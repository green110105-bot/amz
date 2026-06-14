// Batch B1-be-safety-core regression tests.
// Covers: W3 (server forces requiresRealStoreWrite=false), W10 (scoped ads/suggestions
// DB branch), X-P0-01 (no fake rollback for real writes), X-P1-04 (store ownership),
// X-P1-08 (audit retained on store deletion + blocked on un-reverted real writes),
// AUTH-08 (authorized<->credentials invariant).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-be-safety-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.DATA_PROVIDER_MODE = 'hybrid';
delete process.env.REAL_WRITES_ENABLED;
delete process.env.ADS_REAL_WRITES_ENABLED;

const ds = await import('../../apps/api/src/data-store.mjs');
const { handleExtendedRequest } = await import('../../apps/api/src/extended-routes.mjs');
const { handleRequest } = await import('../../apps/api/src/routes.mjs');

const reg = ds.registerUser({ email: 'safety@local.test', password: 'pw123456', name: 'Safety' });
const userA = reg.user.id;
const tokenA = ds.authenticate('safety@local.test', 'pw123456').token;
const db = ds.getDbInstance();
const storeA = db.prepare('SELECT id FROM user_stores WHERE user_id=? LIMIT 1').get(userA).id;

const regB = ds.registerUser({ email: 'other@local.test', password: 'pw123456', name: 'Other' });
const userB = regB.user.id;
const storeB = db.prepare('SELECT id FROM user_stores WHERE user_id=? LIMIT 1').get(userB).id;

function jsonReq(path, { method = 'GET', token, storeId, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (storeId) headers['x-store-id'] = storeId;
  return new Request('http://localhost' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------- W3 ----------
test('W3: REAL_WRITES_ENABLED off forces requiresRealStoreWrite=false and never bypasses to real', async () => {
  const res = await handleRequest(jsonReq('/api/v1/audit/mock-execute', {
    method: 'POST',
    body: {
      sourceModule: 'M3', actionType: 'PAUSE_CAMPAIGN', target: { id: 'c-1' },
      payload: { requiresRealStoreWrite: true },
    },
  }));
  const body = await res.json();
  assert.notEqual(body.risk?.executionMode, 'real');
  assert.equal(body.risk?.executionMode, 'mock');
  // never claims a real external write happened
  assert.notEqual(body.status, 'real_write_success');
});

// ---------- W10 ----------
test('W10: scoped GET /api/v1/ads/suggestions uses DB branch with normalizeCard-compatible shape', async () => {
  const res = await handleExtendedRequest(jsonReq('/api/v1/ads/suggestions', { token: tokenA, storeId: storeA }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sourceMode, 'db');
  assert.ok(Array.isArray(body.audits));
  for (const card of body.audits) {
    assert.ok(card.risk && card.risk.severity !== undefined, 'card.risk.severity present');
    assert.ok(typeof card.risk.requiresApproval === 'boolean', 'card.risk.requiresApproval present');
    assert.ok(card.payload && card.payload.id !== undefined, 'card.payload.id present');
  }
});

test('W10: unauthenticated GET /api/v1/ads/suggestions still returns mock fallback', async () => {
  const res = await handleRequest(jsonReq('/api/v1/ads/suggestions'));
  const body = await res.json();
  assert.equal(body.sourceMode, 'mock');
});

// ---------- X-P1-04 ----------
test('X-P1-04: userA token + spoofed x-store-id owned by userB -> 403 store_not_owned', async () => {
  const res = await handleExtendedRequest(jsonReq('/api/v1/store/ads/strategies', { token: tokenA, storeId: storeB }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'store_not_owned');
});

test('X-P1-04: userA token + own x-store-id passes ownership check', async () => {
  const res = await handleExtendedRequest(jsonReq('/api/v1/store/ads/strategies', { token: tokenA, storeId: storeA }));
  assert.notEqual(res.status, 403);
});

// X-P1-04 must hold on the M4 monitor route family too (not only ads).
test('X-P1-04(monitor): userA token + spoofed x-store-id owned by userB -> 403 store_not_owned', async () => {
  const res = await handleExtendedRequest(jsonReq('/api/v1/store/m4/anomalies', { token: tokenA, storeId: storeB }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'store_not_owned');
});

test('X-P1-04(monitor): userA token + own x-store-id passes ownership check', async () => {
  const res = await handleExtendedRequest(jsonReq('/api/v1/store/m4/anomalies', { token: tokenA, storeId: storeA }));
  assert.notEqual(res.status, 403);
});

// ---------- X-P0-01 ----------
test('X-P0-01: reverting a real-write audit that cannot dispatch inverse keeps reverted=0 and returns 409', async () => {
  // Construct an ACTION_QUEUE_REAL_WRITE audit row directly.
  const audit = ds.appendAuditLog(userA, storeA, {
    sourceModule: 'M3',
    actionType: 'ACTION_QUEUE_REAL_WRITE',
    resourceType: 'ad_action_queue',
    resourceId: 'aq-nonexistent',
    status: 'success',
    origin: 'ads-real-write',
    result: { realWrite: true },
  });
  assert.equal(audit.origin, 'ads-real-write');

  const reverted = ds.revertAuditLog(userA, storeA, audit.id, 'manual test');
  assert.equal(reverted.needsManualReversal, true);
  assert.equal(reverted.dispatchedInverse, false);
  assert.equal(reverted.status, 'revert_failed');

  // DB row must still be reverted=0 (no audit fabrication).
  const row = db.prepare('SELECT reverted FROM audit_logs WHERE id=?').get(audit.id);
  assert.equal(row.reverted, 0);

  // Route returns HTTP 409.
  const res = await handleExtendedRequest(jsonReq(`/api/v1/store/audit-logs/${audit.id}/revert`, {
    method: 'POST', token: tokenA, storeId: storeA, body: { reason: 'manual' },
  }));
  assert.equal(res.status, 409);
});

test('X-P0-01: ordinary local-reversible action reverts normally with reverted=1 and 200', async () => {
  // STRATEGY_TOGGLE has a real inverse dispatch path. Seed a strategy first.
  const strat = db.prepare('SELECT id FROM ad_strategies WHERE user_id=? AND store_id=? LIMIT 1').get(userA, storeA);
  const resourceId = strat ? strat.id : 'strat-x';
  const audit = ds.appendAuditLog(userA, storeA, {
    sourceModule: 'M3', actionType: 'STRATEGY_TOGGLE', resourceType: 'ad_strategy',
    resourceId, status: 'success',
  });
  const res = await handleExtendedRequest(jsonReq(`/api/v1/store/audit-logs/${audit.id}/revert`, {
    method: 'POST', token: tokenA, storeId: storeA, body: { reason: 'undo' },
  }));
  if (strat) {
    assert.equal(res.status, 200);
    const row = db.prepare('SELECT reverted FROM audit_logs WHERE id=?').get(audit.id);
    assert.equal(row.reverted, 1);
  } else {
    // no strategy seeded -> inverse cannot dispatch, but this is a local type so it
    // is allowed to flip reverted=1 (not a real-write row).
    assert.equal(res.status, 200);
  }
});

// ---------- X-P1-08 ----------
test('X-P1-08: removing a store archives audit_logs instead of hard-deleting them', async () => {
  // Give userB a second store so deletion is allowed, then add an audit row to it.
  const extra = ds.addUserStore(userB, { name: 'Extra', region: 'US', currency: 'USD' });
  const extraId = extra.id;
  ds.appendAuditLog(userB, extraId, {
    sourceModule: 'M2', actionType: 'REPRICE_UP', resourceType: 'sku', resourceId: 'sku-1', status: 'success',
  });
  const ok = ds.removeUserStore(userB, extraId);
  assert.equal(ok, true);
  const live = db.prepare('SELECT COUNT(*) n FROM audit_logs WHERE user_id=? AND store_id=?').get(userB, extraId).n;
  assert.equal(live, 0);
  const archived = db.prepare('SELECT COUNT(*) n FROM archived_audit_logs WHERE user_id=? AND store_id=?').get(userB, extraId).n;
  assert.equal(archived, 1);
});

test('X-P1-08: removing a store with un-reverted real writes is blocked (409)', async () => {
  const extra = ds.addUserStore(userB, { name: 'Extra2', region: 'US', currency: 'USD' });
  const extraId = extra.id;
  ds.appendAuditLog(userB, extraId, {
    sourceModule: 'M3', actionType: 'ACTION_QUEUE_REAL_WRITE', resourceType: 'ad_action_queue',
    resourceId: 'aq-x', status: 'success', origin: 'ads-real-write', result: { realWrite: true },
  });
  const result = ds.removeUserStore(userB, extraId);
  assert.equal(result && result.blocked, true);
  assert.equal(result.error, 'store_has_unreverted_real_writes');
  // store still exists
  const still = db.prepare('SELECT COUNT(*) n FROM user_stores WHERE id=?').get(extraId).n;
  assert.equal(still, 1);
});

// ---------- B-2 / N6-w11: DASHBOARD_CARD_DISMISS ----------
test('B-2: POST /api/v1/audit/dismiss persists one DASHBOARD_CARD_DISMISS row and is queryable', async () => {
  const before = ds.countAuditLogs(userA, storeA, { actionType: 'DASHBOARD_CARD_DISMISS' });
  const res = await handleRequest(jsonReq('/api/v1/audit/dismiss', {
    method: 'POST', token: tokenA, storeId: storeA,
    body: { resourceId: 'card-anomaly-1', reason: 'Buy Box 丢失（已人工处理）' },
  }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.actionType, 'DASHBOARD_CARD_DISMISS');
  assert.equal(body.resourceId, 'card-anomaly-1');
  // operator must be the server-authenticated user, never client-supplied.
  assert.equal(body.operator, userA);
  assert.ok(body.dismissedAt);

  // queryable via the audit-logs read path, scoped to user+store, filtered by actionType.
  const after = ds.countAuditLogs(userA, storeA, { actionType: 'DASHBOARD_CARD_DISMISS' });
  assert.equal(after, before + 1);
  const rows = ds.listAuditLogs(userA, storeA, { actionType: 'DASHBOARD_CARD_DISMISS' });
  const row = rows.find((r) => r.id === body.id);
  assert.ok(row, 'dismissed audit row is queryable');
  assert.equal(row.actionType, 'DASHBOARD_CARD_DISMISS');
  assert.equal(row.resourceId, 'card-anomaly-1');
  assert.equal(row.status, 'dismissed');
  // payload carries reason/operator/dismissedAt (留痕字段持久化, rowToAudit 平铺到顶层)。
  assert.equal(row.reason, 'Buy Box 丢失（已人工处理）');
  assert.equal(row.operator, userA);
  assert.ok(row.dismissedAt);
});

test('B-2(negative): unauthenticated POST /api/v1/audit/dismiss -> 401, no row written', async () => {
  const before = ds.countAuditLogs(userA, storeA, { actionType: 'DASHBOARD_CARD_DISMISS' });
  const res = await handleRequest(jsonReq('/api/v1/audit/dismiss', {
    method: 'POST', body: { resourceId: 'card-x', reason: 'spoof' },
  }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'unauthorized');
  const after = ds.countAuditLogs(userA, storeA, { actionType: 'DASHBOARD_CARD_DISMISS' });
  assert.equal(after, before);
});

test('B-2(negative): userA token + spoofed x-store-id owned by userB -> 403 store_not_owned, no row', async () => {
  const beforeA = ds.countAuditLogs(userA, storeB, { actionType: 'DASHBOARD_CARD_DISMISS' });
  const res = await handleRequest(jsonReq('/api/v1/audit/dismiss', {
    method: 'POST', token: tokenA, storeId: storeB,
    body: { resourceId: 'card-cross-tenant', reason: 'spoof' },
  }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'store_not_owned');
  // nothing leaked into userA's view of storeB.
  const afterA = ds.countAuditLogs(userA, storeB, { actionType: 'DASHBOARD_CARD_DISMISS' });
  assert.equal(afterA, beforeA);
});

test('B-2(negative): client-supplied operator is ignored; server uses authenticated user', async () => {
  const res = await handleRequest(jsonReq('/api/v1/audit/dismiss', {
    method: 'POST', token: tokenA, storeId: storeA,
    body: { resourceId: 'card-forge-op', reason: 'x', operator: userB, dismissedAt: '1999-01-01T00:00:00.000Z' },
  }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.operator, userA, 'operator forced to authenticated user, not client value');
  assert.notEqual(body.dismissedAt, '1999-01-01T00:00:00.000Z');
  const rows = ds.listAuditLogs(userA, storeA, { actionType: 'DASHBOARD_CARD_DISMISS' });
  const row = rows.find((r) => r.id === body.id);
  assert.equal(row.operator, userA);
});

test('B-2(negative): missing resourceId -> 400, no row written', async () => {
  const before = ds.countAuditLogs(userA, storeA, { actionType: 'DASHBOARD_CARD_DISMISS' });
  const res = await handleRequest(jsonReq('/api/v1/audit/dismiss', {
    method: 'POST', token: tokenA, storeId: storeA, body: { reason: 'no id' },
  }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'resource_id_required');
  const after = ds.countAuditLogs(userA, storeA, { actionType: 'DASHBOARD_CARD_DISMISS' });
  assert.equal(after, before);
});

test('B-2: unauthenticated dashboard mock fallback stays intact (not removed by dismiss endpoint)', async () => {
  const res = await handleRequest(jsonReq('/api/v1/dashboard/summary'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sourceMode, 'mock');
  assert.ok(body.cardSummary);
});

// ---------- AUTH-08 ----------
test('AUTH-08 invariant: every *_api_authorized=1 store has a matching active credentials row', () => {
  const stores = db.prepare('SELECT id, user_id, sp_api_authorized, ads_api_authorized FROM user_stores').all();
  for (const s of stores) {
    if (s.sp_api_authorized === 1) {
      const cred = db.prepare(
        `SELECT 1 FROM store_credentials WHERE user_id=? AND store_id=? AND provider='spapi' AND status='active' LIMIT 1`
      ).get(s.user_id, s.id);
      assert.ok(cred, `sp_api_authorized=1 store ${s.id} must have active spapi credentials`);
    }
    if (s.ads_api_authorized === 1) {
      const cred = db.prepare(
        `SELECT 1 FROM store_credentials WHERE user_id=? AND store_id=? AND provider='ads' AND status='active' LIMIT 1`
      ).get(s.user_id, s.id);
      assert.ok(cred, `ads_api_authorized=1 store ${s.id} must have active ads credentials`);
    }
  }
});
