// TikTok 日报看板契约测试 (mock 路径 — 测试环境无领星凭证)。
// 验证: 看板契约字段齐全 + 无凭证时诚实标 mock + 落库/读取一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

process.env.DATA_DB_PATH = join(mkdtempSync(join(tmpdir(), 'amz-tiktok-')), 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
// 确保测试环境无领星凭证 -> mock 分支
delete process.env.LINGXING_APP_ID;
delete process.env.LINGXING_APP_SECRET;

const sync = await import('../../apps/api/src/integrations/lingxing/tiktok-sync.mjs');
const { getDbInstance } = await import('../../apps/api/src/data-store.mjs');

test('无凭证: getTikTokDashboard 返回 mock 看板, sourceMeta.mock===true', async () => {
  const db = getDbInstance();
  const d = await sync.getTikTokDashboard(db, 'u-x', 's-x', { date: '2026-04-09' });
  assert.equal(d.sourceMeta.mock, true);
  assert.equal(d.sourceMeta.reason, 'lingxing_credentials_missing');
  assert.equal(d.sourceMeta.platform, 'TikTok');
});

test('看板契约: 必备字段齐全 + 分店铺结构', async () => {
  const db = getDbInstance();
  const d = await sync.getTikTokDashboard(db, 'u-x', 's-x', { date: '2026-04-09' });
  for (const k of ['date', 'timezone', 'currency', 'storeCount', 'totalRevenue', 'totalVolume', 'stores', 'sourceMeta']) {
    assert.ok(k in d, `缺字段 ${k}`);
  }
  assert.equal(d.timezone, 'America/Los_Angeles');
  assert.ok(Array.isArray(d.stores));
  for (const s of d.stores) {
    for (const k of ['storeId', 'storeName', 'revenue', 'volume']) assert.ok(k in s, `店铺缺字段 ${k}`);
  }
  // 全站汇总 = 分店铺之和
  const sumRev = Math.round(d.stores.reduce((a, s) => a + s.revenue, 0) * 100) / 100;
  const sumVol = d.stores.reduce((a, s) => a + s.volume, 0);
  assert.equal(d.totalRevenue, sumRev);
  assert.equal(d.totalVolume, sumVol);
  assert.equal(d.storeCount, d.stores.length);
});

test('落库/读取一致: saveTikTokDaily -> getStoredTikTokDaily', () => {
  const db = getDbInstance();
  const daily = sync.mockTikTokDaily({ date: '2026-05-01' });
  sync.saveTikTokDaily(db, 'u-y', 's-y', daily);
  const back = sync.getStoredTikTokDaily(db, 'u-y', 's-y', '2026-05-01');
  assert.equal(back.date, '2026-05-01');
  assert.equal(back.totalVolume, daily.totalVolume);
  // 幂等: 再存一次不报错, 仍只一行
  sync.saveTikTokDaily(db, 'u-y', 's-y', daily);
  const n = db.prepare("SELECT COUNT(*) c FROM tiktok_daily WHERE user_id='u-y' AND store_id='s-y' AND report_date='2026-05-01'").get().c;
  assert.equal(n, 1);
});

test('4 个 TikTok 店铺常量正确', () => {
  assert.equal(sync.TIKTOK_STORES.length, 4);
  const names = sync.TIKTOK_STORES.map((s) => s.storeName);
  assert.ok(names.includes('TK Slushie 1'));
  assert.ok(names.includes('NSY ProTool Hub'));
});

test('区间看板: 无凭证返回 mock 逐日结构, 每天含 stores', async () => {
  const db = getDbInstance();
  const r = await sync.getTikTokRangeDashboard(db, 'u-r', 's-r', { startDate: '2026-06-16', endDate: '2026-06-22' });
  assert.equal(r.sourceMeta.mock, true);
  // 区间契约字段
  for (const k of ['startDate', 'endDate', 'timezone', 'currency', 'dayCount', 'rangeRevenue', 'rangeVolume', 'days', 'sourceMeta']) {
    assert.ok(k in r, `缺字段 ${k}`);
  }
  assert.equal(r.dayCount, 7); // 06-16 ~ 06-22 含端点 = 7 天
  assert.equal(r.days.length, 7);
  // 最新日期在前
  assert.equal(r.days[0].date, '2026-06-22');
  assert.equal(r.days[6].date, '2026-06-16');
  for (const d of r.days) {
    for (const k of ['date', 'storeCount', 'totalRevenue', 'totalVolume', 'stores']) assert.ok(k in d, `天缺字段 ${k}`);
    // 当天汇总 = 当天各店之和
    const sumV = d.stores.reduce((a, s) => a + s.volume, 0);
    assert.equal(d.totalVolume, sumV);
  }
  // 区间总量 = 各天之和
  const totalV = r.days.reduce((a, d) => a + d.totalVolume, 0);
  assert.equal(r.rangeVolume, totalV);
});

test('区间看板: start>end 自动 clamp, 不报错', async () => {
  const db = getDbInstance();
  const r = await sync.getTikTokRangeDashboard(db, 'u-r2', 's-r2', { startDate: '2026-06-22', endDate: '2026-06-16' });
  assert.ok(r.dayCount >= 1);
  assert.ok(Array.isArray(r.days));
});

test('aggregateByDay/fetchTikTokRange: date_collect 逐日解析正确 (mockTikTokRange 自洽)', () => {
  const r = sync.mockTikTokRange({ startDate: '2026-06-20', endDate: '2026-06-22' });
  assert.equal(r.days.length, 3);
  // 每天 stores 非空且 revenue/volume 为正
  for (const d of r.days) {
    assert.ok(d.stores.length > 0);
    for (const s of d.stores) { assert.ok(s.volume > 0); assert.ok(s.revenue > 0); }
  }
});
