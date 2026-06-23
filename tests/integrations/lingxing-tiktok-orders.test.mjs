// TikTok 真实销售(订单明细过滤)测试。
// 验证: isSampleOrder 识别 4-79 样品订单; mock 区间结构; 字段契约。
import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.LINGXING_APP_ID;
delete process.env.LINGXING_APP_SECRET;

const orders = await import('../../apps/api/src/integrations/lingxing/tiktok-orders.mjs');

test('isSampleOrder: order_tag 含 tag_no=4-79 判为样品订单', () => {
  assert.equal(orders.isSampleOrder({ order_tag: [{ tag_no: '4-79', tag_name: '样品订单' }] }), true);
  assert.equal(orders.isSampleOrder({ order_tag: [{ tag_no: '4-3', tag_name: '拆分订单' }] }), false);
  assert.equal(orders.isSampleOrder({ order_tag: null }), false);
  assert.equal(orders.isSampleOrder({}), false);
});

test('mockTikTokRealSalesRange: 逐日结构 + sampleOrders 字段齐全', () => {
  const r = orders.mockTikTokRealSalesRange({ startDate: '2026-06-20', endDate: '2026-06-22' });
  assert.equal(r.basis, 'order_detail_filtered');
  assert.equal(r.sourceMeta.mock, true);
  for (const k of ['startDate', 'endDate', 'dayCount', 'rangeRevenue', 'rangeVolume', 'rangeSampleOrders', 'days']) {
    assert.ok(k in r, `缺字段 ${k}`);
  }
  assert.equal(r.dayCount, 3);
  for (const d of r.days) {
    for (const k of ['date', 'storeCount', 'totalRevenue', 'totalVolume', 'sampleOrders', 'stores']) assert.ok(k in d, `天缺 ${k}`);
    for (const s of d.stores) for (const k of ['storeId', 'storeName', 'revenue', 'volume', 'sampleOrders']) assert.ok(k in s, `店缺 ${k}`);
  }
  // 区间总量 = 各天之和
  assert.equal(r.rangeVolume, r.days.reduce((a, d) => a + d.totalVolume, 0));
  assert.equal(r.rangeSampleOrders, r.days.reduce((a, d) => a + d.sampleOrders, 0));
});

test('无凭证: getTikTokRealSalesDashboard 返回 mock 真实销售看板', async () => {
  const r = await orders.getTikTokRealSalesDashboard(null, 'u', 's', { startDate: '2026-06-20', endDate: '2026-06-22' });
  assert.equal(r.sourceMeta.mock, true);
  assert.equal(r.basis, 'order_detail_filtered');
});
