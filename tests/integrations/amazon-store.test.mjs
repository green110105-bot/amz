// Amazon 逐日快照落库 + 按区间聚合服务测试(无需领星, 纯本地 DB)。
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

// 直接插逐日行(模拟同步): C店 sid=13056 三天, B001 每天不同 volume/amount
function seedDay(sid, day, asin, volume, amount) {
  store.ensureAmazonSchema(db);
  const now = new Date().toISOString();
  const payload = JSON.stringify({ asins: [{ asin }], volume, amount: String(amount), spend: '0', avg_star: 4.2, item_name: 'X' });
  db.prepare(`INSERT OR REPLACE INTO amazon_perf_snapshot(sid,store_name,currency_code,start_date,end_date,asin,payload,synced_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(sid, 'C店-US', 'USD', day, day, asin, payload, now);
}

test('逐日落库 + hasSnapshot', () => {
  store.ensureAmazonSchema(db);
  assert.equal(store.hasSnapshot(db), false);
  seedDay('13056', '2026-06-22', 'B001', 107, 15888.90);
  seedDay('13056', '2026-06-23', 'B001', 254, 38673.11);
  seedDay('13056', '2026-06-24', 'B001', 79, 11916.49);
  assert.equal(store.hasSnapshot(db), true);
  const meta = store.readLatestSnapshotMeta(db);
  assert.equal(meta.latestDay, '2026-06-24');
});

test('withSnapshot 单日: 只算那一天(不再30天累计)', async () => {
  let served;
  const out = await store.withSnapshot(db, async ({ startDate, endDate }) => {
    assert.equal(startDate, '2026-06-24');
    assert.equal(endDate, '2026-06-24');
    served = await base.fetchProductPerformance({ sid: '13056' });
    return { ok: true };
  }, { startDate: '2026-06-24', endDate: '2026-06-24' });
  // 单日 06-24: volume=79(不是 107+254+79=440)
  assert.equal(served.length, 1);
  assert.equal(served[0].volume, 79);
  assert.equal(out.fromSnapshot, true);
  assert.deepEqual(out.snapshotRange, { startDate: '2026-06-24', endDate: '2026-06-24' });
});

test('withSnapshot 区间: 逐日相加得区间总值', async () => {
  let served;
  await store.withSnapshot(db, async () => { served = await base.fetchProductPerformance({ sid: '13056' }); return {}; },
    { startDate: '2026-06-22', endDate: '2026-06-24' });
  // 3天合计 volume = 107+254+79 = 440; amount = 15888.90+38673.11+11916.49 = 66478.50
  assert.equal(served.length, 1);
  assert.equal(served[0].volume, 440);
  assert.equal(Math.round(Number(served[0].amount) * 100) / 100, 66478.50);
  // 非数值字段(评分)取最新一天的值
  assert.equal(served[0].avg_star, 4.2);
});

test('withSnapshot 缺省区间 = 最新单日', async () => {
  let served;
  const out = await store.withSnapshot(db, async () => { served = await base.fetchProductPerformance({ sid: '13056' }); return {}; });
  // 缺省 -> 最新日 06-24 单日
  assert.equal(out.snapshotRange.endDate, '2026-06-24');
  assert.equal(served[0].volume, 79);
});

test('withSnapshot 无快照返回 null', async () => {
  const empty = new Database(join(mkdtempSync(join(tmpdir(), 'amz-empty-')), 'e.db'));
  const out = await store.withSnapshot(empty, async () => ({ ok: true }), { startDate: '2026-06-24', endDate: '2026-06-24' });
  assert.equal(out, null);
});

test('快照服务后清理: isSnapshotServing=false', () => {
  assert.equal(base.isSnapshotServing(), false);
});
