// 领星 Amazon 每日监控日报 (M4) — 真实数据看板。
// 复用基座 amazon.mjs: fetchActiveAmazonSellers / fetchProductPerformance /
// mapPerformanceRow / aggregateStorePerformance。绝不重写鉴权/签名/限流。
//
// 设计铁律: 只用基座 mapPerformanceRow(131字段) + aggregateStorePerformance 能产出的
// 真实字段做「按店逐日 + 全局汇总 + 环比」。基座拿不到的(竞品BSR/告警/已挽回)继续走
// mock/local 通道并明确标 sourceMeta.mock:true, 绝不和真实区混淆。
//
// 限流硬约束: 基座 PP_MIN_INTERVAL_MS=2200ms 全局串行节流。多店多天必须串行 await,
// 不能 Promise.all 并发, 否则全打 code=3001008。本模块对 buildAmazonDailyReport 结果做
// 短 TTL 缓存(refresh=1 才穿透)。
import {
  fetchActiveAmazonSellers,
  fetchProductPerformance,
  aggregateStorePerformance,
  mapPerformanceRow,
  isLingxingConfigured,
} from './amazon.mjs';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟; 限流下重复请求直接命中缓存
const _cache = new Map(); // key -> { at, data }

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function round4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ---- 日期工具 ----
function todayUTC() { return new Date().toISOString().slice(0, 10); }
function enumerateDays(startDate, endDate) {
  const out = [];
  const s = new Date(startDate + 'T00:00:00Z');
  const e = new Date(endDate + 'T00:00:00Z');
  for (let d = s; d <= e && out.length < 92; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function daysBetween(startDate, endDate) {
  return enumerateDays(startDate, endDate).length;
}
// 等长上一区间 [prevStart, prevEnd]: 紧贴本区间之前、长度相同
function previousRange(startDate, endDate) {
  const len = daysBetween(startDate, endDate);
  const prevEnd = new Date(new Date(startDate + 'T00:00:00Z').getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (len - 1) * 86400000);
  return { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
}

// ---- 比率实算: 一律 sum 分子分母后相除(不对行/店级比率做简单平均, 避免小店稀释) ----
// stores: 已聚合的店级对象数组(含 amount/adSpend/grossProfit/volume/sessions/returnCount + avgStar*reviews)
function computeSummary(storeAggs) {
  const sum = (f) => storeAggs.reduce((a, s) => a + num(s[f]), 0);
  const amount = sum('gmv');
  const adSpend = sum('adSpend');
  const volume = sum('volume');
  const sessions = sum('sessions');
  const grossProfit = sum('grossProfit');
  const returnCount = sum('returnCount');
  // 加权评分: 用每店 avgStar * reviewsCount 回推
  const totalReviews = sum('reviewsCount');
  const avgStar = totalReviews > 0
    ? storeAggs.reduce((a, s) => a + num(s.avgStar) * num(s.reviewsCount), 0) / totalReviews
    : (storeAggs.length ? storeAggs.reduce((a, s) => a + num(s.avgStar), 0) / storeAggs.length : 0);
  // 货币: 跨店混币时不伪造统一 USD 总额, 取占比最高主币种并标注 mixed
  const currency = dominantCurrency(storeAggs);
  return {
    stores: storeAggs.length,
    asinCount: sum('asinCount'),
    volume,
    gmv: round2(amount),
    netAmount: round2(sum('netAmount')),
    adSpend: round2(adSpend),
    adSalesAmount: round2(sum('adSalesAmount')),
    acos: amount > 0 ? round4(adSpend / amount) : 0,
    grossProfit: round2(grossProfit),
    grossMargin: amount > 0 ? round4(grossProfit / amount) : 0,
    sessions,
    cvr: sessions > 0 ? round4(volume / sessions) : 0,
    avgStar: round2(avgStar),
    returnCount,
    returnRate: volume > 0 ? round4(returnCount / volume) : 0,
    currency,
  };
}

// 占比最高的币种; 多于一种则标 mixed:true
function dominantCurrency(storeAggs) {
  const tally = {};
  for (const s of storeAggs) {
    const c = s.currency || 'USD';
    tally[c] = (tally[c] || 0) + num(s.gmv);
  }
  const keys = Object.keys(tally);
  if (keys.length === 0) return 'USD';
  keys.sort((a, b) => tally[b] - tally[a]);
  return keys.length > 1 ? `${keys[0]}*` : keys[0]; // '*' 后缀提示混币, 前端可标注
}

// ---- 把基座 aggregate 摊平成店级行(供 summary 复算 + 前端 store 表) ----
function storeRowFromAggregate(seller, aggregate) {
  const reviewsCount = aggregate.rows.reduce((a, r) => a + num(r.reviewsCount), 0);
  return {
    sid: String(seller.sid),
    name: seller.name,
    region: seller.region || null,
    currency: seller.currencyCode || aggregate.rows[0]?.currencyCode || 'USD',
    asinCount: aggregate.asinCount,
    volume: aggregate.volume,
    gmv: aggregate.amount,
    netAmount: aggregate.netAmount,
    adSpend: aggregate.adSpend,
    adSalesAmount: aggregate.adSalesAmount,
    acos: aggregate.acos,
    grossProfit: aggregate.grossProfit,
    grossMargin: aggregate.grossMargin,
    sessions: aggregate.sessions,
    cvr: aggregate.cvr,
    avgStar: aggregate.avgStar,
    reviewsCount,
    returnCount: aggregate.returnCount,
    returnRate: aggregate.returnRate,
  };
}

// ============================================================
// 单店单区间: 拉行 -> 聚合 -> { store, aggregate, asins }
// ============================================================
export async function fetchStoreDaily({ sid, name, region, currency, startDate, endDate }) {
  const rows = await fetchProductPerformance({ sid, startDate, endDate, summaryField: 'asin' });
  const aggregate = aggregateStorePerformance(rows);
  const seller = { sid, name, region, currencyCode: currency };
  const store = storeRowFromAggregate(seller, aggregate);
  const asins = aggregate.rows.map((r) => ({
    sid: String(sid),
    storeName: name,
    ...r,
  }));
  return { store, aggregate, asins };
}

// ============================================================
// 多店并表(串行, 遵守限流): 每店 store 行 + 全局 summary + asins 扁平表
// ============================================================
export async function fetchMultiStoreDaily({ sellers, startDate, endDate }) {
  const stores = [];
  const asins = [];
  for (const seller of sellers) {
    // 串行 await — 不能 Promise.all, 否则触发限流 3001008
    const { store, asins: storeAsins } = await fetchStoreDaily({
      sid: seller.sid, name: seller.name, region: seller.region,
      currency: seller.currencyCode, startDate, endDate,
    });
    stores.push(store);
    asins.push(...storeAsins);
  }
  const summary = computeSummary(stores);
  return { stores, asins, summary };
}

// ============================================================
// 环比: 本区间 vs 等长上一区间, 产出 *DeltaPct / *Delta
// ============================================================
function pctDelta(cur, prev) {
  const c = num(cur);
  const p = num(prev);
  if (p === 0) return c === 0 ? 0 : null; // 无对比基数
  return round2(((c - p) / Math.abs(p)) * 100);
}
function ratioDelta(cur, prev) {
  // 比率类(acos/returnRate)以百分点差(*100)表达; 评分以原值差
  return round2((num(cur) - num(prev)) * 100);
}

// 给一组店级行 + summary 计算 delta(对比 prev 同口径)
function attachStoreDeltas(curStores, prevStores) {
  const prevBySid = new Map(prevStores.map((s) => [s.sid, s]));
  for (const s of curStores) {
    const p = prevBySid.get(s.sid) || {};
    s.gmvDeltaPct = pctDelta(s.gmv, p.gmv);
    s.unitsDeltaPct = pctDelta(s.volume, p.volume);
    s.adSpendDeltaPct = pctDelta(s.adSpend, p.adSpend);
    s.acosDelta = ratioDelta(s.acos, p.acos);
    s.ratingDelta = round2(num(s.avgStar) - num(p.avgStar));
    s.returnRateDelta = ratioDelta(s.returnRate, p.returnRate);
  }
}
function summaryDelta(cur, prev) {
  return {
    gmvDeltaPct: pctDelta(cur.gmv, prev.gmv),
    unitsDeltaPct: pctDelta(cur.volume, prev.volume),
    adSpendDeltaPct: pctDelta(cur.adSpend, prev.adSpend),
    acosDelta: ratioDelta(cur.acos, prev.acos),
    ratingDelta: round2(num(cur.avgStar) - num(prev.avgStar)),
    returnRateDelta: ratioDelta(cur.returnRate, prev.returnRate),
  };
}

// ============================================================
// 派生层: 排行 + 风险 + headline (纯真实字段, 阈值见设计 §3)
// ============================================================
const RISK_THRESHOLDS = {
  acosHigh: 0.35,
  grossMarginLow: 0.05,
  returnRateHigh: 0.05,
  avgStarLow: 4.0,
  availableDaysLow: 14,
  chainDrop: -0.3,
};

export function deriveInsights({ stores, asins, summary }) {
  const topN = (arr, key, dir = 'desc', scopeFields) => {
    const sorted = [...arr].sort((a, b) => dir === 'desc' ? num(b[key]) - num(a[key]) : num(a[key]) - num(b[key]));
    return sorted.slice(0, 5).map(scopeFields);
  };
  const storeScope = (key) => (s) => ({ scope: 'store', sid: s.sid, name: s.name, value: round4(num(s[key])) });
  const asinScope = (key) => (a) => ({ scope: 'asin', sid: a.sid, asin: a.asin, name: a.itemName || a.asin, value: round4(num(a[key])) });

  const rankings = {
    gmvTop: topN(stores, 'gmv', 'desc', storeScope('gmv')),
    volumeTop: topN(stores, 'volume', 'desc', storeScope('volume')),
    adSpendTop: topN(stores, 'adSpend', 'desc', storeScope('adSpend')),
    highAcosTop: topN(stores.filter((s) => num(s.gmv) > 0), 'acos', 'desc', storeScope('acos')),
    grossProfitTop: topN(stores, 'grossProfit', 'desc', storeScope('grossProfit')),
    growthTop: topN(stores.filter((s) => s.gmvDeltaPct != null), 'gmvDeltaPct', 'desc', storeScope('gmvDeltaPct')),
    declineTop: topN(stores.filter((s) => s.gmvDeltaPct != null), 'gmvDeltaPct', 'asc', storeScope('gmvDeltaPct')),
  };

  const risks = [];
  for (const s of stores) {
    if (num(s.gmv) > 0 && num(s.acos) > RISK_THRESHOLDS.acosHigh) {
      risks.push({ level: 'P1', type: 'acos_high', scope: 'store', sid: s.sid, name: s.name,
        metric: 'acos', value: round4(s.acos), threshold: RISK_THRESHOLDS.acosHigh,
        message: `${s.name} ACOS ${(s.acos * 100).toFixed(0)}% 超 ${RISK_THRESHOLDS.acosHigh * 100}% 阈值, 毛利承压` });
    }
    if (num(s.gmv) > 0 && (num(s.grossProfit) < 0 || num(s.grossMargin) < RISK_THRESHOLDS.grossMarginLow)) {
      risks.push({ level: 'P1', type: 'margin_negative', scope: 'store', sid: s.sid, name: s.name,
        metric: 'grossMargin', value: round4(s.grossMargin), threshold: RISK_THRESHOLDS.grossMarginLow,
        message: `${s.name} 毛利率 ${(s.grossMargin * 100).toFixed(1)}% 偏低/转负` });
    }
    if (num(s.returnRate) > RISK_THRESHOLDS.returnRateHigh) {
      risks.push({ level: 'P2', type: 'return_high', scope: 'store', sid: s.sid, name: s.name,
        metric: 'returnRate', value: round4(s.returnRate), threshold: RISK_THRESHOLDS.returnRateHigh,
        message: `${s.name} 退款率 ${(s.returnRate * 100).toFixed(1)}% 超 ${RISK_THRESHOLDS.returnRateHigh * 100}%` });
    }
    if (num(s.reviewsCount) > 0 && num(s.avgStar) > 0 && num(s.avgStar) < RISK_THRESHOLDS.avgStarLow) {
      risks.push({ level: 'P2', type: 'rating_low', scope: 'store', sid: s.sid, name: s.name,
        metric: 'avgStar', value: round2(s.avgStar), threshold: RISK_THRESHOLDS.avgStarLow,
        message: `${s.name} 评分 ${num(s.avgStar).toFixed(2)} 低于 ${RISK_THRESHOLDS.avgStarLow}` });
    }
    if (s.gmvDeltaPct != null && num(s.gmvDeltaPct) < RISK_THRESHOLDS.chainDrop * 100) {
      risks.push({ level: 'P1', type: 'gmv_drop', scope: 'store', sid: s.sid, name: s.name,
        metric: 'gmvDeltaPct', value: round2(s.gmvDeltaPct), threshold: RISK_THRESHOLDS.chainDrop * 100,
        message: `${s.name} GMV 环比急跌 ${num(s.gmvDeltaPct).toFixed(0)}%` });
    }
  }
  // ASIN 级断货 + 急跌 + 毛利转负
  for (const a of asins) {
    if (num(a.availableDays) > 0 && num(a.availableDays) < RISK_THRESHOLDS.availableDaysLow) {
      risks.push({ level: 'P2', type: 'stockout_risk', scope: 'asin', sid: a.sid, asin: a.asin, name: a.itemName || a.asin,
        metric: 'availableDays', value: num(a.availableDays), threshold: RISK_THRESHOLDS.availableDaysLow,
        message: `${a.asin} 可售仅 ${num(a.availableDays)} 天, 断货风险` });
    }
    if (num(a.amountChainRatio) < RISK_THRESHOLDS.chainDrop || num(a.volumeChainRatio) < RISK_THRESHOLDS.chainDrop) {
      const ratio = Math.min(num(a.amountChainRatio), num(a.volumeChainRatio));
      risks.push({ level: 'P1', type: 'asin_drop', scope: 'asin', sid: a.sid, asin: a.asin, name: a.itemName || a.asin,
        metric: 'amountChainRatio', value: round4(ratio), threshold: RISK_THRESHOLDS.chainDrop,
        message: `${a.asin} 环比急跌 ${(ratio * 100).toFixed(0)}%` });
    }
    if (num(a.amount) > 0 && num(a.grossProfit) < 0) {
      risks.push({ level: 'P1', type: 'margin_negative', scope: 'asin', sid: a.sid, asin: a.asin, name: a.itemName || a.asin,
        metric: 'grossProfit', value: round2(a.grossProfit), threshold: 0,
        message: `${a.asin} 毛利转负` });
    }
  }
  // P1 优先排序
  risks.sort((x, y) => (x.level === 'P1' ? 0 : 1) - (y.level === 'P1' ? 0 : 1));

  const headline = buildHeadline({ stores, summary, rankings, risks });
  return { headline, rankings, risks };
}

function buildHeadline({ stores, summary, rankings, risks }) {
  const cur = summary.currency || 'USD';
  const parts = [];
  const deltaStr = summary.delta && summary.delta.gmvDeltaPct != null
    ? ` (环比 ${summary.delta.gmvDeltaPct > 0 ? '+' : ''}${summary.delta.gmvDeltaPct}%)` : '';
  parts.push(`${summary.stores} 店今日 GMV ${cur} ${Math.round(num(summary.gmv)).toLocaleString('en-US')}${deltaStr}`);
  const acosRisk = risks.find((r) => r.type === 'acos_high');
  if (acosRisk) parts.push(`${acosRisk.name} 高 ACOS 拉高整体广告占比`);
  const drop = rankings.declineTop && rankings.declineTop[0];
  if (drop && num(drop.value) < 0) parts.push(`${drop.name} 环比 ${num(drop.value).toFixed(0)}% 需关注`);
  return parts.join('; ') + '。';
}

// ============================================================
// 区间逐日趋势: 对 [start..end] 每天发单日请求, 拼 dailySeries (全局聚合)
// ============================================================
export async function fetchDailySeries({ sellers, startDate, endDate }) {
  const days = enumerateDays(startDate, endDate);
  const series = [];
  for (const day of days) {
    // 串行: 每天对每店发单日请求(start===end)
    const stores = [];
    for (const seller of sellers) {
      const rows = await fetchProductPerformance({ sid: seller.sid, startDate: day, endDate: day, summaryField: 'asin' });
      stores.push(storeRowFromAggregate(seller, aggregateStorePerformance(rows)));
    }
    const s = computeSummary(stores);
    series.push({
      date: day, volume: s.volume, gmv: s.gmv, adSpend: s.adSpend,
      acos: s.acos, grossProfit: s.grossProfit, avgStar: s.avgStar,
      sessions: s.sessions, returnRate: s.returnRate,
    });
  }
  return series;
}

// ---- sourceMeta: 真实区 mock:false; 基座拿不到的标 mock:true ----
function buildSourceMeta(mock, reason) {
  const real = (extra = {}) => ({ mock, provider: mock ? 'unavailable' : 'lingxing', ...(mock && reason ? { reason } : {}), ...extra });
  return {
    sales: real({ route: 'productPerformance' }),
    gmv: real(),
    adSpend: real(),
    grossProfit: real(),
    sessions: real(),
    rating: real(),
    returnRate: real(),
    // 基座拿不到 — 永远标 mock:true, 不混入真实区
    competitorBsr: { mock: true, provider: 'pseudo_random' },
    alerts: { mock: true, provider: 'local' },
    recovered: { mock: true, provider: 'simulated' },
  };
}

// ============================================================
// mock 兜底 (无凭证/失败): 诚实标 mock:true + 失败原因, 数值置 0, 不造假
// ============================================================
export function mockAmazonDailyReport({ startDate, endDate, dimension, reason }) {
  const range = { startDate, endDate, days: daysBetween(startDate, endDate) };
  const summary = {
    stores: 0, asinCount: 0, volume: 0, gmv: 0, netAmount: 0,
    adSpend: 0, adSalesAmount: 0, acos: 0, grossProfit: 0, grossMargin: 0,
    sessions: 0, cvr: 0, avgStar: 0, returnCount: 0, returnRate: 0, currency: 'USD',
    delta: { gmvDeltaPct: null, unitsDeltaPct: null, adSpendDeltaPct: null, acosDelta: 0, ratingDelta: 0, returnRateDelta: 0 },
  };
  return {
    reportDate: endDate,
    range,
    dimension,
    generatedAt: new Date().toISOString(),
    configured: false,
    error: reason || 'lingxing_not_configured',
    availableStores: [],
    filters: { sids: 'all', dimension, realDataOnly: false },
    summary,
    stores: [],
    asins: [],
    dailySeries: [],
    insights: { headline: '领星凭证未配置, 暂无真实 Amazon 数据。', rankings: {}, risks: [] },
    sourceMeta: buildSourceMeta(true, reason || 'lingxing_not_configured'),
  };
}

// ============================================================
// 顶层编排: 被路由直接调用, 组装完整契约 + sourceMeta + 缓存
// ============================================================
export async function buildAmazonDailyReport(db, userId, storeId, {
  sids = 'all', startDate, endDate, dimension = 'store', refresh = false,
} = {}) {
  const end = endDate || todayUTC();
  let start = startDate || end;
  if (start > end) start = end;
  const dim = dimension === 'asin' ? 'asin' : 'store';

  if (!isLingxingConfigured()) {
    return mockAmazonDailyReport({ startDate: start, endDate: end, dimension: dim, reason: 'lingxing_not_configured' });
  }

  const cacheKey = `${sids}|${start}|${end}|${dim}`;
  if (!refresh) {
    const hit = _cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  }

  let sellers;
  try {
    sellers = await fetchActiveAmazonSellers();
  } catch (err) {
    const mock = mockAmazonDailyReport({ startDate: start, endDate: end, dimension: dim, reason: String(err.message || err) });
    mock.configured = true;
    return mock;
  }

  // sids 过滤
  if (sids && sids !== 'all') {
    const wanted = new Set(String(sids).split(',').map((x) => x.trim()).filter(Boolean));
    sellers = sellers.filter((s) => wanted.has(String(s.sid)));
  }
  let result;
  try {
    // 本区间多店并表(主体, 失败则整体降级)
    const { stores, asins, summary } = await fetchMultiStoreDaily({ sellers, startDate: start, endDate: end });
    // 环比: 等长上一区间(非主体, 失败不阻断 — 仅留空 delta)
    try {
      const prev = previousRange(start, end);
      const prevAgg = await fetchMultiStoreDaily({ sellers, startDate: prev.startDate, endDate: prev.endDate });
      attachStoreDeltas(stores, prevAgg.stores);
      summary.delta = summaryDelta(summary, prevAgg.summary);
    } catch { /* 环比不可得, 主体仍有效 */ }
    // 逐日趋势: 请求量大(天数×店数)易触发限流, 仅在请求总量可控时拉, 失败留空不阻断。
    let dailySeries = [];
    const days = daysBetween(start, end);
    if (days * sellers.length <= 120) {
      try { dailySeries = await fetchDailySeries({ sellers, startDate: start, endDate: end }); } catch { dailySeries = []; }
    }

    const insights = deriveInsights({ stores, asins, summary });

    result = {
      reportDate: end,
      range: { startDate: start, endDate: end, days: daysBetween(start, end) },
      dimension: dim,
      generatedAt: new Date().toISOString(),
      configured: true,
      availableStores: sellers.map((s) => ({ sid: String(s.sid), name: s.name, region: s.region, currency: s.currencyCode, status: s.status })),
      filters: { sids, dimension: dim, realDataOnly: true },
      summary,
      stores,
      asins,
      dailySeries,
      insights,
      sourceMeta: buildSourceMeta(false),
    };
  } catch (err) {
    // 拉取失败(限流/接口错误) — 诚实降级
    const mock = mockAmazonDailyReport({ startDate: start, endDate: end, dimension: dim, reason: String(err.message || err) });
    mock.configured = true;
    mock.availableStores = sellers.map((s) => ({ sid: String(s.sid), name: s.name, region: s.region, currency: s.currencyCode, status: s.status }));
    return mock;
  }

  _cache.set(cacheKey, { at: Date.now(), data: result });
  return result;
}

// 测试可用: 清缓存
export function _clearAmazonDailyCache() { _cache.clear(); }

// ---- 测试导出 (纯函数, 供单测聚合/环比/契约) ----
export const _internals = {
  computeSummary, attachStoreDeltas, summaryDelta, previousRange,
  enumerateDays, daysBetween, storeRowFromAggregate, pctDelta, ratioDelta,
};
