import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const cn = {
  title: '\u0041\u006d\u0061\u007a\u006f\u006e \u6388\u6743\u63a5\u5165\u4e2d\u5fc3',
  routeTitle: '\u0041\u006d\u0061\u007a\u006f\u006e \u6388\u6743\u63a5\u5165',
  spapi: '\u0053\u0050\u002d\u0041\u0050\u0049 \u6388\u6743',
  ads: '\u0041\u006d\u0061\u007a\u006f\u006e \u0041\u0064\u0073 \u6388\u6743',
  diagnosis: '\u771f\u5b9e\u8bca\u65ad',
  orders: '\u540c\u6b65\u8ba2\u5355 \u002f \u0047\u004d\u0056',
  settlement: '\u540c\u6b65\u7ed3\u7b97 \u002f \u8d39\u7528',
  adsSync: '\u540c\u6b65 \u0041\u0064\u0073 \u5c42\u7ea7',
  daily: '\u67e5\u770b \u004d\u0034 \u65e5\u62a5',
  fakeAuth: '\u6a21\u62df\u6388\u6743',
  noTokenEcho: '\u4e0d\u56de\u663e token',
  oneClickSpapi: '\u4e00\u952e\u6388\u6743 SP-API',
  oneClickAds: '\u4e00\u952e\u6388\u6743 Amazon Ads',
  advancedManual: '\u9ad8\u7ea7\u624b\u52a8\u63a5\u5165',
  missingConfigButton: '\u67e5\u770b\u7f3a\u5931\u914d\u7f6e',
};

test('Amazon authorization center is exposed as a visible real-onboarding route', () => {
  const router = read('apps/web-v2/src/router/index.js');
  const routeLine = router.split(/\r?\n/).find((line) => line.includes("path: '/settings/amazon-auth'")) || '';

  assert.match(routeLine, /name:\s*'AmazonAuthCenter'/);
  assert.match(routeLine, /group:\s*'main'/);
  assert.ok(routeLine.includes(`title: '${cn.routeTitle}'`));
  assert.ok(routeLine.includes("../pages/AmazonAuthCenter.vue"));
});

test('Amazon authorization center covers credentials, profileId discovery, and true sync actions', () => {
  const page = read('apps/web-v2/src/pages/AmazonAuthCenter.vue');

  for (const text of [
    cn.title,
    cn.spapi,
    cn.ads,
    cn.diagnosis,
    cn.oneClickSpapi,
    cn.oneClickAds,
    cn.advancedManual,
    'profileId',
    cn.orders,
    cn.settlement,
    cn.adsSync,
    cn.daily,
    '/m4/reports/daily',
    '/ads',
    '/m2/workbench',
    'realWriteEnabled',
    cn.noTokenEcho,
  ]) {
    assert.ok(page.includes(text), `missing ${text}`);
  }

  for (const method of [
    'saveSpApiCredentials',
    'saveAdsCredentials',
    'saveAdsProfile',
    'liveDiagnostics',
    'syncOrders',
    'syncSettlement',
    'syncInventory',
    'syncCatalog',
    'syncAds',
    'syncAll',
    'oauthConfig',
    'startOAuth',
  ]) {
    assert.ok(page.includes(`amazonIntegrationsApi.${method}`), `missing ${method}`);
  }

  assert.ok(!page.includes(cn.missingConfigButton), 'one-click button must not be renamed to a troubleshooting button');
});

test('integrations client maps all real Amazon onboarding endpoints', () => {
  const client = read('apps/web-v2/src/api/integrations.js');

  for (const endpoint of [
    '/status',
    '/oauth/config',
    '/oauth/${provider}/start',
    '/diagnostics',
    '/credentials/spapi',
    '/credentials/ads',
    '/credentials/ads/profile',
    '/credentials/${provider}',
    '/spapi/sync/orders',
    '/spapi/sync/settlement',
    '/spapi/sync/inventory',
    '/spapi/sync/catalog',
    '/ads/sync/all',
    '/sync/all',
  ]) {
    assert.ok(client.includes(endpoint), `missing ${endpoint}`);
  }
});

test('AUTH-02: readinessType is exhaustive — live_partial / mock_ready never map to success-green', () => {
  const page = read('apps/web-v2/src/pages/AmazonAuthCenter.vue');
  // success branch only covers ready + live_ok.
  assert.match(page, /value === 'ready' \|\| value === 'live_ok'\) return 'success'/);
  // live_partial + mock_ready routed to warning.
  assert.match(page, /\['live_partial', 'mock_ready', 'blocked', 'missing'[^\]]*\]\.includes\(value\)\) return 'warning'/);
  // No more blanket success mapping of live_partial / active.
  assert.ok(!page.includes("['ready', 'live_ok', 'live_partial', 'active'].includes(value)) return 'success'"),
    'old false-positive success mapping must be removed');
  // AUTH-02(b): live_partial renders the first blocker inline.
  assert.ok(page.includes("provider.readiness === 'live_partial'"));
  assert.ok(page.includes('provider.blockers[0]'));
});

test('AUTH-06: page exposes a revoke-authorization button with二次确认 and client revoke()', () => {
  const page = read('apps/web-v2/src/pages/AmazonAuthCenter.vue');
  const client = read('apps/web-v2/src/api/integrations.js');
  assert.ok(page.includes('撤销授权'), 'revoke button label present');
  assert.ok(page.includes('revokeAuthorization'), 'revoke handler present');
  assert.ok(page.includes('ElMessageBox.confirm'), 'revoke must二次确认');
  assert.ok(page.includes('amazonIntegrationsApi.revoke'), 'revoke must call client.revoke');
  assert.ok(client.includes('/credentials/${provider}'), 'client DELETE revoke endpoint present');
  assert.ok(/revoke:\s*\(provider\)\s*=>\s*http\.delete/.test(client), 'client.revoke uses DELETE');
});

test('AUTH-13: callback error codes map to a limited Chinese enum, raw LWA text not echoed', () => {
  const page = read('apps/web-v2/src/pages/AmazonAuthCenter.vue');
  for (const code of ['state_expired', 'state_used', 'code_missing', 'lwa_rejected', 'invalid_oauth_state']) {
    assert.ok(page.includes(code), `error enum ${code} mapped`);
  }
  assert.ok(page.includes('oauthErrorText'), 'enum→text resolver present');
});

test('AUTH-10/11/12: store-binding compare, non-probe profile selection, manual-save store guard', () => {
  const page = read('apps/web-v2/src/pages/AmazonAuthCenter.vue');
  // AUTH-10: compares callback storeId vs currentStoreId.
  assert.ok(page.includes('route.query.storeId'));
  assert.ok(page.includes('switchStore'));
  // AUTH-11: consumes profileSelection=required + profileCandidates without a probe.
  assert.ok(page.includes("route.query.profileSelection === 'required'"));
  assert.ok(page.includes('route.query.profileCandidates'));
  assert.ok(page.includes('adsProfileSelection'));
  // AUTH-12: manual save guards target store + confirms name.
  assert.ok(page.includes('confirmTargetStore'));
});

test('B-4 CSRF: ads OAuth now sets and enforces an HttpOnly state cookie (blocker eliminated)', () => {
  const flow = read('apps/api/src/integrations/oauth-flow.mjs');
  // ads /start sets a dedicated HttpOnly state cookie scoped to the ads callback path.
  assert.ok(flow.includes("const ADS_STATE_COOKIE = 'aos_ads_oauth_state'"), 'ADS_STATE_COOKIE declared');
  assert.match(flow, /cookieHeader\(ADS_STATE_COOKIE, state, \{ path: '\/api\/v1\/integrations\/oauth\/ads'/);
  // handleOAuthCallback enforces cookie===state for provider==='ads' before token exchange.
  assert.match(flow, /provider === 'ads'\)\s*\{\s*const cookieState = readCookie\(request, ADS_STATE_COOKIE\)/);
  assert.ok(flow.includes('ads_callback_state_cookie_mismatch_or_missing'), 'ads mismatch path returns invalid_oauth_state');
  // terminal redirects clear the ads cookie.
  assert.ok(flow.includes('redirectClearingStateCookie'), 'callback clears per-provider state cookie');
  // the cookie enforcement is positioned before exchangeAuthorizationCode in the callback.
  const adsCheckIdx = flow.indexOf('ads_callback_state_cookie_mismatch_or_missing');
  const exchangeIdx = flow.indexOf('await exchangeAuthorizationCode');
  assert.ok(adsCheckIdx > 0 && exchangeIdx > adsCheckIdx, 'ads CSRF check precedes token exchange');
});

test('B-4 CSRF: BOUNDARY_NOTES no longer carries the ads恒跳过=通过 false-negative blocker', () => {
  const notes = read('docs/implementation/DEEP_REVIEW_2026-05-29/BOUNDARY_NOTES.md');
  assert.ok(
    !/ads CSRF 在门禁内恒'跳过=通过' false-negative,标记为 blocker/.test(notes),
    'ads CSRF false-negative blocker text must be resolved/removed',
  );
});

test('legacy settings store authorization buttons no longer fake real authorization', () => {
  const settings = read('apps/web-v2/src/pages/Settings.vue');

  assert.ok(settings.includes('/settings/amazon-auth'));
  assert.ok(!settings.includes(cn.fakeAuth));
  assert.ok(!settings.includes("authorize(row, 'spApiAuthorized')"));
  assert.ok(!settings.includes("authorize(row, 'adsApiAuthorized')"));
});
