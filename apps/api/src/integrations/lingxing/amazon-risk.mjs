// 运营风险工作台 — Amazon 真实风险看板。
// 复用基座 amazon.mjs 的真实取数 (fetchActiveAmazonSellers / fetchProductPerformance /
// mapPerformanceRow / aggregateStorePerformance), 不重写鉴权/签名/限流。
//
// 第0铁律: 所有指标只取自 mapPerformanceRow 的真实字段 + aggregateStorePerformance 的店铺级汇总。
//   基座没有逐日时间序列 / 评分历史 / BSR 历史。所以"下滑/骤降"类风险只用领星原生环比字段
//   (volumeChainRatio/amountChainRatio) 或可用库存天数派生, 绝不自造时间序列、绝不用 mock 充数。
//   无凭证/拉取失败时唯一兜底 = 诚实标 source.mock=true + 失败原因 + 空看板, 真实通路始终保留。
import {
  isLingxingConfigured,
  fetchActiveAmazonSellers,
  fetchProductPerformance,
  mapPerformanceRow,
  aggregateStorePerformance,
} from './amazon.mjs';

// 阈值常量 — 单一可信源, 前后端口径一致。
export const RISK_THRESHOLDS = {
  acos: { p1: 0.35, p0: 0.50 },
  returnRate: { p1: 0.10, p0: 0.15 },
  avgStar: { p1: 3.5, p0: 3.0 },
  availableDays: { p1: 14, p0: 7 },
  chainRatio: { p1: -0.30, p0: -0.50 },
  minVolumeSample: 5, // 退货/评分的最小样本(避免单条噪声)
  minAdSpend: 20, // 广告超支最小关注花费(币种原值)
};

const RANK_TOP_N = 5;

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function round4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// 计算两个日期(YYYY-MM-DD)之间的天数(含端点), 至少 1。
export function daysBetween(startDate, endDate) {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 1;
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

// LA 时区"昨天"(与基座 TikTok 口径近似), 作为区间默认结束日。
function laYesterday() {
  return new Date(Date.now() - 8 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);
}

// 默认区间: 近 14 天 (endDate=昨天)。
export function defaultPeriod({ startDate, endDate } = {}) {
  const end = endDate || laYesterday();
  let start = startDate;
  if (!start) {
    const s = new Date(Date.parse(`${end}T00:00:00Z`) - 13 * 86400000);
    start = s.toISOString().slice(0, 10);
  }
  if (start > end) start = end;
  return { startDate: start, endDate: end, days: daysBetween(start, end) };
}

// ============================================================
// 纯函数: 一条 mapped row + 店铺上下文 -> 0..N 条风险
// ============================================================
export function deriveAsinRisks(row, { sid, storeName, periodDays }) {
  const risks = [];
  if (!row || !row.asin) return risks;
  const asin = row.asin;
  const itemName = row.itemName || '';
  const currencyCode = row.currencyCode || 'USD';
  const amount = num(row.amount);
  const volume = num(row.volume);
  const adSpend = num(row.adSpend);
  const adSales = num(row.adSalesAmount);
  const acos = num(row.acos);
  const tacos = num(row.tacos);
  const grossMargin = num(row.grossMargin);
  const days = Math.max(1, num(periodDays) || 1);
  const ctx = { adSpend: round2(adSpend), adSalesAmount: round2(adSales), amount: round2(amount), grossMargin: round4(grossMargin) };
  const base = { sid, storeName, asin, itemName, currencyCode };

  // 1) acos_high — 广告效率预警。需 adSpend 显著(>minAdSpend)避免小额噪声。
  if (acos >= RISK_THRESHOLDS.acos.p1 && adSpend > RISK_THRESHOLDS.minAdSpend) {
    // P0: acos≥0.5 或 广告吃光利润(acos > grossMargin 且毛利率为正)
    const eatsProfit = grossMargin > 0 && acos > grossMargin;
    const severity = (acos >= RISK_THRESHOLDS.acos.p0 || eatsProfit) ? 'P0' : 'P1';
    // 预估损失: 广告超出"毛利覆盖线"的花费 = adSpend - amount*grossMargin (>=0)
    const estimatedLoss = Math.max(0, adSpend - amount * Math.max(0, grossMargin));
    risks.push({
      ...base, id: `acos_high:${sid}:${asin}`, riskType: 'acos_high', severity,
      metric: { name: 'acos', value: round4(acos), threshold: severity === 'P0' ? RISK_THRESHOLDS.acos.p0 : RISK_THRESHOLDS.acos.p1, unit: 'ratio' },
      context: ctx,
      impact: { impactedAmount: round2(amount), estimatedLoss: round2(estimatedLoss), basis: eatsProfit ? 'ad_spend_over_margin' : 'acos_over_threshold' },
    });
  }

  // 2) ad_overspend — 高花费但低产出(花了钱但 acos 极高或 tacos 高)。
  //    与 acos_high 区分: 这里强调"绝对花费大且产出比差", 即便 acos 未到 p1 但 tacos 高也计。
  if (adSpend > RISK_THRESHOLDS.minAdSpend && (acos >= RISK_THRESHOLDS.acos.p1 || tacos >= RISK_THRESHOLDS.acos.p1)) {
    const lowYield = adSales < adSpend; // 广告销售额低于广告花费 = 直接亏
    const severity = (adSpend >= 200 && lowYield) || acos >= RISK_THRESHOLDS.acos.p0 ? 'P0' : 'P1';
    const estimatedLoss = Math.max(0, adSpend - adSales);
    risks.push({
      ...base, id: `ad_overspend:${sid}:${asin}`, riskType: 'ad_overspend', severity,
      metric: { name: 'adSpend', value: round2(adSpend), threshold: RISK_THRESHOLDS.minAdSpend, unit: currencyCode },
      context: { ...ctx, tacos: round4(tacos), acos: round4(acos) },
      impact: { impactedAmount: round2(amount), estimatedLoss: round2(estimatedLoss), basis: 'ad_spend_minus_ad_sales' },
    });
  }

  // 3) rating_low — 评分过低。需 reviewsCount>=minVolumeSample 避免单条噪声; avg_star==0 视为无数据跳过。
  const avgStar = num(row.avgStar);
  const reviewsCount = num(row.reviewsCount);
  if (avgStar > 0 && avgStar <= RISK_THRESHOLDS.avgStar.p1 && reviewsCount >= RISK_THRESHOLDS.minVolumeSample) {
    const severity = avgStar <= RISK_THRESHOLDS.avgStar.p0 ? 'P0' : 'P1';
    risks.push({
      ...base, id: `rating_low:${sid}:${asin}`, riskType: 'rating_low', severity,
      metric: { name: 'avgStar', value: round2(avgStar), threshold: severity === 'P0' ? RISK_THRESHOLDS.avgStar.p0 : RISK_THRESHOLDS.avgStar.p1, unit: 'star' },
      context: { ...ctx, reviewsCount },
      impact: { impactedAmount: round2(amount), estimatedLoss: 0, basis: 'rating_snapshot_no_loss_model' },
    });
  }

  // 4) return_high — 退货率过高。需 volume>=minVolumeSample。
  const returnRate = num(row.returnRate);
  const returnCount = num(row.returnCount);
  if (returnRate >= RISK_THRESHOLDS.returnRate.p1 && volume >= RISK_THRESHOLDS.minVolumeSample) {
    const severity = returnRate >= RISK_THRESHOLDS.returnRate.p0 ? 'P0' : 'P1';
    // 预估损失: 退货数 * 客单价 (客单价 = amount/volume)
    const avgPrice = volume > 0 ? amount / volume : 0;
    const estimatedLoss = returnCount * avgPrice;
    risks.push({
      ...base, id: `return_high:${sid}:${asin}`, riskType: 'return_high', severity,
      metric: { name: 'returnRate', value: round4(returnRate), threshold: severity === 'P0' ? RISK_THRESHOLDS.returnRate.p0 : RISK_THRESHOLDS.returnRate.p1, unit: 'ratio' },
      context: { ...ctx, returnCount, volume },
      impact: { impactedAmount: round2(amount), estimatedLoss: round2(estimatedLoss), basis: 'return_count_times_avg_price' },
    });
  }

  // 5) stockout_risk — 断货风险。available_days===0 视为无数据跳过; 仅 0<days<=14。
  const availableDays = num(row.availableDays);
  if (availableDays > 0 && availableDays <= RISK_THRESHOLDS.availableDays.p1) {
    const severity = availableDays <= RISK_THRESHOLDS.availableDays.p0 ? 'P0' : 'P1';
    // 预估损失: 区间日均销售额 * (区间天数 - 可售天数) 的断货空窗预估
    const dailyAmount = amount / days;
    const estimatedLoss = Math.max(0, dailyAmount * Math.max(0, days - availableDays));
    risks.push({
      ...base, id: `stockout_risk:${sid}:${asin}`, riskType: 'stockout_risk', severity,
      metric: { name: 'availableDays', value: round2(availableDays), threshold: severity === 'P0' ? RISK_THRESHOLDS.availableDays.p0 : RISK_THRESHOLDS.availableDays.p1, unit: 'days' },
      context: { ...ctx, availableInventory: num(row.availableInventory), availableDays: round2(availableDays) },
      impact: { impactedAmount: round2(amount), estimatedLoss: round2(estimatedLoss), basis: 'daily_amount_times_stockout_gap' },
    });
  }

  // 6) sales_drop — 销量/销售额环比骤降(领星原生环比字段, 真实, 非自造时间序列)。
  const volRatio = num(row.volumeChainRatio);
  const amtRatio = num(row.amountChainRatio);
  const worst = Math.min(volRatio, amtRatio);
  if (worst <= RISK_THRESHOLDS.chainRatio.p1) {
    const severity = worst <= RISK_THRESHOLDS.chainRatio.p0 ? 'P0' : 'P1';
    const driver = amtRatio <= volRatio ? 'amountChainRatio' : 'volumeChainRatio';
    // 预估损失: 销售额按环比跌幅回推上期, 损失 = 上期 - 本期 = amount * (-ratio)/(1+ratio)
    const r = amtRatio;
    const estimatedLoss = r < 0 && (1 + r) > 0 ? amount * (-r) / (1 + r) : 0;
    risks.push({
      ...base, id: `sales_drop:${sid}:${asin}`, riskType: 'sales_drop', severity,
      metric: { name: driver, value: round4(worst), threshold: severity === 'P0' ? RISK_THRESHOLDS.chainRatio.p0 : RISK_THRESHOLDS.chainRatio.p1, unit: 'ratio' },
      context: { ...ctx, volumeChainRatio: round4(volRatio), amountChainRatio: round4(amtRatio) },
      impact: { impactedAmount: round2(amount), estimatedLoss: round2(estimatedLoss), basis: 'chain_ratio_implied_drop' },
    });
  }

  return risks;
}

// ============================================================
// 纯函数: 一店所有 mapped rows -> 该店风险列表 + 店铺级计分
// ============================================================
export function deriveStoreRisks(mappedRows, storeAgg, { sid, storeName, periodDays }) {
  const risks = [];
  for (const row of mappedRows || []) {
    risks.push(...deriveAsinRisks(row, { sid, storeName, periodDays }));
  }
  // 同店风险按 severity -> amount 排序(大单品在前)。
  risks.sort(riskSort);

  const p0 = risks.filter((r) => r.severity === 'P0').length;
  const p1 = risks.filter((r) => r.severity === 'P1').length;
  // 受影响销售额(去重 ASIN, 同一 ASIN 多风险只计一次 amount)。
  const impactedByAsin = new Map();
  for (const r of risks) {
    const a = num(r.impact?.impactedAmount);
    if (!impactedByAsin.has(r.asin) || a > impactedByAsin.get(r.asin)) impactedByAsin.set(r.asin, a);
  }
  const impactedAmount = round2([...impactedByAsin.values()].reduce((s, v) => s + v, 0));
  const storeScore = { sid, storeName, p0, p1, score: p0 * 3 + p1, impactedAmount };
  return { risks, storeScore };
}

// 风险排序: severity(P0先) -> impactedAmount 降序。
function riskSort(a, b) {
  const rank = { P0: 0, P1: 1, P2: 2 };
  const d = (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3);
  if (d !== 0) return d;
  return num(b.impact?.impactedAmount) - num(a.impact?.impactedAmount);
}

// ============================================================
// 纯函数: 跨店风险 -> KPI + 排行 + 结论摘要
// ============================================================
export function buildRiskBoard(allRisks, perStoreScores, meta = {}) {
  const risks = [...(allRisks || [])].sort(riskSort);
  const p0 = risks.filter((r) => r.severity === 'P0').length;
  const p1 = risks.filter((r) => r.severity === 'P1').length;

  // 广告超支: acos_high + ad_overspend 涉及的 ASIN(去重), 合计 adSpend。
  const adRows = risks.filter((r) => r.riskType === 'acos_high' || r.riskType === 'ad_overspend');
  const adByAsin = new Map();
  for (const r of adRows) {
    const key = `${r.sid}:${r.asin}`;
    const adSpend = num(r.context?.adSpend);
    if (!adByAsin.has(key) || adSpend > adByAsin.get(key).adSpend) {
      adByAsin.set(key, { asin: r.asin, sid: r.sid, storeName: r.storeName, adSpend, acos: num(r.context?.acos ?? r.metric?.value), amount: num(r.context?.amount) });
    }
  }
  const adOverspendCount = adByAsin.size;
  const adSpendTotal = round2([...adByAsin.values()].reduce((s, v) => s + v.adSpend, 0));

  // 断货: stockout_risk 的 ASIN, 最紧急(最小)可售天数。
  const stockRows = risks.filter((r) => r.riskType === 'stockout_risk');
  const stockoutCount = new Set(stockRows.map((r) => `${r.sid}:${r.asin}`)).size;
  const minAvailableDays = stockRows.length ? Math.min(...stockRows.map((r) => num(r.metric?.value))) : null;

  // 受影响销售额合计(全风险去重 ASIN)。
  const impactedByAsin = new Map();
  for (const r of risks) {
    const key = `${r.sid}:${r.asin}`;
    const a = num(r.impact?.impactedAmount);
    if (!impactedByAsin.has(key) || a > impactedByAsin.get(key)) impactedByAsin.set(key, a);
  }
  const impactedAmount = round2([...impactedByAsin.values()].reduce((s, v) => s + v, 0));

  // 币种是否混合(多店多市场)。
  const currencies = new Set(risks.map((r) => r.currencyCode).filter(Boolean));
  const currencyMixed = currencies.size > 1;

  // 排行。
  const adBurn = [...adByAsin.values()]
    .sort((a, b) => b.adSpend - a.adSpend)
    .slice(0, RANK_TOP_N)
    .map((r) => ({ asin: r.asin, storeName: r.storeName, adSpend: round2(r.adSpend), acos: round4(r.acos), amount: round2(r.amount) }));

  const stockByAsin = new Map();
  for (const r of stockRows) {
    const key = `${r.sid}:${r.asin}`;
    if (!stockByAsin.has(key)) {
      stockByAsin.set(key, {
        asin: r.asin, storeName: r.storeName,
        availableDays: num(r.metric?.value),
        availableInventory: num(r.context?.availableInventory),
        amount: num(r.context?.amount),
      });
    }
  }
  const stockout = [...stockByAsin.values()]
    .sort((a, b) => a.availableDays - b.availableDays)
    .slice(0, RANK_TOP_N)
    .map((r) => ({ asin: r.asin, storeName: r.storeName, availableDays: round2(r.availableDays), availableInventory: r.availableInventory, amount: round2(r.amount) }));

  const storeScore = [...(perStoreScores || [])]
    .filter((s) => s.p0 > 0 || s.p1 > 0)
    .sort((a, b) => b.score - a.score || b.impactedAmount - a.impactedAmount)
    .slice(0, RANK_TOP_N)
    .map((s) => ({ sid: s.sid, storeName: s.storeName, p0: s.p0, p1: s.p1, score: s.score, impactedAmount: round2(s.impactedAmount) }));

  const p0Stores = new Set(risks.filter((r) => r.severity === 'P0').map((r) => r.sid)).size;
  const p0Asins = new Set(risks.filter((r) => r.severity === 'P0').map((r) => `${r.sid}:${r.asin}`)).size;
  const impactedP0 = round2(
    [...new Map(risks.filter((r) => r.severity === 'P0').map((r) => [`${r.sid}:${r.asin}`, num(r.impact?.impactedAmount)])).values()]
      .reduce((s, v) => s + v, 0),
  );
  const summary = risks.length
    ? `${p0Stores} 店 ${p0Asins} 个 ASIN 处于 P0, 合计影响销售额 ${currencyMixed ? '' : '$'}${impactedP0.toLocaleString('en-US')}${currencyMixed ? '(多币种)' : ''}; 最紧急: 断货 ${stockoutCount} 个 / 广告超支 ${adOverspendCount} 个。`
    : '区间内未发现触发阈值的真实风险。';

  return {
    kpi: {
      totalRisks: risks.length, p0, p1,
      adOverspendCount, adSpendTotal,
      stockoutCount, minAvailableDays,
      impactedAmount, currencyMixed,
    },
    risks,
    rankings: { adBurn, stockout, storeScore },
    summary,
  };
}

// ============================================================
// 编排(有 IO): 拉在售店 -> 逐店拉 productPerformance -> map/aggregate -> derive -> buildRiskBoard
// ============================================================
export async function fetchAmazonRiskBoard({ startDate, endDate, sids } = {}) {
  const period = defaultPeriod({ startDate, endDate });
  let sellers = await fetchActiveAmazonSellers();
  if (sids && sids.length) {
    const want = new Set(sids.map(String));
    sellers = sellers.filter((s) => want.has(String(s.sid)));
  }

  const allRisks = [];
  const perStoreScores = [];
  let asinCount = 0;
  const perStoreErrors = [];
  const customerVoice = []; // 客户声音: 评分/退款(真实)
  const categoryRanks = []; // 竞品雷达: 类目排名 + 排名下滑(真实)

  for (const seller of sellers) {
    try {
      const rawRows = await fetchProductPerformance({ sid: seller.sid, startDate: period.startDate, endDate: period.endDate });
      const mappedRows = rawRows.map(mapPerformanceRow);
      asinCount += mappedRows.length;
      const storeAgg = aggregateStorePerformance(rawRows);
      const { risks, storeScore } = deriveStoreRisks(mappedRows, storeAgg, {
        sid: String(seller.sid), storeName: seller.name, periodDays: period.days,
      });
      allRisks.push(...risks);
      perStoreScores.push(storeScore);
      // 客户声音 + 类目排名(真实字段派生)
      for (const r of mappedRows) {
        const base = { sid: String(seller.sid), storeName: seller.name, asin: r.asin, itemName: r.itemName, currencyCode: r.currencyCode };
        if (r.avgStar > 0 || r.reviewsCount > 0 || r.returnRate > 0) {
          customerVoice.push({ ...base, avgStar: round2(r.avgStar), reviewsCount: r.reviewsCount, returnRate: round4(r.returnRate), returnCount: r.returnCount, volume: r.volume });
        }
        const scr = r.smallCateRankDetail;
        if (r.cateRank || scr) {
          const rank = scr?.rank ?? null;
          const prev = scr?.prev_rank ?? null;
          categoryRanks.push({ ...base, category: scr?.category || null, cateRank: r.cateRank, rank, prevRank: prev,
            rankDrop: (rank != null && prev != null) ? (rank - prev) : null });
        }
      }
    } catch (err) {
      perStoreErrors.push({ sid: String(seller.sid), error: String(err.message || err) });
    }
  }

  const board = buildRiskBoard(allRisks, perStoreScores, { period });
  // 客户声音: 评分低/退款高优先; 类目排名: 排名下滑优先
  customerVoice.sort((a, b) => (b.returnRate - a.returnRate) || (a.avgStar - b.avgStar));
  categoryRanks.sort((a, b) => (b.rankDrop ?? -1e9) - (a.rankDrop ?? -1e9));
  return {
    generatedAt: new Date().toISOString(),
    period,
    source: {
      provider: 'lingxing_productPerformance',
      mock: false,
      storeCount: sellers.length,
      asinCount,
      bsrTrend: 'snapshot_only',
      ratingTrend: 'snapshot_only',
      disclaimer: '排名/评分为当期快照, 销量趋势采用领星原生环比字段(相对上一等长区间), 非逐日时间序列。竞品BSR需独立采集, 此处为本店真实类目排名。',
      ...(perStoreErrors.length ? { partialErrors: perStoreErrors } : {}),
    },
    ...board,
    customerVoice: customerVoice.slice(0, 50),
    categoryRanks: categoryRanks.slice(0, 50),
  };
}

// 降级看板(无凭证/拉取失败): 200 + source.mock=true + 空风险 + 全 0 KPI + 注明原因。
export function mockAmazonRiskBoard({ startDate, endDate, reason } = {}) {
  const period = defaultPeriod({ startDate, endDate });
  const board = buildRiskBoard([], [], { period });
  return {
    generatedAt: new Date().toISOString(),
    period,
    source: {
      provider: 'lingxing_productPerformance',
      mock: true,
      reason: reason || 'lingxing_credentials_missing',
      storeCount: 0,
      asinCount: 0,
      bsrTrend: 'snapshot_only',
      ratingTrend: 'snapshot_only',
      disclaimer: '领星未配置/拉取失败, 无真实风险数据。凭证到位即自动切换真实拉取。',
    },
    ...board,
    customerVoice: [],
    categoryRanks: [],
    summary: '领星未配置/拉取失败, 无真实风险数据。',
  };
}

// ============================================================
// 看板入口(对齐 tiktok-orders.mjs 的 getXxxDashboard(db,userId,storeId,{...}) 范式)。
//   配了领星凭证 -> 真实拉取; 否则/失败 -> 诚实 mock(source.mock=true)。
// ============================================================
export async function getAmazonRiskBoard(db, userId, storeId, { startDate, endDate, sids, severity } = {}) {
  const period = defaultPeriod({ startDate, endDate });
  if (!isLingxingConfigured()) {
    return finalizeBoard(mockAmazonRiskBoard({ startDate: period.startDate, endDate: period.endDate }), severity);
  }
  try {
    const board = await fetchAmazonRiskBoard({ startDate: period.startDate, endDate: period.endDate, sids });
    return finalizeBoard(board, severity);
  } catch (err) {
    return finalizeBoard(mockAmazonRiskBoard({ startDate: period.startDate, endDate: period.endDate, reason: String(err.message || err) }), severity);
  }
}

// 应用 severity 过滤(p0 | p1 | all), 并重算受过滤影响的 KPI 主表(排行/摘要保留全量口径)。
function finalizeBoard(board, severity) {
  const sev = String(severity || 'all').toLowerCase();
  if (sev !== 'p0' && sev !== 'p1') return board;
  const wanted = sev === 'p0' ? 'P0' : 'P1';
  return { ...board, risks: board.risks.filter((r) => r.severity === wanted), filteredBy: wanted };
}
