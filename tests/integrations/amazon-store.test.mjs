// Amazon 快照落库 + 快照服务模式测试(无需领星, 纯本地 DB)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const dbPath = join(mkdtempSync(join(tmpdir(), 'amz-snap-')), 'snap.db');
const db = new Database(dbPath);

const store = await import('../../apps/api/src/integrations/lingxing/amazon-store.mjs');
const base = await import('../../apps/api/src/integrations/lingxing/amazon.mjs');

test('ensureAmazonSchema 建表 + hasSnapshot 初始为空', () => {
  store.ensureAmazonSchema(db);
  assert.equal(store.hasSnapshot(db), false);
  assert.equal(store.getLastSyncAt(db), null);
});

test('saveStoreRows 落库原始行 + readLatestSnapshot 按 sid 分组', () => {
  store.ensureAmazonSchema(db);
  // 模拟领星原始 API 行(asins[0].asin)
  const rawRows = [
    { asins: [{ asin: 'B001' }], volume: 10, amount: '100.00' },
    { asins: [{ asin: 'B002' }], volume: 5, amount: '50.00' },
  ];
  // 直接调内部 save 经 syncAmazonSnapshots 不便(要领星); 用 DB upsert via ensure + 手工插
  const up = db.prepare(`INSERT INTO amazon_perf_snapshot(sid,store_name,currency_code,start_date,end_date,asin,payload,synced_at) VALUES (?,?,?,?,?,?,?,?)`);
  const now = new Date().toISOString();
  up.run('17512', 'F店-US', 'USD', '2026-05-25', '2026-06-23', 'B001', JSON.stringify(rawRows[0]), now);
  up.run('17512', 'F店-US', 'USD', '2026-05-25', '2026-06-23', 'B002', JSON.stringify(rawRows[1]), now);
  up.run('13056', 'C店-US', 'USD', '2026-05-25', '2026-06-23', 'B003', JSON.stringify({ asins: [{ asin: 'B003' }], volume: 3, amount: '30.00' }), now);

  assert.equal(store.hasSnapshot(db), true);
  const snap = store.readLatestSnapshot(db);
  assert.equal(snap.startDate, '2026-05-25');
  assert.equal(snap.endDate, '2026-06-23');
  assert.equal(snap.bySid['17512'].length, 2);
  assert.equal(snap.bySid['13056'].length, 1);
  assert.equal(snap.bySid['17512'][0].asins[0].asin, 'B001');
});

test('快照服务模式: setSnapshotServer 后 fetchProductPerformance 返回快照行不打网络', async () => {
  const snap = store.readLatestSnapshot(db);
  base.setSnapshotServer(snap.bySid);
  try {
    const rows = await base.fetchProductPerformance({ sid: '17512', startDate: 'x', endDate: 'y' });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].asins[0].asin, 'B001');
    // 未知 sid 返回空数组(不报错)
    const none = await base.fetchProductPerformance({ sid: '99999', startDate: 'x', endDate: 'y' });
    assert.deepEqual(none, []);
  } finally {
    base.clearSnapshotServer();
  }
  assert.equal(base.isSnapshotServing(), false);
});

test('withSnapshot: 喂 builder + 自动附 fromSnapshot/syncedAt', async () => {
  const out = await store.withSnapshot(db, async ({ startDate, endDate }) => {
    // builder 收到快照区间
    assert.equal(startDate, '2026-05-25');
    assert.equal(endDate, '2026-06-23');
    // builder 内部可调 fetchProductPerformance 拿快照行
    const rows = await base.fetchProductPerformance({ sid: '13056' });
    return { ok: true, rowCount: rows.length };
  });
  assert.equal(out.ok, true);
  assert.equal(out.rowCount, 1);
  assert.equal(out.fromSnapshot, true);
  assert.ok(out.snapshotSyncedAt);
  assert.deepEqual(out.snapshotRange, { startDate: '2026-05-25', endDate: '2026-06-23' });
});

test('withSnapshot 无快照返回 null(调用方回退实时)', async () => {
  const empty = new Database(join(mkdtempSync(join(tmpdir(), 'amz-empty-')), 'e.db'));
  const out = await store.withSnapshot(empty, async () => ({ ok: true }));
  assert.equal(out, null);
});
