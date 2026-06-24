// Amazon 每日监控日报 (M4) 测试。
// 用真实 productPerformance 字段结构的 fixture(参考基座 mapPerformanceRow 输出形状),
// 测: 跨店汇总实算 / 环比 delta / 派生层(排行+风险+headline) / 完整契约 / mock 兜底。
// 不真连领星(本地连不上); 无凭证下 buildAmazonDailyReport 走 mock 分支。
import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.LINGXING_APP_ID;
delete process.env.LINGXING_APP_SECRET;

const mod = await import('../../apps/api/src/integrations/lingxing/amazon-daily.mjs');
const { aggregateStorePerformance } = await import('../../apps/api/src/integrations/lingxing/amazon.mjs');
const { computeSummary, attachStoreDeltas, summaryDelta, previousRange, daysBetween, storeRowFromAggregate, pctDelta, ratioDelta } = mod._internals;

// 真实 productPerformance 原始行形状(snake_case, 来自基座 mapPerformanceRow 解析的字段)
function ppRow(o = {}) {
  return {
    asins: [{ asin: o.asin || 'B0TEST' }],
    item_name: o.itemName || 'Test Item',
    currency_code: o.currency || 'USD',
    volume: o.volume ?? 0,
    amount: o.amount ?? 0,
    net_amount: o.netAmount ?? 0,
    order_items: o.orderItems ?? 0,
    spend: o.spend ?? 0,
    ad_sales_amount: o.adSales ?? 0,
    acos: o.acos ?? 0,
    tacos: o.tacos ?? 0,
    gross_profit: o.grossProfit ?? 0,
    gross_margin: o.grossMargin ?? 0,
    roi: o.roi ?? 0,
    sessions_total: o.sessions ?? 0,
    page_views_total: o.pageViews ?? 0,
    cvr: o.cvr ?? 0,
    ctr: o.ctr ?? 0,
    buy_box_percentage: o.buyBox ?? 0,
    avg_star: o.avgStar ?? 0,
    reviews_count: o.reviews ?? 0,
    return_rate: o.returnRate ?? 0,
    return_count: o.returnCount ?? 0,
    cate_rank: o.cateRank ?? null,
    small_cate_rank: o.smallCateRank ?? null,
    available_inventory: o.availableInventory ?? 0,
    available_days: o.availableDays ?? 0,
    volume_chain_ratio: o.volumeChainRatio ?? 0,
    amount_chain_ratio: o.amountChainRatio ?? 0,
  };
}

// 用基座聚合 + 本模块 storeRowFromAggregate 造一个店级行
function storeRow(seller, rows) {
  return storeRowFromAggregate(seller, aggregateStorePerformance(rows));
}

test('computeSummary: 跨店比率用 sum 分子分母实算(不被小店稀释)', () => {
  const sA = storeRow({ sid: '1', name: 'A', currencyCode: 'USD' }, [
    ppRow({ asin: 'B01', volume: 100, amount: 4000, spend: 600, grossProfit: 800, sessions: 2000, returnCount: 4, avgStar: 4.5, reviews: 100 }),
  ]);
  const sB = storeRow({ sid: '2', name: 'B', currencyCode: 'USD' }, [
    ppRow({ asin: 'B02', volume: 10, amount: 100, spend: 50, grossProfit: 5, sessions: 200, returnCount: 1, avgStar: 3.0, reviews: 10 }),
  ]);
  const sum = computeSummary([sA, sB]);
  assert.equal(sum.stores, 2);
  assert.equal(sum.volume, 110);
  assert.equal(sum.gmv, 4100);
  // ACOS 实算 = (600+50)/(4000+100) = 650/4100
  assert.equal(sum.acos, Math.round((650 / 4100) * 10000) / 10000);
  // 毛利率 = (800+5)/4100
  assert.equal(sum.grossMargin, Math.round((805 / 4100) * 10000) / 10000);
  // CVR = 110/2200
  assert.equal(sum.cvr, Math.round((110 / 2200) * 10000) / 10000);
  // 退款率 = 5/110
  assert.equal(sum.returnRate, Math.round((5 / 110) * 10000) / 10000);
  // 加权评分 = (4.5*100 + 3*10)/110
  assert.equal(sum.avgStar, Math.round(((4.5 * 100 + 3 * 10) / 110) * 100) / 100);
});

test('computeSummary: 跨店混币标主币种 + * 后缀', () => {
  const sUsd = storeRow({ sid: '1', name: 'A', currencyCode: 'USD' }, [ppRow({ amount: 5000 })]);
  const sGbp = storeRow({ sid: '2', name: 'B', currencyCode: 'GBP' }, [ppRow({ amount: 1000 })]);
  const sum = computeSummary([sUsd, sGbp]);
  assert.equal(sum.currency, 'USD*'); // USD 占比最高 + 混币标记
});

test('环比 pctDelta / ratioDelta 口径正确', () => {
  assert.equal(pctDelta(110, 100), 10);      // +10%
  assert.equal(pctDelta(50, 100), -50);      // -50%
  assert.equal(pctDelta(10, 0), null);       // 无对比基数
  assert.equal(pctDelta(0, 0), 0);
  assert.equal(ratioDelta(0.41, 0.35), 6);   // 6 个百分点
});

test('attachStoreDeltas + summaryDelta: 本区间 vs 等长上一区间', () => {
  const cur = [storeRow({ sid: '1', name: 'A', currencyCode: 'USD' }, [ppRow({ volume: 110, amount: 4400, spend: 660, avgStar: 4.5, reviews: 100, returnCount: 3 })])];
  const prev = [storeRow({ sid: '1', name: 'A', currencyCode: 'USD' }, [ppRow({ volume: 100, amount: 4000, spend: 600, avgStar: 4.4, reviews: 100, returnCount: 4 })])];
  attachStoreDeltas(cur, prev);
  assert.equal(cur[0].gmvDeltaPct, 10);
  assert.equal(cur[0].unitsDeltaPct, 10);
  assert.equal(cur[0].ratingDelta, 0.1);
  const sCur = computeSummary(cur);
  const sPrev = computeSummary(prev);
  const d = summaryDelta(sCur, sPrev);
  assert.equal(d.gmvDeltaPct, 10);
});

test('previousRange / daysBetween: 等长紧贴上一区间', () => {
  assert.equal(daysBetween('2026-06-18', '2026-06-24'), 7);
  const p = previousRange('2026-06-18', '2026-06-24');
  assert.equal(p.endDate, '2026-06-17');
  assert.equal(p.startDate, '2026-06-11');
  assert.equal(daysBetween(p.startDate, p.endDate), 7);
});

test('deriveInsights: 排行 + 风险阈值判定 + headline (纯真实字段)', () => {
  const stores = [
    { sid: '1', name: 'US-Main', currency: 'USD', gmv: 31200, volume: 820, adSpend: 4820, acos: 0.1545, grossProfit: 7010, grossMargin: 0.2247, avgStar: 4.5, reviewsCount: 200, returnRate: 0.025, gmvDeltaPct: 8.1 },
    { sid: '2', name: 'UK-Sub', currency: 'GBP', gmv: 5000, volume: 90, adSpend: 2100, acos: 0.42, grossProfit: -120, grossMargin: -0.024, avgStar: 3.8, reviewsCount: 50, returnRate: 0.07, gmvDeltaPct: -34 },
  ];
  const asins = [
    { sid: '1', asin: 'B0A', itemName: 'Good', amount: 4800, grossProfit: 980, availableDays: 21, amountChainRatio: 0.06, volumeChainRatio: 0.08 },
    { sid: '2', asin: 'B0B', itemName: 'StockLow', amount: 300, grossProfit: 20, availableDays: 9, amountChainRatio: -0.4, volumeChainRatio: -0.45 },
    { sid: '2', asin: 'B0C', itemName: 'Loss', amount: 200, grossProfit: -50, availableDays: 0, amountChainRatio: 0, volumeChainRatio: 0 },
  ];
  const summary = { stores: 2, gmv: 36200, currency: 'USD*', delta: { gmvDeltaPct: 3.1 } };
  const ins = mod.deriveInsights({ stores, asins, summary });

  // 排行
  assert.equal(ins.rankings.gmvTop[0].name, 'US-Main');
  assert.equal(ins.rankings.declineTop[0].name, 'UK-Sub'); // 最大下滑
  assert.equal(ins.rankings.highAcosTop[0].name, 'UK-Sub');

  const types = ins.risks.map((r) => r.type);
  assert.ok(types.includes('acos_high'), '应识别高 ACOS');
  assert.ok(types.includes('margin_negative'), '应识别毛利转负');
  assert.ok(types.includes('return_high'), '应识别高退款');
  assert.ok(types.includes('rating_low'), '应识别低评分');
  assert.ok(types.includes('gmv_drop'), '应识别 GMV 急跌');
  assert.ok(types.includes('stockout_risk'), '应识别断货风险(B0B availableDays=9)');
  assert.ok(types.includes('asin_drop'), '应识别 ASIN 环比急跌(B0B -0.45)');
  // P1 排前
  assert.equal(ins.risks[0].level, 'P1');
  // headline 非空且含店数
  assert.match(ins.headline, /2 店/);
});

test('deriveInsights: 全健康店无风险', () => {
  const stores = [{ sid: '1', name: 'A', currency: 'USD', gmv: 10000, volume: 200, adSpend: 1000, acos: 0.1, grossProfit: 3000, grossMargin: 0.3, avgStar: 4.6, reviewsCount: 100, returnRate: 0.02, gmvDeltaPct: 5 }];
  const ins = mod.deriveInsights({ stores, asins: [], summary: { stores: 1, gmv: 10000, currency: 'USD' } });
  assert.equal(ins.risks.length, 0);
});

test('mockAmazonDailyReport: 诚实标 mock:true + 真实区数值置 0 + 失败原因', () => {
  const r = mod.mockAmazonDailyReport({ startDate: '2026-06-24', endDate: '2026-06-24', dimension: 'store', reason: 'lingxing_not_configured' });
  assert.equal(r.configured, false);
  assert.equal(r.error, 'lingxing_not_configured');
  assert.equal(r.summary.gmv, 0);
  assert.equal(r.summary.volume, 0);
  assert.equal(r.filters.realDataOnly, false);
  // 真实区 sourceMeta 标 mock:true
  assert.equal(r.sourceMeta.gmv.mock, true);
  assert.equal(r.sourceMeta.gmv.reason, 'lingxing_not_configured');
  // 基座拿不到的本就 mock:true
  assert.equal(r.sourceMeta.competitorBsr.mock, true);
  assert.equal(r.sourceMeta.alerts.mock, true);
});

test('buildAmazonDailyReport: 无凭证 -> mock 兜底 + 完整契约', async () => {
  mod._clearAmazonDailyCache();
  const r = await mod.buildAmazonDailyReport(null, 'u', 's', { startDate: '2026-06-24', endDate: '2026-06-24', dimension: 'store' });
  // 顶层契约字段齐全
  for (const k of ['reportDate', 'range', 'dimension', 'generatedAt', 'configured', 'availableStores', 'filters', 'summary', 'stores', 'asins', 'dailySeries', 'insights', 'sourceMeta']) {
    assert.ok(k in r, `缺契约字段 ${k}`);
  }
  assert.equal(r.configured, false);
  assert.equal(r.dimension, 'store');
  assert.equal(r.range.days, 1);
  assert.equal(r.sourceMeta.sales.mock, true);
});

test('buildAmazonDailyReport: dimension=asin 透传 + start>end 收敛', async () => {
  mod._clearAmazonDailyCache();
  const r = await mod.buildAmazonDailyReport(null, 'u', 's', { startDate: '2026-06-25', endDate: '2026-06-20', dimension: 'asin' });
  assert.equal(r.dimension, 'asin');
  assert.equal(r.range.startDate, r.range.endDate); // start>end -> start=end
});

test('sourceMeta 真实区与基座拿不到区严格隔离(真实:false 时不混 mock)', () => {
  // 健康聚合不影响 sourceMeta 隔离语义: competitorBsr/alerts/recovered 永远 mock:true
  const r = mod.mockAmazonDailyReport({ startDate: '2026-06-24', endDate: '2026-06-24', dimension: 'store' });
  assert.equal(r.sourceMeta.competitorBsr.provider, 'pseudo_random');
  assert.equal(r.sourceMeta.recovered.provider, 'simulated');
});
