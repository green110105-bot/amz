// sync-routes test — validates HTTP routing + scope + body validation + envelope shape.
// The sync function bodies themselves are covered by their own test files
// (sp-api-orders-sync.test, sp-api-reports.test, sp-api-catalog.test, ads-api.test).
// Here we let real sync functions run; without working credentials they go into the
// runWithGuard catch path and return `{status:'error', ...}` — both ok and error
// envelopes are accepted as long as the shape is right.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-sync-routes-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'cid';
process.env.SPAPI_LWA_CLIENT_SECRET = 'csec';
process.env.ADS_LWA_CLIENT_ID = 'acid';
process.env.ADS_LWA_CLIENT_SECRET = 'asec';
process.env.ADS_API_MOCK = 'true'; // Ads sync short-circuits to fixtures, no network

// Stub global fetch — any real call returns a network-error-like response.
// This keeps sync-routes tests fully offline.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('test_network_blocked');
};

const { getDbInstance, authenticate, registerUser } = await import('../../apps/api/src/data-store.mjs');
const { handleSyncRequest } = await import('../../apps/api/src/integrations/sync-routes.mjs');

// Bootstrap user + token
const reg = registerUser({ email: 'sr@local', password: 'pw1234', name: 'SR' });
const userId = reg.user.id;
const authToken = authenticate('sr@local', 'pw1234').token;
const db = getDbInstance();
const storeRow = db.prepare(`SELECT id FROM user_stores WHERE user_id=? LIMIT 1`).get(userId);
const storeId = storeRow.id;

function mkRequest(method, path, body, headers = {}) {
  return new Request('http://localhost' + path, {
    method,
    headers: {
      'authorization': 'Bearer ' + authToken,
      'x-store-id': storeId,
      'content-type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function envelopeOk(body, { requireOkFlag = true } = {}) {
  if (requireOkFlag) assert.equal(body.ok, true);
  assert.ok(['ok', 'error'].includes(body.status), `bad status: ${body.status}`);
  assert.ok(typeof body.startedAt === 'string');
  assert.ok(typeof body.endedAt === 'string');
  assert.equal(typeof body.label, 'string');
}

test('missing Authorization → 401', async () => {
  const req = new Request('http://localhost/api/v1/integrations/status', { method: 'GET' });
  const res = await handleSyncRequest(req);
  assert.equal(res.status, 401);
});

test('GET /status returns mode + providers + recentSyncs', async () => {
  const res = await handleSyncRequest(mkRequest('GET', '/api/v1/integrations/status'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(['mock', 'real', 'hybrid'].includes(body.mode));
  assert.ok(Array.isArray(body.providers));
  assert.ok(Array.isArray(body.recentSyncs));
});

test('POST /credentials/spapi missing refreshToken → 400', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/credentials/spapi', { marketplaceIds: ['ATVPDKIKX0DER'] }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'refresh_token_required');
});

test('POST /credentials/spapi missing marketplaceIds → 400', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/credentials/spapi', { refreshToken: 'Atzr|x' }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'marketplace_ids_required');
});

test('POST /credentials/spapi success path persists encrypted token', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/credentials/spapi', {
    refreshToken: 'Atzr|good-token',
    sellingPartnerId: 'A123',
    region: 'NA',
    marketplaceIds: ['ATVPDKIKX0DER'],
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.stored, true);

  const row = db.prepare(`SELECT refresh_token_enc, selling_partner_id FROM store_credentials WHERE user_id=? AND store_id=? AND provider='spapi'`).get(userId, storeId);
  assert.ok(row);
  assert.ok(row.refresh_token_enc.includes('.')); // AES-GCM packed format
  assert.notEqual(row.refresh_token_enc, 'Atzr|good-token');
  assert.equal(row.selling_partner_id, 'A123');
  const audit = db.prepare(`SELECT payload FROM audit_logs WHERE user_id=? AND store_id=? AND action_type='AMAZON_SPAPI_CREDENTIALS_SAVED' ORDER BY executed_at DESC LIMIT 1`).get(userId, storeId);
  assert.ok(audit, 'manual SP-API credential save must be audited');
  assert.doesNotMatch(audit.payload, /Atzr\|good-token/);
});

test('POST /credentials/ads success', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/credentials/ads', {
    refreshToken: 'Atzr|ads-token',
    profileId: '12345',
    region: 'NA',
  }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).provider, 'ads');
  const audit = db.prepare(`SELECT payload FROM audit_logs WHERE user_id=? AND store_id=? AND action_type='AMAZON_ADS_CREDENTIALS_SAVED' ORDER BY executed_at DESC LIMIT 1`).get(userId, storeId);
  assert.ok(audit, 'manual Ads credential save must be audited');
  assert.doesNotMatch(audit.payload, /Atzr\|ads-token/);
});

test('POST /credentials/ads/profile requires profileId', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/credentials/ads/profile', {}));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'profile_id_required');
});

test('POST /credentials/ads/profile rejects stores without Ads refresh token', async () => {
  const reg2 = registerUser({ email: 'sr-no-ads@local', password: 'pw1234', name: 'SR No Ads' });
  const token2 = authenticate('sr-no-ads@local', 'pw1234').token;
  const store2 = db.prepare(`SELECT id FROM user_stores WHERE user_id=? LIMIT 1`).get(reg2.user.id).id;
  const req = new Request('http://localhost/api/v1/integrations/credentials/ads/profile', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token2,
      'x-store-id': store2,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ profileId: '99999' }),
  });
  const res = await handleSyncRequest(req);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'ads_credentials_missing');
});

test('POST /credentials/ads/profile updates existing Ads row and status exposes profileId', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/credentials/ads/profile', {
    profileId: '67890',
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.profileId, '67890');

  const row = db.prepare(`SELECT profile_id FROM store_credentials WHERE user_id=? AND store_id=? AND provider='ads'`).get(userId, storeId);
  assert.equal(row.profile_id, '67890');

  const statusRes = await handleSyncRequest(mkRequest('GET', '/api/v1/integrations/status'));
  const statusBody = await statusRes.json();
  const ads = statusBody.providers.find((p) => p.provider === 'ads');
  assert.equal(ads.profileId, '67890');
  const audit = db.prepare(`SELECT payload FROM audit_logs WHERE user_id=? AND store_id=? AND action_type='AMAZON_ADS_PROFILE_SAVED' ORDER BY executed_at DESC LIMIT 1`).get(userId, storeId);
  assert.ok(audit, 'manual Ads profile save must be audited');
});

test('POST /spapi/sync/orders → ok envelope (sync may succeed or fail; envelope must be valid)', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/spapi/sync/orders', {
    since: '2026-05-01T00:00:00Z',
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  envelopeOk(body);
  assert.equal(body.label, 'orders');
});

test('POST /spapi/sync/settlement requires since', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/spapi/sync/settlement', {}));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'since_required');
});

test('POST /spapi/sync/settlement with since → envelope', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/spapi/sync/settlement', {
    since: '2026-05-01T00:00:00Z',
    until: '2026-05-15T00:00:00Z',
  }));
  assert.equal(res.status, 200);
  envelopeOk(await res.json());
});

test('POST /spapi/sync/inventory → envelope', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/spapi/sync/inventory', {}));
  assert.equal(res.status, 200);
  envelopeOk(await res.json());
});

test('POST /spapi/sync/catalog requires asins[]', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/spapi/sync/catalog', {}));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'asins_required');
});

test('POST /spapi/sync/catalog with asins → envelope', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/spapi/sync/catalog', {
    asins: ['B0TEST001'],
    marketplaceIds: ['ATVPDKIKX0DER'],
  }));
  assert.equal(res.status, 200);
  envelopeOk(await res.json());
});

test('POST /ads/sync/all → envelope (ADS_API_MOCK active)', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/ads/sync/all', {
    profileId: '12345',
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  envelopeOk(body);
  assert.equal(body.label, 'ads');
});

test('POST /sync/all returns multi-step envelope', async () => {
  const res = await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/sync/all', {
    since: '2026-05-01T00:00:00Z',
    asins: ['B0TEST001'],
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.steps));
  assert.ok(body.steps.length >= 3); // orders + inventory + catalog + ads (settlement optional)
  for (const step of body.steps) envelopeOk(step, { requireOkFlag: false });
  assert.ok(body.summary && typeof body.summary.total === 'number');
  assert.equal(body.summary.total, body.steps.length);
});

test('unknown path → null (falls through to next router)', async () => {
  const res = await handleSyncRequest(mkRequest('GET', '/api/v1/integrations/nonexistent'));
  assert.equal(res, null);
});

test('bad JSON body → 400', async () => {
  const req = new Request('http://localhost/api/v1/integrations/credentials/spapi', {
    method: 'POST',
    headers: { 'authorization': 'Bearer ' + authToken, 'x-store-id': storeId, 'content-type': 'application/json' },
    body: '{not-json',
  });
  const res = await handleSyncRequest(req);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'bad_json');
});

test('AUTH-06: DELETE /credentials/spapi revokes and audits previousSellingPartnerId', async () => {
  // Ensure an active spapi credential with a known selling partner id exists.
  await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/credentials/spapi', {
    refreshToken: 'Atzr|revoke-token',
    sellingPartnerId: 'A-REVOKE-SP',
    region: 'NA',
    marketplaceIds: ['ATVPDKIKX0DER'],
  }));

  const res = await handleSyncRequest(mkRequest('DELETE', '/api/v1/integrations/credentials/spapi'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.provider, 'spapi');
  assert.equal(body.status, 'revoked');

  // GET /status now shows the provider revoked.
  const statusRes = await handleSyncRequest(mkRequest('GET', '/api/v1/integrations/status'));
  const statusBody = await statusRes.json();
  const sp = statusBody.providers.find((p) => p.provider === 'spapi');
  assert.equal(sp.status, 'revoked');

  // Audit row records the REVOKED action with previousSellingPartnerId.
  const audit = db.prepare(
    `SELECT payload FROM audit_logs WHERE user_id=? AND store_id=? AND action_type='AMAZON_SPAPI_CREDENTIALS_REVOKED' ORDER BY executed_at DESC LIMIT 1`
  ).get(userId, storeId);
  assert.ok(audit, 'revoke must be audited');
  // appendAuditLog stores the caller log under a nested `payload` key.
  const payload = JSON.parse(audit.payload).payload;
  assert.equal(payload.previousSellingPartnerId, 'A-REVOKE-SP');
  assert.doesNotMatch(audit.payload, /Atzr\|revoke-token/);
});

test('AUTH-06: DELETE /credentials/ads revokes and audits previousProfileId', async () => {
  await handleSyncRequest(mkRequest('POST', '/api/v1/integrations/credentials/ads', {
    refreshToken: 'Atzr|ads-revoke-token',
    profileId: '424242',
    region: 'NA',
  }));

  const res = await handleSyncRequest(mkRequest('DELETE', '/api/v1/integrations/credentials/ads'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'revoked');

  const statusRes = await handleSyncRequest(mkRequest('GET', '/api/v1/integrations/status'));
  const ads = (await statusRes.json()).providers.find((p) => p.provider === 'ads');
  assert.equal(ads.status, 'revoked');

  const audit = db.prepare(
    `SELECT payload FROM audit_logs WHERE user_id=? AND store_id=? AND action_type='AMAZON_ADS_CREDENTIALS_REVOKED' ORDER BY executed_at DESC LIMIT 1`
  ).get(userId, storeId);
  assert.ok(audit, 'ads revoke must be audited');
  assert.equal(JSON.parse(audit.payload).payload.previousProfileId, '424242');
});

// Restore fetch at process exit (defensive)
process.on('exit', () => { globalThis.fetch = realFetch; });
