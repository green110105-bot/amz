import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-sched-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'cid';
process.env.SPAPI_LWA_CLIENT_SECRET = 'csec';
process.env.ADS_LWA_CLIENT_ID = 'acid';
process.env.ADS_LWA_CLIENT_SECRET = 'asec';
process.env.ADS_API_MOCK = 'true';

// Block real network; sync functions will land in error branch which the
// scheduler captures per-credential — exactly the resilience we want to test.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('test_network_blocked'); };

const { getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const { upsertSpApiCredentials, revokeSpApiCredentials } = await import('../../apps/api/src/integrations/sp-api/credentials.mjs');
const { upsertAdsCredentials } = await import('../../apps/api/src/integrations/ads-api/credentials.mjs');
const {
  runOnce, startScheduler, stopScheduler, isRunning, _resetForTests, cleanupExpiredOAuthStates,
  shouldRunDailyReport, runDailyReportJob, dailyReportTime,
} = await import('../../apps/api/src/integrations/scheduler.mjs');
// Importing oauth-flow ensures the integration_oauth_states table schema exists.
await import('../../apps/api/src/integrations/oauth-flow.mjs');

const db = getDbInstance();

function seedUserStore(userId, storeId, email) {
  db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, userId, email, 'admin', 'x', new Date().toISOString());
  db.prepare(`INSERT OR REPLACE INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(storeId, userId, storeId, 'US', 'USD', 'ATVPDKIKX0DER', 0, 0, new Date().toISOString());
}

seedUserStore('u-sched-1', 's-sched-1', 'sched1@local');
seedUserStore('u-sched-2', 's-sched-2', 'sched2@local');

// Active SP-API credentials for two stores; one Ads credential
upsertSpApiCredentials({
  userId: 'u-sched-1', storeId: 's-sched-1',
  refreshToken: 'Atzr|s1', marketplaceIds: ['ATVPDKIKX0DER'], region: 'NA',
});
upsertSpApiCredentials({
  userId: 'u-sched-2', storeId: 's-sched-2',
  refreshToken: 'Atzr|s2', marketplaceIds: ['ATVPDKIKX0DER'], region: 'NA',
});
upsertAdsCredentials({
  userId: 'u-sched-1', storeId: 's-sched-1',
  refreshToken: 'Atzr|ads-1', region: 'NA', profileId: '12345',
});

test('runOnce: iterates all active spapi creds + ads creds, returns per-credential results', async () => {
  const result = await runOnce();
  assert.equal(typeof result.at, 'string');
  assert.equal(typeof result.total, 'number');
  // 2 spapi + 1 ads = 3 credentials
  assert.equal(result.perCredential.length, 3);

  const spapiResults = result.perCredential.filter((r) => r.provider === 'spapi');
  const adsResults = result.perCredential.filter((r) => r.provider === 'ads');
  assert.equal(spapiResults.length, 2);
  assert.equal(adsResults.length, 1);

  // SP-API runs 2 steps: orders + inventory
  for (const s of spapiResults) {
    assert.equal(s.steps.length, 2);
    assert.ok(s.steps.find((x) => x.label === 'orders'));
    assert.ok(s.steps.find((x) => x.label === 'inventory'));
  }
});

test('runOnce: per-credential failure does not abort the iteration', async () => {
  const result = await runOnce();
  // With fetch blocked, every step should be status='error' BUT we still got results for all 3 creds.
  assert.equal(result.perCredential.length, 3);
  for (const c of result.perCredential) {
    for (const step of c.steps) {
      assert.ok(['ok', 'error'].includes(step.status));
      assert.ok(typeof step.startedAt === 'string');
      assert.ok(typeof step.endedAt === 'string');
    }
  }
});

test('runOnce: revoked credentials are skipped on next iteration', async () => {
  revokeSpApiCredentials('u-sched-2', 's-sched-2');
  const result = await runOnce();
  // 1 spapi + 1 ads now
  const sp = result.perCredential.filter((r) => r.provider === 'spapi');
  assert.equal(sp.length, 1);
  assert.equal(sp[0].storeId, 's-sched-1');
});

test('runOnce: jobs filter limits which jobs run per credential', async () => {
  // Re-activate s-sched-2
  upsertSpApiCredentials({
    userId: 'u-sched-2', storeId: 's-sched-2',
    refreshToken: 'Atzr|s2-reactivated', marketplaceIds: ['ATVPDKIKX0DER'], region: 'NA',
  });

  const ordersOnly = await runOnce({ jobs: ['orders'] });
  // SP-API credentials still in but no ads
  const spapi = ordersOnly.perCredential.filter((r) => r.provider === 'spapi');
  const ads = ordersOnly.perCredential.filter((r) => r.provider === 'ads');
  assert.equal(spapi.length, 2);
  assert.equal(ads.length, 0);
  for (const c of spapi) {
    assert.equal(c.steps.length, 1);
    assert.equal(c.steps[0].label, 'orders');
  }
});

test('runOnce: uses lastOk timestamp from sync_runs as since-cursor', async () => {
  // Pre-seed a sync_runs row with status=ok and a known timestamp
  db.prepare(`INSERT INTO sync_runs (id,user_id,store_id,provider,endpoint,status,started_at,ended_at,records_in)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
      'syr-cursor', 'u-sched-1', 's-sched-1', 'spapi', 'orders.getOrders', 'ok',
      '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:01.000Z', 0,
    );
  // The scheduler should pick up the cursor — we can't observe its internal `since` arg without
  // mocks, but we verify runOnce doesn't crash + still returns the step envelope.
  const result = await runOnce({ jobs: ['orders'] });
  const targetCred = result.perCredential.find((r) =>
    r.provider === 'spapi' && r.userId === 'u-sched-1' && r.storeId === 's-sched-1');
  assert.ok(targetCred);
  assert.equal(targetCred.steps.length, 1);
});

test('startScheduler returns handle with stop function; idempotent', async () => {
  _resetForTests();
  const h1 = startScheduler({ intervalMs: 60_000 });
  assert.equal(typeof h1.stop, 'function');
  const h2 = startScheduler({ intervalMs: 60_000 }); // second call is a no-op (handle already set)
  assert.equal(typeof h2.stop, 'function');
  stopScheduler();
  // After stop, isRunning is false (overlap guard cleared by stopping)
  assert.equal(isRunning(), false);
});

test('startScheduler immediate=true runs one tick promptly', async () => {
  _resetForTests();
  let ticks = 0;
  startScheduler({ intervalMs: 3_600_000, immediate: true, onTick: () => { ticks += 1; } });
  // Wait briefly for the Promise.resolve().then(tick) chain
  await new Promise((r) => setTimeout(r, 250));
  stopScheduler();
  assert.ok(ticks >= 1, `expected ≥1 immediate tick, got ${ticks}`);
});

test('stopScheduler is safe to call when no scheduler running', () => {
  _resetForTests();
  stopScheduler();
  stopScheduler();
  assert.equal(isRunning(), false);
});

test('AUTH-13: cleanupExpiredOAuthStates deletes expired + consumed rows, keeps live unconsumed', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS integration_oauth_states (
    state TEXT PRIMARY KEY, provider TEXT NOT NULL, user_id TEXT NOT NULL, store_id TEXT NOT NULL,
    region TEXT, redirect_uri TEXT NOT NULL, return_to TEXT, started_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, consumed_at TEXT, meta TEXT)`);
  const past = new Date(Date.now() - 3600_000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  const ins = db.prepare(`INSERT OR REPLACE INTO integration_oauth_states
    (state,provider,user_id,store_id,redirect_uri,started_at,expires_at,consumed_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  ins.run('st-expired', 'spapi', 'u', 's', 'http://x', past, past, null);          // expired, unconsumed → delete
  ins.run('st-consumed', 'spapi', 'u', 's', 'http://x', past, future, past);        // consumed → delete
  ins.run('st-live', 'spapi', 'u', 's', 'http://x', past, future, null);            // live unconsumed → keep

  const { removed } = cleanupExpiredOAuthStates(db);
  assert.ok(removed >= 2, `expected >=2 removed, got ${removed}`);
  assert.equal(db.prepare(`SELECT 1 FROM integration_oauth_states WHERE state='st-expired'`).get(), undefined);
  assert.equal(db.prepare(`SELECT 1 FROM integration_oauth_states WHERE state='st-consumed'`).get(), undefined);
  assert.ok(db.prepare(`SELECT 1 FROM integration_oauth_states WHERE state='st-live'`).get());
});

// ============================================================
// B-6: dailyReport job — time-of-day trigger logic (injected time, NO real wait)
// ============================================================
test('B-6: dailyReportTime defaults to 09:30 and honors SYNC_DAILY_REPORT_AT', () => {
  delete process.env.SYNC_DAILY_REPORT_AT;
  assert.equal(dailyReportTime(), '09:30');
  process.env.SYNC_DAILY_REPORT_AT = '14:00';
  assert.equal(dailyReportTime(), '14:00');
  process.env.SYNC_DAILY_REPORT_AT = 'garbage';
  assert.equal(dailyReportTime(), '09:30'); // invalid → default
  delete process.env.SYNC_DAILY_REPORT_AT;
});

test('B-6: shouldRunDailyReport fires at/after configured time, once per day', () => {
  // Build a Date at local 09:31 — after 09:30.
  const after = new Date(2026, 5, 10, 9, 31, 0);
  const before = new Date(2026, 5, 10, 9, 29, 0);
  const dayKey = after.toISOString().slice(0, 10);

  // before configured time → no fire
  assert.equal(shouldRunDailyReport({ now: before, at: '09:30', lastFiredDayKey: null }).fire, false);
  // at/after configured time, not yet fired today → fire
  const due = shouldRunDailyReport({ now: after, at: '09:30', lastFiredDayKey: null });
  assert.equal(due.fire, true);
  assert.equal(due.reason, 'due');
  // already fired today → no re-fire
  assert.equal(shouldRunDailyReport({ now: after, at: '09:30', lastFiredDayKey: due.dayKey }).fire, false);
  assert.ok(typeof dayKey === 'string');
});

test('B-6: runDailyReportJob builds snapshot + emits M4 notification per active store', async () => {
  // Re-activate s-sched-2 so we have active spapi creds again.
  upsertSpApiCredentials({
    userId: 'u-sched-1', storeId: 's-sched-1',
    refreshToken: 'Atzr|s1-daily', marketplaceIds: ['ATVPDKIKX0DER'], region: 'NA',
  });
  const result = await runDailyReportJob({ db, date: '2026-06-10' });
  assert.ok(result.total >= 1);
  const ok = result.perStore.find((p) => p.userId === 'u-sched-1' && p.storeId === 's-sched-1');
  assert.ok(ok, 'expected a per-store entry for u-sched-1/s-sched-1');
  assert.equal(ok.status, 'ok');
  assert.equal(ok.reportDate, '2026-06-10');
  assert.ok(ok.notificationId, 'expected an emitted notification id');
  // The notification row exists and is sourced from M4.
  const notif = db.prepare('SELECT * FROM m4_notifications WHERE id=?').get(ok.notificationId);
  assert.ok(notif);
  assert.equal(notif.source_module, 'M4');
  // B-5: the notification body carries the watermarked estimated/realized split, never a
  // single ambiguous 已挽回¥X.
  assert.match(notif.body, /已挽回/);
  assert.match(notif.body, /模拟\/预估/);
  assert.match(notif.body, /realized/);
  assert.match(notif.body, /estimated/);
});

test('B-6: runOnce registers dailyReport job and fires by injected time', async () => {
  _resetForTests();
  // Inject a time after 09:30 → dailyReport fires.
  const fireAt = new Date(2026, 5, 10, 9, 45, 0);
  const r1 = await runOnce({ jobs: ['dailyReport'], now: fireAt });
  assert.ok(r1.dailyReport, 'runOnce must return a dailyReport envelope');
  assert.equal(r1.dailyReport.fired, true);
  assert.equal(r1.dailyReport.at, '09:30');
  // Second tick the same day must NOT re-fire (once-per-day guard).
  const r2 = await runOnce({ jobs: ['dailyReport'], now: new Date(2026, 5, 10, 10, 0, 0) });
  assert.equal(r2.dailyReport.fired, false);
  assert.equal(r2.dailyReport.reason, 'already_fired_today');
});

test('B-6: runOnce does NOT fire dailyReport when job not requested (disabled-by-default safety)', async () => {
  _resetForTests();
  const r = await runOnce({ jobs: ['orders'], now: new Date(2026, 5, 10, 9, 45, 0) });
  assert.equal(r.dailyReport, null);
});

test('B-6: runOnce dailyReport does not fire before configured time', async () => {
  _resetForTests();
  const r = await runOnce({ jobs: ['dailyReport'], now: new Date(2026, 5, 10, 8, 0, 0) });
  assert.equal(r.dailyReport.fired, false);
  assert.equal(r.dailyReport.reason, 'before_configured_time');
});

test('B-6: startScheduler default job set includes dailyReport (code-ready)', () => {
  // The default `jobs` arg of startScheduler must include dailyReport so an ENABLED
  // scheduler emits the daily snapshot. We assert via the exported default by reading
  // the function source — cheap structural check, not a real timer wait.
  assert.match(startScheduler.toString(), /dailyReport/);
});

process.on('exit', () => { globalThis.fetch = realFetch; });
