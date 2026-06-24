// 领星 Amazon 数据基座 — 店铺列表 + productPerformance 拉取 + 字段映射。
// 三大模块(每日监控日报/运营风险工作台/经营利润工作台)共用此基座取真实 Amazon 数据。
// 已对真实领星接口验证: seller/lists 返回 22 店; productPerformance 返回 131 字段。
import { signedRequest, isLingxingConfigured } from './client.mjs';

export const SELLER_LIST_ROUTE = '/erp/sc/data/seller/lists';
export const PRODUCT_PERFORMANCE_ROUTE = '/bd/productPerformance/openApi/asinList';
export const PP_PAGE_SIZE = 200;
// productPerformance 严格限流(实测 code=3001008 "请求过于频繁")。请求间隔 + 指数退避。
const PP_MIN_INTERVAL_MS = 2200;
const RATE_LIMIT_BACKOFF_MS = [3000, 5000, 8000, 12000];
let _lastPpAt = 0;

export { isLingxingConfigured };

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 带限流退避的 productPerformance 单次请求
async function ppRequest(body) {
  const wait = PP_MIN_INTERVAL_MS - (Date.now() - _lastPpAt);
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; ; attempt++) {
    _lastPpAt = Date.now();
    const res = await signedRequest(PRODUCT_PERFORMANCE_ROUTE, { method: 'POST', body });
    // 限流码: 3001008("请求过于频繁") 与 103(QPS 超限) 都退避重试。
    if ((String(res.code) === '3001008' || String(res.code) === '103') && attempt < RATE_LIMIT_BACKOFF_MS.length) {
      await sleep(RATE_LIMIT_BACKOFF_MS[attempt]);
      continue;
    }
    return res;
  }
}

// 拉 Amazon 店铺列表 -> [{sid, name, marketplace, region, country, currencyCode, status}]
export async function fetchAmazonSellers() {
  const res = await signedRequest(SELLER_LIST_ROUTE, { method: 'POST', body: {} });
  if (String(res.code) !== '0') throw new Error(`lingxing_seller_list_failed code=${res.code} msg=${res.message || ''}`);
  return (res.data || []).map((s) => ({
    sid: String(s.sid),
    name: s.name || s.seller_name || `店铺${s.sid}`,
    marketplace: s.marketplace || s.mid || null,
    region: s.region || null,
    country: s.country || s.country_code || null,
    currencyCode: s.currency_code || null,
    status: Number(s.status),
  }));
}

// 是否美国店铺(名称含 -US, 或 country/marketplace 标 US)。
export function isUsSeller(s) {
  const name = String(s.name || '');
  if (/-\s*US\b/i.test(name) || /\bUS$/i.test(name.trim())) return true;
  const c = String(s.country || s.marketplace || '').toUpperCase();
  return c === 'US' || c === 'USA' || c.includes('美国');
}

// 在售店铺。业务聚焦【美国店】: 实测有销售数据的店全是 -US 且 status=1。
// 默认返回 美国 + status===1; includeAll 拿全部; usOnly=false 关闭美国过滤(保留多站点能力)。
export async function fetchActiveAmazonSellers({ includeAll = false, usOnly = true } = {}) {
  const all = await fetchAmazonSellers();
  if (includeAll) return all;
  let list = all.filter((s) => s.status === 1);
  if (usOnly) list = list.filter(isUsSeller);
  return list;
}

// 快照服务模式: 设置后, fetchProductPerformance 直接返回本地快照行, 不打领星接口(页面秒开)。
// 由路由层在调用三模块前 setSnapshotServer(rowsBySid), 调用后 clearSnapshotServer()。
let _snapshotBySid = null;
export function setSnapshotServer(bySid) { _snapshotBySid = bySid || null; }
export function clearSnapshotServer() { _snapshotBySid = null; }
export function isSnapshotServing() { return _snapshotBySid != null; }

// 拉单店 productPerformance(区间, asin 维度, 分页全量) -> 原始行数组
export async function fetchProductPerformance({ sid, startDate, endDate, summaryField = 'asin' }) {
  // 快照模式: 直接返回该 sid 的快照行(区间由快照决定, 模块照常 mapPerformanceRow)。
  if (_snapshotBySid) return _snapshotBySid[String(sid)] || [];
  const rows = [];
  let offset = 0;
  for (let guard = 0; guard < 100; guard++) {
    const body = {
      sid: String(sid), start_date: startDate, end_date: endDate,
      summary_field: summaryField, purchase_status: 0, is_recently_enum: 'true',
      offset, length: PP_PAGE_SIZE,
    };
    const res = await ppRequest(body);
    if (String(res.code) !== '0') throw new Error(`lingxing_pp_failed sid=${sid} code=${res.code} msg=${res.message || ''}`);
    const list = Array.isArray(res.data) ? res.data : (res.data?.list || []);
    rows.push(...list);
    if (list.length < PP_PAGE_SIZE) break;
    offset += PP_PAGE_SIZE;
  }
  return rows;
}

// 把 productPerformance 原始行映射为统一指标对象(日报/利润/风险共用)。
// 字段名来自真实接口验证(131 字段, 见 tmp/lobster/amazon-api-spec.json)。
export function mapPerformanceRow(row) {
  return {
    asin: row.asins?.[0]?.asin || row.asin || null,
    itemName: row.item_name || row.local_name || '',
    currencyCode: row.currency_code || 'USD',
    // 销售
    volume: num(row.volume),
    amount: num(row.amount),                 // GMV / 销售额
    netAmount: num(row.net_amount),          // 净销售额
    orderItems: num(row.order_items),
    // 广告
    adSpend: num(row.spend),
    adSalesAmount: num(row.ad_sales_amount),
    acos: num(row.acos),
    tacos: num(row.tacos),
    adOrderQuantity: num(row.ad_order_quantity),
    // 利润
    grossProfit: num(row.gross_profit),
    grossMargin: num(row.gross_margin),
    roi: num(row.roi),
    // 流量/转化
    sessions: num(row.sessions_total ?? row.sessions),
    pageViews: num(row.page_views_total ?? row.page_views),
    cvr: num(row.cvr),
    ctr: num(row.ctr),
    buyBoxPercentage: num(row.buy_box_percentage),
    // 评价/退货
    avgStar: num(row.avg_star),
    reviewsCount: num(row.reviews_count),
    returnRate: num(row.return_rate),
    returnCount: num(row.return_count),
    // 排名/库存(available_inventory 是嵌套对象 {available_inventory:N})
    cateRank: row.cate_rank ?? null,
    smallCateRank: row.small_cate_rank ?? null,
    availableInventory: num(row.available_inventory?.available_inventory ?? row.available_inventory),
    availableDays: num(row.available_days),
    afnFulfillable: num(row.afn_fulfillable_quantity),
    afnInbound: num(row.afn_total_inbound ?? row.afn_inbound_working_quantity),
    afnReserved: num(row.afn_reserved_quantity),
    stockUpNum: num(row.stock_up_num),
    inventoryTurnoverDays: num(row.inventory_turnover_days),
    // 采购成本/货值(资金占用视角)。whs_value/cg_price 此接口常为 null,
    // 用 可售库存 × 平均到岸价(avg_landed_price)估算库存资金占用。
    avgLandedPrice: num(row.avg_landed_price),
    inventoryValue: num(row.available_inventory?.available_inventory ?? row.available_inventory) * num(row.avg_landed_price),
    suppliers: row.suppliers ?? null,
    // 类目排名(含前值, 判断排名下滑): small_cate_rank=[{category,rank,prev_rank}]
    smallCateRankDetail: Array.isArray(row.small_cate_rank) ? row.small_cate_rank[0] : null,
    // 环比
    volumeChainRatio: num(row.volume_chain_ratio),
    amountChainRatio: num(row.amount_chain_ratio),
  };
}

// 把一店区间的所有 asin 行聚合成店铺级汇总指标
export function aggregateStorePerformance(rows) {
  const mapped = rows.map(mapPerformanceRow);
  const sum = (f) => mapped.reduce((a, r) => a + (r[f] || 0), 0);
  const amount = sum('amount');
  const adSpend = sum('adSpend');
  const adSales = sum('adSalesAmount');
  const sessions = sum('sessions');
  const volume = sum('volume');
  const grossProfit = sum('grossProfit');
  // 加权评分(按 reviewsCount)
  const totalReviews = sum('reviewsCount');
  const avgStar = totalReviews > 0
    ? mapped.reduce((a, r) => a + r.avgStar * r.reviewsCount, 0) / totalReviews
    : (mapped.length ? mapped.reduce((a, r) => a + r.avgStar, 0) / mapped.length : 0);
  return {
    asinCount: mapped.length,
    volume,
    amount: round2(amount),
    netAmount: round2(sum('netAmount')),
    adSpend: round2(adSpend),
    adSalesAmount: round2(adSales),
    acos: amount > 0 ? round4(adSpend / amount) : 0,         // 实算 ACOS(广告花费/销售额)
    grossProfit: round2(grossProfit),
    grossMargin: amount > 0 ? round4(grossProfit / amount) : 0,
    sessions,
    cvr: sessions > 0 ? round4(volume / sessions) : 0,
    avgStar: round2(avgStar),
    returnCount: sum('returnCount'),
    returnRate: volume > 0 ? round4(sum('returnCount') / volume) : 0,
    rows: mapped,
  };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function round4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
