import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-oauth-flow-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'spapi-client-id-secret';
process.env.SPAPI_LWA_CLIENT_SECRET = 'spapi-client-secret-secret';
process.env.SPAPI_OAUTH_APPLICATION_ID = 'amzn1.sellerapps.app.test';
process.env.SPAPI_USE_SANDBOX = 'true';
process.env.SPAPI_DEFAULT_REGION = 'NA';
process.env.ADS_LWA_CLIENT_ID = 'ads-client-id-secret';
process.env.ADS_LWA_CLIENT_SECRET = 'ads-client-secret-secret';
process.env.ADS_API_MOCK = 'false';
process.env.ADS_API_USE_SANDBOX = 'true';
process.env.ADS_API_DEFAULT_REGION = 'NA';
process.env.AMZ_WEB_BASE_URL = 'http://web.local';

const SPAPI_STATE_COOKIE = 'aos_spapi_oauth_state';
const ADS_STATE_COOKIE = 'aos_ads_oauth_state';
const realFetch = globalThis.fetch;
const fetchCalls = [];
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  const bodyText = String(init.body || '');
  fetchCalls.push({ href, method: init.method || 'GET', body: bodyText });
  if (href === 'https://api.amazon.com/auth/o2/token') {
    const params = new URLSearchParams(bodyText);
    const code = params.get('code');
    if (code === 'sp-code') {
      return new Response(JSON.stringify({
        refresh_token: 'Atzr|spapi-oauth-refresh-secret',
        access_token: 'Atza|spapi-oauth-access-secret',
        expires_in: 3600,
        scope: 'sellingpartnerapi::migration',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (code === 'ads-code') {
      return new Response(JSON.stringify({
        refresh_token: 'Atzr|ads-oauth-refresh-secret',
        access_token: 'Atza|ads-oauth-access-secret',
        expires_in: 3600,
        scope: 'advertising::campaign_management',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected_oauth_code_' + code);
  }
  if (href.includes('/sellers/v1/marketplaceParticipations')) {
    return new Response(JSON.stringify({
      payload: [
        { marketplace: { id: 'ATVPDKIKX0DER', countryCode: 'US' }, participation: { isParticipating: true } },
        { marketplace: { id: 'A2EUQ1WTGCTBG2', countryCode: 'CA' }, participation: { isParticipating: true } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (href.includes('/v2/profiles')) {
    return new Response(JSON.stringify([
      { profileId: 987654321, countryCode: 'US', accountInfo: { marketplaceStringId: 'ATVPDKIKX0DER' } },
    ]), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('unexpected_fetch_' + href);
};

const { getDbInstance, authenticate, registerUser } = await import('../../apps/api/src/data-store.mjs');
const { handleSyncRequest } = await import('../../apps/api/src/integrations/sync-routes.mjs');

const reg = registerUser({ email: 'oauth@local.test', password: 'pw123456', name: 'OAuth User' });
const userId = reg.user.id;
const authToken = authenticate('oauth@local.test', 'pw123456').token;
const db = getDbInstance();
const storeId = db.prepare(`SELECT id FROM user_stores WHERE user_id=? LIMIT 1`).get(userId).id;

function request(method, path, body, withAuth = true) {
  return new Request('http://api.local' + path, {
    method,
    headers: withAuth ? {
      authorization: 'Bearer ' + authToken,
      'x-store-id': storeId,
      'content-type': 'application/json',
      host: 'api.local',
    } : { host: 'api.local' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function call(method, path, body, withAuth = true) {
  const res = await handleSyncRequest(request(method, path, body, withAuth));
  assert.ok(res, method + ' ' + path + ' returned null');
  const json = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { res, body: json };
}

test('GET /oauth/config reports one-click readiness without leaking client secrets', async () => {
  const { res, body } = await call('GET', '/api/v1/integrations/oauth/config');
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.providers.spapi.ready, true);
  assert.equal(body.providers.ads.ready, true);
  assert.equal(body.providers.spapi.loginUri, 'http://api.local/api/v1/integrations/oauth/spapi/login');
  assert.equal(body.providers.spapi.redirectUri, 'http://api.local/api/v1/integrations/oauth/spapi/callback');
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /spapi-client-secret-secret|ads-client-secret-secret/);
});

test('SP-API one-click OAuth supports public-app login handoff and stores discovered marketplaces', async () => {
  const started = await call('POST', '/api/v1/integrations/oauth/spapi/start', {
    region: 'NA',
    returnTo: '/settings/amazon-auth',
  });
  assert.equal(started.res.status, 200);
  assert.match(started.res.headers.get('set-cookie') || '', /aos_spapi_oauth_state=/);
  const authUrl = new URL(started.body.authorizationUrl);
  assert.equal(authUrl.hostname, 'sellercentral.amazon.com');
  assert.equal(authUrl.searchParams.get('application_id'), 'amzn1.sellerapps.app.test');
  assert.equal(authUrl.searchParams.get('redirect_uri'), null);
  const state = authUrl.searchParams.get('state');
  assert.ok(state);

  const login = await handleSyncRequest(new Request(
    'http://api.local/api/v1/integrations/oauth/spapi/login?amazon_callback_uri=https%3A%2F%2Fsellercentral.amazon.com%2Fapps%2Fauthorize%2Fconfirm&amazon_state=amz-state&selling_partner_id=A-SP-SELLER',
    { method: 'GET', headers: { host: 'api.local', cookie: `${started.res.headers.get('set-cookie')}` } },
  ));
  assert.equal(login.status, 302);
  const loginLocation = new URL(login.headers.get('location'));
  assert.equal(loginLocation.hostname, 'sellercentral.amazon.com');
  assert.equal(loginLocation.searchParams.get('amazon_state'), 'amz-state');
  assert.equal(loginLocation.searchParams.get('state'), state);
  assert.equal(loginLocation.searchParams.get('redirect_uri'), 'http://api.local/api/v1/integrations/oauth/spapi/callback');
  assert.equal(loginLocation.searchParams.get('selling_partner_id'), 'A-SP-SELLER');

  // AUTH-05(c): the spapi callback now requires the HttpOnly state cookie set by
  // /start as a second factor. Pass the cookie issued at start so it keeps passing.
  const cb = await handleSyncRequest(new Request(
    `http://api.local/api/v1/integrations/oauth/spapi/callback?state=${state}&spapi_oauth_code=sp-code&selling_partner_id=A-SP-SELLER`,
    { method: 'GET', headers: { host: 'api.local', cookie: `${SPAPI_STATE_COOKIE}=${state}` } },
  ));
  assert.equal(cb.status, 302);
  assert.match(cb.headers.get('location'), /oauth=spapi/);
  assert.match(cb.headers.get('location'), /status=success/);
  assert.match(cb.headers.get('location'), /marketplaces=2/);

  const row = db.prepare(`SELECT selling_partner_id, marketplace_ids, refresh_token_enc, access_token_enc
    FROM store_credentials WHERE user_id=? AND store_id=? AND provider='spapi'`).get(userId, storeId);
  assert.equal(row.selling_partner_id, 'A-SP-SELLER');
  assert.equal(row.marketplace_ids, 'ATVPDKIKX0DER,A2EUQ1WTGCTBG2');
  assert.ok(row.refresh_token_enc.includes('.'));
  assert.ok(row.access_token_enc.includes('.'));
  assert.notEqual(row.refresh_token_enc, 'Atzr|spapi-oauth-refresh-secret');
});

test('Ads one-click OAuth callback stores token and auto-selects the only profileId', async () => {
  const started = await call('POST', '/api/v1/integrations/oauth/ads/start', {
    region: 'NA',
    returnTo: '/settings/amazon-auth',
  });
  assert.equal(started.res.status, 200);
  const authUrl = new URL(started.body.authorizationUrl);
  assert.equal(authUrl.hostname, 'www.amazon.com');
  assert.equal(authUrl.pathname, '/ap/oa');
  assert.equal(authUrl.searchParams.get('client_id'), 'ads-client-id-secret');
  assert.equal(authUrl.searchParams.get('scope'), 'advertising::campaign_management');
  const state = authUrl.searchParams.get('state');
  assert.ok(state);
  // B-4 CSRF: ads /start now sets an HttpOnly state cookie scoped to the ads callback.
  assert.match(started.res.headers.get('set-cookie') || '', /aos_ads_oauth_state=/);

  // B-4 CSRF: the ads callback now requires cookie===state as a second factor.
  const cb = await handleSyncRequest(new Request(
    `http://api.local/api/v1/integrations/oauth/ads/callback?state=${state}&code=ads-code`,
    { method: 'GET', headers: { host: 'api.local', cookie: `${ADS_STATE_COOKIE}=${state}` } },
  ));
  assert.equal(cb.status, 302);
  assert.match(cb.headers.get('location'), /oauth=ads/);
  assert.match(cb.headers.get('location'), /status=success/);
  assert.match(cb.headers.get('location'), /profileSelection=auto/);
  // success redirect clears the ads state cookie.
  assert.match(cb.headers.get('set-cookie') || '', /aos_ads_oauth_state=;\s*Max-Age=0/);

  const row = db.prepare(`SELECT profile_id, refresh_token_enc, access_token_enc, scope
    FROM store_credentials WHERE user_id=? AND store_id=? AND provider='ads'`).get(userId, storeId);
  assert.equal(row.profile_id, '987654321');
  assert.equal(row.scope, 'advertising::campaign_management');
  assert.ok(row.refresh_token_enc.includes('.'));
  assert.ok(row.access_token_enc.includes('.'));
});

test('OAuth callback rejects invalid state before any token exchange', async () => {
  const before = fetchCalls.length;
  const r = await handleSyncRequest(new Request(
    'http://api.local/api/v1/integrations/oauth/ads/callback?state=missing&code=ads-code',
    { method: 'GET', headers: { host: 'api.local' } },
  ));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'invalid_oauth_state');
  assert.equal(fetchCalls.length, before);
});

test('AUTH-05: spapi callback without state cookie returns 400 and never exchanges code', async () => {
  const started = await call('POST', '/api/v1/integrations/oauth/spapi/start', {
    region: 'NA',
    returnTo: '/settings/amazon-auth',
  });
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  const before = fetchCalls.length;
  const cb = await handleSyncRequest(new Request(
    `http://api.local/api/v1/integrations/oauth/spapi/callback?state=${state}&spapi_oauth_code=sp-code&selling_partner_id=A-SP-SELLER`,
    { method: 'GET', headers: { host: 'api.local' } }, // no cookie
  ));
  assert.equal(cb.status, 400);
  assert.equal((await cb.json()).error, 'invalid_oauth_state');
  assert.equal(fetchCalls.length, before); // no token exchange / probe
});

test('AUTH-05: spapi callback with mismatched cookie returns 400 and never exchanges code', async () => {
  const started = await call('POST', '/api/v1/integrations/oauth/spapi/start', {
    region: 'NA',
    returnTo: '/settings/amazon-auth',
  });
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  const before = fetchCalls.length;
  const cb = await handleSyncRequest(new Request(
    `http://api.local/api/v1/integrations/oauth/spapi/callback?state=${state}&spapi_oauth_code=sp-code&selling_partner_id=A-SP-SELLER`,
    { method: 'GET', headers: { host: 'api.local', cookie: `${SPAPI_STATE_COOKIE}=aos-some-other-state` } },
  ));
  assert.equal(cb.status, 400);
  assert.equal((await cb.json()).error, 'invalid_oauth_state');
  assert.equal(fetchCalls.length, before);
});

test('B-4 CSRF: ads callback without state cookie returns 400 and never exchanges code', async () => {
  const started = await call('POST', '/api/v1/integrations/oauth/ads/start', {
    region: 'NA',
    returnTo: '/settings/amazon-auth',
  });
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  const before = fetchCalls.length;
  const cb = await handleSyncRequest(new Request(
    `http://api.local/api/v1/integrations/oauth/ads/callback?state=${state}&code=ads-code`,
    { method: 'GET', headers: { host: 'api.local' } }, // no cookie
  ));
  assert.equal(cb.status, 400);
  assert.equal((await cb.json()).error, 'invalid_oauth_state');
  assert.equal(fetchCalls.length, before); // intercepted before token exchange / probe
});

test('B-4 CSRF: ads callback with mismatched cookie returns 400 and never exchanges code', async () => {
  const started = await call('POST', '/api/v1/integrations/oauth/ads/start', {
    region: 'NA',
    returnTo: '/settings/amazon-auth',
  });
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  const before = fetchCalls.length;
  const cb = await handleSyncRequest(new Request(
    `http://api.local/api/v1/integrations/oauth/ads/callback?state=${state}&code=ads-code`,
    { method: 'GET', headers: { host: 'api.local', cookie: `${ADS_STATE_COOKIE}=aos-some-other-state` } },
  ));
  assert.equal(cb.status, 400);
  assert.equal((await cb.json()).error, 'invalid_oauth_state');
  assert.equal(fetchCalls.length, before);
});

test('B-4 CSRF: ads callback with cookie===state passes the second factor and completes', async () => {
  const started = await call('POST', '/api/v1/integrations/oauth/ads/start', {
    region: 'NA',
    returnTo: '/settings/amazon-auth',
  });
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  const before = fetchCalls.length;
  const cb = await handleSyncRequest(new Request(
    `http://api.local/api/v1/integrations/oauth/ads/callback?state=${state}&code=ads-code`,
    { method: 'GET', headers: { host: 'api.local', cookie: `${ADS_STATE_COOKIE}=${state}` } },
  ));
  assert.equal(cb.status, 302);
  assert.match(cb.headers.get('location'), /status=success/);
  // matching cookie permits the token exchange to proceed (fetch did fire).
  assert.ok(fetchCalls.length > before);
});

process.on('exit', () => { globalThis.fetch = realFetch; });
