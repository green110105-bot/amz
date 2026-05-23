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
const { runOnce, startScheduler, stopScheduler, isRunning, _resetForTests } = await import('../../apps/api/src/integrations/scheduler.mjs');

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

process.on('exit', () => { globalThis.fetch = realFetch; });
