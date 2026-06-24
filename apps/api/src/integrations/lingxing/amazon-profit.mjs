// 经营利润工作台 — "Amazon 真实利润"看板取数/聚合/派生层。
// 只复用基座 amazon.mjs(鉴权/签名/限流/字段映射), 不重写任何取数细节。
// 设计前提(已核对基座 mapPerformanceRow/aggregateStorePerformance):
//   - 店铺级 acos/tacos/roi/grossMargin 由汇总额在本模块重算(基座不汇总这四个)。
//   - 行级 acos/tacos/roi/grossMargin 直接透出(领星按 ASIN 自算的真实值)。
//   - 跨店合计按 currencyCode 分组(基座币种可能不一致, 强制 currencyBreakdown)。
// 无领星凭证时: 唯一兜底是诚实标 sourceMeta.mock:true + reason, 真实通路始终实现。
import {
  isLingxingConfigured,
  fetchActiveAmazonSellers,
  fetchProductPerformance,
  mapPerformanceRow,
  aggregateStorePerformance,
} from './amazon.mjs';

// 默认阈值(query 可覆盖)
export const DEFAULT_THRESHOLDS = { lossMargin: 0, highTacos: 0.30 };
const TOP_N = 10;
// 多店并发度(基座 ppRequest 自身有 2.2s 最小间隔 + 退避, 这里限制并发避免雪崩)
const STORE_CONCURRENCY = 2;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function round4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }

// '30d' / '7d' / '90d' -> { startDate, endDate }(含今天, 往前推 N-1 天)
export function resolveDateRange(range = '30d', today = new Date()) {
  const days = Math.max(1, Number(String(range).replace(/d$/i, '')) || 30);
  const end = new Date(today.getTime());
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), days };
}

// 单行风险标签(纯函数, 全部基于真实字段)
export function rowRisks(row, thresholds = DEFAULT_THRESHOLDS) {
  const risks = [];
  if (row.grossProfit < 0 || row.grossMargin <= thresholds.lossMargin) risks.push('loss');
  // 广告吞利: ACOS 高于毛利率(每单广告吃掉毛利), 或广告花费已超过毛利
  if ((row.acos > 0 && row.grossMargin > 0 && row.acos > row.grossMargin) ||
      (row.adSpend > 0 && row.adSpend > row.grossProfit)) risks.push('ad_eats_profit');
  if (row.tacos > thresholds.highTacos) risks.push('high_tacos');
  return risks;
}

// 纯函数: 给定(已带 sid/storeName 的)asin 行集 -> 排行 + 风险清单(便于单测)
export function deriveProfitInsights(asinRows, thresholds = DEFAULT_THRESHOLDS) {
  const rows = (asinRows || []).map((r) => ({ ...r, risks: rowRisks(r, thresholds) }));
  const byProfitDesc = [...rows].sort((a, b) => b.grossProfit - a.grossProfit);
  const byProfitAsc = [...rows].sort((a, b) => a.grossProfit - b.grossProfit);
  return {
    topProfit: byProfitDesc.slice(0, TOP_N),
    topDrag: byProfitAsc.slice(0, TOP_N),
    lossAsins: byProfitAsc.filter((r) => r.grossProfit < 0 || r.grossMargin <= thresholds.lossMargin),
    adEatsProfit: rows.filter((r) => r.risks.includes('ad_eats_profit')),
    highTacos: rows.filter((r) => r.risks.includes('high_tacos')),
  };
}

// 店铺级重算(基座只汇总 amount/grossProfit/adSpend/adSalesAmount, 这四个比率本模块算)
function recomputeStoreMetrics(agg) {
  const { amount, grossProfit, adSpend, adSalesAmount } = agg;
  const grossMargin = amount > 0 ? round4(grossProfit / amount) : 0;
  const acos = adSalesAmount > 0 ? round4(adSpend / adSalesAmount) : 0;
  const tacos = amount > 0 ? round4(adSpend / amount) : 0;
  const roi = adSpend > 0 ? round4(grossProfit / adSpend) : 0;
  const adShare = amount > 0 ? round4(adSalesAmount / amount) : 0;
  const health = grossProfit < 0 ? 'loss' : grossMargin < 0.10 ? 'watch' : 'healthy';
  return { grossMargin, acos, tacos, roi, adShare, health };
}

// 单店利润汇总: 拉 productPerformance(asin维度) -> aggregate -> 重算店铺级比率 + 透出 ASIN 行。
export async function computeStoreAmazonProfit({ sid, name, currencyCode, startDate, endDate }) {
  const rows = await fetchProductPerformance({ sid, startDate, endDate, summaryField: 'asin' });
  const agg = aggregateStorePerformance(rows);
  const m = recomputeStoreMetrics(agg);
  const cur = currencyCode || (agg.rows[0]?.currencyCode) || 'USD';
  const asins = agg.rows.map((r) => ({
    asin: r.asin,
    itemName: r.itemName,
    currencyCode: r.currencyCode || cur,
    amount: round2(r.amount),
    netAmount: round2(r.netAmount),
    grossProfit: round2(r.grossProfit),
    grossMargin: round4(r.grossMargin),
    roi: round4(r.roi),
    acos: round4(r.acos),
    tacos: round4(r.tacos),
    adSpend: round2(r.adSpend),
    adSalesAmount: round2(r.adSalesAmount),
    adShare: r.amount > 0 ? round4(r.adSalesAmount / r.amount) : 0,
    volume: r.volume,
    sessions: r.sessions,
    cvr: round4(r.cvr),
    returnRate: round4(r.returnRate),
    availableInventory: r.availableInventory,
    availableDays: r.availableDays,
    afnFulfillable: r.afnFulfillable,
    afnInbound: r.afnInbound,
    stockUpNum: r.stockUpNum,
    inventoryValue: round2(r.inventoryValue),
    avgLandedPrice: round2(r.avgLandedPrice),
    cateRank: r.cateRank,
    amountChainRatio: round4(r.amountChainRatio),
  }));
  return {
    sid: String(sid),
    name: name || `店铺${sid}`,
    currencyCode: cur,
    asinCount: agg.asinCount,
    amount: agg.amount,
    netAmount: agg.netAmount,
    grossProfit: agg.grossProfit,
    grossMargin: m.grossMargin,
    adSpend: agg.adSpend,
    adSalesAmount: agg.adSalesAmount,
    acos: m.acos,
    tacos: m.tacos,
    roi: m.roi,
    adShare: m.adShare,
    volume: agg.volume,
    sessions: agg.sessions,
    cvr: round4(agg.cvr),
    avgStar: agg.avgStar,
    returnRate: round4(agg.returnRate),
    health: m.health,
    asins,
  };
}

// 简易并发池(限制 STORE_CONCURRENCY, 单店失败用 settle 收进 errors 不阻断全局)
async function settleStores(sellers, fn) {
  const results = [];
  const errors = [];
  let idx = 0;
  async function worker() {
    while (idx < sellers.length) {
      const s = sellers[idx++];
      try {
        results.push(await fn(s));
      } catch (err) {
        errors.push({ sid: String(s.sid), message: String(err.message || err) });
      }
    }
  }
  const pool = Array.from({ length: Math.min(STORE_CONCURRENCY, sellers.length || 1) }, worker);
  await Promise.all(pool);
  return { results, errors };
}

// 按币种分组合计 + 重算分组级比率 + 亏损统计
function buildCurrencyBreakdown(stores, asins, thresholds) {
  const byCur = new Map();
  for (const st of stores) {
    const g = byCur.get(st.currencyCode) || {
      currencyCode: st.currencyCode, storeCount: 0,
      amount: 0, netAmount: 0, grossProfit: 0, adSpend: 0, adSalesAmount: 0,
      lossAsinCount: 0, lossAmount: 0,
    };
    g.storeCount += 1;
    g.amount += st.amount;
    g.netAmount += st.netAmount;
    g.grossProfit += st.grossProfit;
    g.adSpend += st.adSpend;
    g.adSalesAmount += st.adSalesAmount;
    byCur.set(st.currencyCode, g);
  }
  for (const a of asins) {
    if (a.grossProfit < 0 || a.grossMargin <= thresholds.lossMargin) {
      const g = byCur.get(a.currencyCode);
      if (g) { g.lossAsinCount += 1; g.lossAmount += a.grossProfit; }
    }
  }
  return [...byCur.values()].map((g) => ({
    currencyCode: g.currencyCode,
    storeCount: g.storeCount,
    amount: round2(g.amount),
    netAmount: round2(g.netAmount),
    grossProfit: round2(g.grossProfit),
    grossMargin: g.amount > 0 ? round4(g.grossProfit / g.amount) : 0,
    adSpend: round2(g.adSpend),
    adSalesAmount: round2(g.adSalesAmount),
    acos: g.adSalesAmount > 0 ? round4(g.adSpend / g.adSalesAmount) : 0,
    tacos: g.amount > 0 ? round4(g.adSpend / g.amount) : 0,
    roi: g.adSpend > 0 ? round4(g.grossProfit / g.adSpend) : 0,
    lossAsinCount: g.lossAsinCount,
    lossAmount: round2(g.lossAmount),
  })).sort((a, b) => b.amount - a.amount);
}

// 把店铺/ASIN 集合组装成完整看板契约(纯函数, 便于 mock 复用)
function assembleDashboard({ range, startDate, endDate, stores, allAsins, thresholds, errors, mockMeta }) {
  const storeRanking = [...stores].sort((a, b) => b.grossProfit - a.grossProfit)
    .map(({ asins, ...rest }) => rest); // 店铺排行不带 asins 明细
  const asinRanking = [...allAsins].sort((a, b) => b.grossProfit - a.grossProfit)
    .map((a) => ({ ...a, risks: rowRisks(a, thresholds) }));
  const currencyBreakdown = buildCurrencyBreakdown(storeRanking, allAsins, thresholds);
  const main = currencyBreakdown[0] || {
    currencyCode: 'USD', storeCount: 0, amount: 0, netAmount: 0, grossProfit: 0, grossMargin: 0,
    adSpend: 0, adSalesAmount: 0, acos: 0, tacos: 0, roi: 0, lossAsinCount: 0, lossAmount: 0,
  };
  const mainStores = storeRanking.filter((s) => s.currencyCode === main.currencyCode);
  const mainAsins = asinRanking.filter((a) => a.currencyCode === main.currencyCode);
  const insights = deriveProfitInsights(mainAsins, thresholds);
  const topStore = mainStores[0]
    ? { sid: mainStores[0].sid, name: mainStores[0].name, grossProfit: mainStores[0].grossProfit }
    : { sid: '', name: '', grossProfit: 0 };
  const worst = [...mainAsins].sort((a, b) => a.grossProfit - b.grossProfit)[0];
  const worstAsin = worst
    ? { asin: worst.asin, itemName: worst.itemName, grossProfit: worst.grossProfit }
    : { asin: '', itemName: '', grossProfit: 0 };

  const summary = {
    currencyCode: main.currencyCode,
    storeCount: main.storeCount,
    asinCount: mainAsins.length,
    amount: main.amount,
    netAmount: main.netAmount,
    grossProfit: main.grossProfit,
    grossMargin: main.grossMargin,
    acos: main.acos,
    tacos: main.tacos,
    roi: main.roi,
    lossAsinCount: main.lossAsinCount,
    lossAmount: main.lossAmount,
    topStore,
    worstAsin,
  };

  const sourceMeta = mockMeta || {
    source: 'lingxing-openapi', platform: 'Amazon', basis: 'productPerformance_asin',
    mock: false, fetchedAt: new Date().toISOString(),
  };

  return {
    range,
    startDate,
    endDate,
    generatedAt: new Date().toISOString(),
    currencyBreakdown,
    summary,
    stores: storeRanking,
    asins: asinRanking,
    insights,
    capital: deriveCapital(mainAsins, main.currencyCode),
    actions: deriveActions(mainAsins, thresholds),
    thresholds,
    partial: errors.length > 0,
    errors,
    sourceMeta,
  };
}

// 资金与采购视角(真实库存字段): 仓库货值/在途/可售天数/备货, + 断货&积压清单。
export function deriveCapital(asins, currencyCode = 'USD') {
  const sum = (f) => asins.reduce((a, r) => a + (Number(r[f]) || 0), 0);
  const invValue = round2(sum('inventoryValue')); // 库存资金占用 = 可售库存 × 平均到岸价
  const stockout = asins.filter((a) => (a.availableDays || 0) > 0 && a.availableDays < 14 && a.volume > 0)
    .map((a) => ({ asin: a.asin, itemName: a.itemName, availableDays: a.availableDays, availableInventory: a.availableInventory, volume: a.volume, sid: a.sid, storeName: a.storeName }))
    .sort((x, y) => x.availableDays - y.availableDays);
  const overstock = asins.filter((a) => (a.availableDays || 0) > 90)
    .map((a) => ({ asin: a.asin, itemName: a.itemName, availableDays: a.availableDays, availableInventory: a.availableInventory, inventoryValue: round2(a.inventoryValue), sid: a.sid, storeName: a.storeName }))
    .sort((x, y) => (y.inventoryValue || 0) - (x.inventoryValue || 0));
  return {
    currencyCode,
    inventoryValue: invValue,                 // 库存资金占用(可售库存 × 到岸价)
    fbaAvailable: sum('afnFulfillable'),      // FBA 可售
    fbaInbound: sum('afnInbound'),            // FBA 在途
    stockUpNum: sum('stockUpNum'),            // 建议备货
    stockoutRiskCount: stockout.length,
    overstockCount: overstock.length,
    stockoutList: stockout.slice(0, 20),
    overstockList: overstock.slice(0, 20),
  };
}

// 今日必须处理(从真实指标派生, 优先级排序)。
export function deriveActions(asins, thresholds = DEFAULT_THRESHOLDS) {
  const acts = [];
  for (const a of asins) {
    if ((a.grossMargin ?? 1) < (thresholds.lossMargin ?? 0) || a.grossProfit < 0) {
      acts.push({ kind: 'loss', severity: 'p0', asin: a.asin, itemName: a.itemName, sid: a.sid, storeName: a.storeName,
        metric: `毛利 ${a.grossProfit}`, action: '止损: 复核成本/定价/广告' });
    } else if (a.tacos > (thresholds.highTacos ?? 0.30)) {
      acts.push({ kind: 'ad_eat', severity: 'p1', asin: a.asin, itemName: a.itemName, sid: a.sid, storeName: a.storeName,
        metric: `TACOS ${(a.tacos * 100).toFixed(1)}%`, action: '广告吞利: 降预算/优化否词' });
    }
    if ((a.availableDays || 0) > 0 && a.availableDays < 14 && a.volume > 0) {
      acts.push({ kind: 'stockout', severity: 'p0', asin: a.asin, itemName: a.itemName, sid: a.sid, storeName: a.storeName,
        metric: `可售 ${a.availableDays} 天`, action: '断货风险: 尽快补货' });
    }
    if ((a.returnRate || 0) > 0.05) {
      acts.push({ kind: 'return', severity: 'p1', asin: a.asin, itemName: a.itemName, sid: a.sid, storeName: a.storeName,
        metric: `退款率 ${(a.returnRate * 100).toFixed(1)}%`, action: '退款过高: 排查质量/Listing' });
    }
  }
  const order = { p0: 0, p1: 1, p2: 2 };
  return acts.sort((x, y) => (order[x.severity] ?? 9) - (order[y.severity] ?? 9)).slice(0, 50);
}

// 多店并发聚合 + 按币种分组 + 全局派生。真实通路。
export async function computeAmazonProfit({ range = '30d', sid = null, thresholds = DEFAULT_THRESHOLDS } = {}) {
  const { startDate, endDate } = resolveDateRange(range);
  let sellers = await fetchActiveAmazonSellers();
  if (sid) sellers = sellers.filter((s) => String(s.sid) === String(sid));
  const { results: stores, errors } = await settleStores(sellers, (s) =>
    computeStoreAmazonProfit({ sid: s.sid, name: s.name, currencyCode: s.currencyCode, startDate, endDate }));
  const allAsins = [];
  for (const st of stores) {
    for (const a of st.asins) allAsins.push({ ...a, sid: st.sid, storeName: st.name });
  }
  return assembleDashboard({ range, startDate, endDate, stores, allAsins, thresholds, errors });
}

// ---- mock 兜底(无凭证/失败): 真实字段结构, 诚实标 sourceMeta.mock:true ----
function mockAsin(sid, storeName, i, currencyCode) {
  // 制造一个亏损/吞利样例(i===2)以覆盖前端风险清单渲染
  const loss = i === 2;
  const amount = loss ? 400 : 1000 + i * 350;
  const grossProfit = loss ? -120 : 180 + i * 60;
  const adSpend = loss ? 260 : 90 + i * 20;
  const adSalesAmount = loss ? 150 : 360 + i * 80;
  return {
    sid, storeName,
    asin: `B0MOCK${sid}${i}`,
    itemName: `${storeName} 示例商品 ${i + 1}`,
    currencyCode,
    amount: round2(amount),
    netAmount: round2(amount * 0.92),
    grossProfit: round2(grossProfit),
    grossMargin: amount > 0 ? round4(grossProfit / amount) : 0,
    roi: adSpend > 0 ? round4(grossProfit / adSpend) : 0,
    acos: adSalesAmount > 0 ? round4(adSpend / adSalesAmount) : 0,
    tacos: amount > 0 ? round4(adSpend / amount) : 0,
    adSpend: round2(adSpend),
    adSalesAmount: round2(adSalesAmount),
    adShare: amount > 0 ? round4(adSalesAmount / amount) : 0,
    volume: 20 + i * 8,
    sessions: 300 + i * 90,
    cvr: round4((20 + i * 8) / (300 + i * 90)),
    returnRate: round4(0.02 + i * 0.005),
    availableInventory: 120 - i * 10,
    availableDays: i === 1 ? 9 : (i === 3 ? 120 : 45 - i * 5), // i1 断货风险, i3 积压
    afnFulfillable: 120 - i * 10,
    afnInbound: 30 + i * 10,
    stockUpNum: i === 1 ? 200 : 0,
    inventoryValue: round2((120 - i * 10) * (180 + i * 20)),
    avgLandedPrice: round2(180 + i * 20),
    cateRank: 1000 + i * 250,
    amountChainRatio: round4(loss ? -0.18 : 0.05 + i * 0.02),
  };
}

export function mockAmazonProfit({ range = '30d', sid = null, thresholds = DEFAULT_THRESHOLDS, reason = 'lingxing_credentials_missing' } = {}) {
  const { startDate, endDate } = resolveDateRange(range);
  const sample = [
    { sid: '900001', name: '示例店铺 US-A', currencyCode: 'USD' },
    { sid: '900002', name: '示例店铺 US-B', currencyCode: 'USD' },
    { sid: '900003', name: '示例店铺 EU-DE', currencyCode: 'EUR' },
  ].filter((s) => !sid || String(s.sid) === String(sid));

  const stores = sample.map((s) => {
    const asins = [0, 1, 2, 3].map((i) => mockAsin(s.sid, s.name, i, s.currencyCode));
    const sum = (f) => asins.reduce((a, r) => a + r[f], 0);
    const amount = round2(sum('amount'));
    const grossProfit = round2(sum('grossProfit'));
    const adSpend = round2(sum('adSpend'));
    const adSalesAmount = round2(sum('adSalesAmount'));
    const m = recomputeStoreMetrics({ amount, grossProfit, adSpend, adSalesAmount });
    return {
      sid: s.sid, name: s.name, currencyCode: s.currencyCode,
      asinCount: asins.length,
      amount, netAmount: round2(sum('netAmount')), grossProfit,
      grossMargin: m.grossMargin, adSpend, adSalesAmount,
      acos: m.acos, tacos: m.tacos, roi: m.roi, adShare: m.adShare,
      volume: sum('volume'), sessions: sum('sessions'),
      cvr: round4(sum('volume') / Math.max(1, sum('sessions'))),
      avgStar: 4.5, returnRate: 0.03, health: m.health,
      asins,
    };
  });
  const allAsins = [];
  for (const st of stores) for (const a of st.asins) allAsins.push(a);
  const out = assembleDashboard({
    range, startDate, endDate, stores, allAsins, thresholds, errors: [],
    mockMeta: { source: 'lingxing-openapi', platform: 'Amazon', basis: 'productPerformance_asin', mock: true, reason, fetchedAt: new Date().toISOString() },
  });
  return out;
}

// 看板入口(对齐 tiktok getXxxDashboard 范式)。配置领星 -> 真实拉取; 否则/失败 -> mock 标注。
export async function getAmazonProfitDashboard(db, userId, storeId, { range = '30d', sid = null, thresholds } = {}) {
  const th = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  if (!isLingxingConfigured()) return mockAmazonProfit({ range, sid, thresholds: th });
  try {
    return await computeAmazonProfit({ range, sid, thresholds: th });
  } catch (err) {
    const mock = mockAmazonProfit({ range, sid, thresholds: th, reason: 'lingxing_fetch_failed' });
    mock.sourceMeta.error = String(err.message || err);
    return mock;
  }
}

export { isLingxingConfigured };
