// Amazon 真实利润看板测试。
// 验证: resolveDateRange / rowRisks / deriveProfitInsights 纯函数; mock 兜底契约 + sourceMeta.mock;
//        getAmazonProfitDashboard 无凭证返回 mock; 币种分组不直接相加; 派生排行正确。
// 不真连领星(本地连不上); fixture 用真实 mapPerformanceRow 输出形状(已带 sid/storeName)。
import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.LINGXING_APP_ID;
delete process.env.LINGXING_APP_SECRET;

const mod = await import('../../apps/api/src/integrations/lingxing/amazon-profit.mjs');

// 真实字段结构的 asin 行 fixture(对齐 mapPerformanceRow 透出 + sid/storeName)
function asin(over = {}) {
  return {
    sid: 's1', storeName: '店A', asin: 'B0X', itemName: 'item', currencyCode: 'USD',
    amount: 1000, netAmount: 920, grossProfit: 200, grossMargin: 0.2, roi: 2.0,
    acos: 0.1, tacos: 0.1, adSpend: 100, adSalesAmount: 1000, adShare: 1.0,
    volume: 30, sessions: 300, cvr: 0.1, returnRate: 0.02,
    availableInventory: 100, availableDays: 40, cateRank: 1000, amountChainRatio: 0.05,
    ...over,
  };
}

test('resolveDateRange: 区间换算 7d/30d/90d 含今天往前推 N-1 天', () => {
  const r = mod.resolveDateRange('30d', new Date('2026-06-24T00:00:00Z'));
  assert.equal(r.endDate, '2026-06-24');
  assert.equal(r.startDate, '2026-05-26');
  assert.equal(r.days, 30);
  assert.equal(mod.resolveDateRange('7d', new Date('2026-06-24T00:00:00Z')).startDate, '2026-06-18');
  // 非法 range 回落 30d
  assert.equal(mod.resolveDateRange('xx', new Date('2026-06-24T00:00:00Z')).days, 30);
});

test('rowRisks: 亏损 / 广告吞利 / 高TACOS 标签', () => {
  // 健康行无风险
  assert.deepEqual(mod.rowRisks(asin()), []);
  // 亏损: grossProfit<0
  assert.ok(mod.rowRisks(asin({ grossProfit: -50 })).includes('loss'));
  // 广告吞利: acos>grossMargin
  assert.ok(mod.rowRisks(asin({ acos: 0.4, grossMargin: 0.2 })).includes('ad_eats_profit'));
  // 广告吞利: adSpend>grossProfit
  assert.ok(mod.rowRisks(asin({ adSpend: 500, grossProfit: 100 })).includes('ad_eats_profit'));
  // 高 TACOS: tacos>0.30
  assert.ok(mod.rowRisks(asin({ tacos: 0.45 })).includes('high_tacos'));
  // 阈值可调
  assert.ok(mod.rowRisks(asin({ tacos: 0.2 }), { lossMargin: 0, highTacos: 0.1 }).includes('high_tacos'));
});

test('deriveProfitInsights: 利润排行 + 亏损/吞利/高TACOS 清单', () => {
  const rows = [
    asin({ asin: 'A', grossProfit: 500 }),
    asin({ asin: 'B', grossProfit: -100, grossMargin: -0.1 }),
    asin({ asin: 'C', grossProfit: 50, acos: 0.5, grossMargin: 0.05 }),
    asin({ asin: 'D', grossProfit: 200, tacos: 0.5 }),
  ];
  const ins = mod.deriveProfitInsights(rows);
  assert.equal(ins.topProfit[0].asin, 'A');        // 毛利最高
  assert.equal(ins.topDrag[0].asin, 'B');          // 毛利最低(亏损)
  assert.ok(ins.lossAsins.some((r) => r.asin === 'B'));
  assert.ok(ins.adEatsProfit.some((r) => r.asin === 'C'));
  assert.ok(ins.highTacos.some((r) => r.asin === 'D'));
  // 每行带 risks 数组
  assert.ok(Array.isArray(ins.topProfit[0].risks));
});

test('mockAmazonProfit: 契约字段齐全 + sourceMeta.mock:true + 币种分组', () => {
  const r = mod.mockAmazonProfit({ range: '30d' });
  for (const k of ['range', 'startDate', 'endDate', 'generatedAt', 'currencyBreakdown',
    'summary', 'stores', 'asins', 'insights', 'thresholds', 'partial', 'errors', 'sourceMeta']) {
    assert.ok(k in r, `缺顶层字段 ${k}`);
  }
  assert.equal(r.sourceMeta.mock, true);
  assert.equal(r.sourceMeta.platform, 'Amazon');
  assert.ok(r.sourceMeta.reason, 'mock 必须带 reason');
  // 多币种: USD + EUR 至少两组, 不直接相加
  assert.ok(r.currencyBreakdown.length >= 2);
  const codes = r.currencyBreakdown.map((c) => c.currencyCode);
  assert.ok(codes.includes('USD') && codes.includes('EUR'));
  // 主币种为销售额最大组
  assert.equal(r.summary.currencyCode, r.currencyBreakdown[0].currencyCode);
  // 店铺排行不带 asins 明细(已剥离)
  assert.ok(!('asins' in r.stores[0]));
  // 每个店铺有 health + 重算比率
  for (const s of r.stores) {
    for (const k of ['grossMargin', 'acos', 'tacos', 'roi', 'health']) assert.ok(k in s, `店缺 ${k}`);
    assert.ok(['healthy', 'watch', 'loss'].includes(s.health));
  }
  // ASIN 行带 sid/storeName/risks
  for (const a of r.asins) {
    for (const k of ['sid', 'storeName', 'asin', 'risks']) assert.ok(k in a, `asin 缺 ${k}`);
  }
  // 存在亏损样例(覆盖前端风险清单)
  assert.ok(r.summary.lossAsinCount > 0);
});

test('mockAmazonProfit: 店铺级毛利率由汇总额重算(grossProfit/amount)', () => {
  const r = mod.mockAmazonProfit({ range: '30d' });
  const s = r.stores[0];
  const expected = Math.round((s.grossProfit / s.amount) * 10000) / 10000;
  assert.equal(s.grossMargin, expected);
});

test('mockAmazonProfit: sid 过滤只返回单店', () => {
  const r = mod.mockAmazonProfit({ range: '7d', sid: '900001' });
  assert.equal(r.stores.length, 1);
  assert.equal(r.stores[0].sid, '900001');
});

test('getAmazonProfitDashboard: 无凭证返回 mock 看板', async () => {
  const r = await mod.getAmazonProfitDashboard(null, 'u', 's', { range: '30d' });
  assert.equal(r.sourceMeta.mock, true);
  assert.equal(r.range, '30d');
  assert.ok(Array.isArray(r.stores));
  assert.ok(Array.isArray(r.asins));
});

test('getAmazonProfitDashboard: thresholds 透传影响风险标签', async () => {
  const r = await mod.getAmazonProfitDashboard(null, 'u', 's', { range: '30d', thresholds: { highTacos: 0.05 } });
  assert.equal(r.thresholds.highTacos, 0.05);
});

test('isLingxingConfigured: 无凭证为 false', () => {
  assert.equal(mod.isLingxingConfigured(), false);
});
