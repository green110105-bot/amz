// AUTH-09 regression: when SP-API marketplace discovery fails AND no marketplace
// hint exists, the finalized credential must land status='needs_attention' (not
// 'active') so the 'active' semantic stays aligned with diagnostics readiness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-oauth-needs-attn-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'spapi-client-id-secret';
process.env.SPAPI_LWA_CLIENT_SECRET = 'spapi-client-secret-secret';
process.env.SPAPI_OAUTH_APPLICATION_ID = 'amzn1.sellerapps.app.test';
process.env.SPAPI_USE_SANDBOX = 'true';
process.env.SPAPI_DEFAULT_REGION = 'NA';
process.env.AMZ_WEB_BASE_URL = 'http://web.local';

const SPAPI_STATE_COOKIE = 'aos_spapi_oauth_state';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  const bodyText = String(init.body || '');
  if (href === 'https://api.amazon.com/auth/o2/token') {
    return new Response(JSON.stringify({
      refresh_token: 'Atzr|spapi-oauth-refresh-secret',
      access_token: 'Atza|spapi-oauth-access-secret',
      expires_in: 3600,
      scope: 'sellingpartnerapi::migration',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (href.includes('/sellers/v1/marketplaceParticipations')) {
    // Simulate discovery failure (e.g. throttled / unauthorized).
    return new Response(JSON.stringify({ errors: [{ code: 'Unauthorized' }] }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error('unexpected_fetch_' + href);
};

const { getDbInstance, authenticate, registerUser } = await import('../../apps/api/src/data-store.mjs');
const { handleSyncRequest } = await import('../../apps/api/src/integrations/sync-routes.mjs');
const { buildAmazonAuthorizationDiagnostics } = await import('../../apps/api/src/integrations/authorization-diagnostics.mjs');

const reg = registerUser({ email: 'needsattn@local.test', password: 'pw123456', name: 'NeedsAttn' });
const userId = reg.user.id;
const authToken = authenticate('needsattn@local.test', 'pw123456').token;
const db = getDbInstance();
const storeId = db.prepare(`SELECT id FROM user_stores WHERE user_id=? LIMIT 1`).get(userId).id;
// AUTH-09 precondition: clear the marketplace_id hint so discovery is the only source.
db.prepare(`UPDATE user_stores SET marketplace_id=NULL WHERE id=?`).run(storeId);

function authHeaders() {
  return { authorization: 'Bearer ' + authToken, 'x-store-id': storeId, 'content-type': 'application/json', host: 'api.local' };
}

test('AUTH-09: marketplace discovery failure lands status=needs_attention and diagnostics readiness != ready', async () => {
  // Start to mint a valid state + cookie (AUTH-05 second factor).
  const startRes = await handleSyncRequest(new Request('http://api.local/api/v1/integrations/oauth/spapi/start', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ region: 'NA', returnTo: '/settings/amazon-auth' }),
  }));
  const startBody = await startRes.json();
  const state = new URL(startBody.authorizationUrl).searchParams.get('state');

  const cb = await handleSyncRequest(new Request(
    `http://api.local/api/v1/integrations/oauth/spapi/callback?state=${state}&spapi_oauth_code=sp-code&selling_partner_id=A-SP-SELLER`,
    { method: 'GET', headers: { host: 'api.local', cookie: `${SPAPI_STATE_COOKIE}=${state}` } },
  ));
  assert.equal(cb.status, 302);
  // discovery failed → redirect carries warning marketplace_discovery_failed
  assert.match(cb.headers.get('location'), /warning=marketplace_discovery_failed/);

  const row = db.prepare(`SELECT status, marketplace_ids FROM store_credentials WHERE user_id=? AND store_id=? AND provider='spapi'`).get(userId, storeId);
  assert.notEqual(row.status, 'active', 'half-ready credential must not stay active');
  assert.equal(row.status, 'needs_attention');

  const diag = await buildAmazonAuthorizationDiagnostics({ userId, storeId, provider: 'spapi' });
  const sp = diag.providers.find((p) => p.provider === 'spapi');
  assert.notEqual(sp.readiness, 'ready', 'readiness must not be ready while status is needs_attention');
  assert.ok(sp.blockers.includes('spapi_credentials_not_active'));
});

process.on('exit', () => { globalThis.fetch = realFetch; });
