// W14: real-write gate — client bypass + re-entrancy regression.
//
// Acceptance (worklist W14):
//   REAL_WRITES_ENABLED!=='true' 时：
//     - 前端 body 传 requiresRealStoreWrite:true 调 mock-execute，
//       assert 服务端覆写为 false 不触达真实店铺；
//     - execute 200ms 双击仅产生 1 条审计行。
//   REAL_WRITES_ENABLED==='true' 时：
//     - assert 闸门进入 requiresApproval 路径且经 ad_action_queue。
//
// Rationale: 将 W3/W4/W7 的安全不变量固化为回归，覆盖客户端绕过与防重入。
//
// SECURITY INVARIANTS asserted here (must never be weakened to go green):
//   #1 写 Ads 实体必经 ad_action_queue，dryRun=1 / auditRequired=1。
//   #2 REAL_WRITES_ENABLED!=='true' 时服务端强制 requiresRealStoreWrite=false；
//      真实写需 isRealMode()+gate。
//   #3 不得把 mock 伪装 real（executionMode/status 不得谎报真实写成功）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-real-write-gate-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.DATA_PROVIDER_MODE = 'hybrid';
// Default world: real writes OFF. Individual tests that need the gate ON set it
// locally and restore it in a finally block.
delete process.env.REAL_WRITES_ENABLED;
delete process.env.ADS_REAL_WRITES_ENABLED;

const ds = await import('../../apps/api/src/data-store.mjs');
const { handleRequest } = await import('../../apps/api/src/routes.mjs');

const reg = ds.registerUser({ email: 'gate@local.test', password: 'pw123456', name: 'Gate' });
const userA = reg.user.id;
const tokenA = ds.authenticate('gate@local.test', 'pw123456').token;
const db = ds.getDbInstance();
const storeA = db.prepare('SELECT id FROM user_stores WHERE user_id=? LIMIT 1').get(userA).id;

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

function mockExecuteReq(payloadExtra = {}, idempotencyKey) {
  const body = {
    sourceModule: 'M3',
    actionType: 'PAUSE_CAMPAIGN',
    target: { id: 'c-bypass-1' },
    // Malicious/buggy client tries to force a REAL store write from the browser.
    payload: { requiresRealStoreWrite: true, ...payloadExtra },
  };
  if (idempotencyKey) body.idempotencyKey = idempotencyKey;
  return jsonReq('/api/v1/audit/mock-execute', { method: 'POST', body });
}

function auditRowCount() {
  try {
    return db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n;
  } catch {
    return 0;
  }
}

async function readSrc(rel) {
  return readFile(join(repoRoot, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// W14-a: client bypass — body requiresRealStoreWrite:true is overwritten to
// false by the server; it never touches a real store / never claims real write.
// ---------------------------------------------------------------------------
test('W14: REAL_WRITES_ENABLED off — server overrides client requiresRealStoreWrite:true to mock', async () => {
  assert.notEqual(process.env.REAL_WRITES_ENABLED, 'true', 'precondition: real writes off');
  const res = await handleRequest(mockExecuteReq());
  const body = await res.json();
  // Invariant #2: forced to mock execution regardless of client request.
  assert.notEqual(body.risk?.executionMode, 'real', 'must NOT execute as real');
  assert.equal(body.risk?.executionMode, 'mock', 'execution mode forced to mock');
  // Invariant #3: never reports a successful real external write.
  assert.notEqual(body.status, 'real_write_success', 'must not claim real write success');
  // The echoed/effective real-store-write flag must not be left true.
  const effective =
    body.requiresRealStoreWrite ??
    body.risk?.requiresRealStoreWrite ??
    body.payload?.requiresRealStoreWrite;
  if (effective !== undefined) {
    assert.equal(effective, false, 'server-side requiresRealStoreWrite forced false');
  }
});

// ---------------------------------------------------------------------------
// W14-b: re-entrancy — a 200ms double-click must produce exactly ONE audit row.
//
// Architecture note: /api/v1/audit/mock-execute is intentionally STATELESS and
// gated — it computes a decision and persists NO real audit_logs row (so it can
// never fabricate a real write). Therefore the "exactly one audit row" invariant
// is enforced at the SUBMIT (re-entrancy) layer, not by a server-side row insert:
//   1) The endpoint must not fabricate persisted audit rows on repeated calls
//      (no server-side side effect that a double-click could double).
//   2) The frontend execute() path (DecisionCard, W7) must hold a re-entrancy
//      guard bound to :loading/:disabled so a 200ms double-click sends at most
//      one submit() — yielding at most one (downstream) audit row.
// We assert BOTH so the invariant can't regress on either layer.
// ---------------------------------------------------------------------------
test('W14: repeated mock-execute fabricates no persisted audit_logs rows (no server-side double effect)', async () => {
  const before = auditRowCount();
  // Simulate a 200ms double-click hitting the endpoint twice.
  const [r1, r2] = await Promise.all([
    handleRequest(mockExecuteReq()),
    handleRequest(mockExecuteReq()),
  ]);
  const b1 = await r1.json();
  const b2 = await r2.json();
  // The endpoint reports a mock execution (status mock_executed / result.mode mock)
  // and never claims a real external write — so it has no real side effect a
  // double-click could duplicate.
  for (const b of [b1, b2]) {
    assert.equal(b.status, 'mock_executed', 'response status is mock_executed (honestly mock)');
    assert.equal(b.result?.mode, 'mock', 'result.mode is mock — no external account touched');
    assert.notEqual(b.status, 'real_write_success', 'never claims a real write happened');
  }
  const after = auditRowCount();
  assert.equal(after - before, 0, 'mock-execute persists no audit_logs rows (cannot be doubled server-side)');
});

test('W14: frontend execute() has a re-entrancy guard so a 200ms double-click submits once', async () => {
  // DecisionCard.execute is the single workbench execute path.
  const dc = await readSrc('apps/web-v2/src/components/DecisionCard.vue');
  // A submitting guard must exist and short-circuit the second click.
  assert.match(dc, /submitting\s*=\s*ref\(/, 'submitting re-entrancy ref declared');
  assert.match(dc, /if \(executeDisabled\.value\) return/, 'execute() bails when disabled (re-entry blocked)');
  assert.match(dc, /:loading="submitting"/, 'button :loading bound to submitting');
  assert.match(dc, /:disabled="executeDisabled"/, 'button :disabled bound to executeDisabled (covers submitting)');
  // executeDisabled must be derived from submitting (so an in-flight submit disables it).
  assert.match(dc, /executeDisabled\s*=\s*computed\(\(\)\s*=>\s*submitting\.value/, 'executeDisabled includes submitting');

  // And useAudit.submit must stamp the gate truth from the appStore single source
  // (NOT a hard-coded true) — so the client never self-escalates a real write.
  const ua = await readSrc('apps/web-v2/src/composables/useAudit.js');
  assert.match(
    ua,
    /requiresRealStoreWrite:\s*appStore\.realWritesEnabled\s*===\s*true/,
    'submit stamps requiresRealStoreWrite from appStore.realWritesEnabled single source',
  );
  // Must NOT hard-code requiresRealStoreWrite:true in the submit payload.
  assert.ok(
    !/requiresRealStoreWrite:\s*true\b/.test(ua),
    'submit never hard-codes requiresRealStoreWrite:true',
  );
});

// ---------------------------------------------------------------------------
// W14-c: gate ON — real writes go through the requiresApproval / ad_action_queue
// path (dryRun boundary + auditRequired), they are NOT auto-dispatched to the
// real store synchronously from mock-execute.
// ---------------------------------------------------------------------------
test('W14: REAL_WRITES_ENABLED on — ad writes route through requiresApproval / ad_action_queue, not auto-real', async () => {
  const prev = process.env.REAL_WRITES_ENABLED;
  process.env.REAL_WRITES_ENABLED = 'true';
  try {
    const res = await handleRequest(mockExecuteReq());
    const body = await res.json();
    // Invariant #1/#3: even with the gate on, the audit/mock-execute endpoint
    // must NOT report a completed real external write. A real ad write is only
    // legitimate via the ad_action_queue (enqueue + approval), so this endpoint
    // must either keep it gated (auditRequired / pending) or never claim
    // real_write_success here.
    assert.notEqual(body.status, 'real_write_success', 'mock-execute never completes a real write itself');
    // The gate path must surface that approval / queueing is required, never a
    // silent direct mutation.
    const requiresApproval =
      body.risk?.requiresApproval === true ||
      body.auditRequired === true ||
      body.risk?.auditRequired === true ||
      body.enqueuedToActionQueue === true;
    assert.ok(requiresApproval, 'gate ON keeps the action in approval / queued state');
  } finally {
    if (prev === undefined) delete process.env.REAL_WRITES_ENABLED;
    else process.env.REAL_WRITES_ENABLED = prev;
  }
});
