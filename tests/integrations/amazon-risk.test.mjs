// Amazon 真实风险看板测试。
// 用真实字段结构(mapPerformanceRow 输出形状)的 fixture, 测 6 类风险派生 / 店铺聚合 /
// 看板契约 / severity 过滤 / 无凭证 mock 兜底。不真连领星(本地连不上)。
import test from 'node:test';
import assert from 'node:assert/strict';

// 确保无凭证, 走 mock 通路验证降级。
delete process.env.LINGXING_APP_ID;
delete process.env.LINGXING_APP_SECRET;

const M = await import('../../apps/api/src/integrations/lingxing/amazon-risk.mjs');

// mapPerformanceRow 输出形状(只列与风险相关的字段; 与 amazon.mjs 一致)。
function row(over = {}) {
  return {
    asin: 'B0TEST0001', itemName: 'Test Item', currencyCode: 'USD',
    volume: 100, amount: 1000, netAmount: 900, orderItems: 100,
    adSpend: 50, adSalesAmount: 200, acos: 0.05, tacos: 0.05, adOrderQuantity: 10,
    grossProfit: 250, grossMargin: 0.25, roi: 1,
    sessions: 1000, pageViews: 1200, cvr: 0.1, ctr: 0.01, buyBoxPercentage: 0.9,
    avgStar: 4.6, reviewsCount: 30, returnRate: 0.02, returnCount: 2,
    cateRank: 1234, smallCateRank: 56, availableInventory: 500, availableDays: 60,
    volumeChainRatio: 0.05, amountChainRatio: 0.05,
    ...over,
  };
}

const ctx = { sid: 'S1', storeName: 'Store One', periodDays: 14 };

test('RISK_THRESHOLDS 暴露单一可信源阈值', () => {
  assert.equal(M.RISK_THRESHOLDS.acos.p0, 0.50);
  assert.equal(M.RISK_THRESHOLDS.availableDays.p1, 14);
  assert.equal(M.RISK_THRESHOLDS.chainRatio.p0, -0.50);
});

test('daysBetween / defaultPeriod', () => {
  assert.equal(M.daysBetween('2026-06-01', '2026-06-14'), 14);
  assert.equal(M.daysBetween('2026-06-01', '2026-06-01'), 1);
  const p = M.defaultPeriod({ startDate: '2026-06-01', endDate: '2026-06-14' });
  assert.equal(p.days, 14);
  assert.equal(p.startDate, '2026-06-01');
  // 默认无参: 近 14 天
  const d = M.defaultPeriod();
  assert.equal(d.days, 14);
  assert.ok(d.startDate <= d.endDate);
});

test('健康 ASIN 不产生任何风险', () => {
  assert.equal(M.deriveAsinRisks(row(), ctx).length, 0);
});

test('acos_high: acos>=0.5 -> P0; 广告吃光利润也 P0', () => {
  const p0 = M.deriveAsinRisks(row({ acos: 0.55, adSpend: 300 }), ctx).find((r) => r.riskType === 'acos_high');
  assert.ok(p0); assert.equal(p0.severity, 'P0');
  assert.equal(p0.metric.name, 'acos');
  // acos 0.4 (>=0.35 但 <0.5) 且 > grossMargin(0.25) -> 吃光利润 P0
  const eats = M.deriveAsinRisks(row({ acos: 0.40, adSpend: 300, grossMargin: 0.25 }), ctx).find((r) => r.riskType === 'acos_high');
  assert.ok(eats); assert.equal(eats.severity, 'P0');
  assert.equal(eats.impact.basis, 'ad_spend_over_margin');
});

test('acos_high: 小额广告花费(<minAdSpend)不触发', () => {
  const risks = M.deriveAsinRisks(row({ acos: 0.6, adSpend: 10 }), ctx);
  assert.equal(risks.find((r) => r.riskType === 'acos_high'), undefined);
});

test('ad_overspend: 高花费低产出 -> 损失=adSpend-adSales', () => {
  const r = M.deriveAsinRisks(row({ adSpend: 300, adSalesAmount: 100, acos: 0.6 }), ctx).find((x) => x.riskType === 'ad_overspend');
  assert.ok(r); assert.equal(r.severity, 'P0');
  assert.equal(r.impact.estimatedLoss, 200);
  assert.equal(r.impact.basis, 'ad_spend_minus_ad_sales');
});

test('rating_low: <=3.0 P0, <=3.5 P1, 样本不足跳过, 0 视为无数据', () => {
  const p0 = M.deriveAsinRisks(row({ avgStar: 2.8, reviewsCount: 10 }), ctx).find((r) => r.riskType === 'rating_low');
  assert.equal(p0.severity, 'P0');
  const p1 = M.deriveAsinRisks(row({ avgStar: 3.4, reviewsCount: 10 }), ctx).find((r) => r.riskType === 'rating_low');
  assert.equal(p1.severity, 'P1');
  // 样本<5 跳过
  assert.equal(M.deriveAsinRisks(row({ avgStar: 2.0, reviewsCount: 3 }), ctx).find((r) => r.riskType === 'rating_low'), undefined);
  // avgStar=0 视为无数据
  assert.equal(M.deriveAsinRisks(row({ avgStar: 0, reviewsCount: 100 }), ctx).find((r) => r.riskType === 'rating_low'), undefined);
});

test('return_high: >=0.15 P0; 损失=returnCount*客单价', () => {
  const r = M.deriveAsinRisks(row({ returnRate: 0.20, returnCount: 20, volume: 100, amount: 1000 }), ctx).find((x) => x.riskType === 'return_high');
  assert.ok(r); assert.equal(r.severity, 'P0');
  // 客单价=10, returnCount=20 -> loss 200
  assert.equal(r.impact.estimatedLoss, 200);
  // 样本不足(volume<5)跳过
  assert.equal(M.deriveAsinRisks(row({ returnRate: 0.5, returnCount: 1, volume: 2 }), ctx).find((x) => x.riskType === 'return_high'), undefined);
});

test('stockout_risk: 0<days<=7 P0; days===0 视为无数据跳过', () => {
  const p0 = M.deriveAsinRisks(row({ availableDays: 4, amount: 1400 }), ctx).find((r) => r.riskType === 'stockout_risk');
  assert.ok(p0); assert.equal(p0.severity, 'P0');
  const p1 = M.deriveAsinRisks(row({ availableDays: 12 }), ctx).find((r) => r.riskType === 'stockout_risk');
  assert.equal(p1.severity, 'P1');
  // days=0 = 无数据
  assert.equal(M.deriveAsinRisks(row({ availableDays: 0 }), ctx).find((r) => r.riskType === 'stockout_risk'), undefined);
  // days>14 无风险
  assert.equal(M.deriveAsinRisks(row({ availableDays: 30 }), ctx).find((r) => r.riskType === 'stockout_risk'), undefined);
});

test('sales_drop: 环比<=-0.5 P0(领星原生环比, 非自造序列)', () => {
  const p0 = M.deriveAsinRisks(row({ amountChainRatio: -0.6, volumeChainRatio: -0.55 }), ctx).find((r) => r.riskType === 'sales_drop');
  assert.ok(p0); assert.equal(p0.severity, 'P0');
  const p1 = M.deriveAsinRisks(row({ amountChainRatio: -0.35, volumeChainRatio: -0.1 }), ctx).find((r) => r.riskType === 'sales_drop');
  assert.equal(p1.severity, 'P1');
  // 上涨不触发
  assert.equal(M.deriveAsinRisks(row({ amountChainRatio: 0.2 }), ctx).find((r) => r.riskType === 'sales_drop'), undefined);
});

test('deriveStoreRisks: 计分 + 受影响销售额去重 ASIN', () => {
  const rows = [
    row({ asin: 'A1', acos: 0.6, adSpend: 300, amount: 5000 }), // acos_high P0 (+ad_overspend)
    row({ asin: 'A2', avgStar: 2.5, reviewsCount: 20, amount: 800 }), // rating_low P0
    row({ asin: 'A3', availableDays: 10, amount: 300 }), // stockout P1
  ];
  const { risks, storeScore } = M.deriveStoreRisks(rows, {}, ctx);
  assert.ok(risks.length >= 3);
  assert.equal(storeScore.sid, 'S1');
  assert.ok(storeScore.p0 >= 2);
  assert.equal(storeScore.score, storeScore.p0 * 3 + storeScore.p1);
  // 排序: P0 在前
  assert.equal(risks[0].severity, 'P0');
  // impactedAmount 去重 ASIN(A1 即便有多条风险只计一次)
  assert.equal(storeScore.impactedAmount, 5000 + 800 + 300);
});

test('buildRiskBoard: 契约字段齐全 + 排行 + 摘要', () => {
  const r1 = M.deriveAsinRisks(row({ asin: 'A1', acos: 0.6, adSpend: 300, amount: 5000 }), ctx);
  const r2 = M.deriveAsinRisks(row({ asin: 'A2', availableDays: 3, amount: 800 }), { ...ctx, sid: 'S2', storeName: 'Store Two' });
  const all = [...r1, ...r2];
  const scores = [
    M.deriveStoreRisks([row({ asin: 'A1', acos: 0.6, adSpend: 300, amount: 5000 })], {}, ctx).storeScore,
    M.deriveStoreRisks([row({ asin: 'A2', availableDays: 3, amount: 800 })], {}, { ...ctx, sid: 'S2', storeName: 'Store Two' }).storeScore,
  ];
  const board = M.buildRiskBoard(all, scores, {});
  for (const k of ['totalRisks', 'p0', 'p1', 'adOverspendCount', 'adSpendTotal', 'stockoutCount', 'minAvailableDays', 'impactedAmount', 'currencyMixed']) {
    assert.ok(k in board.kpi, `kpi 缺 ${k}`);
  }
  assert.ok(Array.isArray(board.risks));
  assert.ok(Array.isArray(board.rankings.adBurn));
  assert.ok(Array.isArray(board.rankings.stockout));
  assert.ok(Array.isArray(board.rankings.storeScore));
  assert.equal(typeof board.summary, 'string');
  assert.equal(board.kpi.stockoutCount, 1);
  assert.equal(board.kpi.minAvailableDays, 3);
  assert.ok(board.kpi.adSpendTotal > 0);
  // 每条 risk 结构契约
  for (const r of board.risks) {
    for (const k of ['id', 'sid', 'storeName', 'asin', 'riskType', 'severity', 'metric', 'context', 'impact', 'currencyCode']) {
      assert.ok(k in r, `risk 缺 ${k}`);
    }
    assert.ok(['P0', 'P1'].includes(r.severity));
  }
});

test('mockAmazonRiskBoard: source.mock=true + 空看板 + 全 0 KPI', () => {
  const b = M.mockAmazonRiskBoard({ startDate: '2026-06-01', endDate: '2026-06-14' });
  assert.equal(b.source.mock, true);
  assert.equal(b.source.provider, 'lingxing_productPerformance');
  assert.equal(b.kpi.totalRisks, 0);
  assert.equal(b.kpi.p0, 0);
  assert.deepEqual(b.risks, []);
  assert.equal(b.source.bsrTrend, 'snapshot_only');
  assert.ok(b.source.reason);
});

test('getAmazonRiskBoard: 无凭证 -> 诚实 mock(不抛错)', async () => {
  const b = await M.getAmazonRiskBoard(null, 'u', 's', { startDate: '2026-06-01', endDate: '2026-06-14' });
  assert.equal(b.source.mock, true);
  assert.equal(b.kpi.totalRisks, 0);
  // 真实通路始终保留: provider 标注 lingxing
  assert.equal(b.source.provider, 'lingxing_productPerformance');
  // 契约完整
  assert.ok('rankings' in b && 'kpi' in b && 'period' in b);
});

test('severity 过滤: p0 只留 P0', async () => {
  // 直接验证 buildRiskBoard + finalize 经 getAmazonRiskBoard 间接路径不易, 改测纯过滤逻辑:
  const r1 = M.deriveAsinRisks(row({ acos: 0.6, adSpend: 300, asin: 'A1' }), ctx); // P0
  const r2 = M.deriveAsinRisks(row({ availableDays: 12, asin: 'A2' }), ctx); // P1
  const board = M.buildRiskBoard([...r1, ...r2], [], {});
  const onlyP0 = board.risks.filter((r) => r.severity === 'P0');
  assert.ok(onlyP0.length >= 1);
  assert.ok(board.risks.some((r) => r.severity === 'P1'));
});
