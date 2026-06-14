// tests/integrations/n8-b6-daily-cron-b5.test.mjs
// Batch N8-b6-daily-cron + B5.
//   B-6: scheduler dailyReport job (time-of-day trigger, snapshot + M4 notification) +
//        front-end M4DailyReport time-selector enabled with '每日 {time} 自动生成(需开启调度)'.
//   B-5: daily-report '已挽回' must be split estimated vs realized double-fields with a
//        '模拟/预估' watermark — never collapsed into a single ambiguous 已挽回¥X, and
//        never presented as realized cash 对外.
//
// Setup mirrors tests/qa/m4-functional.test.mjs: temp db, enc key, ads mock, network
// blocked, registerUser/authenticate, handleMonitorRequest black-box.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const TMP_DIR = mkdtempSync(join(tmpdir(), 'n8-b6-'));
process.env.DATA_DB_PATH = join(TMP_DIR, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.ADS_API_MOCK = 'true';

globalThis.fetch = async () => { throw new Error('network blocked in test'); };

const { handleMonitorRequest, buildDailyReport } = await import('../../apps/api/src/store-routes-monitor.mjs');
const { authenticate, registerUser, getDbInstance, defaultStoreIdFor } = await import('../../apps/api/src/data-store.mjs');

const BASE = 'http://localhost';
let TOKEN = null, STORE_ID = null, USER_ID = null;

function setup() {
  if (TOKEN) return;
  const email = `n8b6-${Date.now()}@example.com`;
  const reg = registerUser({ email, password: 'pass1234', name: 'N8 B6', role: 'operator' });
  assert.ok(reg.user, 'registerUser must succeed: ' + JSON.stringify(reg));
  USER_ID = reg.user.id;
  TOKEN = authenticate(email, 'pass1234').token;
  STORE_ID = defaultStoreIdFor(USER_ID);
  assert.ok(TOKEN && STORE_ID);
}

async function call(method, path, { noAuth, noStore, storeId } = {}) {
  setup();
  const h = {
    'content-type': 'application/json',
    ...(noAuth ? {} : { authorization: 'Bearer ' + TOKEN }),
    ...(noStore ? {} : { 'x-store-id': storeId || STORE_ID }),
  };
  const req = new Request(BASE + path, { method, headers: h });
  const res = await handleMonitorRequest(req);
  assert.ok(res, 'handler returned null for ' + method + ' ' + path);
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

// ============================================================
// B-5: estimated vs realized recovered + watermark (route contract)
// ============================================================
test('B-5: daily report summary.recovered has estimated + realized double fields', async () => {
  const { status, json } = await call('GET', '/api/v1/store/m4/reports/daily');
  assert.equal(status, 200);
  const rec = json?.summary?.recovered;
  assert.ok(rec, 'summary.recovered must exist');
  // double fields — never a single collapsed amount.
  assert.equal(typeof rec.estimated, 'number');
  assert.equal(typeof rec.realized, 'number');
  assert.equal(typeof rec.estimatedCount, 'number');
  assert.equal(typeof rec.realizedCount, 'number');
});

test('B-5: recovered carries 模拟/预估 watermark + simulated provenance (对外不混淆)', async () => {
  const { json } = await call('GET', '/api/v1/store/m4/reports/daily');
  const rec = json.summary.recovered;
  assert.equal(rec.simulated, true, 'recovered must be flagged simulated');
  assert.equal(rec.mock, true);
  assert.equal(rec.watermark, '模拟/预估');
  assert.match(rec.disclaimer || '', /模拟\/预估/);
  // sourceMeta dimension for recovered is mock (never real Amazon cash).
  assert.ok(json.sourceMeta?.recovered, 'sourceMeta.recovered must exist');
  assert.equal(json.sourceMeta.recovered.mock, true);
});

test('B-5: realized vs estimated computed from recovery table (review_updated => realized)', async () => {
  setup();
  const db = getDbInstance();
  const before = buildDailyReport(db, USER_ID, STORE_ID, { storeIds: STORE_ID }).summary.recovered;
  const now = new Date().toISOString();
  // add one realized (review_updated) + one in-flight (marked_sent) recovery row and assert
  // the realized count tracks the realized insert and the estimated count tracks in-flight.
  db.prepare(`INSERT INTO m4_recovery_emails(id,user_id,store_id,review_id,subject,body,status,created_at,round_no)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('rec-realized-x', USER_ID, STORE_ID, 'rv1', 's', 'b', 'review_updated', now, 1);
  db.prepare(`INSERT INTO m4_recovery_emails(id,user_id,store_id,review_id,subject,body,status,created_at,round_no)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('rec-inflight-x', USER_ID, STORE_ID, 'rv2', 's', 'b', 'marked_sent', now, 1);

  const rec = buildDailyReport(db, USER_ID, STORE_ID, { storeIds: STORE_ID }).summary.recovered;
  // realized count went up by exactly the realized insert; estimated up by the in-flight insert.
  assert.equal(rec.realizedCount, before.realizedCount + 1);
  assert.equal(rec.estimatedCount, before.estimatedCount + 1);
  assert.ok(rec.realized > 0);
  assert.ok(rec.estimated > 0);
  // realized and estimated are independent fields (the review_updated row is NOT in estimated).
  assert.ok(rec.estimated !== rec.realized || rec.estimatedCount !== rec.realizedCount);
});

test('B-5/sec: cross-tenant store-id on daily report is rejected 403 (ownership preserved)', async () => {
  const { status } = await call('GET', '/api/v1/store/m4/reports/daily', { storeId: 'store-of-another-tenant' });
  assert.equal(status, 403);
});

test('B-5/sec: unauthenticated daily report is rejected 401', async () => {
  const { status } = await call('GET', '/api/v1/store/m4/reports/daily', { noAuth: true });
  assert.equal(status, 401);
});

// ============================================================
// B-6 / B-5: front-end M4DailyReport.vue copy + watermark (source contract)
// ============================================================
test('B-6: M4DailyReport time selector enabled + 每日 {time} 自动生成(需开启调度) copy', () => {
  const src = readFileSync(new URL('../../apps/web-v2/src/pages/M4DailyReport.vue', import.meta.url), 'utf8');
  // time selector is explicitly enabled (no greyed-out :disabled="true").
  assert.match(src, /data-test="schedule-time-select"/);
  assert.match(src, /:disabled="false"/);
  // scheduled-push copy is the new wording, not '定时推送规划中'.
  assert.doesNotMatch(src, /定时推送规划中/);
  assert.match(src, /每日 \$\{fixedTime\.value\} 自动生成（需开启调度）/);
  assert.match(src, /data-test="schedule-push-hint"/);
});

test('B-5: M4DailyReport surfaces estimated vs realized recovered + 模拟/预估 watermark', () => {
  const src = readFileSync(new URL('../../apps/web-v2/src/pages/M4DailyReport.vue', import.meta.url), 'utf8');
  assert.match(src, /data-test="recovered-card"/);
  assert.match(src, /data-test="recovered-watermark"/);
  assert.match(src, /data-test="recovered-realized"/);
  assert.match(src, /data-test="recovered-estimated"/);
  // watermark text present.
  assert.match(src, /模拟\/预估/);
  // realized and estimated are both rendered (double field, never single collapsed).
  assert.match(src, /recovered\.realized/);
  assert.match(src, /recovered\.estimated/);
});
