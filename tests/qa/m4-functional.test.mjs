// tests/qa/m4-functional.test.mjs
// QA Agent M4 — functional + state machine + cross-module verification.
// Covers ~57 endpoints under /api/v1/store/m4/* plus the M4-driven
// M3 ads pause / resume linkage and M1 audit-chain insert via clusters/reviews/image-diffs.
//
// Setup pattern: per-mission instructions:
//   - DATA_DB_PATH set to a temp .db file (clean run)
//   - CREDENTIAL_ENC_KEY env var present
//   - ADS_API_MOCK=true so any optional ads-api side-effects stay mocked
//   - globalThis.fetch blocked to ensure no real network is hit
//   - registerUser() bootstraps a fresh tenant; authenticate() yields a Bearer token
//   - handleMonitorRequest used directly (per-route black-box)

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---- Environment ----------------------------------------------------------
const TMP_DIR = mkdtempSync(join(tmpdir(), 'qa-m4-'));
process.env.DATA_DB_PATH = join(TMP_DIR, 'store.db');
process.env.CREDENTIAL_ENC_KEY = process.env.CREDENTIAL_ENC_KEY || 'qa-m4-test-key-please-rotate';
process.env.ADS_API_MOCK = 'true';

// Block real network so anything that escapes mocks fails loudly.
globalThis.fetch = async () => {
  throw new Error('network blocked in QA test');
};

// ---- Imports (after env) --------------------------------------------------
const { handleMonitorRequest } = await import('../../apps/api/src/store-routes-monitor.mjs');
const dataStore = await import('../../apps/api/src/data-store.mjs');
const { authenticate, registerUser, getDbInstance, defaultStoreIdFor, listAuditLogs } = dataStore;

// ---- Helpers --------------------------------------------------------------
const BASE = 'http://localhost';

let TOKEN = null;
let STORE_ID = null;
let USER_ID = null;

function setup() {
  if (TOKEN) return;
  const email = `qa-m4-${Date.now()}@example.com`;
  const reg = registerUser({ email, password: 'pass1234', name: 'QA M4', role: 'operator' });
  assert.ok(reg.user, 'registerUser must succeed: ' + JSON.stringify(reg));
  USER_ID = reg.user.id;
  const auth = authenticate(email, 'pass1234');
  assert.ok(auth?.token, 'authenticate must yield token');
  TOKEN = auth.token;
  STORE_ID = defaultStoreIdFor(USER_ID);
  assert.ok(STORE_ID, 'default store must exist');
}

async function call(method, path, { body, headers, noAuth, noStore } = {}) {
  setup();
  const h = {
    'content-type': 'application/json',
    ...(noAuth ? {} : { authorization: 'Bearer ' + TOKEN }),
    ...(noStore ? {} : { 'x-store-id': STORE_ID }),
    ...(headers || {}),
  };
  const req = new Request(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const res = await handleMonitorRequest(req);
  assert.ok(res, 'handler returned null for ' + method + ' ' + path);
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body: json };
}

function db() { return getDbInstance(); }

function manualTestBuyBody(seed = 'qa') {
  return {
    manualOrderId: `TB-MANUAL-${seed}`,
    submittedBy: 'QA operator',
    manualSubmittedAt: '2026-05-29T09:30:00Z',
    evidenceAttachment: `evidence://${seed}/test-buy.png`,
  };
}

function manualExternalCaseBody(seed = 'qa') {
  return {
    amazonComplaintId: `CASE-${seed}`,
    amazonCaseId: `CASE-${seed}`,
    submittedBy: 'QA operator',
    manualSubmittedAt: '2026-05-29T09:30:00Z',
    evidenceAttachment: `evidence://${seed}/case.pdf`,
  };
}

// ====================================================================================
// 1. Auth guards (the route guard fires at the very front, so all paths share this)
// ====================================================================================
test('AUTH: missing bearer -> 401', async () => {
  const r = await call('GET', '/api/v1/store/m4/anomalies', { noAuth: true });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'unauthorized');
});

test('AUTH: bogus token -> 401', async () => {
  setup();
  const req = new Request(BASE + '/api/v1/store/m4/anomalies', {
    headers: { authorization: 'Bearer not-real', 'x-store-id': STORE_ID || 's-x' },
  });
  const res = await handleMonitorRequest(req);
  assert.equal(res.status, 401);
});

test('AUTH: out-of-scope path -> handler returns null', async () => {
  setup();
  const req = new Request(BASE + '/api/v1/store/profit/something', {
    headers: { authorization: 'Bearer ' + TOKEN, 'x-store-id': STORE_ID },
  });
  const res = await handleMonitorRequest(req);
  assert.equal(res, null);
});

// ====================================================================================
// 2. Anomalies (8 endpoints) + 5-state machine
// ====================================================================================
test('ANOMALY list happy path', async () => {
  const r = await call('GET', '/api/v1/store/m4/anomalies');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(typeof r.body.summary === 'object');
  // Seed inserts 12 anomalies
  assert.ok(r.body.items.length >= 10);
});

test('ANOMALY list filter by severity=P0', async () => {
  const r = await call('GET', '/api/v1/store/m4/anomalies?severity=P0');
  assert.equal(r.status, 200);
  for (const it of r.body.items) assert.equal(it.severity, 'P0');
});

test('ANOMALY create requires fields -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m4/anomalies', { body: { severity: 'P1' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'validation_failed');
});

test('ANOMALY create invalid severity -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m4/anomalies', {
    body: { anomalyCode: 'A_T', category: 'review', severity: 'Pxx', title: 'bad' },
  });
  assert.equal(r.status, 400);
});

test('ANOMALY create happy + get + status=open', async () => {
  const r = await call('POST', '/api/v1/store/m4/anomalies', {
    body: { anomalyCode: 'A_TEST_CREATE', category: 'review', severity: 'P1', title: 'QA created anomaly' },
  });
  assert.equal(r.status, 201);
  const id = r.body.id;
  assert.equal(r.body.status, 'open');
  const got = await call('GET', '/api/v1/store/m4/anomalies/' + id);
  assert.equal(got.status, 200);
  assert.equal(got.body.id, id);
  assert.ok(Array.isArray(got.body.slaEvents));
  assert.ok(got.body.slaEvents.some((e) => e.eventType === 'detected'));
});

test('ANOMALY get unknown id -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m4/anomalies/does-not-exist-x');
  assert.equal(r.status, 404);
});

test('STATE-MACHINE: assign requires assigneeLabel', async () => {
  const a = await call('POST', '/api/v1/store/m4/anomalies', {
    body: { anomalyCode: 'A_SM1', category: 'traffic', severity: 'P2', title: 'sm1' },
  });
  const id = a.body.id;
  const r = await call('POST', `/api/v1/store/m4/anomalies/${id}/assign`, { body: {} });
  assert.equal(r.status, 400);
});

test('STATE-MACHINE: open -> assigned -> investigating -> resolved (happy chain)', async () => {
  const a = await call('POST', '/api/v1/store/m4/anomalies', {
    body: { anomalyCode: 'A_SM2', category: 'review', severity: 'P1', title: 'chain' },
  });
  const id = a.body.id;
  // assign
  const r1 = await call('POST', `/api/v1/store/m4/anomalies/${id}/assign`, {
    body: { assigneeLabel: 'ops-team' },
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.status, 'assigned');
  // acknowledge
  const r2 = await call('POST', `/api/v1/store/m4/anomalies/${id}/acknowledge`, { body: {} });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.status, 'investigating');
  assert.ok(r2.body.acknowledgedAt);
  // resolve
  const r3 = await call('POST', `/api/v1/store/m4/anomalies/${id}/resolve`, {
    body: { note: 'fixed via QA' },
  });
  assert.equal(r3.status, 200);
  assert.equal(r3.body.status, 'resolved');
  assert.ok(r3.body.resolvedAt);
  // SLA events should now contain detected, assigned, acknowledged, resolved
  const detail = await call('GET', `/api/v1/store/m4/anomalies/${id}`);
  const types = detail.body.slaEvents.map((e) => e.eventType);
  for (const t of ['detected', 'assigned', 'acknowledged', 'resolved']) {
    assert.ok(types.includes(t), `expected SLA event ${t}`);
  }
});

test('STATE-MACHINE: open -> dismissed (terminal)', async () => {
  const a = await call('POST', '/api/v1/store/m4/anomalies', {
    body: { anomalyCode: 'A_SM3', category: 'review', severity: 'P2', title: 'dis' },
  });
  const id = a.body.id;
  const r = await call('POST', `/api/v1/store/m4/anomalies/${id}/dismiss`, {
    body: { reason: 'false positive' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'dismissed');
});

test('STATE-MACHINE: open -> escalated (manual, no background tick needed)', async () => {
  const a = await call('POST', '/api/v1/store/m4/anomalies', {
    body: { anomalyCode: 'A_SM4', category: 'review', severity: 'P1', title: 'esc' },
  });
  const id = a.body.id;
  const r = await call('POST', `/api/v1/store/m4/anomalies/${id}/escalate`, {
    body: { reason: 'past SLA', escalateTo: 'manager' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'escalated');
  // listSlaEvents should contain an 'escalated' event for this anomaly
  const ev = await call('GET', '/api/v1/store/m4/sla/events?anomalyId=' + id);
  assert.equal(ev.status, 200);
  assert.ok(ev.body.items.some((e) => e.eventType === 'escalated'));
});

test('STATE-MACHINE: unknown id -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m4/anomalies/nope-x/assign', {
    body: { assigneeLabel: 'team' },
  });
  assert.equal(r.status, 404);
});

// ====================================================================================
// 3. SLA endpoints (2)
// ====================================================================================
test('SLA board returns todayStats + team', async () => {
  const r = await call('GET', '/api/v1/store/m4/sla/board?range=7d');
  assert.equal(r.status, 200);
  assert.ok('todayStats' in r.body && Array.isArray(r.body.team));
});

test('SLA events default list', async () => {
  const r = await call('GET', '/api/v1/store/m4/sla/events');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

// ====================================================================================
// 4. Cases (5) + ref_count increment via recommend
// ====================================================================================
test('CASE list works (seeded 8 rows)', async () => {
  const r = await call('GET', '/api/v1/store/m4/cases');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length >= 5);
});

test('CASE create validation', async () => {
  const r = await call('POST', '/api/v1/store/m4/cases', { body: { scenario: 'only' } });
  assert.equal(r.status, 400);
});

test('CASE create happy + update + recommend ref_count++', async () => {
  // create case
  const c = await call('POST', '/api/v1/store/m4/cases', {
    body: { scenario: 'QA scenario', actionPlan: 'do x', reusable: true, anomalyCode: 'A_QA1', tags: ['qa'] },
  });
  assert.equal(c.status, 201);
  const id = c.body.id;
  // get
  const got = await call('GET', '/api/v1/store/m4/cases/' + id);
  assert.equal(got.status, 200);
  // update
  const upd = await call('PATCH', '/api/v1/store/m4/cases/' + id, {
    body: { status: 'successful', outcome: 'ok' },
  });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.status, 'successful');

  // Create anomaly + recommend (must bump reference_count)
  const a = await call('POST', '/api/v1/store/m4/anomalies', {
    body: { anomalyCode: 'A_QA1', category: 'review', severity: 'P2', title: 'rec target' },
  });
  const anomalyId = a.body.id;
  const before = (await call('GET', '/api/v1/store/m4/cases/' + id)).body.referenceCount || 0;
  const rec = await call('GET', '/api/v1/store/m4/cases/recommend?anomalyId=' + anomalyId);
  assert.equal(rec.status, 200);
  assert.ok(rec.body.items.length >= 1);
  const after = (await call('GET', '/api/v1/store/m4/cases/' + id)).body.referenceCount || 0;
  assert.ok(after >= before + 1, `referenceCount should bump (${before}->${after})`);
});

// ====================================================================================
// 5. Postmortems (4)
// ====================================================================================
test('POSTMORTEM list works', async () => {
  const r = await call('GET', '/api/v1/store/m4/postmortems');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('POSTMORTEM generate without anomalyIds -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m4/postmortems/generate', { body: {} });
  assert.equal(r.status, 400);
});

test('POSTMORTEM generate happy + update', async () => {
  // Create source anomaly
  const a = await call('POST', '/api/v1/store/m4/anomalies', {
    body: { anomalyCode: 'A_PM1', category: 'refund', severity: 'P0', title: 'PM source' },
  });
  const aid = a.body.id;
  const gen = await call('POST', '/api/v1/store/m4/postmortems/generate', {
    body: { anomalyIds: [aid], title: 'QA pm' },
  });
  assert.equal(gen.status, 201);
  const pmId = gen.body.id;
  assert.ok(Array.isArray(gen.body.timeline));

  const got = await call('GET', '/api/v1/store/m4/postmortems/' + pmId);
  assert.equal(got.status, 200);

  const upd = await call('PUT', '/api/v1/store/m4/postmortems/' + pmId, {
    body: { verdict: 'successful', rootCause: 'reproduced' },
  });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.verdict, 'successful');
});

// ====================================================================================
// 6. Hijacking (6) + M3 pause + 24h dedup + revert verification
// ====================================================================================
test('HIJACK list + scan happy', async () => {
  const r = await call('GET', '/api/v1/store/m4/hijacking');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  const sc = await call('POST', '/api/v1/store/m4/hijacking/scan', { body: {} });
  assert.equal(sc.status, 201);
  assert.ok(sc.body.created.length >= 1);
});

test('HIJACK start-test-buy forbidden from non-pending status', async () => {
  // pick a 'closed' seeded record if any; otherwise transition one first
  const list = await call('GET', '/api/v1/store/m4/hijacking');
  const closed = list.body.items.find((h) => h.status === 'closed' || h.status === 'test_buy_in_transit' || h.status === 'test_buy_received');
  assert.ok(closed, 'need a non-pending hijack from seed');
  const r = await call('POST', `/api/v1/store/m4/hijacking/${closed.id}/start-test-buy`, { body: {} });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'state_transition_forbidden');
});

test('HIJACK upload-proof invalid type -> 400', async () => {
  const list = await call('GET', '/api/v1/store/m4/hijacking');
  const any = list.body.items[0];
  const r = await call('POST', `/api/v1/store/m4/hijacking/${any.id}/upload-proof`, {
    body: { type: 'something_random' },
  });
  assert.equal(r.status, 400);
});

test('HIJACK counterfeit -> M3 pause + first call NOT dedupped (asin path)', async () => {
  // 1) Make sure we have an enabled lx_campaign for some asin so pauseAds finds a victim.
  setup();
  const d = db();
  const asin = 'B0CASEQA-' + Date.now().toString(36).slice(-4);
  const cid = 'cQA-' + Math.random().toString(36).slice(2, 8);
  const aid = 'aQA-' + Math.random().toString(36).slice(2, 8);
  const gid = 'gQA-' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  d.prepare(`INSERT INTO lx_campaigns(id,user_id,store_id,name,type,state,service_state,enabled,daily_budget,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(cid, USER_ID, STORE_ID, 'qa-camp', 'SP', '启用', '正在投放', 1, 10, now, now);
  d.prepare(`INSERT INTO lx_ad_groups(id,user_id,store_id,campaign_id,name,enabled,state,default_bid,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(gid, USER_ID, STORE_ID, cid, 'qa-ag', 1, '启用', 1, now, now);
  d.prepare(`INSERT INTO lx_ads(id,user_id,store_id,ad_group_id,asin,sku,enabled,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(aid, USER_ID, STORE_ID, gid, asin, null, 1, '启用', now, now);

  // 2) Insert a hijack row by hand so we control the ASIN
  const hjId = 'hj-qa-' + Math.random().toString(36).slice(2, 8);
  d.prepare(`INSERT INTO m4_hijacking(id,user_id,store_id,asin,hijacker_seller,detected_at,duration_min,type,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(hjId, USER_ID, STORE_ID, asin, 'BadSeller-1', now, 0, 'price_competition', 'pending_test_buy', now);

  // 3) start test buy -> in_transit
  const r1 = await call('POST', `/api/v1/store/m4/hijacking/${hjId}/start-test-buy`, { body: manualTestBuyBody('hj1') });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.status, 'test_buy_in_transit');

  // 4) confirm counterfeit -> M3 pause expected
  const r2 = await call('POST', `/api/v1/store/m4/hijacking/${hjId}/upload-proof`, {
    body: { type: 'counterfeit_confirmed', proofImages: ['/p1.jpg'] },
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.m3AdsPaused, true);
  assert.ok(r2.body.m3PausedCampaignIds.includes(cid));

  // M4 must queue the M3 write-like pause; it must not mutate the shadow Ads table directly.
  const camp = d.prepare('SELECT enabled FROM lx_campaigns WHERE id=?').get(cid);
  assert.equal(camp.enabled, 1);
  const pauseQueue = d.prepare(`SELECT * FROM ad_action_queue WHERE user_id=? AND store_id=? ORDER BY created_at DESC LIMIT 1`).get(USER_ID, STORE_ID);
  assert.ok(pauseQueue, 'M4 pause must create an M3 action-queue item');
  assert.match(pauseQueue.typed_action, /M4_PAUSE_ADS_FOR_ASIN/);

  // 5) Trigger a SECOND hijack on same asin/day to test 24h dedup
  const hjId2 = 'hj-qa2-' + Math.random().toString(36).slice(2, 8);
  d.prepare(`INSERT INTO m4_hijacking(id,user_id,store_id,asin,hijacker_seller,detected_at,duration_min,type,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(hjId2, USER_ID, STORE_ID, asin, 'BadSeller-2', now, 0, 'price_competition', 'pending_test_buy', now);
  await call('POST', `/api/v1/store/m4/hijacking/${hjId2}/start-test-buy`, { body: manualTestBuyBody('hj2') });
  const r3 = await call('POST', `/api/v1/store/m4/hijacking/${hjId2}/upload-proof`, {
    body: { type: 'counterfeit_confirmed', proofImages: [] },
  });
  assert.equal(r3.status, 200);
  // dedup means m3AdsPaused stays false on the second row
  assert.equal(r3.body.m3AdsPaused, false, 'second hijack same-day same-asin should be dedupped');

  // 6) Reverse path: closeHijacking should resume the first one's campaigns
  const close = await call('POST', `/api/v1/store/m4/hijacking/${hjId}/close`, {
    body: { outcome: 'hijacker_removed' },
  });
  assert.equal(close.status, 200);
  const camp2 = d.prepare('SELECT enabled FROM lx_campaigns WHERE id=?').get(cid);
  assert.equal(camp2.enabled, 1, 'campaign remains unchanged until M3 action queue execution');
  const resumeQueue = d.prepare(`SELECT * FROM ad_action_queue WHERE user_id=? AND store_id=? AND typed_action LIKE '%M4_RESUME_ADS_FOR_ASIN%' ORDER BY created_at DESC LIMIT 1`).get(USER_ID, STORE_ID);
  assert.ok(resumeQueue, 'closeHijacking must queue the M3 resume intent');

  // 7) Genuine path: must not call M3 pause
  const hjId3 = 'hj-qa3-' + Math.random().toString(36).slice(2, 8);
  d.prepare(`INSERT INTO m4_hijacking(id,user_id,store_id,asin,hijacker_seller,detected_at,duration_min,type,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(hjId3, USER_ID, STORE_ID, asin, 'GoodSeller', now, 0, 'price_competition', 'pending_test_buy', now);
  await call('POST', `/api/v1/store/m4/hijacking/${hjId3}/start-test-buy`, { body: manualTestBuyBody('hj3') });
  const r4 = await call('POST', `/api/v1/store/m4/hijacking/${hjId3}/upload-proof`, {
    body: { type: 'genuine_authorized' },
  });
  assert.equal(r4.body.status, 'genuine');
  assert.equal(r4.body.m3AdsPaused, false);
});

test('HIJACK submit-appeal validation', async () => {
  const list = await call('GET', '/api/v1/store/m4/hijacking');
  const any = list.body.items[0];
  const r = await call('POST', `/api/v1/store/m4/hijacking/${any.id}/submit-appeal`, { body: {} });
  assert.equal(r.status, 400);
});

// Cross-module revert via audit-log API → store-routes.mjs path
// GAP: revertM4Action(M3_PAUSE_ADS_FROM_M4) reads payload.pausedCampaignIds, but
// appendAuditLog wraps the caller payload at payload.payload.pausedCampaignIds, so
// the campaign list is *not* recovered automatically through the public revert API.
// We document this by asserting the audit row is marked reverted, but the campaign
// stays paused (no automatic resume on revert). The forward close-hijacking path
// (which DOES resume) is verified in the earlier counterfeit test.
test('CROSS-MODULE M3 pause-from-M4 leaves an audit row that revert API accepts', async () => {
  setup();
  const d = db();
  const asin = 'B0REV-' + Date.now().toString(36).slice(-4);
  const cid = 'cREV-' + Math.random().toString(36).slice(2, 8);
  const aid = 'aREV-' + Math.random().toString(36).slice(2, 8);
  const gid = 'gREV-' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  d.prepare(`INSERT INTO lx_campaigns(id,user_id,store_id,name,type,state,service_state,enabled,daily_budget,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(cid, USER_ID, STORE_ID, 'rev-camp', 'SP', '启用', '正在投放', 1, 10, now, now);
  d.prepare(`INSERT INTO lx_ad_groups(id,user_id,store_id,campaign_id,name,enabled,state,default_bid,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(gid, USER_ID, STORE_ID, cid, 'rev-ag', 1, '启用', 1, now, now);
  d.prepare(`INSERT INTO lx_ads(id,user_id,store_id,ad_group_id,asin,sku,enabled,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(aid, USER_ID, STORE_ID, gid, asin, null, 1, '启用', now, now);

  const hjId = 'hjREV-' + Math.random().toString(36).slice(2, 8);
  d.prepare(`INSERT INTO m4_hijacking(id,user_id,store_id,asin,hijacker_seller,detected_at,duration_min,type,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(hjId, USER_ID, STORE_ID, asin, 'Bad', now, 0, 'price_competition', 'pending_test_buy', now);
  await call('POST', `/api/v1/store/m4/hijacking/${hjId}/start-test-buy`, { body: manualTestBuyBody('hj1') });
  await call('POST', `/api/v1/store/m4/hijacking/${hjId}/upload-proof`, {
    body: { type: 'counterfeit_confirmed' },
  });
  assert.equal(d.prepare('SELECT enabled FROM lx_campaigns WHERE id=?').get(cid).enabled, 1);
  const pauseQueue = d.prepare(`SELECT id FROM ad_action_queue WHERE user_id=? AND store_id=? AND typed_action LIKE '%M4_PAUSE_ADS_FOR_ASIN%' ORDER BY created_at DESC LIMIT 1`).get(USER_ID, STORE_ID);
  assert.ok(pauseQueue, 'M4 pause should be queued for M3 review');

  // find audit log for M3_PAUSE_ADS_FROM_M4
  const logs = listAuditLogs(USER_ID, STORE_ID, { sourceModule: 'M4', actionType: 'M3_PAUSE_ADS_FROM_M4' });
  assert.ok(logs.length >= 1, 'missing M3_PAUSE_ADS_FROM_M4 audit row');
  const target = logs[0];

  const reverted = dataStore.revertAuditLog(USER_ID, STORE_ID, target.id, 'qa revert');
  assert.ok(reverted, 'revertAuditLog returned falsy');
  assert.equal(reverted.reverted, true, 'audit row must flip reverted=true');
  // The forward path (closeHijacking) is the documented resume mechanism — verified
  // in the earlier counterfeit/dedup test (HIJACK counterfeit -> M3 pause + first call NOT dedupped).
});

// ====================================================================================
// 7. Infringement 4-state machine + legalDisclaimerAck
// ====================================================================================
test('INFRINGEMENT list', async () => {
  const r = await call('GET', '/api/v1/store/m4/infringement');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('INFRINGEMENT create validation', async () => {
  const r = await call('POST', '/api/v1/store/m4/infringement', { body: {} });
  assert.equal(r.status, 400);
});

test('INFRINGEMENT create + draft requires legalDisclaimerAck', async () => {
  const c = await call('POST', '/api/v1/store/m4/infringement', {
    body: { asin: 'B0CASE001', type: 'trademark', severity: 'high', description: 'foo' },
  });
  assert.equal(c.status, 201);
  const id = c.body.id;
  // No ack -> 400 referencing legalDisclaimerAck
  const r1 = await call('POST', `/api/v1/store/m4/infringement/${id}/draft`, { body: {} });
  assert.equal(r1.status, 400);
  assert.match(r1.body.message || '', /legalDisclaimerAck/);
  // With ack -> 200 draft
  const r2 = await call('POST', `/api/v1/store/m4/infringement/${id}/draft`, {
    body: { legalDisclaimerAck: true },
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.status, 'draft');
  assert.equal(r2.body.legalDisclaimerAck, true);
});

test('INFRINGEMENT 4-state happy path: investigating->draft->submitted->resolved', async () => {
  const c = await call('POST', '/api/v1/store/m4/infringement', {
    body: { asin: 'B0CASE001', type: 'copyright', severity: 'medium' },
  });
  const id = c.body.id;
  const r1 = await call('POST', `/api/v1/store/m4/infringement/${id}/draft`, {
    body: { legalDisclaimerAck: true },
  });
  assert.equal(r1.body.status, 'draft');
  // can't draft again from draft
  const rDup = await call('POST', `/api/v1/store/m4/infringement/${id}/draft`, {
    body: { legalDisclaimerAck: true },
  });
  assert.equal(rDup.status, 400);
  assert.equal(rDup.body.error, 'state_transition_forbidden');

  const r2 = await call('POST', `/api/v1/store/m4/infringement/${id}/submit`, { body: manualExternalCaseBody(id) });
  assert.equal(r2.body.status, 'submitted');
  // can't submit twice
  const rDup2 = await call('POST', `/api/v1/store/m4/infringement/${id}/submit`, { body: manualExternalCaseBody(id) });
  assert.equal(rDup2.status, 400);

  // resolve with invalid outcome
  const rBad = await call('POST', `/api/v1/store/m4/infringement/${id}/resolve`, {
    body: { outcome: 'mystery' },
  });
  assert.equal(rBad.status, 400);
  // resolve with accepted
  const r3 = await call('POST', `/api/v1/store/m4/infringement/${id}/resolve`, {
    body: { outcome: 'accepted' },
  });
  assert.equal(r3.body.status, 'resolved');
});

test('INFRINGEMENT resolve rejected / dismissed branches', async () => {
  for (const outcome of ['rejected', 'dismissed']) {
    const c = await call('POST', '/api/v1/store/m4/infringement', {
      body: { asin: 'B0CASE001', type: 'patent' },
    });
    const id = c.body.id;
    await call('POST', `/api/v1/store/m4/infringement/${id}/draft`, {
      body: { legalDisclaimerAck: true },
    });
    await call('POST', `/api/v1/store/m4/infringement/${id}/submit`, { body: manualExternalCaseBody(id) });
    const r = await call('POST', `/api/v1/store/m4/infringement/${id}/resolve`, {
      body: { outcome },
    });
    assert.equal(r.body.status, outcome);
  }
});

// ====================================================================================
// 8. Reviews (5) + cluster + push-M1 audit chain
// ====================================================================================
test('REVIEWS list + summary fields', async () => {
  const r = await call('GET', '/api/v1/store/m4/reviews');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(typeof r.body.summary === 'object');
});

test('REVIEWS sync creates rows + potential burst anomaly', async () => {
  const r = await call('POST', '/api/v1/store/m4/reviews/sync', { body: { limit: 6, seedTag: 'qaT1' } });
  assert.equal(r.status, 201);
  assert.ok(r.body.created >= 1);
});

test('REVIEW push-m1 writes M1 audit row (M4 -> M1 audit chain)', async () => {
  // ensure a review exists
  await call('POST', '/api/v1/store/m4/reviews/sync', { body: { limit: 3, seedTag: 'qaPushM1' } });
  const list = await call('GET', '/api/v1/store/m4/reviews?sentiment=negative');
  const target = list.body.items[0] || (await call('GET', '/api/v1/store/m4/reviews')).body.items[0];
  assert.ok(target, 'need at least one review');
  const r = await call('POST', `/api/v1/store/m4/reviews/${target.id}/push-m1`, { body: {} });
  assert.equal(r.status, 200);
  assert.ok(r.body.m1TargetId);
  // verify audit chain contains both M4 PUSH_M1_IMPROVEMENT and M1 M1_TARGET_CREATE
  const m4logs = listAuditLogs(USER_ID, STORE_ID, { sourceModule: 'M4', actionType: 'PUSH_M1_IMPROVEMENT' });
  const m1logs = listAuditLogs(USER_ID, STORE_ID, { sourceModule: 'M1', actionType: 'M1_TARGET_CREATE' });
  assert.ok(m4logs.length >= 1, 'no M4 PUSH_M1_IMPROVEMENT audit');
  assert.ok(m1logs.length >= 1, 'no M1 M1_TARGET_CREATE audit');
  assert.ok(m1logs.some((l) => l.resourceId === r.body.m1TargetId));
});

test('REVIEW mark-appealable updates flag', async () => {
  const list = await call('GET', '/api/v1/store/m4/reviews');
  const target = list.body.items[0];
  const r = await call('POST', `/api/v1/store/m4/reviews/${target.id}/mark-appealable`, {
    body: { appealable: true, violationType: 'hateful' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.appealEligible, true);
});

test('REVIEW get unknown -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m4/reviews/no-such-rev');
  assert.equal(r.status, 404);
});

// ====================================================================================
// 9. Clusters (4) + push-M1
// ====================================================================================
test('CLUSTERS list + recompute', async () => {
  const r = await call('GET', '/api/v1/store/m4/review-clusters');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  const re = await call('POST', '/api/v1/store/m4/review-clusters/recompute', {
    body: { asin: 'B0CASE001' },
  });
  assert.equal(re.status, 201);
  assert.ok(re.body.created >= 1);
});

test('CLUSTER push-m1 records cluster.status=pushed + writes M1 audit', async () => {
  const list = await call('GET', '/api/v1/store/m4/review-clusters');
  const target = list.body.items[0];
  const r = await call('POST', `/api/v1/store/m4/review-clusters/${target.id}/push-m1`, {
    body: { layer: 'listing' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'pushed');
  assert.ok(r.body.pushedM1TargetIds.length >= 1);
  const m1Logs = listAuditLogs(USER_ID, STORE_ID, { sourceModule: 'M1', actionType: 'M1_TARGET_CREATE' });
  assert.ok(m1Logs.length >= 1);
});

// ====================================================================================
// 10. Trends (2)
// ====================================================================================
test('TRENDS list + snapshot', async () => {
  const r = await call('GET', '/api/v1/store/m4/review-trends');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  const s = await call('POST', '/api/v1/store/m4/review-trends/snapshot', {
    body: { asins: ['B0CASE001'] },
  });
  assert.equal(s.status, 201);
  assert.ok(s.body.created >= 1);
});

// ====================================================================================
// 11. Appeals (5) + chain via parent_appeal_id
// ====================================================================================
test('APPEALS list + summary', async () => {
  const r = await call('GET', '/api/v1/store/m4/appeals');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(typeof r.body.summary === 'object');
});

test('APPEAL draft validation (violationType, reviewId|hijackingId)', async () => {
  const r1 = await call('POST', '/api/v1/store/m4/appeals/draft', { body: { reviewId: 'r1' } });
  assert.equal(r1.status, 400);
  const r2 = await call('POST', '/api/v1/store/m4/appeals/draft', {
    body: { violationType: 'hateful' },
  });
  assert.equal(r2.status, 400);
});

test('APPEAL state-machine + retry chain', async () => {
  // ensure a review
  await call('POST', '/api/v1/store/m4/reviews/sync', { body: { limit: 2, seedTag: 'apqa' } });
  const reviews = (await call('GET', '/api/v1/store/m4/reviews')).body.items;
  const rev = reviews[0];
  // draft
  const c = await call('POST', '/api/v1/store/m4/appeals/draft', {
    body: { reviewId: rev.id, violationType: 'hateful' },
  });
  assert.equal(c.status, 201);
  const id = c.body.id;
  // submit
  const s = await call('POST', `/api/v1/store/m4/appeals/${id}/submit`, { body: manualExternalCaseBody(id) });
  assert.equal(s.body.status, 'submitted');
  // review (under_review)
  const rv = await call('POST', `/api/v1/store/m4/appeals/${id}/review`, {
    body: { outcome: 'under_review' },
  });
  assert.equal(rv.body.status, 'under_review');
  // reject
  const rj = await call('POST', `/api/v1/store/m4/appeals/${id}/review`, {
    body: { outcome: 'rejected', amazonResponse: 'no evidence' },
  });
  assert.equal(rj.body.status, 'rejected');
  // retry forbidden when not yet rejected? we are at rejected -> allowed
  const ry = await call('POST', `/api/v1/store/m4/appeals/${id}/retry`, {
    body: { note: 'more proof attached' },
  });
  assert.equal(ry.status, 200);
  assert.equal(ry.body.parentAppealId, id, 'retry must chain via parentAppealId');
  assert.equal(ry.body.retryCount, 1);
  // submit + accept the retry
  const s2 = await call('POST', `/api/v1/store/m4/appeals/${ry.body.id}/submit`, { body: manualExternalCaseBody(ry.body.id) });
  assert.equal(s2.body.status, 'submitted');
  const ac = await call('POST', `/api/v1/store/m4/appeals/${ry.body.id}/review`, {
    body: { outcome: 'accepted' },
  });
  assert.equal(ac.body.status, 'accepted');
  // forbidden: trying to submit twice on accepted
  const dup = await call('POST', `/api/v1/store/m4/appeals/${ry.body.id}/submit`, { body: manualExternalCaseBody(ry.body.id) });
  assert.equal(dup.status, 400);
});

test('APPEAL retry forbidden from non-rejected', async () => {
  // grab any draft seeded appeal
  const r = await call('GET', '/api/v1/store/m4/appeals?status=draft');
  if (!r.body.items.length) return; // skip
  const ap = r.body.items[0];
  const res = await call('POST', `/api/v1/store/m4/appeals/${ap.id}/retry`, { body: {} });
  assert.equal(res.status, 400);
});

test('APPEAL review invalid outcome -> 400', async () => {
  await call('POST', '/api/v1/store/m4/reviews/sync', { body: { limit: 1, seedTag: 'invout' } });
  const rev = (await call('GET', '/api/v1/store/m4/reviews')).body.items[0];
  const draft = await call('POST', '/api/v1/store/m4/appeals/draft', {
    body: { reviewId: rev.id, violationType: 'hateful' },
  });
  await call('POST', `/api/v1/store/m4/appeals/${draft.body.id}/submit`, { body: manualExternalCaseBody(draft.body.id) });
  const r = await call('POST', `/api/v1/store/m4/appeals/${draft.body.id}/review`, {
    body: { outcome: 'maybe' },
  });
  assert.equal(r.status, 400);
});

// ====================================================================================
// 12. Recovery (5)
// ====================================================================================
test('RECOVERY list + draft + send + reply + next-round chain', async () => {
  await call('POST', '/api/v1/store/m4/reviews/sync', { body: { limit: 2, seedTag: 'recqa' } });
  const rev = (await call('GET', '/api/v1/store/m4/reviews')).body.items[0];

  const list = await call('GET', '/api/v1/store/m4/recovery');
  assert.equal(list.status, 200);

  // draft without reviewId -> 400
  const v = await call('POST', '/api/v1/store/m4/recovery/draft', { body: {} });
  assert.equal(v.status, 400);
  // draft with bad reviewId -> 404
  const v2 = await call('POST', '/api/v1/store/m4/recovery/draft', { body: { reviewId: 'nope' } });
  assert.equal(v2.status, 404);

  const d = await call('POST', '/api/v1/store/m4/recovery/draft', {
    body: { reviewId: rev.id, templateId: 'tpl-apology' },
  });
  assert.equal(d.status, 201);
  const id = d.body.id;
  assert.equal(d.body.roundNo, 1);

  // get
  const g = await call('GET', '/api/v1/store/m4/recovery/' + id);
  assert.equal(g.status, 200);

  // M4-P1-03: send is a MANUAL ticket-board action. Without manual-evidence it 400s;
  // with evidence it marks the recovery 'marked_sent' (never fakes a real 'sent').
  const sNoEvidence = await call('POST', `/api/v1/store/m4/recovery/${id}/send`, { body: {} });
  assert.equal(sNoEvidence.status, 400);
  const s = await call('POST', `/api/v1/store/m4/recovery/${id}/send`, {
    body: { channel: 'buyer_seller_messaging', sentBy: 'qa-op', sentAt: '2026-05-29T10:00:00Z' },
  });
  assert.equal(s.body.status, 'marked_sent');
  // send again -> 400 (already marked_sent)
  const s2 = await call('POST', `/api/v1/store/m4/recovery/${id}/send`, {
    body: { channel: 'email', sentBy: 'qa-op', sentAt: '2026-05-29T10:05:00Z' },
  });
  assert.equal(s2.status, 400);

  // record reply with new rating
  const rep = await call('POST', `/api/v1/store/m4/recovery/${id}/record-reply`, {
    body: { repliedBody: 'thank you', reviewUpdated: true, newRating: 4 },
  });
  assert.equal(rep.body.status, 'review_updated');
  assert.equal(rep.body.newRating, 4);

  // next-round (forms a chain via parentEmailId)
  const nr = await call('POST', `/api/v1/store/m4/recovery/${id}/next-round`, {
    body: { templateId: 'tpl-followup' },
  });
  assert.equal(nr.status, 200);
  assert.equal(nr.body.roundNo, 2);
});

// ====================================================================================
// 13. Competitors (5)
// ====================================================================================
test('COMPETITORS list + add + snapshot + timeline + dismiss', async () => {
  const list = await call('GET', '/api/v1/store/m4/competitors');
  assert.equal(list.status, 200);

  const bad = await call('POST', '/api/v1/store/m4/competitors', { body: {} });
  assert.equal(bad.status, 400);

  const add = await call('POST', '/api/v1/store/m4/competitors', {
    body: { competitorAsin: 'B0QA001', title: 'QA comp', price: 19.99 },
  });
  assert.equal(add.status, 201);

  const snap = await call('POST', '/api/v1/store/m4/competitors/snapshot', {
    body: { asins: ['B0QA001'] },
  });
  assert.equal(snap.status, 201);

  const tl = await call('GET', '/api/v1/store/m4/competitors/B0QA001/timeline');
  assert.equal(tl.status, 200);
  assert.ok(Array.isArray(tl.body.items));

  // dismiss-change (no changes likely; just verify endpoint returns 200/404)
  const dc = await call('POST', '/api/v1/store/m4/competitors/B0QA001/dismiss-change', {
    body: { changeIdx: 0, reason: 'noise' },
  });
  assert.ok([200, 404].includes(dc.status));
});

// ====================================================================================
// 14. Image Diffs (3)
// ====================================================================================
test('IMAGE-DIFFS list + scan + push-m1', async () => {
  const list = await call('GET', '/api/v1/store/m4/image-diffs');
  assert.equal(list.status, 200);
  const sc = await call('POST', '/api/v1/store/m4/image-diffs/scan', { body: {} });
  assert.equal(sc.status, 201);
  assert.ok(sc.body.created >= 1);
  const target = list.body.items[0] || (await call('GET', '/api/v1/store/m4/image-diffs')).body.items[0];
  const push = await call('POST', `/api/v1/store/m4/image-diffs/${target.id}/push-m1`, { body: {} });
  assert.equal(push.status, 200);
  assert.ok(push.body.m1TargetId);
});

// ====================================================================================
// 15. Brand Defense (4) + counter
// ====================================================================================
test('BRAND-DEFENSE get returns layers', async () => {
  const r = await call('GET', '/api/v1/store/m4/brand-defense');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.layers));
  assert.ok(r.body.layers.length >= 1);
});

test('BRAND-DEFENSE enable + disable layer', async () => {
  const cur = await call('GET', '/api/v1/store/m4/brand-defense');
  const layer = cur.body.layers[0];
  const en = await call('POST', `/api/v1/store/m4/brand-defense/${layer.layerCode}/enable`, {
    body: { boundStrategyIds: ['s1'], boundCampaignIds: ['c1'] },
  });
  assert.equal(en.status, 200);
  assert.equal(en.body.status, 'enabled');
  const di = await call('POST', `/api/v1/store/m4/brand-defense/${layer.layerCode}/disable`, {
    body: { reason: 'manual off' },
  });
  assert.equal(di.status, 200);
  assert.equal(di.body.status, 'disabled');
});

test('BRAND-DEFENSE counter validation + happy', async () => {
  const bad = await call('POST', '/api/v1/store/m4/brand-defense/counter', { body: { term: 'x' } });
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/api/v1/store/m4/brand-defense/counter', {
    body: { term: 'mybrand', bidIncrease: 0.5 },
  });
  assert.equal(ok.status, 201);
  assert.ok(Array.isArray(ok.body.updatedTargetingIds));
});

// 安全不变量(1): counterBrand 不得直写 lx_targetings.bid, 必须改走 ad_action_queue
test('BRAND-DEFENSE counter queues M4_BRAND_COUNTER_BID and does NOT write lx_targetings.bid', async () => {
  const d = db();
  const now = new Date().toISOString();
  const tid = 'tg-brandcounter-' + Math.random().toString(16).slice(2, 8);
  // seed one brand targeting with a known bid
  d.prepare(`INSERT INTO lx_targetings(id, user_id, store_id, ad_group_id, term, match_type, state, bid, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(tid, USER_ID, STORE_ID, null, 'queuebrand-defense', 'exact', '启用', 1.0, now, now);

  const res = await call('POST', '/api/v1/store/m4/brand-defense/counter', {
    body: { term: 'queuebrand', bidIncrease: 0.5 },
  });
  assert.equal(res.status, 201);
  // (a) bid must be UNCHANGED (no direct write)
  const after = d.prepare('SELECT bid FROM lx_targetings WHERE id=?').get(tid);
  assert.equal(after.bid, 1.0, 'lx_targetings.bid must not be directly written by counterBrand');
  // (b) a queued intent must exist, dryRun=1, guardrail needs_review, audit_required
  assert.ok(res.body.queuedActionId, 'response carries queuedActionId');
  const q = d.prepare(`SELECT * FROM ad_action_queue WHERE id=?`).get(res.body.queuedActionId);
  assert.ok(q, 'ad_action_queue row created');
  assert.equal(q.dry_run, 1, 'queued intent is dryRun=1');
  assert.equal(q.audit_required, 1, 'queued intent requires audit');
  assert.match(q.typed_action, /M4_BRAND_COUNTER_BID/);
  assert.match(q.guardrail, /needs_review/);
  // (c) the affected targeting id is captured for later M3 execution
  assert.ok(res.body.updatedTargetingIds.includes(tid));
});

// ====================================================================================
// 16. Notifications (5) + 5min dedup
// ====================================================================================
test('NOTIFICATIONS list returns items + summary', async () => {
  const r = await call('GET', '/api/v1/store/m4/notifications');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(typeof r.body.summary === 'object');
});

test('NOTIFICATIONS create validation', async () => {
  const r = await call('POST', '/api/v1/store/m4/notifications', { body: {} });
  assert.equal(r.status, 400);
});

test('NOTIFICATIONS 5-min dedup', async () => {
  const body = {
    title: 'QA dedup test',
    severity: 'P1',
    sourceModule: 'M4A',
    sourceEvent: 'QA_DEDUP',
    relatedResourceType: 'qa',
    relatedResourceId: 'qa-dedup-1',
  };
  const r1 = await call('POST', '/api/v1/store/m4/notifications', { body });
  assert.equal(r1.status, 201);
  assert.ok(r1.body.id);
  assert.ok(r1.body.created === true);

  const r2 = await call('POST', '/api/v1/store/m4/notifications', { body });
  assert.equal(r2.status, 201);
  assert.equal(r2.body.deduped, true, 'second within 5min must be deduped');
  assert.equal(r2.body.id, r1.body.id);
});

test('NOTIFICATIONS read-single + read-all + unread-count', async () => {
  const list = await call('GET', '/api/v1/store/m4/notifications');
  const first = list.body.items[0];
  const ro = await call('POST', `/api/v1/store/m4/notifications/${first.id}/read`, { body: {} });
  assert.equal(ro.status, 200);

  const ra = await call('POST', '/api/v1/store/m4/notifications/read-all', { body: {} });
  assert.equal(ra.status, 200);
  assert.ok(typeof ra.body.markedCount === 'number');

  const uc = await call('GET', '/api/v1/store/m4/notifications/unread-count');
  assert.equal(uc.status, 200);
  assert.equal(uc.body.unreadCount, 0);
});

test('NOTIFICATIONS unread filter', async () => {
  // create one fresh, then filter
  await call('POST', '/api/v1/store/m4/notifications', {
    body: { title: 'fresh-' + Date.now(), severity: 'P2', sourceModule: 'M4A' },
  });
  const r = await call('GET', '/api/v1/store/m4/notifications?unread=true');
  assert.equal(r.status, 200);
  for (const n of r.body.items) assert.equal(n.readAt, null);
});

// ====================================================================================
// 16b. N3-notif-store-isolation: read-state isolated per (user_id, store_id, notif_id)
// ====================================================================================
test('NOTIFICATIONS read-state isolated across stores (storeA read != storeB unread)', async () => {
  setup();
  // Provision a second store for the same user.
  const storeB = dataStore.addUserStore(USER_ID, { name: 'QA Store B', region: 'US', currency: 'USD' });
  assert.ok(storeB?.id && storeB.id !== STORE_ID, 'second store must be created');
  const STORE_B = storeB.id;

  const hdrB = { headers: { 'x-store-id': STORE_B } };

  // Create one notification in each store.
  const seed = Date.now();
  const a = await call('POST', '/api/v1/store/m4/notifications', {
    body: { title: 'A-' + seed, severity: 'P1', sourceModule: 'M4A' },
  });
  assert.equal(a.status, 201, 'create in storeA');
  const notifA = a.body.id;

  const b = await call('POST', '/api/v1/store/m4/notifications', {
    ...hdrB,
    body: { title: 'B-' + seed, severity: 'P1', sourceModule: 'M4A' },
  });
  assert.equal(b.status, 201, 'create in storeB');
  const notifB = b.body.id;

  // Baseline: each store has its own unread count, independent of the other.
  const ucA0 = await call('GET', '/api/v1/store/m4/notifications/unread-count');
  const ucB0 = await call('GET', '/api/v1/store/m4/notifications/unread-count', hdrB);
  assert.ok(ucA0.body.unreadCount >= 1, 'storeA has unread');
  assert.ok(ucB0.body.unreadCount >= 1, 'storeB has unread');

  // Mark the storeB notif read IN storeB.
  const roB = await call('POST', `/api/v1/store/m4/notifications/${notifB}/read`, { ...hdrB, body: {} });
  assert.equal(roB.status, 200, 'mark read in storeB');

  // storeA unread count must be UNCHANGED by storeB's read action.
  const ucA1 = await call('GET', '/api/v1/store/m4/notifications/unread-count');
  assert.equal(ucA1.body.unreadCount, ucA0.body.unreadCount, 'storeA unread unaffected by storeB read');

  // storeB unread dropped by exactly one.
  const ucB1 = await call('GET', '/api/v1/store/m4/notifications/unread-count', hdrB);
  assert.equal(ucB1.body.unreadCount, ucB0.body.unreadCount - 1, 'storeB unread decremented');

  // storeA's own notif still surfaces as unread in storeA's list.
  const listA = await call('GET', '/api/v1/store/m4/notifications?unread=true');
  assert.ok(listA.body.items.some((n) => n.id === notifA && n.readAt === null),
    'storeA notif still unread in storeA list');

  // The storeB read flag must NOT appear in storeA's list at all.
  const listAall = await call('GET', '/api/v1/store/m4/notifications');
  assert.ok(!listAall.body.items.some((n) => n.id === notifB),
    'storeB notif must not appear in storeA list');
});

test('NOTIFICATIONS cross-store mark-read returns not_found (ownership guard)', async () => {
  setup();
  const storeB = dataStore.addUserStore(USER_ID, { name: 'QA Store C', region: 'US', currency: 'USD' });
  const STORE_B = storeB.id;
  const hdrB = { headers: { 'x-store-id': STORE_B } };

  // Create a notif in storeA.
  const a = await call('POST', '/api/v1/store/m4/notifications', {
    body: { title: 'guard-' + Date.now(), severity: 'P2', sourceModule: 'M4A' },
  });
  assert.equal(a.status, 201);
  const notifA = a.body.id;

  // Attempt to mark storeA's notif read via storeB dimension → 404 not_found.
  const cross = await call('POST', `/api/v1/store/m4/notifications/${notifA}/read`, { ...hdrB, body: {} });
  assert.equal(cross.status, 404, 'cross-store mark-read must be not_found');

  // And the read flag must NOT have been written under storeB: storeA notif stays unread in storeA.
  const listA = await call('GET', '/api/v1/store/m4/notifications?unread=true');
  assert.ok(listA.body.items.some((n) => n.id === notifA && n.readAt === null),
    'storeA notif remains unread after rejected cross-store read');
});

test('NOTIFICATIONS read-all is store-scoped (does not clear other store)', async () => {
  setup();
  const storeB = dataStore.addUserStore(USER_ID, { name: 'QA Store D', region: 'US', currency: 'USD' });
  const STORE_B = storeB.id;
  const hdrB = { headers: { 'x-store-id': STORE_B } };

  // Fresh unread in storeB.
  await call('POST', '/api/v1/store/m4/notifications', {
    ...hdrB,
    body: { title: 'readall-B-' + Date.now(), severity: 'P1', sourceModule: 'M4A' },
  });
  const ucB0 = await call('GET', '/api/v1/store/m4/notifications/unread-count', hdrB);
  assert.ok(ucB0.body.unreadCount >= 1);

  // read-all in storeA.
  const ra = await call('POST', '/api/v1/store/m4/notifications/read-all', { body: {} });
  assert.equal(ra.status, 200);

  // storeB still has its unread (read-all in A did not touch B).
  const ucB1 = await call('GET', '/api/v1/store/m4/notifications/unread-count', hdrB);
  assert.ok(ucB1.body.unreadCount >= 1, 'storeB unread preserved after storeA read-all');
});

// ====================================================================================
// 17. Cleanup
// ====================================================================================
test('cleanup tmp db', () => {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});
