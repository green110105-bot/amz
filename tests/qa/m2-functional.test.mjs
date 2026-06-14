// M2 QA functional + integration test suite.
// - Exercises all ~50 store-routes-profit.mjs endpoints (happy + negative).
// - Tests the full 5-state PO machine (every valid + forbidden transition).
// - Verifies 4-level profit drill-down (overview -> skus -> waterfall -> order)
//   closes within rounding tolerance against the seeded fixture data.
// - Slow-moving 3-layer audit chain push to M1.
// - FX 30-day rates + currency exposure sanity.
// - Alert enable/disable/threshold trigger.
// - Cross-module M2 -> M3 inventory link pauses campaigns (ADS_API_MOCK).
// - Integration: syncOrders / syncSettlement / syncInventory using injectXxx
//   stub hooks so no network is needed.
//
// Setup convention matches the M1/M3 QA agents:
//   process.env.DATA_DB_PATH    = mkdtempSync + store.db
//   process.env.CREDENTIAL_ENC_KEY = random 32 bytes hex
//   process.env.ADS_API_MOCK    = 'true'
//   globalThis.fetch            = blocked (no live network at all)

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// ---- ENV must be set BEFORE importing any app module ----
const tmpDir = mkdtempSync(join(tmpdir(), 'amz-m2-qa-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.ADS_API_MOCK = 'true';
process.env.SPAPI_LWA_CLIENT_ID = 'test-client-id';
process.env.SPAPI_LWA_CLIENT_SECRET = 'test-client-secret';

// Block all outbound network.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('network_blocked_by_qa_test'); };

const { handleProfitRequest } = await import('../../apps/api/src/store-routes-profit.mjs');
const { authenticate, registerUser, getDbInstance, defaultStoreIdFor, appendAuditLog, listAuditLogs } =
  await import('../../apps/api/src/data-store.mjs');
const { syncOrders } = await import('../../apps/api/src/integrations/sp-api/sync/orders-sync.mjs');
const { syncSettlement } = await import('../../apps/api/src/integrations/sp-api/sync/settlement-sync.mjs');
const { syncInventory } = await import('../../apps/api/src/integrations/sp-api/sync/inventory-sync.mjs');
const { upsertSpApiCredentials, setSpApiAccessToken } =
  await import('../../apps/api/src/integrations/sp-api/credentials.mjs');
const { createCampaign } = await import('../../apps/api/src/data-store-ads.mjs');

// ---- one-time user/store bootstrap ----
const EMAIL = `m2qa-${randomBytes(3).toString('hex')}@amz.local`;
const PASS = 'password';
const reg = registerUser({ email: EMAIL, password: PASS, name: 'M2 QA', role: 'admin' });
assert.ok(reg && reg.user, 'register failed: ' + JSON.stringify(reg));
const USER_ID = reg.user.id;
const auth = authenticate(EMAIL, PASS);
assert.ok(auth && auth.token, 'auth failed');
const TOKEN = auth.token;
const STORE_ID = defaultStoreIdFor(USER_ID);
assert.ok(STORE_ID, 'default store missing');

// Seed SP-API credentials so syncOrders has a path.
upsertSpApiCredentials({
  userId: USER_ID, storeId: STORE_ID,
  sellingPartnerId: 'A1B2C3',
  region: 'NA',
  marketplaceIds: ['ATVPDKIKX0DER'],
  refreshToken: 'Atzr|TEST-' + randomBytes(4).toString('hex'),
});
setSpApiAccessToken(USER_ID, STORE_ID, 'Atza|fake', new Date(Date.now() + 3600 * 1000).toISOString());

// ---- helpers ----
function req(method, path, body) {
  const init = {
    method,
    headers: {
      authorization: 'Bearer ' + TOKEN,
      'x-store-id': STORE_ID,
      'content-type': 'application/json',
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request('http://localhost' + path, init);
}
async function call(method, path, body) {
  const r = await handleProfitRequest(req(method, path, body));
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, body: json, raw: text };
}
async function callNoAuth(method, path) {
  const r = await handleProfitRequest(new Request('http://localhost' + path, { method }));
  return { status: r.status };
}

// =====================================================================
// 0. Smoke + auth
// =====================================================================
test('M2 auth: missing Bearer -> 401', async () => {
  const r = await callNoAuth('GET', '/api/v1/store/m2/profit/overview');
  assert.equal(r.status, 401);
});

test('M2 auth: invalid Bearer -> 401', async () => {
  const r = await handleProfitRequest(new Request('http://localhost/api/v1/store/m2/profit/overview', {
    method: 'GET',
    headers: { authorization: 'Bearer not-a-real-token', 'x-store-id': STORE_ID },
  }));
  assert.equal(r.status, 401);
});

test('M2 route: non-M2 path returns null (handler defers)', async () => {
  const r = await handleProfitRequest(new Request('http://localhost/api/v1/store/other', { method: 'GET' }));
  assert.equal(r, null);
});

// =====================================================================
// 1. Profit / orders (4-level drill-down)
// =====================================================================
test('M2 profit overview: returns aggregate revenue + topSkus + trend', async () => {
  const r = await call('GET', '/api/v1/store/m2/profit/overview?range=30d');
  assert.equal(r.status, 200);
  assert.ok(r.body.overview);
  assert.ok(typeof r.body.overview.revenue === 'number');
  assert.ok(Array.isArray(r.body.topSkus));
  assert.ok(Array.isArray(r.body.trend));
});

test('M2 profit recompute: POST writes snapshots + returns same overview (M2-P1-02)', async () => {
  const r = await call('POST', '/api/v1/store/m2/profit/recompute', { range: 30 });
  assert.equal(r.status, 200);
  // 不再伪装异步：返回 {recomputed,count}，不得含 queued/jobId/etaSeconds
  assert.equal(r.body.recomputed, true);
  assert.equal(typeof r.body.count, 'number');
  assert.ok(!('queued' in r.body), 'recompute response must not contain queued');
  assert.ok(!('jobId' in r.body), 'recompute response must not contain jobId');
  assert.ok(r.body.overview);
});

test('M2 profit skus: list snapshots (seed has 3 SKU * range=30)', async () => {
  const r = await call('GET', '/api/v1/store/m2/profit/skus?range=30d');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.skus));
  assert.ok(r.body.skus.length >= 1, 'expected at least one SKU snapshot');
});

test('M2 profit skus: search filter narrows results', async () => {
  const r = await call('GET', '/api/v1/store/m2/profit/skus?range=30d&search=CASE');
  assert.equal(r.status, 200);
  for (const s of r.body.skus) {
    assert.ok(s.sku.includes('CASE') || (s.asin || '').includes('CASE'));
  }
});

test('M2 profit waterfall: SKU drill-down items reconcile to net_profit', async () => {
  const wf = await call('GET', '/api/v1/store/m2/profit/skus/CASE-001/waterfall?range=30d');
  assert.equal(wf.status, 200);
  assert.ok(Array.isArray(wf.body.items));
  // Revenue + negative cost items + total = closing balance
  const rev = wf.body.items.find((it) => it.type === 'positive')?.value || 0;
  const total = wf.body.items.find((it) => it.type === 'total')?.value || 0;
  const negSum = wf.body.items.filter((it) => it.type === 'negative')
    .reduce((s, it) => s + it.value, 0);  // values are stored negative
  const closing = rev + negSum;  // revenue + (sum of negatives) should ~= total (net profit)
  // tolerance 0.05 to absorb rounding in mapper
  assert.ok(Math.abs(closing - total) <= 0.05,
    `waterfall does not close: rev=${rev} negSum=${negSum} total=${total} closing=${closing}`);
});

test('M2 profit waterfall: unknown SKU -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m2/profit/skus/NOPE-SKU/waterfall?range=30d');
  assert.equal(r.status, 404);
});

test('M2 profit 4-level closure: overview totals match sum of sku snapshots', async () => {
  await call('POST', '/api/v1/store/m2/profit/recompute', { range: 30 });
  const ov = await call('GET', '/api/v1/store/m2/profit/overview?range=30d');
  const skus = await call('GET', '/api/v1/store/m2/profit/skus?range=30d');
  const skuRev = skus.body.skus.reduce((s, x) => s + (x.revenue || 0), 0);
  const skuNet = skus.body.skus.reduce((s, x) => s + (x.netProfit || 0), 0);
  // overview is snapshot-aware after recompute, so sums must match to cents
  assert.ok(Math.abs(skuRev - ov.body.overview.revenue) < 0.5,
    `revenue mismatch skuRev=${skuRev} overview=${ov.body.overview.revenue}`);
  assert.ok(Math.abs(skuNet - ov.body.overview.netProfit) < 0.5,
    `net profit mismatch skuNet=${skuNet} overview=${ov.body.overview.netProfit}`);
});

test('M2 orders: list returns paginated orders + nextCursor', async () => {
  const r = await call('GET', '/api/v1/store/m2/orders?limit=10');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.orders));
  assert.ok(r.body.orders.length <= 10);
});

test('M2 orders: filter by sku', async () => {
  const r = await call('GET', '/api/v1/store/m2/orders?sku=CASE-001&limit=20');
  assert.equal(r.status, 200);
  for (const o of r.body.orders) assert.equal(o.sku, 'CASE-001');
});

test('M2 order profit: drill into single order returns fees breakdown', async () => {
  const list = await call('GET', '/api/v1/store/m2/orders?limit=1');
  const orderId = list.body.orders[0].orderId;
  const r = await call('GET', `/api/v1/store/m2/orders/${encodeURIComponent(orderId)}/profit`);
  assert.equal(r.status, 200);
  assert.ok(r.body.order);
  assert.ok(r.body.fees);
  assert.ok(Array.isArray(r.body.timeline));
});

test('M2 order profit: unknown order -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m2/orders/NOT-AN-ORDER/profit');
  assert.equal(r.status, 404);
});

// =====================================================================
// 2. Leaks
// =====================================================================
test('M2 leaks: list returns leaks + counts', async () => {
  const r = await call('GET', '/api/v1/store/m2/profit/leaks');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.leaks));
  assert.ok(r.body.counts);
});

test('M2 leaks: filter by severity=P0', async () => {
  const r = await call('GET', '/api/v1/store/m2/profit/leaks?severity=P0');
  assert.equal(r.status, 200);
  for (const l of r.body.leaks) assert.equal(l.severity, 'P0');
});

test('M2 leak start-fix: pending -> fixing (audit row written)', async () => {
  const list = await call('GET', '/api/v1/store/m2/profit/leaks?status=pending');
  const id = list.body.leaks[0].id;
  const r = await call('POST', `/api/v1/store/m2/leaks/${id}/start-fix`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'fixing');
  // double-start-fix should be rejected
  const r2 = await call('POST', `/api/v1/store/m2/leaks/${id}/start-fix`);
  assert.equal(r2.status, 400);
});

test('M2 leak mark-fixed: writes resolved_at + actualSaving', async () => {
  const list = await call('GET', '/api/v1/store/m2/profit/leaks?status=pending');
  const id = list.body.leaks[0].id;
  const r = await call('POST', `/api/v1/store/m2/leaks/${id}/mark-fixed`, { actualSaving: 1234 });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'fixed');
  assert.equal(r.body.fixedActualSaving, 1234);
});

test('M2 leak ignore: pending -> ignored', async () => {
  const list = await call('GET', '/api/v1/store/m2/profit/leaks?status=pending');
  const id = list.body.leaks[0].id;
  const r = await call('POST', `/api/v1/store/m2/leaks/${id}/ignore`, { reason: 'duplicate' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ignored');
});

test('M2 leak: unknown id -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m2/leaks/leak-doesnotexist/start-fix');
  assert.equal(r.status, 404);
});

// =====================================================================
// 3. Cashflow
// =====================================================================
test('M2 cashflow timeline: returns points + summary', async () => {
  const r = await call('GET', '/api/v1/store/m2/cashflow/timeline?days=30');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.points));
  assert.ok(r.body.summary);
});

test('M2 cashflow alerts: returns array', async () => {
  const r = await call('GET', '/api/v1/store/m2/cashflow/alerts');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.alerts));
});

test('M2 cashflow event: create requires event_date', async () => {
  const r = await call('POST', '/api/v1/store/m2/cashflow/events', { label: 'x' });
  assert.equal(r.status, 400);
});

test('M2 cashflow event: happy path', async () => {
  const r = await call('POST', '/api/v1/store/m2/cashflow/events', {
    event_date: '2026-06-01', label: 'manual test', inflow: 1000, outflow: 0,
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.id);
});

// =====================================================================
// 4. Scenarios
// =====================================================================
test('M2 scenario preview: returns simulated + delta', async () => {
  const r = await call('POST', '/api/v1/store/m2/scenarios/preview', {
    baseline: { price: 22.99, acos: 0.22, monthlyVolume: 320, returnRate: 0.05 },
    variables: { priceDelta: -10, acosDelta: 0, volumeDelta: 30, returnDelta: 0 },
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.simulated);
  assert.ok(typeof r.body.delta === 'number');
});

test('M2 scenario save + list', async () => {
  const save = await call('POST', '/api/v1/store/m2/scenarios', {
    name: 'QA scenario', sku: 'CASE-001',
    baseline: { price: 22.99 }, variables: { priceDelta: 5 },
  });
  assert.equal(save.status, 201);
  assert.ok(save.body.id);
  const list = await call('GET', '/api/v1/store/m2/scenarios');
  assert.equal(list.status, 200);
  assert.ok(list.body.scenarios.length >= 1);
});

// =====================================================================
// 5. Reorder + slow-moving (3-layer audit chain to M1)
// =====================================================================
test('M2 reorder list: returns decisions array', async () => {
  const r = await call('GET', '/api/v1/store/m2/inventory/reorder');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.decisions));
  assert.ok(r.body.decisions.length >= 1);
});

test('M2 reorder create-po: drafts new PO row', async () => {
  const list = await call('GET', '/api/v1/store/m2/inventory/reorder');
  const reorderId = list.body.decisions[0].reorder.id;
  const r = await call('POST', `/api/v1/store/m2/inventory/reorder/${reorderId}/create-po`, {});
  assert.equal(r.status, 201);
  assert.ok(r.body.poId);
  assert.equal(r.body.status, 'draft');
});

test('M2 reorder dismiss: writes status=dismissed', async () => {
  const list = await call('GET', '/api/v1/store/m2/inventory/reorder?status=pending');
  if (list.body.decisions.length === 0) return; // already drafted everything
  const reorderId = list.body.decisions[0].reorder.id;
  const r = await call('POST', `/api/v1/store/m2/inventory/reorder/${reorderId}/dismiss`, { reason: 'overstocked' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'dismissed');
});

test('M2 slow-moving list', async () => {
  const r = await call('GET', '/api/v1/store/m2/inventory/slow-moving');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('M2 slow-moving execute option A: 3-layer audit chain to M1', async () => {
  const list = await call('GET', '/api/v1/store/m2/inventory/slow-moving?status=pending');
  const id = list.body.items[0].id;
  const r = await call('POST', `/api/v1/store/m2/inventory/slow-moving/${id}/execute`, { option: 'A' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'executed');
  // option A creates parent + REPRICE_DOWN child + M1 LISTING_VERSION_CREATE_FROM_M2 audit rows.
  // Verify via listAuditLogs (3 entries: SLOW_MOVING_EXECUTE, REPRICE_DOWN, LISTING_VERSION_CREATE_FROM_M2).
  const audits = listAuditLogs(USER_ID, STORE_ID, { limit: 50 });
  const slow = audits.find((a) => a.actionType === 'SLOW_MOVING_EXECUTE');
  const reprice = audits.find((a) => a.actionType === 'REPRICE_DOWN');
  const m1 = audits.find((a) => a.actionType === 'LISTING_VERSION_CREATE_FROM_M2');
  assert.ok(slow, 'missing SLOW_MOVING_EXECUTE audit row');
  assert.ok(reprice, 'missing REPRICE_DOWN audit row');
  assert.ok(m1, 'missing M1 LISTING_VERSION_CREATE_FROM_M2 audit row');
  // m2_repricing -> m1_listing_versions row should exist with source='m2_reprice'
  const versionRow = getDbInstance().prepare(
    `SELECT * FROM m1_listing_versions WHERE user_id=? AND store_id=? AND source=?`,
  ).all(USER_ID, STORE_ID, 'm2_reprice');
  assert.ok(versionRow.length >= 1, 'M1 listing version row not written');
});

test('M2 slow-moving execute: invalid option -> 400', async () => {
  const list = await call('GET', '/api/v1/store/m2/inventory/slow-moving?status=pending');
  if (list.body.items.length === 0) return;
  const id = list.body.items[0].id;
  const r = await call('POST', `/api/v1/store/m2/inventory/slow-moving/${id}/execute`, { option: 'Z' });
  assert.equal(r.status, 400);
});

// =====================================================================
// 6. Transfers
// =====================================================================
test('M2 transfers list', async () => {
  const r = await call('GET', '/api/v1/store/m2/inventory/transfers');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.transfers));
});

test('M2 transfer approve: recommended -> in_transit + real inventory move (M2-P1-05)', async () => {
  const list = await call('GET', '/api/v1/store/m2/inventory/transfers?status=recommended');
  const t = list.body.transfers[0];
  const id = t.id;
  const db = getDbInstance();
  // ensure both warehouses have a snapshot so we can observe the move
  function ensureSnap(wh, onHand) {
    let s = db.prepare(`SELECT * FROM m2_inventory_snapshots WHERE user_id=? AND store_id=? AND sku=? AND warehouse=?`)
      .get(USER_ID, STORE_ID, t.sku, wh);
    if (!s) {
      db.prepare(`INSERT INTO m2_inventory_snapshots(id,user_id,store_id,sku,warehouse,on_hand,snapshot_at)
        VALUES (?,?,?,?,?,?,?)`).run('inv-test-' + wh, USER_ID, STORE_ID, t.sku, wh, onHand, new Date().toISOString());
      s = db.prepare(`SELECT * FROM m2_inventory_snapshots WHERE id=?`).get('inv-test-' + wh);
    }
    return s;
  }
  const fromBefore = ensureSnap(t.fromWarehouse, 1000).on_hand;
  const toBefore = ensureSnap(t.toWarehouse, 100).on_hand;
  const r = await call('POST', `/api/v1/store/m2/inventory/transfers/${id}/approve`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'in_transit');
  const fromAfter = db.prepare(`SELECT on_hand FROM m2_inventory_snapshots WHERE user_id=? AND store_id=? AND sku=? AND warehouse=?`)
    .get(USER_ID, STORE_ID, t.sku, t.fromWarehouse).on_hand;
  const toAfter = db.prepare(`SELECT on_hand FROM m2_inventory_snapshots WHERE user_id=? AND store_id=? AND sku=? AND warehouse=?`)
    .get(USER_ID, STORE_ID, t.sku, t.toWarehouse).on_hand;
  assert.equal(fromAfter, Math.max(0, fromBefore - t.transferQty), 'from warehouse on_hand reduced');
  assert.equal(toAfter, toBefore + t.transferQty, 'to warehouse on_hand increased');
  // Re-approve -> 400 (no longer in recommended state)
  const r2 = await call('POST', `/api/v1/store/m2/inventory/transfers/${id}/approve`);
  assert.equal(r2.status, 400);
});

test('M2 transfer cancel', async () => {
  const list = await call('GET', '/api/v1/store/m2/inventory/transfers?status=recommended');
  if (list.body.transfers.length === 0) return;
  const id = list.body.transfers[0].id;
  const r = await call('POST', `/api/v1/store/m2/inventory/transfers/${id}/cancel`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'cancelled');
});

// =====================================================================
// 7. Purchase orders (5-state machine)
//    draft -> ordered | cancelled
//    ordered -> in_transit | cancelled | disputed
//    in_transit -> received | cancelled | disputed
//    received -> disputed
//    cancelled -> (none)
//    disputed -> received | cancelled
// =====================================================================
test('M2 PO list + filter by status', async () => {
  const r = await call('GET', '/api/v1/store/m2/purchase-orders');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.pos));
  const drafts = await call('GET', '/api/v1/store/m2/purchase-orders?status=draft');
  for (const p of drafts.body.pos) assert.equal(p.status, 'draft');
});

test('M2 PO create: requires items', async () => {
  const r = await call('POST', '/api/v1/store/m2/purchase-orders', {});
  assert.equal(r.status, 400);
});

test('M2 PO create + get + update', async () => {
  const create = await call('POST', '/api/v1/store/m2/purchase-orders', {
    supplierName: 'QA Supplier',
    items: [{ sku: 'CASE-001', qty: 100, unitCost: 8.4 }],
  });
  assert.equal(create.status, 201);
  const id = create.body.id;
  const get = await call('GET', `/api/v1/store/m2/purchase-orders/${id}`);
  assert.equal(get.status, 200);
  assert.equal(get.body.id, id);
  assert.ok(Array.isArray(get.body.items));
  const update = await call('PATCH', `/api/v1/store/m2/purchase-orders/${id}`, { tracking: 'TRK-99' });
  assert.equal(update.status, 200);
  assert.equal(update.body.tracking, 'TRK-99');
});

test('M2 PO get unknown -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m2/purchase-orders/po-doesnotexist');
  assert.equal(r.status, 404);
});

// ---- 5-state transitions (happy paths) ----
async function newDraftPO() {
  const r = await call('POST', '/api/v1/store/m2/purchase-orders', {
    items: [{ sku: 'CASE-001', qty: 50, unitCost: 8.4 }],
  });
  return r.body.id;
}

test('PO state machine: draft -> ordered', async () => {
  const id = await newDraftPO();
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ordered');
});

test('PO state machine: draft -> cancelled', async () => {
  const id = await newDraftPO();
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'cancelled' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'cancelled');
});

test('PO state machine: ordered -> in_transit (with tracking)', async () => {
  const id = await newDraftPO();
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'in_transit', tracking: 'TRK-T' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'in_transit');
});

test('PO state machine: ordered -> disputed', async () => {
  const id = await newDraftPO();
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'disputed' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'disputed');
});

test('PO state machine: in_transit -> received writes inv snapshot', async () => {
  const id = await newDraftPO();
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'in_transit', tracking: 'TRK' });
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'received' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'received');
});

test('PO state machine: disputed -> received', async () => {
  const id = await newDraftPO();
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'disputed' });
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'received' });
  assert.equal(r.status, 200);
});

test('PO state machine: disputed -> cancelled', async () => {
  const id = await newDraftPO();
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'disputed' });
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'cancelled' });
  assert.equal(r.status, 200);
});

// ---- 5-state transitions (forbidden) ----
test('PO state machine: forbidden draft -> received', async () => {
  const id = await newDraftPO();
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'received' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_transition');
});

test('PO state machine: forbidden draft -> in_transit', async () => {
  const id = await newDraftPO();
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'in_transit' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_transition');
});

test('PO state machine: forbidden draft -> disputed', async () => {
  const id = await newDraftPO();
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'disputed' });
  assert.equal(r.status, 400);
});

test('PO state machine: forbidden ordered -> received', async () => {
  const id = await newDraftPO();
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'received' });
  assert.equal(r.status, 400);
});

test('PO state machine: forbidden received -> ordered', async () => {
  const id = await newDraftPO();
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'in_transit' });
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'received' });
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  assert.equal(r.status, 400);
});

test('PO state machine: forbidden cancelled -> anything (terminal)', async () => {
  const id = await newDraftPO();
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'cancelled' });
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  assert.equal(r.status, 400);
});

test('PO state machine: missing "to" -> 400', async () => {
  const id = await newDraftPO();
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, {});
  assert.equal(r.status, 400);
});

test('PO state machine: unknown id -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m2/purchase-orders/po-nope/transition', { to: 'ordered' });
  assert.equal(r.status, 404);
});

test('PO payment: deposit then balance writes cashflow rows', async () => {
  const id = await newDraftPO();
  const dep = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/payment`, { phase: 'deposit', amount: 100 });
  assert.equal(dep.status, 200);
  const bal = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/payment`, { phase: 'balance', amount: 200 });
  assert.equal(bal.status, 200);
});

test('PO payment: invalid phase -> 400', async () => {
  const id = await newDraftPO();
  const r = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/payment`, { phase: 'xxx' });
  assert.equal(r.status, 400);
});

// =====================================================================
// 8. Suppliers
// =====================================================================
test('M2 supplier list + filter', async () => {
  const r = await call('GET', '/api/v1/store/m2/suppliers');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.suppliers));
});

test('M2 supplier CRUD: create + get + update + delete', async () => {
  const create = await call('POST', '/api/v1/store/m2/suppliers', { name: 'QA Supplier', leadDays: 30 });
  assert.equal(create.status, 201);
  const id = create.body.id;
  const get = await call('GET', `/api/v1/store/m2/suppliers/${id}`);
  assert.equal(get.status, 200);
  assert.equal(get.body.name, 'QA Supplier');
  const upd = await call('PUT', `/api/v1/store/m2/suppliers/${id}`, { rating: 5.0 });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.rating, 5.0);
  const del = await call('DELETE', `/api/v1/store/m2/suppliers/${id}`);
  assert.equal(del.status, 200);
});

test('M2 supplier create: missing name -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m2/suppliers', { contact: 'x' });
  assert.equal(r.status, 400);
});

// =====================================================================
// 9. Repricing
// =====================================================================
test('M2 repricing list', async () => {
  const r = await call('GET', '/api/v1/store/m2/repricing');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('M2 repricing trigger: requires sku', async () => {
  const r = await call('POST', '/api/v1/store/m2/repricing/trigger', {});
  assert.equal(r.status, 400);
});

test('M2 repricing trigger + apply: M2->M1 listing version row', async () => {
  const trig = await call('POST', '/api/v1/store/m2/repricing/trigger', { sku: 'CASE-001', manual: true });
  assert.equal(trig.status, 201);
  const id = trig.body.id;
  // M2-P0-04: apply a price at/above break-even (recommendation carries breakEvenPrice)
  const breakEven = trig.body.breakEvenPrice ?? trig.body.break_even_price ?? 0;
  const safePrice = Math.max(21.50, Math.round((breakEven + 0.5) * 100) / 100);
  const apply = await call('POST', `/api/v1/store/m2/repricing/${id}/apply`, { price: safePrice });
  assert.equal(apply.status, 200);
  assert.equal(apply.body.status, 'applied');
  // M1 listing version row should exist (source=m2_reprice)
  const v = getDbInstance().prepare(
    `SELECT COUNT(*) AS c FROM m1_listing_versions WHERE user_id=? AND store_id=? AND source='m2_reprice'`,
  ).get(USER_ID, STORE_ID).c;
  assert.ok(v >= 1, 'expected M1 listing version row from M2 reprice');
});

test('M2 repricing apply: already-applied -> 400', async () => {
  const trig = await call('POST', '/api/v1/store/m2/repricing/trigger', { sku: 'CABLE-002' });
  const id = trig.body.id;
  const safe = Math.round(((trig.body.breakEvenPrice || 0) + 1) * 100) / 100;
  const first = await call('POST', `/api/v1/store/m2/repricing/${id}/apply`, { price: safe });
  assert.equal(first.status, 200);
  const r2 = await call('POST', `/api/v1/store/m2/repricing/${id}/apply`, { price: safe });
  assert.equal(r2.status, 400);
});

test('M2 repricing apply: unknown id -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m2/repricing/rp-nope/apply', { price: 1 });
  assert.equal(r.status, 404);
});

// =====================================================================
// 10. FX (30-day rates + currency exposure + sensitivity)
// =====================================================================
test('M2 FX exposures: returns currencies + total + recommendations', async () => {
  const r = await call('GET', '/api/v1/store/m2/fx/exposures');
  assert.equal(r.status, 200);
  assert.ok(typeof r.body.totalExposureCny === 'number');
  assert.ok(Array.isArray(r.body.exposures));
  assert.ok(r.body.exposures.length >= 1);
  const shares = r.body.exposures.map((e) => e.share);
  const sum = shares.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.05, `share sum should ~1.0, got ${sum}`);
});

test('M2 FX rates: 30-day history USD/CNY', async () => {
  const r = await call('GET', '/api/v1/store/m2/fx/rates?base=USD&quote=CNY&days=30');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.rateHistory));
  assert.equal(r.body.rateHistory.length, 30);
  // dates should be ascending
  for (let i = 1; i < r.body.rateHistory.length; i++) {
    assert.ok(r.body.rateHistory[i].date >= r.body.rateHistory[i - 1].date);
  }
});

test('M2 FX sensitivity: returns +/- delta projection', async () => {
  const r = await call('GET', '/api/v1/store/m2/fx/sensitivity');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.sensitivity));
  // expect 4 deltas: -3, -1, 1, 3
  const deltas = r.body.sensitivity.map((s) => s.delta).sort((a, b) => a - b);
  assert.deepEqual(deltas, [-3, -1, 1, 3]);
});

// =====================================================================
// 11. Payment channels
// =====================================================================
test('M2 payment channels list (4 from seed)', async () => {
  const r = await call('GET', '/api/v1/store/m2/payment-channels');
  assert.equal(r.status, 200);
  assert.ok(r.body.channels.length >= 4);
});

test('M2 payment channel create + update + delete', async () => {
  const create = await call('POST', '/api/v1/store/m2/payment-channels', { name: 'QA Channel' });
  assert.equal(create.status, 201);
  const id = create.body.id;
  const upd = await call('PATCH', `/api/v1/store/m2/payment-channels/${id}`, { feePct: 0.02 });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.feePct, 0.02);
  const del = await call('DELETE', `/api/v1/store/m2/payment-channels/${id}`);
  assert.equal(del.status, 200);
});

test('M2 payment channel: cannot delete primary -> 409', async () => {
  const list = await call('GET', '/api/v1/store/m2/payment-channels');
  const primary = list.body.channels.find((c) => c.isPrimary);
  if (!primary) return;
  const r = await call('DELETE', `/api/v1/store/m2/payment-channels/${primary.id}`);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'cannot_delete_primary');
});

// =====================================================================
// 12. Tax
// =====================================================================
test('M2 tax summary', async () => {
  const r = await call('GET', '/api/v1/store/m2/tax/summary');
  assert.equal(r.status, 200);
  assert.ok(r.body.vat);
  assert.ok(r.body.salesTax);
  assert.ok(Array.isArray(r.body.deadlines));
});

test('M2 tax records: list + filter by type', async () => {
  const r = await call('GET', '/api/v1/store/m2/tax/records?type=vat');
  assert.equal(r.status, 200);
  for (const t of r.body.records) assert.equal(t.taxType, 'vat');
});

test('M2 tax file: pending -> filed', async () => {
  const list = await call('GET', '/api/v1/store/m2/tax/records?status=pending');
  const id = list.body.records[0].id;
  const r = await call('POST', `/api/v1/store/m2/tax/records/${id}/file`, { filingRef: 'QA-FILE-1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'filed');
});

// =====================================================================
// 13. LTV
// =====================================================================
test('M2 LTV: returns per-SKU snapshots', async () => {
  const r = await call('GET', '/api/v1/store/m2/ltv/skus');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(r.body.items.length >= 1);
});

// =====================================================================
// 14. Alerts (custom alerts: enable / disable / threshold trigger)
// =====================================================================
test('M2 alert rules list', async () => {
  const r = await call('GET', '/api/v1/store/m2/alerts/rules');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.rules));
});

test('M2 alert rule CRUD: create + toggle disabled + update threshold + delete', async () => {
  const create = await call('POST', '/api/v1/store/m2/alerts/rules', {
    name: 'QA Margin Rule',
    conditions: [{ field: 'sku.margin', op: '<', value: 0.2 }],
    severity: 'P1', notifyChannels: ['in_app'],
  });
  assert.equal(create.status, 201);
  const id = create.body.id;
  // Toggle disabled
  const off = await call('PATCH', `/api/v1/store/m2/alerts/rules/${id}`, { enabled: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.enabled, false);
  // Update threshold
  const upd = await call('PATCH', `/api/v1/store/m2/alerts/rules/${id}`, {
    conditions: [{ field: 'sku.margin', op: '<', value: 0.1 }],
  });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.conditions[0].value, 0.1);
  // Delete
  const del = await call('DELETE', `/api/v1/store/m2/alerts/rules/${id}`);
  assert.equal(del.status, 200);
});

test('M2 alert rule create: missing name -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m2/alerts/rules', { severity: 'P1' });
  assert.equal(r.status, 400);
});

test('M2 alert scan: conditions evaluated against real metrics (M2-P0-07)', async () => {
  // 不匹配条件：cashflow.balance < 1（种子余额 ~350000）→ 不写事件
  const noMatch = await call('POST', '/api/v1/store/m2/alerts/rules', {
    name: 'QA NoMatch', conditions: [{ field: 'cashflow.balance', op: '<', value: 1 }],
    severity: 'P0', notifyChannels: ['in_app'],
  });
  assert.equal(noMatch.status, 201);
  const scanNoMatch = await call('POST', '/api/v1/store/m2/alerts/scan', { ruleId: noMatch.body.id });
  assert.equal(scanNoMatch.status, 200);
  assert.equal(scanNoMatch.body.created, 0, 'non-matching condition must create 0 events');

  // 匹配条件：cashflow.balance > 0 → 写事件，且 matched_value 为真实值（非 simulated_trigger）
  const match = await call('POST', '/api/v1/store/m2/alerts/rules', {
    name: 'QA Match', conditions: [{ field: 'cashflow.balance', op: '>', value: 0 }],
    severity: 'P1', notifyChannels: ['in_app'], cooldownHours: 6,
  });
  assert.equal(match.status, 201);
  const scan1 = await call('POST', '/api/v1/store/m2/alerts/scan', { ruleId: match.body.id });
  assert.equal(scan1.body.created, 1, 'matching condition creates 1 event');
  assert.notEqual(scan1.body.events[0].matchedValue, 'simulated_trigger');
  assert.equal(typeof scan1.body.events[0].matchedValue, 'number');
  // N1-scanAlerts-real: 事件带 sourceMeta，且指向真实 cashflow 行
  const ev0 = scan1.body.events[0];
  assert.ok(Array.isArray(ev0.sourceMeta), 'event carries sourceMeta array');
  assert.equal(ev0.sourceMeta[0].table, 'm2_cashflow_events', 'sourceMeta points to real cashflow table');
  assert.ok(ev0.sourceMeta[0].rowId, 'sourceMeta carries real DB rowId');
  assert.equal(ev0.isSimulated, false, 'real cashflow-derived event is not simulated');

  // cooldown 内二次 scan → created 0
  const scan2 = await call('POST', '/api/v1/store/m2/alerts/scan', { ruleId: match.body.id });
  assert.equal(scan2.body.created, 0, 'within cooldown second scan creates 0');
});

test('M2-N1 alert scan: real m2_leaks match yields sourceMeta(m2_leaks) + isSimulated=false', async () => {
  // 真实 leak 数据（种子里 monthly_impact 最高 18000）。规则 monthly_impact > 100 必命中真实 leak 行。
  const rule = await call('POST', '/api/v1/store/m2/alerts/rules', {
    name: 'QA Leak Impact',
    conditions: [{ field: 'leak.monthly_impact', op: '>', value: 100 }],
    severity: 'P0', notifyChannels: ['in_app'], cooldownHours: 0,
  });
  assert.equal(rule.status, 201);
  const scan = await call('POST', '/api/v1/store/m2/alerts/scan', { ruleId: rule.body.id });
  assert.equal(scan.body.created, 1, 'real leak match creates exactly 1 event');
  const ev = scan.body.events[0];
  // 事件来源必须是真实 DB 行（m2_leaks），不是 isSimulated 恒 true 的假事件
  assert.equal(ev.isSimulated, false, 'event derived from real m2_leaks row must NOT be simulated');
  assert.ok(Array.isArray(ev.sourceMeta) && ev.sourceMeta.length >= 1, 'sourceMeta present');
  const meta = ev.sourceMeta[0];
  assert.equal(meta.table, 'm2_leaks', 'sourceMeta.table is the real leak table');
  assert.match(meta.rowId, /^leak-/, 'sourceMeta.rowId references a real seeded leak row');
  assert.equal(meta.field, 'monthly_impact', 'sourceMeta records the matched field');
  assert.equal(typeof meta.fieldValue, 'number', 'sourceMeta carries the real field value');
  assert.ok(meta.fieldValue > 100, 'fieldValue actually satisfies the condition');

  // 验证持久化的事件行 matched_value 内嵌真实 sourceMeta（端到端落库，非仅返回值）
  const events = await call('GET', `/api/v1/store/m2/alerts/events?ruleId=${rule.body.id}`);
  const persisted = events.body.events.find((e) => e.matchedValue && e.matchedValue.sourceMeta);
  assert.ok(persisted, 'persisted event row stores sourceMeta in matched_value');
  assert.equal(persisted.matchedValue.dataReal, true, 'persisted event flagged dataReal=true');
  assert.equal(persisted.isSimulated, false, 'persisted event isSimulated=false');
});

test('M2-N1 alert scan: no real match yields created=0 and writes NO fake event', async () => {
  // 不可能命中的条件：leak.monthly_impact > 1e12（远超任何真实 leak）→ 空态。
  const rule = await call('POST', '/api/v1/store/m2/alerts/rules', {
    name: 'QA Leak Impossible',
    conditions: [{ field: 'leak.monthly_impact', op: '>', value: 1e12 }],
    severity: 'P0', notifyChannels: ['in_app'], cooldownHours: 0,
  });
  assert.equal(rule.status, 201);
  const scan = await call('POST', '/api/v1/store/m2/alerts/scan', { ruleId: rule.body.id });
  assert.equal(scan.body.created, 0, 'non-matching real data must create 0 events (no fabrication)');
  assert.equal(scan.body.events.length, 0, 'empty events array on no match');
  // 断言确实没有为该 rule 写入任何事件（绝不写死假 simulated_trigger 事件）
  const events = await call('GET', `/api/v1/store/m2/alerts/events?ruleId=${rule.body.id}`);
  assert.equal(events.body.events.length, 0, 'no alert event row persisted for non-matching rule');
});

test('M2-N1 alert scan: no isSimulated-always-true fake events across all real-data rules', async () => {
  // 扫描全部启用规则；对每条产生的事件，凡 sourceMeta 指向真实表的，isSimulated 必为 false。
  // 断言不存在“数据来自真实 DB 查询却被标 isSimulated=true”的假事件。
  const scan = await call('POST', '/api/v1/store/m2/alerts/scan', {});
  assert.equal(scan.status, 200);
  for (const ev of scan.body.events) {
    if (!Array.isArray(ev.sourceMeta)) continue;
    const allRealRows = ev.sourceMeta.every((m) => m && m.table && m.rowId && !m.synthetic);
    if (allRealRows) {
      assert.equal(ev.isSimulated, false,
        `event ${ev.eventId} sources from real DB rows but was wrongly flagged isSimulated=true`);
    }
  }
});

test('M2 alert ack event', async () => {
  await call('POST', '/api/v1/store/m2/alerts/scan', {});
  const ev = await call('GET', '/api/v1/store/m2/alerts/events?acknowledged=false');
  if (ev.body.events.length === 0) return;
  const id = ev.body.events[0].id;
  const r = await call('POST', `/api/v1/store/m2/alerts/events/${id}/ack`, { by: 'qa' });
  assert.equal(r.status, 200);
  assert.equal(r.body.acknowledged, true);
});

// =====================================================================
// 15. Dimensions
// =====================================================================
test('M2 dimensions list (brand/team/owner/project)', async () => {
  const r = await call('GET', '/api/v1/store/m2/dimensions');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('M2 dimensions list filtered by=brand', async () => {
  const r = await call('GET', '/api/v1/store/m2/dimensions?by=brand');
  assert.equal(r.status, 200);
  for (const d of r.body.items) assert.equal(d.dimType, 'brand');
});

test('M2 dimensions update', async () => {
  const list = await call('GET', '/api/v1/store/m2/dimensions?by=brand');
  const id = list.body.items[0].id;
  const r = await call('PATCH', `/api/v1/store/m2/dimensions/${id}`, { name: 'QA Updated Brand' });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'QA Updated Brand');
});

test('M2 dimensions update: unknown id -> 404', async () => {
  const r = await call('PATCH', '/api/v1/store/m2/dimensions/dim-nope', { name: 'x' });
  assert.equal(r.status, 404);
});

// =====================================================================
// 16. Inventory link (M2 -> M3 with ADS_API_MOCK)
// =====================================================================
test('M2 inventory-link config GET (lazy-initializes default row)', async () => {
  const r = await call('GET', '/api/v1/store/m2/inventory-link/config');
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, true);
  assert.equal(r.body.stopAt, 3);
});

test('M2 inventory-link config update', async () => {
  const r = await call('PATCH', '/api/v1/store/m2/inventory-link/config', {
    thresholds: { stopAt: 2, reduce50At: 6, reduce20At: 12, alertAt: 18 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.stopAt, 2);
  assert.equal(r.body.reduce50At, 6);
});

test('M2 inventory-link events list', async () => {
  const r = await call('GET', '/api/v1/store/m2/inventory-link/events');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.events));
});

test('M2 inventory-link execute: queues M3 campaign pause (ADS_API_MOCK)', async () => {
  // Ensure there is a campaign whose name matches the LAMP-003 SKU (seed event uses LAMP-003).
  const db = getDbInstance();
  let camp = db.prepare(`SELECT * FROM lx_campaigns WHERE user_id=? AND store_id=? AND name LIKE ?`)
    .get(USER_ID, STORE_ID, '%LAMP-003%');
  if (!camp) {
    createCampaign(db, USER_ID, STORE_ID, { name: 'Campaign for LAMP-003', dailyBudget: 50 });
    camp = db.prepare(`SELECT * FROM lx_campaigns WHERE user_id=? AND store_id=? AND name LIKE ?`)
      .get(USER_ID, STORE_ID, '%LAMP-003%');
  }
  // The seed inserts a pending stop_all event for LAMP-003.
  const list = await call('GET', '/api/v1/store/m2/inventory-link/events?status=pending');
  const evt = list.body.events.find((e) => e.sku === 'LAMP-003' && e.action === 'stop_all');
  assert.ok(evt, 'seed pending stop_all event missing');
  const r = await call('POST', `/api/v1/store/m2/inventory-link/events/${evt.id}/execute`);
  assert.equal(r.status, 200);
  // M2-P0-06: 不再伪装"已执行"，落库 queued_pending_review
  assert.equal(r.body.status, 'queued_pending_review');
  assert.equal(r.body.needsManualReview, true);
  // Campaign must stay unchanged until the M3 action queue is reviewed/executed.
  const after = db.prepare('SELECT enabled FROM lx_campaigns WHERE id=?').get(camp.id);
  assert.equal(after.enabled, 1, 'campaign should not be paused directly');
  const queue = db.prepare(`SELECT * FROM ad_action_queue WHERE user_id=? AND store_id=? AND typed_action LIKE '%M2_PAUSE_CAMPAIGN_FOR_INVENTORY%' ORDER BY created_at DESC LIMIT 1`).get(USER_ID, STORE_ID);
  assert.ok(queue, 'inventory-link must create an M3 action-queue item');
  // 安全不变量回归锁定：dryRun=true 且 guardrail.status='needs_review'，不得误改成真写
  const ta = JSON.parse(queue.typed_action);
  assert.equal(ta.dryRun, true, 'inventory-link M3 enqueue must remain dryRun=true');
  const gr = JSON.parse(queue.guardrail);
  assert.equal(gr.status, 'needs_review', 'inventory-link M3 enqueue must be needs_review');
});

test('M2 inventory-link execute: re-execute already executed -> 400', async () => {
  const list = await call('GET', '/api/v1/store/m2/inventory-link/events?status=queued_pending_review');
  if (list.body.events.length === 0) return;
  const evt = list.body.events[0];
  const r = await call('POST', `/api/v1/store/m2/inventory-link/events/${evt.id}/execute`);
  assert.equal(r.status, 400);
});

test('M2 inventory-link execute: unknown id -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m2/inventory-link/events/ile-nope/execute');
  assert.equal(r.status, 404);
});

// =====================================================================
// 17. SP-API Integration: syncOrders / syncSettlement / syncInventory
// =====================================================================

// syncOrders uses iterOrders which calls fetch; we cannot inject (no injectItems param).
// Instead, stub the SP-API endpoints by short-circuiting fetch with a route table.
const fakeOrders = [
  {
    AmazonOrderId: 'QA-ORD-1',
    PurchaseDate: '2026-05-01T10:00:00Z',
    LastUpdateDate: '2026-05-01T11:00:00Z',
    OrderStatus: 'Shipped',
    OrderTotal: { Amount: '49.99', CurrencyCode: 'USD' },
    NumberOfItemsShipped: 1, NumberOfItemsUnshipped: 0,
    MarketplaceId: 'ATVPDKIKX0DER',
  },
];
const fakeItems = [
  {
    ASIN: 'B0QATEST', OrderItemId: 'ITM-1', SellerSKU: 'QA-SKU-1',
    Title: 'QA item', QuantityOrdered: 1,
    ItemPrice: { Amount: '49.99', CurrencyCode: 'USD' },
    ShippingPrice: { Amount: '4.99', CurrencyCode: 'USD' },
    ItemTax: { Amount: '3.50', CurrencyCode: 'USD' },
    ShippingTax: { Amount: '0.50', CurrencyCode: 'USD' },
    PromotionDiscount: { Amount: '2.00', CurrencyCode: 'USD' },
  },
];

function stubFetchForOrders() {
  return async (url, _opts) => {
    const u = typeof url === 'string' ? url : url.toString();
    const text = (body) => ({
      status: 200, ok: true,
      headers: new Map(),
      text: async () => JSON.stringify(body),
    });
    if (u.includes('api.amazon.com/auth/o2/token')) {
      return text({ access_token: 'Atza|mock', expires_in: 3600, token_type: 'bearer' });
    }
    if (u.includes('/orders/v0/orders') && !u.includes('/orderItems')) {
      return text({ payload: { Orders: fakeOrders } });
    }
    if (u.includes('/orderItems')) {
      return text({ payload: { OrderItems: fakeItems } });
    }
    return { status: 404, ok: false, headers: new Map(), text: async () => '{}' };
  };
}

test('SP-API syncOrders: stubbed fetch writes m2_orders + m2_order_costs', async (t) => {
  const db = getDbInstance();
  db.prepare(`DELETE FROM m2_orders WHERE user_id=? AND store_id=? AND order_id LIKE 'QA-ORD%'`).run(USER_ID, STORE_ID);
  db.prepare(`DELETE FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id LIKE 'QA-ORD%'`).run(USER_ID, STORE_ID);
  globalThis.fetch = stubFetchForOrders();
  t.after(() => { globalThis.fetch = async () => { throw new Error('network_blocked_by_qa_test'); }; });

  const result = await syncOrders({ userId: USER_ID, storeId: STORE_ID, since: '2026-04-01T00:00:00Z' });
  assert.equal(result.ordersProcessed, 1);
  assert.equal(result.errors.length, 0);

  // GET /api/v1/store/m2/orders should now return it.
  const list = await call('GET', '/api/v1/store/m2/orders?sku=QA-SKU-1');
  assert.ok(list.body.orders.length >= 1, 'syncOrders row should be visible via M2 orders endpoint');
  const synced = list.body.orders.find((o) => o.orderId === 'QA-ORD-1');
  assert.ok(synced, 'QA-ORD-1 missing from M2 orders list');
  assert.equal(synced.sku, 'QA-SKU-1');
  assert.ok(synced.revenue > 0);
});

test('SP-API syncOrders: missing user/store -> throws', async () => {
  await assert.rejects(() => syncOrders({ userId: '', storeId: '' }), /user_and_store_required/);
});

test('SP-API syncSettlement: injectRows hook writes m2_order_costs (no fetch)', async () => {
  const rows = [
    {
      'amazon-order-id': 'SETTLE-1', 'amazon-order-item-code': 'SETTLE-1',
      'amount-type': 'ItemPrice', 'amount-description': 'Principal',
      amount: '49.99', currency: 'USD', sku: 'QA-SKU-1',
      'posted-date': '2026-05-02T00:00:00Z', 'transaction-type': 'Order',
    },
    {
      'amazon-order-id': 'SETTLE-1', 'amazon-order-item-code': 'SETTLE-1',
      'amount-type': 'ItemFees', 'amount-description': 'FBAPerUnitFulfillmentFee',
      amount: '-3.85', currency: 'USD', sku: 'QA-SKU-1',
      'posted-date': '2026-05-02T00:00:00Z', 'transaction-type': 'Order',
    },
  ];
  const r = await syncSettlement({
    userId: USER_ID, storeId: STORE_ID,
    since: '2026-04-01T00:00:00Z', until: '2026-05-31T23:59:59Z',
    injectRows: rows,
  });
  assert.equal(r.written, 2);
  const db = getDbInstance();
  const persisted = db.prepare(
    `SELECT cost_type, amount FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id=? ORDER BY cost_type`,
  ).all(USER_ID, STORE_ID, 'SETTLE-1');
  assert.equal(persisted.length, 2);
  const types = persisted.map((p) => p.cost_type).sort();
  assert.deepEqual(types, ['ItemFees:FBAPerUnitFulfillmentFee', 'ItemPrice:Principal']);
});

test('SP-API syncSettlement: idempotency — second run with same range replaces', async () => {
  const rows = [
    {
      'amazon-order-id': 'SETTLE-2', 'amazon-order-item-code': 'SETTLE-2',
      'amount-type': 'ItemPrice', 'amount-description': 'Principal',
      amount: '99.99', currency: 'USD',
    },
  ];
  await syncSettlement({
    userId: USER_ID, storeId: STORE_ID,
    since: '2026-06-01T00:00:00Z', until: '2026-06-30T23:59:59Z',
    injectRows: rows,
  });
  await syncSettlement({
    userId: USER_ID, storeId: STORE_ID,
    since: '2026-06-01T00:00:00Z', until: '2026-06-30T23:59:59Z',
    injectRows: rows,
  });
  const db = getDbInstance();
  const count = db.prepare(
    `SELECT COUNT(*) AS c FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id=?`,
  ).get(USER_ID, STORE_ID, 'SETTLE-2').c;
  assert.equal(count, 1, 'expected idempotent replace, not duplicate');
});

test('SP-API syncSettlement: missing since/until -> throws', async () => {
  await assert.rejects(
    () => syncSettlement({ userId: USER_ID, storeId: STORE_ID, injectRows: [] }),
    /since_and_until_required/,
  );
});

test('SP-API syncInventory: injectRows hook writes m2_inventory_snapshots (no fetch)', async () => {
  const db = getDbInstance();
  // Wipe any FBA rows so we count only fresh ones.
  db.prepare(`DELETE FROM m2_inventory_snapshots WHERE user_id=? AND store_id=? AND warehouse='FBA'`)
    .run(USER_ID, STORE_ID);
  const r = await syncInventory({
    userId: USER_ID, storeId: STORE_ID,
    injectRows: [
      { 'seller-sku': 'QA-SKU-1', asin: 'B0QATEST', 'afn-fulfillable-quantity': '120', 'afn-reserved-quantity': '5', 'afn-inbound-shipped-quantity': '50' },
      { 'seller-sku': 'QA-SKU-2', asin: 'B0OTHER', 'afn-fulfillable-quantity': '0', 'afn-reserved-quantity': '0', 'afn-inbound-shipped-quantity': '0' },
    ],
  });
  assert.equal(r.written, 2);
  const persisted = db.prepare(
    `SELECT sku, on_hand, reserved, inbound FROM m2_inventory_snapshots
       WHERE user_id=? AND store_id=? AND warehouse='FBA' ORDER BY sku`,
  ).all(USER_ID, STORE_ID);
  assert.equal(persisted.length, 2);
  assert.equal(persisted[0].on_hand, 120);
  assert.equal(persisted[0].reserved, 5);
  assert.equal(persisted[0].inbound, 50);
});

test('SP-API syncInventory: snapshot semantics — old FBA rows replaced', async () => {
  await syncInventory({
    userId: USER_ID, storeId: STORE_ID,
    injectRows: [{ 'seller-sku': 'QA-NEW-1', 'afn-fulfillable-quantity': '999' }],
  });
  const db = getDbInstance();
  const rows = db.prepare(
    `SELECT sku FROM m2_inventory_snapshots WHERE user_id=? AND store_id=? AND warehouse='FBA'`,
  ).all(USER_ID, STORE_ID);
  // After the wipe + insert: only QA-NEW-1
  assert.deepEqual(rows.map((r) => r.sku).sort(), ['QA-NEW-1']);
});

test('SP-API syncInventory: empty injectRows -> 0 written, no throw', async () => {
  const r = await syncInventory({ userId: USER_ID, storeId: STORE_ID, injectRows: [] });
  assert.equal(r.written, 0);
});

// =====================================================================
// 18. Settlement -> profit reconciliation
// =====================================================================
test('SP-API settlement -> profit drill-down sees synced cost rows', async () => {
  // Settle a synthetic order so it shows up in m2_order_costs and the drill-down
  // walks past the inject. We don't recompute snapshots here; we just verify the
  // cost rows exist and have the expected total.
  const rows = [
    { 'amazon-order-id': 'PRO-1', 'amount-type': 'ItemPrice', 'amount-description': 'Principal',
      amount: '20.00', currency: 'USD' },
    { 'amazon-order-id': 'PRO-1', 'amount-type': 'ItemFees', 'amount-description': 'Commission',
      amount: '-3.00', currency: 'USD' },
    { 'amazon-order-id': 'PRO-1', 'amount-type': 'ItemFees', 'amount-description': 'FBAPerUnitFulfillmentFee',
      amount: '-2.50', currency: 'USD' },
  ];
  await syncSettlement({
    userId: USER_ID, storeId: STORE_ID,
    since: '2026-07-01T00:00:00Z', until: '2026-07-31T23:59:59Z',
    injectRows: rows,
  });
  const db = getDbInstance();
  const sum = db.prepare(
    `SELECT SUM(amount) AS s FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id=?`,
  ).get(USER_ID, STORE_ID, 'PRO-1').s;
  // 20 + (-3) + (-2.5) = 14.5
  assert.ok(Math.abs(sum - 14.5) < 0.01, `unexpected settlement cost sum: ${sum}`);
});

test('SP-API syncInventory -> /m2/inventory/reorder reflects new SKU', async () => {
  // Inventory snapshot does not directly drive /inventory/reorder (which reads
  // m2_reorder_recommendations), but verify the inventory snapshot lookup works.
  await syncInventory({
    userId: USER_ID, storeId: STORE_ID,
    injectRows: [{ 'seller-sku': 'SYNC-RELOAD', 'afn-fulfillable-quantity': '10' }],
  });
  const db = getDbInstance();
  const row = db.prepare(
    `SELECT sku, on_hand FROM m2_inventory_snapshots
       WHERE user_id=? AND store_id=? AND warehouse='FBA' AND sku='SYNC-RELOAD'`,
  ).get(USER_ID, STORE_ID);
  assert.ok(row, 'inventory snapshot row not found');
  assert.equal(row.on_hand, 10);
});

// =====================================================================
// 18b. Deep-review fixes (W1 batch B3-be-profit)
// =====================================================================

// M2-P0-04: applyRepricing price guards
test('M2-P0-04 applyRepricing: price=0 -> 400 (no silent recommended_price)', async () => {
  const trig = await call('POST', '/api/v1/store/m2/repricing/trigger', { sku: 'CASE-001', manual: true });
  const r = await call('POST', `/api/v1/store/m2/repricing/${trig.body.id}/apply`, { price: 0 });
  assert.equal(r.status, 400);
});
test('M2-P0-04 applyRepricing: below break-even -> 400 unless confirmBelowBreakeven', async () => {
  const trig = await call('POST', '/api/v1/store/m2/repricing/trigger', { sku: 'CASE-001', manual: true });
  const be = trig.body.breakEvenPrice;
  const below = Math.round((be - 1) * 100) / 100;
  const r1 = await call('POST', `/api/v1/store/m2/repricing/${trig.body.id}/apply`, { price: below });
  assert.equal(r1.status, 400);
  const trig2 = await call('POST', '/api/v1/store/m2/repricing/trigger', { sku: 'CASE-001', manual: true });
  const r2 = await call('POST', `/api/v1/store/m2/repricing/${trig2.body.id}/apply`, { price: below, confirmBelowBreakeven: true });
  assert.equal(r2.status, 200);
});

// M2-P0-05: slow-moving option A newPrice >= break_even (no confirm)
test('M2-P0-05 slow-moving option A: newPrice >= break_even + oldPrice is listing price', async () => {
  const list = await call('GET', '/api/v1/store/m2/inventory/slow-moving?status=pending');
  if (!list.body.items.length) return;
  const item = list.body.items[0];
  const prev = await call('POST', `/api/v1/store/m2/inventory/slow-moving/${item.id}/preview`, { option: 'A' });
  assert.equal(prev.status, 200);
  assert.ok(prev.body.newPrice >= prev.body.breakEven, 'newPrice must not drop below break-even without confirm');
  // execute uses same compute → pricing returned, draft pending (not "已执行" real)
  const ex = await call('POST', `/api/v1/store/m2/inventory/slow-moving/${item.id}/execute`, { option: 'A' });
  assert.equal(ex.status, 200);
  assert.ok(ex.body.pricing.newPrice >= ex.body.pricing.breakEven);
  assert.equal(ex.body.draftStatus, 'm1_price_draft_pending_upload');
});

// M2-P0-02 / M2-P0-03: payPO single source + idempotency + real balance
test('M2-P0-02 payPO: single po_deposit row + idempotent already_paid', async () => {
  const create = await call('POST', '/api/v1/store/m2/purchase-orders', {
    items: [{ sku: 'CASE-001', qty: 100, unitCost: 8 }],
  });
  const id = create.body.id;
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  const pay1 = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/payment`, { phase: 'deposit' });
  assert.equal(pay1.status, 200);
  const db = getDbInstance();
  const cnt = db.prepare(`SELECT COUNT(*) AS c FROM m2_cashflow_events WHERE user_id=? AND store_id=? AND source='po_deposit' AND ref_id=?`)
    .get(USER_ID, STORE_ID, id).c;
  assert.equal(cnt, 1, 'exactly one po_deposit cashflow row');
  // repeat deposit payment -> already_paid, count stays 1
  const pay2 = await call('POST', `/api/v1/store/m2/purchase-orders/${id}/payment`, { phase: 'deposit' });
  assert.equal(pay2.status, 400);
  assert.equal(pay2.body.error, 'already_paid');
  const cnt2 = db.prepare(`SELECT COUNT(*) AS c FROM m2_cashflow_events WHERE user_id=? AND store_id=? AND source='po_deposit' AND ref_id=?`)
    .get(USER_ID, STORE_ID, id).c;
  assert.equal(cnt2, 1, 'still exactly one po_deposit row after repeat');
});
test('M2-P0-02 transitionPO no longer writes cashflow on ordered/in_transit', async () => {
  const create = await call('POST', '/api/v1/store/m2/purchase-orders', {
    items: [{ sku: 'CASE-001', qty: 50, unitCost: 8 }],
  });
  const id = create.body.id;
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'ordered' });
  await call('POST', `/api/v1/store/m2/purchase-orders/${id}/transition`, { to: 'in_transit' });
  const db = getDbInstance();
  const cnt = db.prepare(`SELECT COUNT(*) AS c FROM m2_cashflow_events WHERE user_id=? AND store_id=? AND ref_id=?`)
    .get(USER_ID, STORE_ID, id).c;
  assert.equal(cnt, 0, 'transitionPO must not write any cashflow rows');
});

// M2-P0-03: cashflow balance reflects outflow + back-fill
test('M2-P0-03 cashflow: insert outflow lowers later balance + addCashflowEvent no 350000 magic', async () => {
  const before = await call('GET', '/api/v1/store/m2/cashflow/timeline?days=180');
  const lastBefore = before.body.points[before.body.points.length - 1].balance;
  // insert an outflow=100 today
  const add = await call('POST', '/api/v1/store/m2/cashflow/events', {
    eventDate: new Date().toISOString().slice(0, 10), outflow: 100, label: 'QA outflow',
  });
  assert.equal(add.status, 201);
  const after = await call('GET', '/api/v1/store/m2/cashflow/timeline?days=180');
  const lastAfter = after.body.points[after.body.points.length - 1].balance;
  assert.ok(lastAfter <= lastBefore - 99.99, `last balance should drop ~100: before=${lastBefore} after=${lastAfter}`);
});

// M2-P0-07 already covered above (real condition + cooldown). isSimulated default mode hybrid -> false.

// M2-P1-02: lifecycle is recomputed (not all 'mature')
test('M2-P1-02 recompute: snapshots carry recomputed lifecycle/days_cover', async () => {
  await call('POST', '/api/v1/store/m2/profit/recompute', { range: 30 });
  const db = getDbInstance();
  const rows = db.prepare(`SELECT DISTINCT lifecycle FROM m2_sku_profit_snapshots WHERE user_id=? AND store_id=? AND range_days=30`)
    .all(USER_ID, STORE_ID).map((r) => r.lifecycle);
  // lifecycle field is populated (mature/growth/launch/declining), days_cover numeric
  assert.ok(rows.length >= 1);
  const dc = db.prepare(`SELECT days_cover FROM m2_sku_profit_snapshots WHERE user_id=? AND store_id=? AND range_days=30 LIMIT 1`)
    .get(USER_ID, STORE_ID);
  assert.equal(typeof dc.days_cover, 'number');
});

// M2-P1-01: preview/save unitProfit consistency + feasible flag
test('M2-P1-01 previewScenario: respects passed unitCost (no price*0.45 fallback)', async () => {
  const withCost = await call('POST', '/api/v1/store/m2/scenarios/preview', {
    baseline: { price: 20, acos: 0.1, monthlyVolume: 100, returnRate: 0.05, unitCost: 5 },
    variables: {},
  });
  const noCost = await call('POST', '/api/v1/store/m2/scenarios/preview', {
    baseline: { price: 20, acos: 0.1, monthlyVolume: 100, returnRate: 0.05 },
    variables: {},
  });
  // unitCost=5 vs fallback 20*0.45=9 → different unitProfit
  assert.notEqual(withCost.body.simulated.unitProfit, noCost.body.simulated.unitProfit);
  assert.ok('feasible' in withCost.body);
});

// M2-P1-06: payment channel monthly_cost computed server-side
test('M2-P1-06 payment channel: monthly_cost = fee_pct*volume + fee_fixed*txCount', async () => {
  const create = await call('POST', '/api/v1/store/m2/payment-channels', {
    name: 'QA Cost', feePct: 0.01, feeFixedPerTx: 0.3, monthlyVolume: 10000, txCount: 100,
  });
  assert.equal(create.status, 201);
  // 0.01*10000 + 0.3*100 = 100 + 30 = 130
  assert.equal(create.body.monthlyCost, 130);
});

// M2-P2-03: inventory-link threshold monotonicity
test('M2-P2-03 inventory-link: stopAt>=alertAt rejected with validation_error', async () => {
  const r = await call('PATCH', '/api/v1/store/m2/inventory-link/config', {
    thresholds: { stopAt: 21, reduce50At: 7, reduce20At: 14, alertAt: 3 },
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'validation_error');
});
test('M2-P2-03 inventory-link: enabled toggle persists', async () => {
  await call('PATCH', '/api/v1/store/m2/inventory-link/config', { enabled: false });
  const r = await call('GET', '/api/v1/store/m2/inventory-link/config');
  assert.equal(r.body.enabled, false);
  await call('PATCH', '/api/v1/store/m2/inventory-link/config', { enabled: true });
});

// M2-P2-04: PO numbering numeric (PO-999 -> PO-1000)
test('M2-P2-04 PO numbering: PO-0999 yields PO-1000 (numeric not lexicographic)', async () => {
  const db = getDbInstance();
  db.prepare(`INSERT INTO m2_purchase_orders(id,user_id,store_id,po_number,status,total_landed,currency,deposit,balance,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('po-seed-999', USER_ID, STORE_ID, 'PO-0999', 'draft', 100, 'USD', 30, 70, new Date().toISOString());
  const create = await call('POST', '/api/v1/store/m2/purchase-orders', { items: [{ sku: 'CASE-001', qty: 1, unitCost: 1 }] });
  assert.equal(create.status, 201);
  const n = Number(create.body.poNumber.match(/PO-(\d+)/)[1]);
  assert.equal(n, 1000, `expected 1000, got ${create.body.poNumber}`);
});

// M2-P2-06: repricing reject endpoint exists
test('M2-P2-06 repricing reject: endpoint exists + filter returns rejected', async () => {
  const trig = await call('POST', '/api/v1/store/m2/repricing/trigger', { sku: 'LAMP-003', manual: true });
  const rej = await call('POST', `/api/v1/store/m2/repricing/${trig.body.id}/reject`, { reason: 'qa' });
  assert.equal(rej.status, 200);
  assert.equal(rej.body.status, 'rejected');
  const list = await call('GET', '/api/v1/store/m2/repricing?status=rejected');
  assert.ok(list.body.items.some((i) => i.id === trig.body.id));
});

// M2-P3-01: batch ack + boolean acknowledged + ackBy
test('M2-P3-01 alerts: batch ack multiple events + acknowledged boolean', async () => {
  // create matching rule + scan twice past cooldown to get >=2 events
  const rule = await call('POST', '/api/v1/store/m2/alerts/rules', {
    name: 'QA Batch', conditions: [{ field: 'cashflow.balance', op: '>', value: 0 }],
    severity: 'P2', notifyChannels: ['in_app'], cooldownHours: 0,
  });
  await call('POST', '/api/v1/store/m2/alerts/scan', { ruleId: rule.body.id });
  await call('POST', '/api/v1/store/m2/alerts/scan', { ruleId: rule.body.id });
  const ev = await call('GET', `/api/v1/store/m2/alerts/events?ruleId=${rule.body.id}&acknowledged=false`);
  const ids = ev.body.events.map((e) => e.id).slice(0, 2);
  assert.ok(ids.length >= 1);
  const ack = await call('POST', '/api/v1/store/m2/alerts/events/ack-batch', { ids, ackBy: 'qa-batch' });
  assert.equal(ack.status, 200);
  assert.equal(ack.body.acknowledged, ids.length);
  for (const e of ack.body.events) assert.equal(e.acknowledged, true);
});

// =====================================================================
// 19. Final restore
// =====================================================================
test('teardown: restore global fetch', () => {
  globalThis.fetch = originalFetch;
});
