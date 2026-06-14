import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-auth-diag-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'spapi-client-id-secret';
process.env.SPAPI_LWA_CLIENT_SECRET = 'spapi-client-secret-secret';
process.env.SPAPI_DEFAULT_REGION = 'NA';
process.env.SPAPI_USE_SANDBOX = 'true';
delete process.env.ADS_LWA_CLIENT_ID;
delete process.env.ADS_LWA_CLIENT_SECRET;
process.env.ADS_CLIENT_ID = 'legacy-ads-client-id-secret';
process.env.ADS_CLIENT_SECRET = 'legacy-ads-client-secret-secret';
process.env.ADS_API_MOCK = 'false';
process.env.ADS_API_USE_SANDBOX = 'true';
process.env.ADS_API_DEFAULT_REGION = 'NA';

const realFetch = globalThis.fetch;
const fetchCalls = [];
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  fetchCalls.push({ href, method: init.method || 'GET' });
  if (href === 'https://api.amazon.com/auth/o2/token') {
    return new Response(JSON.stringify({ access_token: 'Atza|diagnostic-access-token', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (href.includes('/sellers/v1/marketplaceParticipations')) {
    return new Response(JSON.stringify({
      payload: [
        { marketplace: { id: 'ATVPDKIKX0DER', countryCode: 'US' }, participation: { isParticipating: true } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (href.includes('/v2/profiles')) {
    return new Response(JSON.stringify([
      { profileId: 12345, countryCode: 'US', accountInfo: { marketplaceStringId: 'ATVPDKIKX0DER' } },
    ]), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('unexpected_fetch_' + href);
};

const { getDbInstance, authenticate, registerUser } = await import('../../apps/api/src/data-store.mjs');
const { handleSyncRequest } = await import('../../apps/api/src/integrations/sync-routes.mjs');

const reg = registerUser({ email: 'authdiag@local.test', password: 'pw123456', name: 'Auth Diag' });
const userId = reg.user.id;
const authToken = authenticate('authdiag@local.test', 'pw123456').token;
const db = getDbInstance();
const storeId = db.prepare(`SELECT id FROM user_stores WHERE user_id=? LIMIT 1`).get(userId).id;

function mkRequest(method, path, body) {
  return new Request('http://localhost' + path, {
    method,
    headers: {
      authorization: 'Bearer ' + authToken,
      'x-store-id': storeId,
      'content-type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function call(method, path, body) {
  const res = await handleSyncRequest(mkRequest(method, path, body));
  assert.ok(res, method + ' ' + path + ' returned null');
  const json = await res.json();
  return { status: res.status, body: json };
}

function provider(body, name) {
  return body.providers.find((p) => p.provider === name);
}

test('GET /integrations/diagnostics is offline, redacted, and reports missing credentials', async () => {
  const before = fetchCalls.length;
  const r = await call('GET', '/api/v1/integrations/diagnostics');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(fetchCalls.length, before, 'offline diagnostics must not call network');
  assert.equal(r.body.environment.spapi.clientId.configured, true);
  assert.equal(r.body.environment.ads.clientId.source, 'ADS_CLIENT_ID');
  assert.equal(provider(r.body, 'spapi').readiness, 'blocked');
  assert.ok(provider(r.body, 'spapi').blockers.includes('spapi_credentials_missing'));
  assert.ok(provider(r.body, 'ads').blockers.includes('ads_credentials_missing'));

  const serialized = JSON.stringify(r.body);
  assert.doesNotMatch(serialized, /spapi-client-id-secret|legacy-ads-client-id-secret|Atzr\|/);
});

test('diagnostics recognizes encrypted SP-API and Ads credentials without exposing tokens', async () => {
  await call('POST', '/api/v1/integrations/credentials/spapi', {
    refreshToken: 'Atzr|spapi-refresh-secret',
    sellingPartnerId: 'A-SP-123',
    region: 'NA',
    marketplaceIds: ['ATVPDKIKX0DER'],
  });
  await call('POST', '/api/v1/integrations/credentials/ads', {
    refreshToken: 'Atzr|ads-refresh-secret',
    profileId: '12345',
    region: 'NA',
  });

  const r = await call('GET', '/api/v1/integrations/diagnostics');
  assert.equal(r.status, 200);
  const spapi = provider(r.body, 'spapi');
  const ads = provider(r.body, 'ads');
  assert.equal(spapi.readiness, 'ready');
  assert.equal(spapi.credential.hasRefreshToken, true);
  assert.equal(spapi.credential.refreshTokenEncryptedShapeOk, true);
  assert.equal(spapi.credential.marketplaceCount, 1);
  assert.equal(ads.readiness, 'ready');
  assert.equal(ads.credential.profileIdConfigured, true);
  assert.equal(r.body.m3Impact.realWriteEnabled, false);
  assert.equal(r.body.m3Impact.realWriteMode, 'disabled_dry_run_audit_first');

  const serialized = JSON.stringify(r.body);
  assert.doesNotMatch(serialized, /Atzr\|spapi-refresh-secret|Atzr\|ads-refresh-secret|Atza\|diagnostic-access-token/);
});

test('POST /integrations/diagnostics liveProbe validates LWA plus safe read probes', async () => {
  const r = await call('POST', '/api/v1/integrations/diagnostics', {
    provider: 'all',
    liveProbe: true,
    apiProbe: true,
  });
  assert.equal(r.status, 200);
  const spapi = provider(r.body, 'spapi');
  const ads = provider(r.body, 'ads');
  assert.equal(spapi.readiness, 'live_ok');
  assert.equal(ads.readiness, 'live_ok');
  assert.equal(spapi.liveProbe.status, 'ok');
  assert.equal(ads.liveProbe.status, 'ok');
  assert.ok(spapi.liveProbe.checks.some((c) => c.name === 'lwa_token_exchange' && c.status === 'ok'));
  assert.ok(spapi.liveProbe.checks.some((c) => c.name === 'sellers_marketplace_participations' && c.recordsIn === 1));
  assert.ok(ads.liveProbe.checks.some((c) => c.name === 'ads_profiles_list' && c.recordsIn === 1));
  assert.ok(fetchCalls.some((c) => c.href.includes('sandbox.sellingpartnerapi-na.amazon.com/sellers/v1/marketplaceParticipations')));
  assert.ok(fetchCalls.some((c) => c.href.includes('advertising-api-test.amazon.com/v2/profiles')));

  const serialized = JSON.stringify(r.body);
  assert.doesNotMatch(serialized, /Atza\|diagnostic-access-token|Atzr\|/);
});

test('POST /integrations/diagnostics rejects invalid provider', async () => {
  const r = await call('POST', '/api/v1/integrations/diagnostics', { provider: 'keepa', liveProbe: true });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_provider');
});

test('AUTH-02/AUTH-04: ADS_API_MOCK=1 → ads readiness mock_ready (never ready), warning + ads_mock_fixture, realWriteEnabled honest', async () => {
  const prevMock = process.env.ADS_API_MOCK;
  process.env.ADS_API_MOCK = 'true';
  try {
    const r = await call('GET', '/api/v1/integrations/diagnostics');
    assert.equal(r.status, 200);
    const ads = provider(r.body, 'ads');
    // (c) ads readiness is mock_ready, NOT 'ready' (so the UI tag maps to warning).
    assert.equal(ads.readiness, 'mock_ready');
    assert.notEqual(ads.readiness, 'ready');
    assert.ok(ads.warnings.includes('ads_running_on_mock_fixtures'));
    // m3DataMode reflects mock fixture, never live-ready.
    assert.equal(r.body.m3Impact.m3DataMode, 'ads_mock_fixture');
    // AUTH-04: realWriteEnabled stays a HONEST readback. mock-on means the gate
    // can never be armed (mockExclusive=false), so realWriteEnabled is false.
    assert.equal(r.body.m3Impact.realWriteEnabled, false);
    assert.equal(r.body.m3Impact.realWriteGate.mockExclusive, false);
  } finally {
    process.env.ADS_API_MOCK = prevMock;
  }
});

test('AUTH-04: realWriteGate exposed on m3Impact and reflects env gate state', async () => {
  const save = {
    enabled: process.env.ADS_REAL_WRITES_ENABLED,
    allow: process.env.ADS_REAL_WRITES_STORE_ALLOWLIST,
    mock: process.env.ADS_API_MOCK,
  };
  process.env.ADS_REAL_WRITES_ENABLED = 'true';
  process.env.ADS_REAL_WRITES_STORE_ALLOWLIST = '*';
  process.env.ADS_API_MOCK = 'false';
  try {
    const r = await call('GET', '/api/v1/integrations/diagnostics');
    assert.equal(r.body.m3Impact.realWriteEnabled, true);
    assert.equal(r.body.m3Impact.realWriteMode, 'armed_real_write_env_gate_on');
    assert.equal(r.body.m3Impact.realWriteGate.realWriteEnabled, true);
  } finally {
    if (save.enabled === undefined) delete process.env.ADS_REAL_WRITES_ENABLED; else process.env.ADS_REAL_WRITES_ENABLED = save.enabled;
    if (save.allow === undefined) delete process.env.ADS_REAL_WRITES_STORE_ALLOWLIST; else process.env.ADS_REAL_WRITES_STORE_ALLOWLIST = save.allow;
    if (save.mock === undefined) delete process.env.ADS_API_MOCK; else process.env.ADS_API_MOCK = save.mock;
  }
});

process.on('exit', () => { globalThis.fetch = realFetch; });
