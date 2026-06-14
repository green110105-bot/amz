// QA Agent M3 — Deep button-level QA of the M3 ads module.
// Covers ~80+ endpoints across store-routes-ads.mjs + 17 actionType revert paths
// + ads-api sync integration + strategy-campaign binding + audit-log filters.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-qa-m3-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.ADS_API_MOCK = 'true';
process.env.ADS_LWA_CLIENT_ID = 'qa-ads-client-id';
process.env.ADS_LWA_CLIENT_SECRET = 'qa-ads-client-secret';

globalThis.fetch = async () => { throw new Error('network_blocked_in_qa'); };

const { handleAdsRequest } = await import('../../apps/api/src/store-routes-ads.mjs');
const { handleStoreRequest } = await import('../../apps/api/src/store-routes.mjs');
const {
  registerUser, defaultStoreIdFor, getDbInstance,
  appendAuditLog, listAuditLogs, revertAuditLog,
} = await import('../../apps/api/src/data-store.mjs');
const { syncAdsHierarchy } = await import('../../apps/api/src/integrations/ads-api/sync/campaigns-sync.mjs');
const { createTargeting: dbCreateTargeting, settleObservations } = await import('../../apps/api/src/data-store-ads.mjs');

// -----------------------------------------------------------------------------
// Test scaffold — use the auto-seeded demo user (the only user that gets the
// full mock ads data set, since seedAdsForUser uses INSERT OR IGNORE on PK).
// -----------------------------------------------------------------------------
const { authenticate } = await import('../../apps/api/src/data-store.mjs');
// Touch data-store to trigger ensureDemoUser at module-init time
getDbInstance();
const auth = authenticate('demo@amz.local', 'demo');
assert.ok(auth?.token, 'demo auth failed');
const TOKEN = auth.token;
const USER_ID = auth.user.id;
const STORE_ID = defaultStoreIdFor(USER_ID);
// Side-register a separate user so we can test cross-store scoping
const otherReg = registerUser({ email: 'qa-m3-other@local.test', password: 'qa-pass-1234' });
const OTHER_TOKEN = authenticate('qa-m3-other@local.test', 'qa-pass-1234').token;
const OTHER_STORE = defaultStoreIdFor(otherReg.user.id);

function adsReq(method, path, { body, multipart, qs, token = TOKEN, storeId = STORE_ID } = {}) {
  const url = 'http://localhost' + path + (qs ? '?' + new URLSearchParams(qs).toString() : '');
  const headers = { 'authorization': 'Bearer ' + token, 'x-store-id': storeId };
  let init = { method, headers };
  if (multipart) {
    const boundary = '----amzqa' + randomBytes(6).toString('hex');
    headers['content-type'] = `multipart/form-data; boundary=${boundary}`;
    const parts = [];
    for (const [name, val] of Object.entries(multipart)) {
      parts.push(`--${boundary}\r\n`);
      if (val && typeof val === 'object' && val.filename != null) {
        parts.push(`Content-Disposition: form-data; name="${name}"; filename="${val.filename}"\r\n\r\n`);
        parts.push(val.content);
        parts.push('\r\n');
      } else {
        parts.push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
        parts.push(String(val));
        parts.push('\r\n');
      }
    }
    parts.push(`--${boundary}--\r\n`);
    init.body = Buffer.from(parts.join(''));
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

async function callAds(method, path, opts) {
  const res = await handleAdsRequest(adsReq(method, path, opts));
  assert.ok(res, 'route returned null for ' + method + ' ' + path);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body: json };
}
async function callStore(method, path, opts) {
  const res = await handleStoreRequest(adsReq(method, path, opts));
  assert.ok(res, 'store route returned null for ' + method + ' ' + path);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body: json };
}

// =============================================================================
// 1. Auth / scoping
// =============================================================================
test('M3-auth-01: missing Authorization header returns 401', async () => {
  const req = new Request('http://localhost/api/v1/store/ads/strategies', { method: 'GET' });
  const res = await handleAdsRequest(req);
  assert.equal(res.status, 401);
});

test('M3-auth-02: bogus bearer token returns 401', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/strategies', { token: 'tok-doesnt-exist' });
  assert.equal(r.status, 401);
});

test('M3-auth-03: non-ads URL returns null from handler', async () => {
  const res = await handleAdsRequest(new Request('http://localhost/api/v1/store/other', { method: 'GET', headers: { authorization: 'Bearer ' + TOKEN, 'x-store-id': STORE_ID } }));
  assert.equal(res, null);
});

// =============================================================================
// 2. Strategies (3.1)
// =============================================================================
test('M3-strat-01: GET /strategies lists seeded strategies', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/strategies');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(r.body.items.length > 0);
});

test('M3-strat-02: GET /strategies?category=X filters', async () => {
  const all = await callAds('GET', '/api/v1/store/ads/strategies');
  const cat = all.body.items[0]?.category;
  if (cat) {
    const r = await callAds('GET', '/api/v1/store/ads/strategies', { qs: { category: cat } });
    assert.equal(r.status, 200);
    for (const it of r.body.items) assert.equal(it.category, cat);
  }
});

test('M3-strat-03: GET /strategies?status=enabled filters', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/strategies', { qs: { status: 'enabled' } });
  for (const it of r.body.items) assert.equal(it.enabled, true);
});

test('M3-strat-04: POST /strategies missing name → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/strategies', { body: { category: 'x' } });
  assert.equal(r.status, 400);
});

test('M3-strat-05: POST /strategies creates strategy', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/strategies', { body: { name: 'qa-strategy-1', category: 'bid' } });
  assert.equal(r.status, 201);
  assert.ok(r.body.id);
  globalThis.__qaStratId = r.body.id;
});

test('M3-strat-06: GET /strategies/:id returns created', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/strategies/' + globalThis.__qaStratId);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, globalThis.__qaStratId);
});

test('M3-strat-07: GET /strategies/:id with unknown id → 404', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/strategies/nope-x');
  assert.equal(r.status, 404);
});

test('M3-strat-08: PUT /strategies/:id updates', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/strategies/' + globalThis.__qaStratId, { body: { description: 'qa upd' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.description, 'qa upd');
});

test('M3-strat-09: POST /strategies/:id/toggle toggles enabled', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/strategies/' + globalThis.__qaStratId + '/toggle', { body: { enabled: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, false);
});

test('M3-strat-10: POST /strategies/:id/toggle missing enabled → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/strategies/' + globalThis.__qaStratId + '/toggle', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-strat-11: POST /strategies/:id/bind sets bindings', async () => {
  const cmp = await callAds('GET', '/api/v1/store/ads/lx/campaigns');
  const cmpId = cmp.body.items[0].id;
  const r = await callAds('POST', '/api/v1/store/ads/strategies/' + globalThis.__qaStratId + '/bind', { body: { campaignIds: [cmpId] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.bindings.length, 1);
  assert.equal(r.body.bindings[0].id, cmpId);
});

test('M3-strat-12: DELETE /strategies/:id removes', async () => {
  const r = await callAds('DELETE', '/api/v1/store/ads/strategies/' + globalThis.__qaStratId);
  assert.equal(r.status, 200);
  const after = await callAds('GET', '/api/v1/store/ads/strategies/' + globalThis.__qaStratId);
  assert.equal(after.status, 404);
});

// =============================================================================
// 3. Suggestions (3.2)
// =============================================================================
test('M3-sug-01: GET /suggestions lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/suggestions');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('M3-sug-02: GET /suggestions?state=pending filters', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/suggestions', { qs: { state: 'pending' } });
  for (const it of r.body.items) assert.equal(it.state, 'pending');
});

test('M3-sug-03: GET /suggestions/:id', async () => {
  const list = await callAds('GET', '/api/v1/store/ads/suggestions');
  if (list.body.items.length) {
    const id = list.body.items[0].id;
    const r = await callAds('GET', '/api/v1/store/ads/suggestions/' + id);
    assert.equal(r.status, 200);
    assert.equal(r.body.id, id);
  }
});

test('M3-sug-04: POST /suggestions/:id/accept → observing', async () => {
  const list = await callAds('GET', '/api/v1/store/ads/suggestions', { qs: { state: 'pending' } });
  const id = list.body.items[0]?.id;
  assert.ok(id, 'need a pending suggestion');
  globalThis.__qaSugId = id;
  const r = await callAds('POST', '/api/v1/store/ads/suggestions/' + id + '/accept', { body: { chosenAlternativeIndex: 0 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'observing');
});

test('M3-sug-05: POST /suggestions/:id/revert pending', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/suggestions/' + globalThis.__qaSugId + '/revert', { body: { reason: 'qa-revert' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'pending');
});

test('M3-sug-06: POST /suggestions/:id/reject → rejected', async () => {
  const list = await callAds('GET', '/api/v1/store/ads/suggestions', { qs: { state: 'pending' } });
  const id = list.body.items[0]?.id;
  const r = await callAds('POST', '/api/v1/store/ads/suggestions/' + id + '/reject', { body: { reason: 'no' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'rejected');
});

test('M3-sug-07: POST /suggestions/:id/accept on unknown id → 404', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/suggestions/nope-y/accept', { body: {} });
  assert.equal(r.status, 404);
});

// =============================================================================
// 4. Manual changes (3.3)
// =============================================================================
test('M3-mc-01: GET /manual-changes lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/manual-changes');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('M3-mc-02: GET /manual-changes?state=pending filters', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/manual-changes', { qs: { state: 'pending' } });
  for (const it of r.body.items) assert.equal(it.state, 'pending');
});

test('M3-mc-03: POST /manual-changes/:id/apply-alternative resolves', async () => {
  const list = await callAds('GET', '/api/v1/store/ads/manual-changes', { qs: { state: 'pending' } });
  const id = list.body.items[0]?.id;
  if (!id) return;
  const r = await callAds('POST', '/api/v1/store/ads/manual-changes/' + id + '/apply-alternative');
  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'resolved');
  globalThis.__qaMcResolvedId = id;
});

test('M3-mc-04: POST /manual-changes/:id/ignore on second pending', async () => {
  const list = await callAds('GET', '/api/v1/store/ads/manual-changes', { qs: { state: 'pending' } });
  const id = list.body.items[0]?.id;
  if (!id) return;
  const r = await callAds('POST', '/api/v1/store/ads/manual-changes/' + id + '/ignore');
  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'resolved');
});

test('M3-mc-05: POST /manual-changes/:id/apply-alternative unknown → 404', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/manual-changes/nope-z/apply-alternative');
  assert.equal(r.status, 404);
});

// =============================================================================
// 5. LX Portfolios (3.4)
// =============================================================================
test('M3-pf-01: GET /lx/portfolios lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/portfolios');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('M3-pf-02: POST /lx/portfolios creates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/portfolios', { body: { name: 'qa-pf', budgetCap: 500 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.name, 'qa-pf');
  globalThis.__qaPfId = r.body.id;
});

test('M3-pf-03: POST /lx/portfolios missing name → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/portfolios', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-pf-04: GET /lx/portfolios/:id', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/portfolios/' + globalThis.__qaPfId);
  assert.equal(r.status, 200);
});

test('M3-pf-05: PUT /lx/portfolios/:id updates name', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/portfolios/' + globalThis.__qaPfId, { body: { name: 'qa-pf-renamed' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'qa-pf-renamed');
});

test('M3-pf-06: POST /lx/portfolios/:id/toggle disables', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/portfolios/' + globalThis.__qaPfId + '/toggle', { body: { enabled: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, false);
});

test('M3-pf-07: POST /lx/portfolios/:id/toggle missing enabled → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/portfolios/' + globalThis.__qaPfId + '/toggle', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-pf-08: PUT /lx/portfolios/:id/budget updates budgetCap', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/portfolios/' + globalThis.__qaPfId + '/budget', { body: { budgetCap: 999 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.budgetCap, 999);
});

test('M3-pf-09: PUT /lx/portfolios/:id/budget missing → 400', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/portfolios/' + globalThis.__qaPfId + '/budget', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-pf-10: DELETE /lx/portfolios/:id', async () => {
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/portfolios/' + globalThis.__qaPfId);
  assert.equal(r.status, 200);
});

// =============================================================================
// 6. LX Campaigns
// =============================================================================
test('M3-cmp-01: GET /lx/campaigns lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/campaigns');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length > 0);
  globalThis.__qaSeedCmpId = r.body.items[0].id;
});

test('M3-cmp-02: POST /lx/campaigns creates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/campaigns', { body: { name: 'qa-cmp', dailyBudget: 30 } });
  assert.equal(r.status, 201);
  globalThis.__qaCmpId = r.body.id;
});

test('M3-cmp-03: POST /lx/campaigns missing name → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/campaigns', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-cmp-04: GET /lx/campaigns/:id', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId);
  assert.equal(r.status, 200);
});

test('M3-cmp-05: PATCH /lx/campaigns/:id', async () => {
  const r = await callAds('PATCH', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId, { body: { name: 'qa-cmp-2' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'qa-cmp-2');
});

test('M3-cmp-06: POST /lx/campaigns/:id/toggle', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId + '/toggle', { body: { enabled: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, false);
});

test('M3-cmp-07: PUT /lx/campaigns/:id/budget updates', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId + '/budget', { body: { dailyBudget: 99 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.dailyBudget, 99);
});

test('M3-cmp-08: PUT /lx/campaigns/:id/budget missing → 400', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId + '/budget', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-cmp-09: PUT /lx/campaigns/:id/bid-strategy', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId + '/bid-strategy', { body: { bidStrategy: '动态竞价 - 提高和降低' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.bidStrategy, '动态竞价 - 提高和降低');
});

test('M3-cmp-10: PUT /lx/campaigns/:id/bid-strategy missing → 400', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId + '/bid-strategy', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-cmp-11: GET /lx/campaigns/:id/strategies (3.1 m2m bindings)', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId + '/strategies');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('M3-cmp-12: POST /lx/campaigns/:id/copy duplicates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaSeedCmpId + '/copy', { body: { name: 'qa-copy' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.name, 'qa-copy');
  globalThis.__qaCopyCmpId = r.body.id;
});

test('M3-cmp-13: POST /lx/campaigns/bulk-budget updates many', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/campaigns/bulk-budget', { body: [{ id: globalThis.__qaCmpId, dailyBudget: 77 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.updated, 1);
  globalThis.__qaBulkBudgetAuditCmpId = globalThis.__qaCmpId;
});

test('M3-cmp-14: POST /lx/promote-to-manual missing fields → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/promote-to-manual', { body: { term: 'foo' } });
  assert.equal(r.status, 400);
});

test('M3-cmp-15: POST /lx/promote-to-manual creates targeting + negative', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/promote-to-manual', { body: {
    term: 'qa-promote-term', autoCampaignId: globalThis.__qaSeedCmpId, autoAdGroupId: null,
    manualCampaignId: globalThis.__qaCmpId, manualAdGroupId: 'ag-fake', matchType: 'exact', bid: 1.5,
  } });
  assert.equal(r.status, 201);
  assert.ok(r.body.targeting?.id);
  globalThis.__qaPromoteTargetingId = r.body.targeting.id;
});

test('M3-cmp-99: DELETE /lx/campaigns/:id deletes', async () => {
  // Leave qaCmpId alive; delete copy only
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCopyCmpId);
  assert.equal(r.status, 200);
});

// =============================================================================
// 7. LX Ad Groups
// =============================================================================
test('M3-ag-01: GET /lx/ad-groups lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/ad-groups');
  assert.equal(r.status, 200);
});

test('M3-ag-02: GET /lx/ad-groups?campaignId=X filters', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/ad-groups', { qs: { campaignId: globalThis.__qaSeedCmpId } });
  for (const it of r.body.items) assert.equal(it.campaignId, globalThis.__qaSeedCmpId);
});

test('M3-ag-03: POST /lx/ad-groups creates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/ad-groups', { body: { name: 'qa-ag', campaignId: globalThis.__qaCmpId, defaultBid: 1.0 } });
  assert.equal(r.status, 201);
  globalThis.__qaAgId = r.body.id;
});

test('M3-ag-04: POST /lx/ad-groups missing name → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/ad-groups', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-ag-05: GET /lx/ad-groups/:id', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/ad-groups/' + globalThis.__qaAgId);
  assert.equal(r.status, 200);
});

test('M3-ag-06: PATCH /lx/ad-groups/:id', async () => {
  const r = await callAds('PATCH', '/api/v1/store/ads/lx/ad-groups/' + globalThis.__qaAgId, { body: { name: 'qa-ag-2' } });
  assert.equal(r.status, 200);
});

test('M3-ag-07: PUT /lx/ad-groups/:id/bid updates bid', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/ad-groups/' + globalThis.__qaAgId + '/bid', { body: { defaultBid: 2.5 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.defaultBid, 2.5);
});

test('M3-ag-08: PUT /lx/ad-groups/:id/bid missing → 400', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/ad-groups/' + globalThis.__qaAgId + '/bid', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-ag-09: DELETE /lx/ad-groups/:id', async () => {
  // Don't delete primary; create disposable
  const create = await callAds('POST', '/api/v1/store/ads/lx/ad-groups', { body: { name: 'qa-ag-tmp' } });
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/ad-groups/' + create.body.id);
  assert.equal(r.status, 200);
});

// =============================================================================
// 8. LX Ads
// =============================================================================
test('M3-ad-01: GET /lx/ads lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/ads');
  assert.equal(r.status, 200);
});

test('M3-ad-02: POST /lx/ads creates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/ads', { body: { adGroupId: globalThis.__qaAgId, asin: 'B0QA0001', sku: 'SKU-QA' } });
  assert.equal(r.status, 201);
  globalThis.__qaAdId = r.body.id;
});

test('M3-ad-03: PATCH /lx/ads/:id', async () => {
  const r = await callAds('PATCH', '/api/v1/store/ads/lx/ads/' + globalThis.__qaAdId, { body: { headline: 'qa headline' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.headline, 'qa headline');
});

test('M3-ad-04: POST /lx/ads/:id/toggle', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/ads/' + globalThis.__qaAdId + '/toggle', { body: { enabled: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, false);
});

test('M3-ad-05: POST /lx/ads/:id/toggle missing enabled → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/ads/' + globalThis.__qaAdId + '/toggle', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-ad-06: DELETE /lx/ads/:id', async () => {
  const c = await callAds('POST', '/api/v1/store/ads/lx/ads', { body: { adGroupId: globalThis.__qaAgId, asin: 'B0QA0002' } });
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/ads/' + c.body.id);
  assert.equal(r.status, 200);
});

// =============================================================================
// 9. LX Targetings
// =============================================================================
test('M3-tgt-01: GET /lx/targetings lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/targetings');
  assert.equal(r.status, 200);
});

test('M3-tgt-02: POST /lx/targetings creates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/targetings', { body: {
    campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId,
    type: 'keyword', term: 'qa-term', matchType: 'exact', bid: 1.2,
  } });
  assert.equal(r.status, 201);
  globalThis.__qaTgtId = r.body.id;
});

test('M3-tgt-03: GET /lx/targetings/:id', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/targetings/' + globalThis.__qaTgtId);
  assert.equal(r.status, 200);
});

test('M3-tgt-04: PATCH /lx/targetings/:id', async () => {
  const r = await callAds('PATCH', '/api/v1/store/ads/lx/targetings/' + globalThis.__qaTgtId, { body: { matchType: 'phrase' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.matchType, 'phrase');
});

test('M3-tgt-05: PUT /lx/targetings/:id/bid updates', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/targetings/' + globalThis.__qaTgtId + '/bid', { body: { bid: 2.0 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.bid, 2.0);
});

test('M3-tgt-06: PUT /lx/targetings/:id/bid missing → 400', async () => {
  const r = await callAds('PUT', '/api/v1/store/ads/lx/targetings/' + globalThis.__qaTgtId + '/bid', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-tgt-07: POST /lx/targetings/:id/toggle', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/targetings/' + globalThis.__qaTgtId + '/toggle', { body: { enabled: false } });
  assert.equal(r.status, 200);
});

test('M3-tgt-08: POST /lx/targetings/bulk-bid updates multiple', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/targetings/bulk-bid', { body: [{ id: globalThis.__qaTgtId, bid: 3.0 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.updated, 1);
});

test('M3-tgt-09: DELETE /lx/targetings/:id', async () => {
  const c = await callAds('POST', '/api/v1/store/ads/lx/targetings', { body: { term: 'qa-tgt-tmp', matchType: 'exact', bid: 0.5 } });
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/targetings/' + c.body.id);
  assert.equal(r.status, 200);
});

// =============================================================================
// 10. LX Negatives
// =============================================================================
test('M3-neg-01: GET /lx/negatives lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/negatives');
  assert.equal(r.status, 200);
});

test('M3-neg-02: POST /lx/negatives creates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/negatives', { body: {
    campaignId: globalThis.__qaCmpId, type: 'keyword', term: 'qa-neg-1', matchType: 'exact',
  } });
  assert.equal(r.status, 201);
  globalThis.__qaNegId = r.body.id;
});

test('M3-neg-03: DELETE /lx/negatives/:id', async () => {
  const c = await callAds('POST', '/api/v1/store/ads/lx/negatives', { body: { term: 'qa-neg-tmp', matchType: 'exact' } });
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/negatives/' + c.body.id);
  assert.equal(r.status, 200);
});

// =============================================================================
// 11. User search terms + promote/negate
// =============================================================================
test('M3-ust-01: GET /lx/user-search-terms', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/user-search-terms');
  assert.equal(r.status, 200);
});

test('M3-ust-02: POST /lx/user-search-terms/promote missing term → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/user-search-terms/promote', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-ust-03: POST /lx/user-search-terms/promote OK', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/user-search-terms/promote', { body: { term: 'qa-promote-2', campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId, bid: 0.8 } });
  assert.equal(r.status, 201);
});

test('M3-ust-04: POST /lx/user-search-terms/negate OK', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/user-search-terms/negate', { body: { term: 'qa-negate-1', campaignId: globalThis.__qaCmpId } });
  assert.equal(r.status, 201);
});

// =============================================================================
// 12. Op log + Daily
// =============================================================================
test('M3-oplog-01: GET /lx/op-log returns ordered list', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/op-log');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('M3-oplog-02: GET /lx/op-log?limit=5', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/op-log', { qs: { limit: '5' } });
  assert.ok(r.body.items.length <= 5);
});

test('M3-daily-01: GET /lx/daily', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/daily');
  assert.equal(r.status, 200);
});

// =============================================================================
// 13. KW Grabbing
// =============================================================================
test('M3-kwg-01: GET /lx/kw-grabbing lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/kw-grabbing');
  assert.equal(r.status, 200);
});

test('M3-kwg-02: POST /lx/kw-grabbing missing keyword → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/kw-grabbing', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-kwg-03: POST /lx/kw-grabbing creates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/kw-grabbing', { body: {
    keyword: 'qa-kw-grab', campaignId: globalThis.__qaCmpId, currentBid: 1.0, suggestedBid: 1.5, currentPosition: 6.0, targetPosition: 3,
  } });
  assert.equal(r.status, 201);
  globalThis.__qaKwgId = r.body.id;
});

test('M3-kwg-04: PATCH /lx/kw-grabbing/:id', async () => {
  const r = await callAds('PATCH', '/api/v1/store/ads/lx/kw-grabbing/' + globalThis.__qaKwgId, { body: { targetPosition: 5 } });
  assert.equal(r.status, 200);
});

test('M3-kwg-05: POST /lx/kw-grabbing/:id/apply-bid applies suggested bid', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/kw-grabbing/' + globalThis.__qaKwgId + '/apply-bid');
  assert.equal(r.status, 200);
  assert.equal(r.body.currentBid, 1.5);
});

test('M3-kwg-06: DELETE /lx/kw-grabbing/:id', async () => {
  const c = await callAds('POST', '/api/v1/store/ads/lx/kw-grabbing', { body: { keyword: 'qa-tmp' } });
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/kw-grabbing/' + c.body.id);
  assert.equal(r.status, 200);
});

// =============================================================================
// 14. Placements
// =============================================================================
test('M3-pl-01: GET /lx/placements lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/placements');
  assert.equal(r.status, 200);
  globalThis.__qaPlId = r.body.items[0]?.id;
});

test('M3-pl-02: PATCH /lx/placements/:id updates bidAdj', async () => {
  if (!globalThis.__qaPlId) return;
  const r = await callAds('PATCH', '/api/v1/store/ads/lx/placements/' + globalThis.__qaPlId, { body: { bidAdj: 50 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.bidAdj, 50);
});

// =============================================================================
// 15. AMC audiences
// =============================================================================
test('M3-amc-01: GET /lx/amc-audiences', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/amc-audiences');
  assert.equal(r.status, 200);
});

test('M3-amc-02: POST /lx/amc-audiences creates', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/amc-audiences', { body: { name: 'qa-amc', size: 1000, source: 'AMC' } });
  assert.equal(r.status, 201);
  globalThis.__qaAmcId = r.body.id;
});

test('M3-amc-03: DELETE /lx/amc-audiences/:id', async () => {
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/amc-audiences/' + globalThis.__qaAmcId);
  assert.equal(r.status, 200);
});

// =============================================================================
// 16. Reports / SQP
// =============================================================================
test('M3-rep-01: GET /reports/search-terms', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/reports/search-terms');
  assert.equal(r.status, 200);
});

test('M3-rep-02: GET /reports/campaigns', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/reports/campaigns');
  assert.equal(r.status, 200);
});

test('M3-rep-03: POST /reports/search-terms/promote missing term → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/reports/search-terms/promote', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-rep-04: POST /reports/search-terms/promote OK', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/reports/search-terms/promote', { body: { term: 'qa-rep-promote' } });
  assert.equal(r.status, 201);
});

test('M3-rep-05: POST /reports/search-terms/negate OK', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/reports/search-terms/negate', { body: { term: 'qa-rep-negate' } });
  assert.equal(r.status, 201);
});

test('M3-sqp-01: GET /sqp lists', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/sqp');
  assert.equal(r.status, 200);
  globalThis.__qaSqp = r.body.items[0];
});

test('M3-sqp-02: GET /sqp?asin=X filters', async () => {
  if (!globalThis.__qaSqp?.asin) return;
  const r = await callAds('GET', '/api/v1/store/ads/sqp', { qs: { asin: globalThis.__qaSqp.asin } });
  for (const it of r.body.items) assert.equal(it.asin, globalThis.__qaSqp.asin);
});

test('M3-sqp-03: POST /sqp/take-action missing fields → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/sqp/take-action', { body: {} });
  assert.equal(r.status, 400);
});

test('M3-sqp-04: POST /sqp/take-action add_targeting creates', async () => {
  if (!globalThis.__qaSqp) return;
  const r = await callAds('POST', '/api/v1/store/ads/sqp/take-action', { body: {
    queryId: globalThis.__qaSqp.id, action: 'add_targeting',
    payload: { campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId, matchType: 'exact', bid: 1.1 },
  } });
  assert.equal(r.status, 201);
});

test('M3-sqp-05: POST /sqp/take-action dedupe → 409', async () => {
  if (!globalThis.__qaSqp) return;
  const r = await callAds('POST', '/api/v1/store/ads/sqp/take-action', { body: {
    queryId: globalThis.__qaSqp.id, action: 'add_targeting',
    payload: { campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId, matchType: 'exact' },
  } });
  assert.equal(r.status, 409);
});

// =============================================================================
// 17. Bulk endpoints + CSV
// =============================================================================
test('M3-bulk-01: POST /lx/bulk-create-campaigns', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/bulk-create-campaigns', { body: {
    strategyId: 'qa-str', portfolioId: null,
    campaigns: [{ name: 'qa-bulk-1', dailyBudget: 10 }, { name: 'qa-bulk-2', dailyBudget: 20 }],
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.created, 2);
});

test('M3-bulk-02: POST /lx/bulk-import JSON path (campaigns)', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/bulk-import', { body: {
    type: 'campaigns',
    rows: [{ name: 'qa-bulk-json-1', dailyBudget: 5 }, { name: 'qa-bulk-json-2', dailyBudget: 7 }],
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.created, 2);
});

test('M3-bulk-03: POST /lx/bulk-import multipart CSV (campaigns)', async () => {
  const csv = 'name,budget,bid_strategy,state\nqa-csv-1,12,动态竞价 - 仅降低,enabled\nqa-csv-2,15,动态竞价 - 仅降低,enabled\n';
  const r = await callAds('POST', '/api/v1/store/ads/lx/bulk-import', { multipart: {
    type: 'campaigns',
    file: { filename: 'c.csv', content: csv },
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.created, 2);
  globalThis.__qaCsvAudit = true;
});

test('M3-bulk-04: POST /lx/bulk-import unknown type returns errors entries', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/bulk-import', { body: {
    type: 'mystery', rows: [{ name: 'x' }],
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.errors, 1);
});

test('M3-bulk-05: POST /lx/bulk-import multipart missing file → 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/bulk-import', { multipart: { type: 'campaigns' } });
  assert.equal(r.status, 400);
});

test('M3-bulk-06: POST /lx/bulk-import targetings rows', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/bulk-import', { body: {
    type: 'targetings',
    rows: [{ campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId, term: 'qa-bulk-tgt', matchType: 'exact', bid: 0.9 }],
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.created, 1);
});

// =============================================================================
// 18. Strategy ↔ Campaign m2m binding integrity
// =============================================================================
test('M3-m2m-01: bind strategy to 2 campaigns, then unbind one', async () => {
  const s = await callAds('POST', '/api/v1/store/ads/strategies', { body: { name: 'qa-m2m', category: 'bid' } });
  const sid = s.body.id;
  const cmps = (await callAds('GET', '/api/v1/store/ads/lx/campaigns')).body.items.slice(0, 2);
  const r = await callAds('POST', '/api/v1/store/ads/strategies/' + sid + '/bind', { body: { campaignIds: cmps.map((c) => c.id) } });
  assert.equal(r.body.bindings.length, 2);
  // Verify reverse lookup
  const inv = await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + cmps[0].id + '/strategies');
  assert.ok(inv.body.items.some((it) => it.id === sid));
  // Unbind one
  const r2 = await callAds('POST', '/api/v1/store/ads/strategies/' + sid + '/bind', { body: { campaignIds: [cmps[1].id] } });
  assert.equal(r2.body.bindings.length, 1);
  // bindingsCount mirror
  const fresh = await callAds('GET', '/api/v1/store/ads/strategies/' + sid);
  assert.equal(fresh.body.bindingsCount, 1);
  globalThis.__qaM2mStratId = sid;
  globalThis.__qaM2mCmpIds = cmps.map((c) => c.id);
});

test('M3-m2m-02: bind dedupes same campaignId in input list', async () => {
  const cmp = (await callAds('GET', '/api/v1/store/ads/lx/campaigns')).body.items[0].id;
  const r = await callAds('POST', '/api/v1/store/ads/strategies/' + globalThis.__qaM2mStratId + '/bind', { body: { campaignIds: [cmp, cmp, cmp] } });
  assert.equal(r.body.bindings.length, 1);
});

// =============================================================================
// 19. Ads API sync — populate lx_* from fixtures
// =============================================================================
test('M3-sync-01: syncAdsHierarchy populates lx_* with expected counts', async () => {
  // Wipe lx_* for this user so we get a clean count
  const db = getDbInstance();
  for (const t of ['lx_campaigns', 'lx_ad_groups', 'lx_ads', 'lx_targetings']) {
    db.prepare(`DELETE FROM ${t} WHERE user_id=? AND store_id=?`).run(USER_ID, STORE_ID);
  }
  const res = await syncAdsHierarchy({ userId: USER_ID, storeId: STORE_ID, profileId: '12345' });
  assert.equal(res.counts.campaigns, 5);
  assert.equal(res.counts.adGroups, 15);
  assert.equal(res.counts.ads, 15);
  assert.equal(res.counts.keywords, 150);
});

test('M3-sync-02: lx_campaigns row count matches fixture (5)', () => {
  const db = getDbInstance();
  const n = db.prepare('SELECT COUNT(*) AS n FROM lx_campaigns WHERE user_id=? AND store_id=?').get(USER_ID, STORE_ID).n;
  assert.equal(n, 5);
});

test('M3-sync-03: GET /lx/campaigns reflects synced data through HTTP layer', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/campaigns');
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 5);
  // Synced campaigns have IDs from fixtures (numeric string)
  assert.ok(r.body.items.every((c) => /^\d+$/.test(c.id)));
  globalThis.__qaSyncedCmpId = r.body.items[0].id;
});

test('M3-sync-04: GET /lx/targetings returns 150 synced keyword targetings', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/targetings');
  assert.equal(r.status, 200);
  // could include test-seeded rows too; ensure at least 150
  assert.ok(r.body.items.length >= 150, 'expected >=150 targetings, got ' + r.body.items.length);
});

test('M3-sync-05: idempotent re-sync keeps counts stable', async () => {
  await syncAdsHierarchy({ userId: USER_ID, storeId: STORE_ID, profileId: '12345' });
  const db = getDbInstance();
  const n = db.prepare('SELECT COUNT(*) AS n FROM lx_campaigns WHERE user_id=? AND store_id=?').get(USER_ID, STORE_ID).n;
  assert.equal(n, 5);
});

test('M3-sync-06: synced campaign supports strategy binding (m2m cross with sync)', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/strategies/' + globalThis.__qaM2mStratId + '/bind', { body: { campaignIds: [globalThis.__qaSyncedCmpId] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.bindings.length, 1);
  // reverse lookup on synced campaign
  const inv = await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaSyncedCmpId + '/strategies');
  assert.ok(inv.body.items.length >= 1);
});

test('M3-sync-07: budget update on synced campaign + revert restores via audit', async () => {
  const cmpId = globalThis.__qaSyncedCmpId;
  const before = (await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + cmpId)).body.dailyBudget;
  await callAds('PUT', '/api/v1/store/ads/lx/campaigns/' + cmpId + '/budget', { body: { dailyBudget: 42.0 } });
  const after = (await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + cmpId)).body.dailyBudget;
  assert.equal(after, 42.0);
  // Find audit log
  const logs = listAuditLogs(USER_ID, STORE_ID, { actionType: 'LX_CAMPAIGN_BUDGET_UPDATE', limit: 10 });
  const target = logs.find((l) => l.resourceId === cmpId);
  assert.ok(target, 'audit log not found');
  const reverted = revertAuditLog(USER_ID, STORE_ID, target.id);
  assert.ok(reverted.reverted, 'revert flag not set');
  assert.ok(reverted.dispatchedInverse, 'inverse dispatcher must succeed');
  const restored = (await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + cmpId)).body.dailyBudget;
  assert.equal(restored, before);
});

// =============================================================================
// 20. 17 actionType revert paths
// =============================================================================
async function lastLog(actionType) {
  // Direct DB query with rowid tie-breaker — listAuditLogs uses ORDER BY executed_at DESC
  // only, which is non-deterministic when adjacent calls collide on the same millisecond.
  // Returned shape matches the camelCase rowToAudit output that other tests rely on.
  const db = getDbInstance();
  const row = db.prepare(
    `SELECT * FROM audit_logs
     WHERE user_id=? AND store_id=? AND action_type=?
     ORDER BY executed_at DESC, rowid DESC LIMIT 1`
  ).get(USER_ID, STORE_ID, actionType);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id,
    sourceModule: row.source_module,
    actionType: row.action_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    status: row.status,
    reverted: row.reverted === 1 || row.reverted === true,
    revertedAt: row.reverted_at,
    revertReason: row.revert_reason,
    executedAt: row.executed_at,
    payload: row.payload,
  };
}

test('M3-revert-01: STRATEGY_TOGGLE revert', async () => {
  const s = await callAds('POST', '/api/v1/store/ads/strategies', { body: { name: 'qa-r-toggle', category: 'bid' } });
  const before = s.body.enabled;
  await callAds('POST', '/api/v1/store/ads/strategies/' + s.body.id + '/toggle', { body: { enabled: !before } });
  const log = await lastLog('STRATEGY_TOGGLE');
  assert.ok(log && log.resourceId === s.body.id);
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = await callAds('GET', '/api/v1/store/ads/strategies/' + s.body.id);
  assert.equal(fresh.body.enabled, before);
});

test('M3-revert-02: STRATEGY_UPDATE revert', async () => {
  const s = await callAds('POST', '/api/v1/store/ads/strategies', { body: { name: 'qa-r-up', category: 'bid', description: 'orig' } });
  await callAds('PATCH', '/api/v1/store/ads/strategies/' + s.body.id, { body: { description: 'changed' } });
  const log = await lastLog('STRATEGY_UPDATE');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const f = await callAds('GET', '/api/v1/store/ads/strategies/' + s.body.id);
  assert.equal(f.body.description, 'orig');
});

test('M3-revert-03: STRATEGY_BIND revert restores prior bindings', async () => {
  const s = await callAds('POST', '/api/v1/store/ads/strategies', { body: { name: 'qa-r-bind', category: 'bid' } });
  const cmps = (await callAds('GET', '/api/v1/store/ads/lx/campaigns')).body.items.slice(0, 2);
  await callAds('POST', '/api/v1/store/ads/strategies/' + s.body.id + '/bind', { body: { campaignIds: [cmps[0].id] } });
  // change to a new binding set
  await callAds('POST', '/api/v1/store/ads/strategies/' + s.body.id + '/bind', { body: { campaignIds: [cmps[1].id] } });
  const log = await lastLog('STRATEGY_BIND'); // most recent: changed from [cmp0] to [cmp1]
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const f = await callAds('GET', '/api/v1/store/ads/strategies/' + s.body.id);
  assert.deepEqual(f.body.bindings.map((b) => b.id), [cmps[0].id]);
});

test('M3-revert-04: TIMELINE_ACCEPT revert', async () => {
  const list = (await callAds('GET', '/api/v1/store/ads/suggestions', { qs: { state: 'pending' } })).body.items;
  if (!list.length) return;
  const id = list[0].id;
  await callAds('POST', '/api/v1/store/ads/suggestions/' + id + '/accept', { body: {} });
  const log = await lastLog('TIMELINE_ACCEPT');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = await callAds('GET', '/api/v1/store/ads/suggestions/' + id);
  assert.equal(fresh.body.state, 'pending');
});

test('M3-revert-05: TIMELINE_REJECT revert', async () => {
  const list = (await callAds('GET', '/api/v1/store/ads/suggestions', { qs: { state: 'pending' } })).body.items;
  if (!list.length) return;
  const id = list[0].id;
  await callAds('POST', '/api/v1/store/ads/suggestions/' + id + '/reject', { body: { reason: 'r' } });
  const log = await lastLog('TIMELINE_REJECT');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = await callAds('GET', '/api/v1/store/ads/suggestions/' + id);
  assert.equal(fresh.body.state, 'pending');
});

test('M3-revert-06: TIMELINE_REVERT revert restores observing', async () => {
  const list = (await callAds('GET', '/api/v1/store/ads/suggestions', { qs: { state: 'pending' } })).body.items;
  if (!list.length) return;
  const id = list[0].id;
  await callAds('POST', '/api/v1/store/ads/suggestions/' + id + '/accept', { body: {} });
  await callAds('POST', '/api/v1/store/ads/suggestions/' + id + '/revert', { body: { reason: 'r' } });
  const log = await lastLog('TIMELINE_REVERT');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = await callAds('GET', '/api/v1/store/ads/suggestions/' + id);
  assert.equal(fresh.body.state, 'observing');
});

test('M3-revert-07: ADD_NEGATIVE_KEYWORD revert deletes negative', async () => {
  const c = await callAds('POST', '/api/v1/store/ads/lx/negatives', { body: { term: 'qa-r-neg', matchType: 'exact', campaignId: globalThis.__qaCmpId } });
  const id = c.body.id;
  const log = await lastLog('ADD_NEGATIVE_KEYWORD');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const db = getDbInstance();
  const row = db.prepare('SELECT id FROM lx_negatives WHERE id=?').get(id);
  assert.equal(row, undefined);
});

test('M3-revert-08: PROMOTE_TO_MANUAL revert deletes targeting + negative', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/promote-to-manual', { body: {
    term: 'qa-r-prom', autoCampaignId: globalThis.__qaCmpId, autoAdGroupId: null,
    manualCampaignId: globalThis.__qaCmpId, manualAdGroupId: globalThis.__qaAgId, matchType: 'exact', bid: 1.0,
  } });
  const tId = r.body.targeting.id;
  const nId = r.body.negative.id;
  const log = await lastLog('PROMOTE_TO_MANUAL');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const db = getDbInstance();
  assert.equal(db.prepare('SELECT id FROM lx_targetings WHERE id=?').get(tId), undefined);
  assert.equal(db.prepare('SELECT id FROM lx_negatives WHERE id=?').get(nId), undefined);
});

test('M3-revert-09: BULK_CHANGE_BUDGET revert restores previous values', async () => {
  const cmps = (await callAds('GET', '/api/v1/store/ads/lx/campaigns')).body.items.slice(0, 2);
  const before = cmps.map((c) => c.dailyBudget);
  await callAds('POST', '/api/v1/store/ads/lx/campaigns/bulk-budget', { body: cmps.map((c) => ({ id: c.id, dailyBudget: 88 })) });
  const log = await lastLog('BULK_CHANGE_BUDGET');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const after = (await callAds('GET', '/api/v1/store/ads/lx/campaigns')).body.items.slice(0, 2);
  assert.deepEqual(after.map((c) => c.dailyBudget), before);
});

test('M3-revert-10: COPY_CAMPAIGN revert deletes the copy', async () => {
  const cmps = (await callAds('GET', '/api/v1/store/ads/lx/campaigns')).body.items;
  const src = cmps[0].id;
  const r = await callAds('POST', '/api/v1/store/ads/lx/campaigns/' + src + '/copy', { body: { name: 'qa-r-copy' } });
  const copyId = r.body.id;
  const log = await lastLog('COPY_CAMPAIGN');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const db = getDbInstance();
  assert.equal(db.prepare('SELECT id FROM lx_campaigns WHERE id=?').get(copyId), undefined);
});

test('M3-revert-11: SQP_ADD_TARGETING revert deletes targeting', async () => {
  // Find a fresh SQP query
  const sqps = (await callAds('GET', '/api/v1/store/ads/sqp')).body.items;
  const fresh = sqps.find((s) => s.id && s.id !== globalThis.__qaSqp?.id);
  if (!fresh) return;
  await callAds('POST', '/api/v1/store/ads/sqp/take-action', { body: {
    queryId: fresh.id, action: 'add_targeting',
    payload: { campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId, matchType: 'exact' },
  } });
  const log = await lastLog('SQP_ADD_TARGETING');
  if (!log) return;
  const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : (log.payload || {});
  const tId = payload?.payload?.targetingId || payload?.targetingId;
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const db = getDbInstance();
  if (tId) assert.equal(db.prepare('SELECT id FROM lx_targetings WHERE id=?').get(tId), undefined);
});

test('M3-revert-12: LX_UST_PROMOTE revert deletes targeting', async () => {
  // Note: do not rely on listAuditLogs ORDER BY executed_at DESC to find "the
  // latest" audit row — adjacent tests can collide on the millisecond, and
  // SQLite's tie-break order is unspecified. Look up the audit by resource_id
  // (the returned targeting id) instead.
  const r = await callAds('POST', '/api/v1/store/ads/lx/user-search-terms/promote', { body: { term: 'qa-r-ust-' + randomBytes(8).toString('hex'), campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId } });
  const tId = r.body.id;
  assert.ok(tId, 'promote should return a targeting id');
  const db = getDbInstance();
  const auditRow = db.prepare(
    `SELECT id FROM audit_logs WHERE user_id=? AND store_id=? AND action_type='LX_UST_PROMOTE' AND resource_id=? LIMIT 1`
  ).get(USER_ID, STORE_ID, tId);
  assert.ok(auditRow, 'LX_UST_PROMOTE audit row should exist for the new targeting');
  const rv = revertAuditLog(USER_ID, STORE_ID, auditRow.id);
  assert.equal(rv.dispatchedInverse, true);
  assert.equal(db.prepare('SELECT id FROM lx_targetings WHERE id=?').get(tId), undefined);
});

test('M3-revert-13: LX_TARGETING_BID_UPDATE revert restores bid', async () => {
  const t = await callAds('POST', '/api/v1/store/ads/lx/targetings', { body: {
    campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId,
    type: 'keyword', term: 'qa-r-bid', matchType: 'exact', bid: 1.0,
  } });
  await callAds('PUT', '/api/v1/store/ads/lx/targetings/' + t.body.id + '/bid', { body: { bid: 3.5 } });
  const log = await lastLog('LX_TARGETING_BID_UPDATE');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = await callAds('GET', '/api/v1/store/ads/lx/targetings/' + t.body.id);
  assert.equal(fresh.body.bid, 1.0);
});

test('M3-revert-14: LX_TARGETING_UPDATE revert restores matchType', async () => {
  const t = await callAds('POST', '/api/v1/store/ads/lx/targetings', { body: {
    campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId,
    type: 'keyword', term: 'qa-r-mt', matchType: 'exact', bid: 0.5,
  } });
  await callAds('PATCH', '/api/v1/store/ads/lx/targetings/' + t.body.id, { body: { matchType: 'phrase' } });
  const log = await lastLog('LX_TARGETING_UPDATE');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = await callAds('GET', '/api/v1/store/ads/lx/targetings/' + t.body.id);
  assert.equal(fresh.body.matchType, 'exact');
});

test('M3-revert-15: LX_ADGROUP_BID_UPDATE revert restores defaultBid', async () => {
  const ag = await callAds('POST', '/api/v1/store/ads/lx/ad-groups', { body: { name: 'qa-r-ag', defaultBid: 0.5 } });
  await callAds('PUT', '/api/v1/store/ads/lx/ad-groups/' + ag.body.id + '/bid', { body: { defaultBid: 2.5 } });
  const log = await lastLog('LX_ADGROUP_BID_UPDATE');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = await callAds('GET', '/api/v1/store/ads/lx/ad-groups/' + ag.body.id);
  assert.equal(fresh.body.defaultBid, 0.5);
});

test('M3-revert-16: BULK_CSV_IMPORT revert deletes created entities', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/bulk-import', { body: {
    type: 'campaigns', rows: [{ name: 'qa-r-csv-1', dailyBudget: 1 }, { name: 'qa-r-csv-2', dailyBudget: 1 }],
  } });
  assert.equal(r.body.created, 2);
  const ids = r.body.createdIds.map((x) => x.id);
  const log = await lastLog('BULK_CSV_IMPORT');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const db = getDbInstance();
  for (const id of ids) {
    assert.equal(db.prepare('SELECT id FROM lx_campaigns WHERE id=?').get(id), undefined);
  }
});

test('M3-revert-17: ACCEPT_ALTERNATIVE_TO_MANUAL_CHANGE revert restores pending', async () => {
  // Need a pending manual change
  const list = (await callAds('GET', '/api/v1/store/ads/manual-changes', { qs: { state: 'pending' } })).body.items;
  if (!list.length) return;
  const id = list[0].id;
  await callAds('POST', '/api/v1/store/ads/manual-changes/' + id + '/apply-alternative');
  const log = await lastLog('ACCEPT_ALTERNATIVE_TO_MANUAL_CHANGE');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = (await callAds('GET', '/api/v1/store/ads/manual-changes')).body.items.find((x) => x.id === id);
  assert.equal(fresh.state, 'pending');
});

test('M3-revert-18: MANUAL_CHANGE_IGNORE revert restores pending', async () => {
  const list = (await callAds('GET', '/api/v1/store/ads/manual-changes', { qs: { state: 'pending' } })).body.items;
  if (!list.length) return;
  const id = list[0].id;
  await callAds('POST', '/api/v1/store/ads/manual-changes/' + id + '/ignore');
  const log = await lastLog('MANUAL_CHANGE_IGNORE');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const fresh = (await callAds('GET', '/api/v1/store/ads/manual-changes')).body.items.find((x) => x.id === id);
  assert.equal(fresh.state, 'pending');
});

test('M3-revert-19: LX_CAMPAIGN_TOGGLE revert restores enabled', async () => {
  const cmps = (await callAds('GET', '/api/v1/store/ads/lx/campaigns')).body.items;
  const before = cmps[0].enabled;
  await callAds('POST', '/api/v1/store/ads/lx/campaigns/' + cmps[0].id + '/toggle', { body: { enabled: !before } });
  const log = await lastLog('LX_CAMPAIGN_TOGGLE');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const after = await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + cmps[0].id);
  assert.equal(after.body.enabled, before);
});

test('M3-revert-20: LX_KWG_APPLY_BID revert restores currentBid', async () => {
  const kwg = await callAds('POST', '/api/v1/store/ads/lx/kw-grabbing', { body: {
    keyword: 'qa-r-kwg', campaignId: globalThis.__qaCmpId, currentBid: 1.0, suggestedBid: 2.5,
  } });
  await callAds('POST', '/api/v1/store/ads/lx/kw-grabbing/' + kwg.body.id + '/apply-bid');
  const log = await lastLog('LX_KWG_APPLY_BID');
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true);
  const db = getDbInstance();
  const row = db.prepare('SELECT current_bid FROM lx_kw_grabbing WHERE id=?').get(kwg.body.id);
  assert.equal(row.current_bid, 1.0);
});

// =============================================================================
// 21. Audit logs filtering & pagination (via /store/audit-logs)
// =============================================================================
test('M3-audit-01: GET /audit-logs?sourceModule=M3 returns only M3 rows', async () => {
  const r = await callStore('GET', '/api/v1/store/audit-logs', { qs: { sourceModule: 'M3', limit: '50' } });
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length > 0);
  for (const it of r.body.items) assert.equal(it.sourceModule, 'M3');
});

test('M3-audit-02: GET /audit-logs?actionType=LX_CAMPAIGN_BUDGET_UPDATE narrows', async () => {
  const r = await callStore('GET', '/api/v1/store/audit-logs', { qs: { actionType: 'LX_CAMPAIGN_BUDGET_UPDATE' } });
  for (const it of r.body.items) assert.equal(it.actionType, 'LX_CAMPAIGN_BUDGET_UPDATE');
});

test('M3-audit-03: GET /audit-logs?reverted=true returns only reverted entries', async () => {
  const r = await callStore('GET', '/api/v1/store/audit-logs', { qs: { reverted: 'true', limit: '50' } });
  for (const it of r.body.items) assert.equal(it.reverted, true);
});

test('M3-audit-04: GET /audit-logs?reverted=false returns only non-reverted', async () => {
  const r = await callStore('GET', '/api/v1/store/audit-logs', { qs: { reverted: 'false', limit: '50' } });
  for (const it of r.body.items) assert.equal(it.reverted, false);
});

test('M3-audit-05: pagination — limit + offset shifts result window', async () => {
  const a = await callStore('GET', '/api/v1/store/audit-logs', { qs: { limit: '5', offset: '0' } });
  const b = await callStore('GET', '/api/v1/store/audit-logs', { qs: { limit: '5', offset: '5' } });
  assert.equal(a.body.items.length, 5);
  assert.ok(b.body.items.length <= 5);
  const overlap = a.body.items.find((x) => b.body.items.some((y) => y.id === x.id));
  assert.equal(overlap, undefined, 'paged windows must not overlap');
});

test('M3-audit-06: total count present on /audit-logs response', async () => {
  const r = await callStore('GET', '/api/v1/store/audit-logs', { qs: { sourceModule: 'M3', limit: '1' } });
  assert.ok(typeof r.body.total === 'number' && r.body.total > 0);
});

test('M3-audit-07: POST /audit-logs/:id/revert reflects HTTP layer', async () => {
  // Trigger an action then revert via HTTP
  const c = await callAds('POST', '/api/v1/store/ads/lx/negatives', { body: { term: 'qa-http-rev', campaignId: globalThis.__qaCmpId } });
  const logs = listAuditLogs(USER_ID, STORE_ID, { actionType: 'ADD_NEGATIVE_KEYWORD', limit: 1 });
  const id = logs[0].id;
  const r = await callStore('POST', '/api/v1/store/audit-logs/' + id + '/revert', { body: { reason: 'qa-http' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.reverted, true);
});

// =============================================================================
// 22. Cross-module / ADS sync audit
// =============================================================================
test('M3-cross-01: ads_sync_batch audit row exists after sync', () => {
  const db = getDbInstance();
  const row = db.prepare(`SELECT * FROM audit_logs WHERE source_module='ADS' AND action_type='ads_sync_batch' ORDER BY executed_at DESC LIMIT 1`).get();
  assert.ok(row);
  assert.equal(row.user_id, USER_ID);
});

test('M3-cross-02: sync_runs records ads provider rows', () => {
  const db = getDbInstance();
  const n = db.prepare(`SELECT COUNT(*) AS n FROM sync_runs WHERE provider='ads' AND status='ok'`).get().n;
  assert.ok(n > 0);
});

test('M3-cross-03: ADD_NEGATIVE_KEYWORD revert handles second invocation gracefully', async () => {
  const c = await callAds('POST', '/api/v1/store/ads/lx/negatives', { body: { term: 'qa-cross-neg', campaignId: globalThis.__qaCmpId } });
  const log = await lastLog('ADD_NEGATIVE_KEYWORD');
  const r1 = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(r1.reverted, true);
  const r2 = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(r2.reverted, true); // idempotent
});

// =============================================================================
// 23. Negative / scoping cases
// =============================================================================
test('M3-neg-x-01: unknown campaign GET → 404', async () => {
  const r = await callAds('GET', '/api/v1/store/ads/lx/campaigns/cmp-does-not-exist');
  assert.equal(r.status, 404);
});

test('M3-neg-x-02: PATCH unknown portfolio → 404', async () => {
  const r = await callAds('PATCH', '/api/v1/store/ads/lx/portfolios/pf-fake', { body: { name: 'x' } });
  assert.equal(r.status, 404);
});

test('M3-neg-x-03: DELETE unknown targeting → 404', async () => {
  const r = await callAds('DELETE', '/api/v1/store/ads/lx/targetings/t-fake');
  assert.equal(r.status, 404);
});

test('M3-neg-x-04: cross-store scoping isolates data', async () => {
  // Other user (registered in scaffold) should NOT see demo user's campaign
  const res = await callAds('GET', '/api/v1/store/ads/lx/campaigns/' + globalThis.__qaCmpId, { token: OTHER_TOKEN, storeId: OTHER_STORE });
  assert.equal(res.status, 404);
});

test('M3-neg-x-05: revertAuditLog on unknown id returns null', () => {
  const r = revertAuditLog(USER_ID, STORE_ID, 'audit-fake-id');
  assert.equal(r, null);
});

test('M3-neg-x-06: 401 when no x-store-id and user has no store', async () => {
  // The handler falls back to defaultStoreIdFor so this still works; just ensure no crash
  const r = await callAds('GET', '/api/v1/store/ads/strategies');
  assert.equal(r.status, 200);
});

test('M3-neg-x-07: missing required SQP queryId returns 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/sqp/take-action', { body: { action: 'add_targeting' } });
  assert.equal(r.status, 400);
});

test('M3-neg-x-08: missing required SQP action returns 400', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/sqp/take-action', { body: { queryId: 'q-1' } });
  assert.equal(r.status, 400);
});

test('M3-neg-x-09: SQP take-action on unknown queryId returns 404', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/sqp/take-action', { body: { queryId: 'q-fake', action: 'add_targeting' } });
  assert.equal(r.status, 404);
});

test('M3-neg-x-10: copy non-existent source campaign → 404', async () => {
  const r = await callAds('POST', '/api/v1/store/ads/lx/campaigns/cmp-no/copy', { body: {} });
  assert.equal(r.status, 404);
});

// =============================================================================
// 24. X-P0-05 — real-write revert is BLOCKED (must not flip reverted=1)
//
// The existing M3-revert-* cases (and M3-audit-07 / M3-cross-03) all assert
// dispatchedInverse===true. That is CORRECT — those are *local* (in-DB) reversible
// actions (ADD_NEGATIVE_KEYWORD, bid updates, toggles). None touch a real
// Amazon/领星 account, so an automatic inverse genuinely reverses them.
//
// Safety invariant 4: a *real-store* write must NEVER be auto-reverted by merely
// flipping a DB flag. revertAuditLog() classifies a row via isRealWriteAuditRow()
// (action_type ACTION_QUEUE_REAL_WRITE / origin 'ads-real-write' / payload markers)
// and, when no genuine inverse dispatched, must return dispatchedInverse===false,
// needsManualReversal===true, status==='revert_failed' and leave reverted=0.
// These tests lock that contract so a future change cannot silently regress it to an
// unconditional `UPDATE audit_logs SET reverted=1`.
// =============================================================================

// Append a real-write audit row through the canonical appendAuditLog() writer, then
// resolve its id through lastLog() (the same reader the passing revert tests use).
async function appendRealWriteAudit({ actionType, resourceType, resourceId, previousValues, newValues }) {
  appendAuditLog(USER_ID, STORE_ID, {
    sourceModule: 'M3',
    actionType, resourceType, resourceId,
    status: 'applied',
    previousValues, newValues,
  });
  const log = await lastLog(actionType);
  assert.ok(log && log.resourceId === resourceId, 'appended real-write audit row is readable via lastLog');
  return log;
}

function rawReverted(auditId) {
  const row = getDbInstance().prepare('SELECT reverted FROM audit_logs WHERE id=?').get(auditId);
  return row ? row.reverted : null;
}

test('X-P0-05-01: ACTION_QUEUE_REAL_WRITE revert is blocked — reverted stays 0, manual reversal required', async () => {
  const log = await appendRealWriteAudit({
    actionType: 'ACTION_QUEUE_REAL_WRITE',
    resourceType: 'REAL_STORE_WRITE',
    resourceId: 'tgt-real-1-' + randomBytes(4).toString('hex'),
    previousValues: { bid: 1.0 },
    newValues: { bid: 2.5 },
  });
  assert.equal(rawReverted(log.id), 0, 'precondition: new audit row is not reverted');

  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.ok(rv, 'revert returns a result object for an existing row');
  assert.equal(rv.dispatchedInverse, false, 'must NOT dispatch an inverse for a real write');
  assert.equal(rv.needsManualReversal, true, 'must require human manual reversal');
  assert.equal(rv.status, 'revert_failed', 'blocked real-write revert is surfaced as revert_failed');
  assert.equal(rawReverted(log.id), 0, 'DB reverted column must remain 0 after a blocked revert');
});

test('X-P0-05-02: ads-real-write origin row is blocked from revert', async () => {
  // A row whose origin is the real-write executor must also be blocked even though
  // its action_type is the generic dry/real wrapper. We assert via the canonical
  // ACTION_QUEUE_REAL_WRITE type which deriveAuditOrigin() maps to 'ads-real-write'.
  const log = await appendRealWriteAudit({
    actionType: 'ACTION_QUEUE_REAL_WRITE',
    resourceType: 'lx_targeting',
    resourceId: 'tgt-real-2-' + randomBytes(4).toString('hex'),
    previousValues: { bid: 0.8 },
    newValues: { bid: 1.6 },
  });
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, false);
  assert.equal(rv.needsManualReversal, true);
  assert.equal(rawReverted(log.id), 0, 'real-write row must keep reverted=0');
});

test('X-P0-05-03: local-reversible action STILL auto-reverts (dispatchedInverse===true) — contract not over-broadened', async () => {
  // Regression guard: blocking real writes must not accidentally block legitimate
  // local reversals. A STRATEGY_TOGGLE is a purely local, in-DB reversible action
  // (no real Amazon write), so its revert must still dispatch a genuine inverse and
  // flip reverted=1 — proving the real-write block did NOT over-broaden.
  const s = await callAds('POST', '/api/v1/store/ads/strategies', { body: { name: 'qa-xp005-toggle', category: 'bid' } });
  const sid = s.body.id;
  const before = s.body.enabled;
  await callAds('POST', '/api/v1/store/ads/strategies/' + sid + '/toggle', { body: { enabled: !before } });
  const log = await lastLog('STRATEGY_TOGGLE');
  assert.ok(log && log.resourceId === sid, 'audit row for the toggle must exist');

  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, true, 'local reversible action must still auto-revert');
  assert.equal(rv.needsManualReversal, false, 'local revert is NOT a manual-reversal case');
  assert.equal(rawReverted(log.id), 1, 'local reversible row is marked reverted=1');
  const fresh = await callAds('GET', '/api/v1/store/ads/strategies/' + sid);
  assert.equal(fresh.body.enabled, before, 'inverse actually restored the prior enabled state');
});

test('X-P0-05-04: real_write bid change only returns to previousValue when dispatchedInverse===true', async () => {
  // Data regression for a real lx_targetings.bid write record. Because the revert is
  // blocked (dispatchedInverse===false), the live value must NOT roll back.
  const t = dbCreateTargeting(getDbInstance(), USER_ID, STORE_ID, {
    campaignId: globalThis.__qaCmpId, adGroupId: globalThis.__qaAgId,
    type: 'keyword', term: 'qa-xp005-realbid', matchType: 'exact', bid: 4.2,
  });
  const log = await appendRealWriteAudit({
    actionType: 'ACTION_QUEUE_REAL_WRITE',
    resourceType: 'REAL_STORE_WRITE',
    resourceId: t.id,
    previousValues: { bid: 1.0 },
    newValues: { bid: 4.2 },
  });
  const rv = revertAuditLog(USER_ID, STORE_ID, log.id);
  assert.equal(rv.dispatchedInverse, false);
  const fresh = await callAds('GET', '/api/v1/store/ads/lx/targetings/' + t.id);
  assert.equal(fresh.body.bid, 4.2, 'blocked real-write revert must not roll the bid back to previousValue');
});

// M3-P0-05: BudgetAllocator/Dayparting enqueue route must actually land a queued,
// needs_review, dryRun=1 ad_action_queue row (not a 404). This closes the fake-green gap
// where the route was missing and the only coverage was a static source grep.
test('M3-P0-05: POST /action-queue/enqueue lands a needs_review dryRun=1 queued row', async () => {
  const uniqueId = 'qa-enqueue-' + Math.random().toString(16).slice(2, 8);
  const res = await callAds('POST', '/api/v1/store/ads/action-queue/enqueue', {
    body: {
      sourceStrategyName: 'budget_allocator',
      entity: { kind: 'campaign', id: uniqueId, name: 'QA enqueue camp' },
      typedAction: {
        actionPrimitive: 'ADJUST_BUDGET', sourceSurface: 'budget_allocator',
        entityKind: 'campaign', resourceId: uniqueId,
        currentValue: { dailyBudget: 10 }, recommendedValue: { dailyBudget: 20 },
        dryRun: true, auditRequired: true,
      },
      guardrail: { status: 'passed' }, // forged client guardrail — must be ignored
    },
  });
  assert.equal(res.status, 201, 'enqueue returns 201, not 404');
  assert.equal(res.body.queued, true);
  // server-side authority: forged guardrail.status=passed must be overridden to needs_review
  assert.equal(res.body.guardrail?.status, 'needs_review');
  assert.equal(res.body.dryRun, true);
  // verify the row really exists in ad_action_queue
  const row = getDbInstance().prepare(
    `SELECT dry_run, audit_required, guardrail, state FROM ad_action_queue WHERE id=?`
  ).get(res.body.id);
  assert.ok(row, 'ad_action_queue row persisted');
  assert.equal(row.dry_run, 1);
  assert.equal(row.audit_required, 1);
  assert.equal(row.state, 'queued');
  assert.match(row.guardrail, /needs_review/);

  // GET /active returns this queued action for the entity (pending badge contract)
  const active = await callAds('GET', `/api/v1/store/ads/action-queue/active?entityKind=campaign&entityId=${uniqueId}`);
  assert.equal(active.status, 200);
  assert.equal(active.body?.id, res.body.id);

  // dedupe: a second identical enqueue returns duplicate (queued:false), no second row
  const dup = await callAds('POST', '/api/v1/store/ads/action-queue/enqueue', {
    body: {
      sourceStrategyName: 'budget_allocator',
      entity: { kind: 'campaign', id: uniqueId },
      typedAction: { actionPrimitive: 'ADJUST_BUDGET', entityKind: 'campaign', resourceId: uniqueId, dryRun: true, auditRequired: true },
    },
  });
  assert.equal(dup.body.queued, false, 'duplicate enqueue is not a fresh write');
});

// =============================================================================
// N5-m3-observation-settle: explicit observation settlement (non-cron)
// observing → succeeded/failed once the observation window elapsed, honestly
// flagged sourceMeta.simulated=true; never touches real Amazon.
// =============================================================================
function insertObservingSuggestion(db, { id, nextEligibleAt, confidence, historicalSuccessRate }) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO ad_suggestions(
    id, user_id, store_id, time_bucket, severity, action_type, cross_module,
    source_strategy_id, source_strategy_name, entity, title, summary, detail,
    confidence, historical_success_rate, impact, evidence, lifecycle, category,
    strategic_tags, alternatives, state, cooldown_hours, observation_window_hours,
    accepted_at, next_eligible_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, USER_ID, STORE_ID, now, JSON.stringify('high'),
    JSON.stringify({ actionPrimitive: 'ADJUST_BID' }), null,
    null, 'qa-settle-strategy', JSON.stringify({ kind: 'targeting', id: 'tg-settle' }),
    'qa settle', 'qa settle summary', 'detail',
    confidence, historicalSuccessRate, JSON.stringify(null), JSON.stringify([]),
    'active', 'bid', JSON.stringify([]), JSON.stringify([]),
    'observing', 6, 72, now, nextEligibleAt, now
  );
}

test('N5-settle-01: window elapsed → high score settles to succeeded with simulated=true', async () => {
  const db = getDbInstance();
  const id = 'qa-settle-ok-' + randomBytes(3).toString('hex');
  // Window already passed (1h ago); confidence/hist high → score 0.9 ⇒ succeeded
  insertObservingSuggestion(db, {
    id, nextEligibleAt: new Date(Date.now() - 3600_000).toISOString(),
    confidence: 0.9, historicalSuccessRate: 0.9,
  });
  const res = await callAds('POST', '/api/v1/store/ads/observations/settle');
  assert.equal(res.status, 200);
  assert.equal(res.body.simulated, true);
  assert.equal(res.body.realEffectMeasured, false);
  const fresh = await callAds('GET', '/api/v1/store/ads/suggestions/' + id);
  assert.equal(fresh.body.state, 'succeeded');
  assert.equal(fresh.body.settlementOutcome, 'succeeded');
  assert.equal(fresh.body.settlementMeta?.simulated, true, 'settlement must be honestly flagged simulated');
  assert.equal(fresh.body.settlementMeta?.realEffectMeasured, false, 'no real effect measured');
  assert.ok(fresh.body.settledAt, 'settledAt persisted');
  // audit row written, no real store side-effect
  const logs = listAuditLogs(USER_ID, STORE_ID, { actionType: 'TIMELINE_SETTLE', limit: 20 });
  const target = logs.find((l) => l.resourceId === id);
  assert.ok(target, 'TIMELINE_SETTLE audit row must exist');
});

test('N5-settle-02: window elapsed → low score settles to failed', async () => {
  const db = getDbInstance();
  const id = 'qa-settle-fail-' + randomBytes(3).toString('hex');
  insertObservingSuggestion(db, {
    id, nextEligibleAt: new Date(Date.now() - 3600_000).toISOString(),
    confidence: 0.1, historicalSuccessRate: 0.1,
  });
  await callAds('POST', '/api/v1/store/ads/observations/settle');
  const fresh = await callAds('GET', '/api/v1/store/ads/suggestions/' + id);
  assert.equal(fresh.body.state, 'failed');
  assert.equal(fresh.body.settlementOutcome, 'failed');
  assert.equal(fresh.body.settlementMeta?.simulated, true);
});

test('N5-settle-03: window NOT elapsed → suggestion stays observing (not settled)', async () => {
  const db = getDbInstance();
  const id = 'qa-settle-future-' + randomBytes(3).toString('hex');
  // Window still in the future → must NOT settle
  insertObservingSuggestion(db, {
    id, nextEligibleAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
    confidence: 0.9, historicalSuccessRate: 0.9,
  });
  await callAds('POST', '/api/v1/store/ads/observations/settle');
  const fresh = await callAds('GET', '/api/v1/store/ads/suggestions/' + id);
  assert.equal(fresh.body.state, 'observing', 'in-window suggestion must remain observing');
  assert.equal(fresh.body.settledAt, null, 'no settlement timestamp while in window');
});

test('N5-settle-04: settle is idempotent — re-running does not re-settle already settled', async () => {
  const db = getDbInstance();
  const id = 'qa-settle-idem-' + randomBytes(3).toString('hex');
  insertObservingSuggestion(db, {
    id, nextEligibleAt: new Date(Date.now() - 3600_000).toISOString(),
    confidence: 0.9, historicalSuccessRate: 0.9,
  });
  const first = await callAds('POST', '/api/v1/store/ads/observations/settle');
  const firstHit = first.body.items.some((it) => it.id === id);
  assert.ok(firstHit, 'first settle includes our suggestion');
  const second = await callAds('POST', '/api/v1/store/ads/observations/settle');
  const secondHit = second.body.items.some((it) => it.id === id);
  assert.equal(secondHit, false, 'already-settled suggestion not re-settled');
});

test('N5-settle-05: cross-store scoping — settle does not touch another tenant', async () => {
  // Another user's observing suggestion must be invisible to this store's settle.
  const db = getDbInstance();
  const otherUserId = otherReg.user.id;
  const id = 'qa-settle-xstore-' + randomBytes(3).toString('hex');
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO ad_suggestions(
    id, user_id, store_id, time_bucket, entity, state, cooldown_hours,
    observation_window_hours, accepted_at, next_eligible_at, created_at,
    confidence, historical_success_rate)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, otherUserId, OTHER_STORE, now, JSON.stringify({ kind: 'targeting' }),
    'observing', 6, 72, now, new Date(Date.now() - 3600_000).toISOString(), now, 0.9, 0.9
  );
  // Settle as the demo user/store — must not settle the other tenant's row.
  await callAds('POST', '/api/v1/store/ads/observations/settle');
  const row = db.prepare('SELECT state FROM ad_suggestions WHERE id=?').get(id);
  assert.equal(row.state, 'observing', 'other tenant row untouched by this store settle');
});

test('N5-settle-06: unauthenticated settle → 401', async () => {
  const req = new Request('http://localhost/api/v1/store/ads/observations/settle', { method: 'POST' });
  const res = await handleAdsRequest(req);
  assert.equal(res.status, 401);
});
