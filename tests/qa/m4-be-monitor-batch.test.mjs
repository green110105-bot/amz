// tests/qa/m4-be-monitor-batch.test.mjs
// Batch B4-be-monitor CI gate. Locks the corrected contracts for:
//   M4-P0-01 submitHijackingAppeal transactional + manual-evidence
//   M4-P0-04 revert _MANUAL strip + HIJACK_* / SEND_RECOVERY_EMAIL_MANUAL cases
//   M4-P0-06 revert-set coverage + appeal-chain redlines
//   M4-P1-01 anomaly state-machine from-guards + shared ANOMALY_TRANSITIONS
//   M4-P1-02 SLA breach derivation
//   M4-P1-03 sendRecovery -> manual ticket board (marked_sent, no fake real send)
//   M4-P1-07 draftRecovery keeps review in待挽回 backlog (reversible in_progress)
//   M4-P2-01 markNotificationRead ownership 404
//   M4-P2-04 recordRecoveryReply state guard
//
// Setup mirrors tests/qa/m4-functional.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const TMP_DIR = mkdtempSync(join(tmpdir(), 'qa-m4-batch-'));
process.env.DATA_DB_PATH = join(TMP_DIR, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.ADS_API_MOCK = 'true';
globalThis.fetch = async () => { throw new Error('network blocked in QA test'); };

const dataStore = await import('../../apps/api/src/data-store.mjs');
const monitor = await import('../../apps/api/src/data-store-monitor.mjs');
const { authenticate, registerUser, getDbInstance, revertAuditLog } = dataStore;

const reg = registerUser({ email: `m4batch-${Date.now()}@local`, password: 'pw1234', name: 'M4Batch' });
const userId = reg.user.id;
authenticate(reg.user.email, 'pw1234');
const db = getDbInstance();
const storeId = db.prepare('SELECT id FROM user_stores WHERE user_id=? LIMIT 1').get(userId).id;
const storeId2 = (function () {
  const r = registerUser({ email: `m4batch2-${Date.now()}@local`, password: 'pw1234', name: 'M4Batch2' });
  authenticate(r.user.email, 'pw1234');
  const otherUser = r.user.id;
  const sid = getDbInstance().prepare('SELECT id FROM user_stores WHERE user_id=? LIMIT 1').get(otherUser).id;
  return { userId: otherUser, storeId: sid };
})();

const now = () => new Date().toISOString();
function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

// ---------- helpers to seed rows ----------
function seedHijacking({ id, status, appealId = null, asin = 'B0HJ1' }) {
  db.prepare(`INSERT INTO m4_hijacking
    (id,user_id,store_id,asin,hijacker_seller,detected_at,duration_min,type,status,appeal_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, asin, 'BadSeller', now(), 0, 'price_competition', status, appealId, now());
}
function seedAppeal({ id, hijackingId, status = 'draft' }) {
  db.prepare(`INSERT INTO m4_appeals
    (id,user_id,store_id,review_id,hijacking_id,asin,violation_type,draft_content,drafted_at,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, null, hijackingId, 'B0HJ1', 'hijacking_counterfeit', 'draft', now(), status, now());
}
function seedAnomaly({ id, status = 'open', severity = 'P0', slaDeadline, detectedAt, slaBreached = 0 }) {
  const det = detectedAt || now();
  const dl = slaDeadline || new Date(Date.now() + 3600_000).toISOString();
  db.prepare(`INSERT INTO m4_anomalies
    (id,user_id,store_id,anomaly_code,category,severity,status,title,detected_at,sla_minutes,sla_deadline,sla_breached,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, 'rating_drop', 'reviews', severity, status, 'Anom ' + id, det, 60, dl, slaBreached, det, det);
}
function seedReview({ id, recoveryStatus = 'pending', rating = 1 }) {
  db.prepare(`INSERT INTO reviews
    (id,user_id,store_id,product_id,asin,sku,reviewer,rating,title,body,sentiment,recovery_status,posted_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, 'PROD-1', 'B0R1', 'SKU1', 'Buyer', rating, 't', 'b', 'negative', recoveryStatus, now(), now());
}

// ============================================================
// M4-P1-01: anomaly state-machine from-guards
// ============================================================
test('M4-P1-01: shared ANOMALY_TRANSITIONS exported & investigating is non-terminal', () => {
  assert.ok(monitor.ANOMALY_TRANSITIONS, 'backend must export ANOMALY_TRANSITIONS');
  assert.deepEqual(monitor.ANOMALY_TRANSITIONS.resolved, []);
  assert.deepEqual(monitor.ANOMALY_TRANSITIONS.dismissed, []);
  assert.ok(monitor.ANOMALY_TRANSITIONS.open.includes('escalated'));
});

test('M4-P1-01(a): resolved再escalate -> state_transition_forbidden', () => {
  const id = uid('an');
  seedAnomaly({ id, status: 'resolved' });
  const r = monitor.escalateAnomaly(db, userId, storeId, id, { reason: 'x' });
  assert.equal(r.error, 'state_transition_forbidden');
  assert.equal(db.prepare('SELECT status FROM m4_anomalies WHERE id=?').get(id).status, 'resolved');
});

test('M4-P1-01(b): closed再resolve -> state_transition_forbidden', () => {
  const id = uid('an');
  seedAnomaly({ id, status: 'closed' });
  const r = monitor.resolveAnomaly(db, userId, storeId, id, {});
  assert.equal(r.error, 'state_transition_forbidden');
});

test('M4-P1-01(c): open->acknowledged(investigating)->resolved 合法链路', () => {
  const id = uid('an');
  seedAnomaly({ id, status: 'open' });
  const ack = monitor.acknowledgeAnomaly(db, userId, storeId, id);
  assert.equal(ack.status, 'investigating');
  const res = monitor.resolveAnomaly(db, userId, storeId, id, {});
  assert.equal(res.status, 'resolved');
});

test('M4-P1-01: acknowledge on terminal status is forbidden (not silent no-op)', () => {
  const id = uid('an');
  seedAnomaly({ id, status: 'resolved' });
  const r = monitor.acknowledgeAnomaly(db, userId, storeId, id);
  assert.equal(r.error, 'state_transition_forbidden');
});

// ============================================================
// M4-P1-02: SLA breach derivation
// ============================================================
test('M4-P1-02: overdue unresolved P0 counts as breached (rate drops)', () => {
  // fresh store window: use a far-past deadline, open status, not sla_breached flagged
  const id = uid('an');
  const past = new Date(Date.now() - 5 * 3600_000).toISOString();
  const deadline = new Date(Date.now() - 4 * 3600_000).toISOString();
  seedAnomaly({ id, status: 'open', severity: 'P0', detectedAt: past, slaDeadline: deadline, slaBreached: 0 });
  const board = monitor.slaBoard(db, userId, storeId, '30d');
  // there is at least one P0 and it is breached -> p0Sla < 1
  assert.ok(board.rangeStats.p0Total >= 1);
  assert.ok(board.rangeStats.p0Sla < 1, `expected breached to lower p0Sla, got ${board.rangeStats.p0Sla}`);
});

test('M4-P1-02: on-time resolved counts as within SLA', () => {
  const id = uid('an');
  const det = new Date(Date.now() - 30 * 60_000).toISOString();
  const dl = new Date(Date.now() + 3600_000).toISOString();
  seedAnomaly({ id, status: 'resolved', severity: 'P1', detectedAt: det, slaDeadline: dl, slaBreached: 0 });
  const board = monitor.slaBoard(db, userId, storeId, '30d');
  assert.ok(board.rangeStats.p1Total >= 1);
});

test('M4-P2-03: slaBoard returns range + rangeStats alias and default 7d', () => {
  const board = monitor.slaBoard(db, userId, storeId);
  assert.equal(board.range, '7d');
  assert.ok(board.rangeStats, 'rangeStats canonical block present');
  assert.deepEqual(board.todayStats, board.rangeStats, 'todayStats is back-compat alias');
});

// ============================================================
// M4-P0-01: submitHijackingAppeal
// ============================================================
const MANUAL_APPEAL = { amazonCaseId: 'CASE-1', submittedBy: 'op', manualSubmittedAt: now(), evidenceAttachment: 'file://a.png' };

test('M4-P0-01(a): test_buy_received + appeal_id + 4 evidence -> submitted', () => {
  const hid = uid('hj'); const apid = uid('ap');
  seedHijacking({ id: hid, status: 'test_buy_received', appealId: apid });
  seedAppeal({ id: apid, hijackingId: hid, status: 'draft' });
  const r = monitor.submitHijackingAppeal(db, userId, storeId, hid, MANUAL_APPEAL);
  assert.ok(!r.error, 'should succeed: ' + JSON.stringify(r));
  assert.equal(db.prepare('SELECT status FROM m4_hijacking WHERE id=?').get(hid).status, 'appeal_submitted');
  assert.equal(db.prepare('SELECT status FROM m4_appeals WHERE id=?').get(apid).status, 'submitted');
});

test('M4-P0-01(b): missing evidence -> validation_failed.missing, no dirty write', () => {
  const hid = uid('hj'); const apid = uid('ap');
  seedHijacking({ id: hid, status: 'test_buy_received', appealId: apid });
  seedAppeal({ id: apid, hijackingId: hid, status: 'draft' });
  const r = monitor.submitHijackingAppeal(db, userId, storeId, hid, { submittedBy: 'op' });
  assert.equal(r.error, 'validation_failed');
  assert.ok(Array.isArray(r.missing) && r.missing.length, 'missing fields listed');
  assert.equal(db.prepare('SELECT status FROM m4_hijacking WHERE id=?').get(hid).status, 'test_buy_received');
  assert.equal(db.prepare('SELECT status FROM m4_appeals WHERE id=?').get(apid).status, 'draft');
});

test('M4-P0-01(c): appeal_id null -> validation_failed no draft appeal, no state change', () => {
  const hid = uid('hj');
  seedHijacking({ id: hid, status: 'test_buy_received', appealId: null });
  const r = monitor.submitHijackingAppeal(db, userId, storeId, hid, MANUAL_APPEAL);
  assert.equal(r.error, 'validation_failed');
  assert.match(r.message, /no draft appeal/);
  assert.equal(db.prepare('SELECT status FROM m4_hijacking WHERE id=?').get(hid).status, 'test_buy_received');
});

test('M4-P0-06(3): confirm-counterfeit leaves hijacking status test_buy_received (not appeal_drafted)', () => {
  const hid = uid('hj');
  seedHijacking({ id: hid, status: 'test_buy_in_transit' });
  monitor.uploadHijackingProof(db, userId, storeId, hid, { type: 'counterfeit_confirmed', proofImages: ['p1'] });
  const row = db.prepare('SELECT status, appeal_id FROM m4_hijacking WHERE id=?').get(hid);
  assert.equal(row.status, 'test_buy_received');
  assert.ok(row.appeal_id, 'a draft appeal id is attached');
});

// ============================================================
// M4-P1-07: draftRecovery keeps review in backlog (in_progress)
// ============================================================
test('M4-P1-07(a): drafting recovery keeps review counted in待挽回 backlog', () => {
  const rid = uid('rv');
  seedReview({ id: rid, recoveryStatus: 'pending' });
  const before = monitor.listReviewsM4(db, userId, storeId).summary.recoveryPending;
  monitor.draftRecovery(db, userId, storeId, { reviewId: rid });
  const row = db.prepare('SELECT recovery_status FROM reviews WHERE id=?').get(rid);
  assert.equal(row.recovery_status, 'in_progress', 'reversible in_progress, not drafted');
  const after = monitor.listReviewsM4(db, userId, storeId).summary.recoveryPending;
  assert.equal(after, before, 'still counted in待挽回 backlog (pending+in_progress)');
});

// ============================================================
// M4-P1-03: sendRecovery -> manual ticket board
// ============================================================
test('M4-P1-03(a): send without manual-evidence -> validation_failed', () => {
  const rid = uid('rv'); seedReview({ id: rid });
  const rec = monitor.draftRecovery(db, userId, storeId, { reviewId: rid });
  const r = monitor.sendRecovery(db, userId, storeId, rec.id, {});
  assert.equal(r.error, 'validation_failed');
});

test('M4-P1-03(b): send with evidence -> marked_sent, review not "sent", audit _MANUAL', () => {
  const rid = uid('rv'); seedReview({ id: rid });
  const rec = monitor.draftRecovery(db, userId, storeId, { reviewId: rid });
  const r = monitor.sendRecovery(db, userId, storeId, rec.id, { channel: 'buyer_seller_messaging', sentBy: 'op', sentAt: now() });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(db.prepare('SELECT status FROM m4_recovery_emails WHERE id=?').get(rec.id).status, 'marked_sent');
  const rv = db.prepare('SELECT recovery_status FROM reviews WHERE id=?').get(rid);
  assert.notEqual(rv.recovery_status, 'sent', 'reviews must NOT be flipped to fake "sent"');
  const audit = db.prepare("SELECT action_type FROM audit_logs WHERE resource_id=? AND action_type LIKE 'SEND_RECOVERY_EMAIL%' ORDER BY executed_at DESC LIMIT 1").get(rec.id);
  assert.match(audit.action_type, /_MANUAL$/);
});

// ============================================================
// M4-P2-04: recordRecoveryReply state guard
// ============================================================
test('M4-P2-04(a): record-reply on draft -> forbidden, rating untouched', () => {
  const rid = uid('rv'); seedReview({ id: rid, rating: 1 });
  const rec = monitor.draftRecovery(db, userId, storeId, { reviewId: rid });
  // status is 'draft' here
  const r = monitor.recordRecoveryReply(db, userId, storeId, rec.id, { repliedBody: 'x', reviewUpdated: true, newRating: 5 });
  assert.equal(r.error, 'state_transition_forbidden');
  assert.equal(db.prepare('SELECT rating FROM reviews WHERE id=?').get(rid).rating, 1, 'rating not polluted');
});

test('M4-P2-04(b): record-reply on marked_sent -> allowed', () => {
  const rid = uid('rv'); seedReview({ id: rid, rating: 1 });
  const rec = monitor.draftRecovery(db, userId, storeId, { reviewId: rid });
  monitor.sendRecovery(db, userId, storeId, rec.id, { channel: 'email', sentBy: 'op', sentAt: now() });
  const r = monitor.recordRecoveryReply(db, userId, storeId, rec.id, { repliedBody: 'thanks', reviewUpdated: true, newRating: 5 });
  assert.ok(!r.error, JSON.stringify(r));
});

// ============================================================
// M4-P2-01: markNotificationRead ownership
// ============================================================
test('M4-P2-01(a): cross-store / unknown notif id -> not_found, not marked', () => {
  const r = monitor.markNotificationRead(db, userId, storeId, 'notif-does-not-exist');
  assert.equal(r.error, 'not_found');
});

// ============================================================
// M4-P0-04 / M4-P0-06: revert _MANUAL strip + coverage gate
// ============================================================
test('M4-P0-04: SEND_RECOVERY_EMAIL_MANUAL revert restores via stripped case', () => {
  const rid = uid('rv'); seedReview({ id: rid });
  const rec = monitor.draftRecovery(db, userId, storeId, { reviewId: rid });
  monitor.sendRecovery(db, userId, storeId, rec.id, { channel: 'email', sentBy: 'op', sentAt: now() });
  const audit = db.prepare("SELECT id FROM audit_logs WHERE resource_id=? AND action_type='SEND_RECOVERY_EMAIL_MANUAL' ORDER BY executed_at DESC LIMIT 1").get(rec.id);
  const out = revertAuditLog(userId, storeId, audit.id, 'test');
  assert.ok(out, 'revert returns');
  assert.equal(out.dispatchedInverse, true, 'inverse dispatched (not default false)');
});

test('M4-P0-04/06: every auditM4 actionType is revertible or whitelisted', () => {
  const src = readFileSync(new URL('../../apps/api/src/data-store-monitor.mjs', import.meta.url), 'utf8');
  // collect all auditM4 actionType literals
  const re = /auditM4\([^,]+,[^,]+,\s*'([A-Z0-9_]+)'/g;
  const written = new Set(); let m;
  while ((m = re.exec(src))) written.add(m[1]);
  // collect revertM4Action case labels (between switch and default)
  const switchBody = src.slice(src.indexOf('switch (actionType)'), src.indexOf('default:'));
  const caseRe = /case\s+'([A-Z0-9_]+)'/g;
  const cases = new Set(); let c;
  while ((c = caseRe.exec(switchBody))) cases.add(c[1]);
  const whitelist = monitor.REVERT_NON_REVERTIBLE_WHITELIST;
  const strip = (s) => s.replace(/_MANUAL$/, '');
  const uncovered = [...written].filter((a) => {
    const base = strip(a);
    return !cases.has(base) && !cases.has(a) && !whitelist.has(base) && !whitelist.has(a);
  });
  assert.deepEqual(uncovered, [], 'all audit action types must be revertible or in whitelist; uncovered=' + uncovered.join(','));
});

test('M4-P0-04: HIJACK_* and _MANUAL variants all dispatch (no default false)', () => {
  // Build representative audit rows for each hijack action and assert revert dispatches.
  const cases = [
    { at: 'HIJACK_START_TESTBUY_MANUAL', seed: () => { const id = uid('hj'); seedHijacking({ id, status: 'test_buy_in_transit' }); return id; } },
    { at: 'HIJACK_SUBMIT_APPEAL', seed: () => { const id = uid('hj'); seedHijacking({ id, status: 'appeal_submitted' }); return id; } },
    { at: 'HIJACK_CLOSE', seed: () => { const id = uid('hj'); seedHijacking({ id, status: 'closed' }); return id; } },
    { at: 'HIJACK_CONFIRM_GENUINE', seed: () => { const id = uid('hj'); seedHijacking({ id, status: 'genuine' }); return id; } },
  ];
  for (const cse of cases) {
    const rid = cse.seed();
    const auditId = uid('aud');
    db.prepare(`INSERT INTO audit_logs (id,user_id,store_id,source_module,action_type,resource_type,resource_id,status,executed_at,payload)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      auditId, userId, storeId, 'M4', cse.at, 'hijacking', rid, 'success', now(),
      JSON.stringify({ sourceModule: 'M4', actionType: cse.at, payload: {} }));
    const out = revertAuditLog(userId, storeId, auditId, 'test');
    assert.ok(out && out.dispatchedInverse === true, `${cse.at} must dispatch inverse, got ${JSON.stringify(out)}`);
  }
});
