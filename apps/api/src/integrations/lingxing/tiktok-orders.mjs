// 领星 TikTok 订单明细 -> 过滤样品/赠品 -> 按天×店铺重算"真实销售"。
// 已对真实订单验证: order_tag tag_no='4-79'(样品订单) = 送达人/联盟样品(减价$0);
// 这些订单被 saleStat 算进销量导致数字偏高。本模块剔除它们 + 零价商品项, 得真实成交。
import { signedRequest } from './client.mjs';
import { TIKTOK_STORES } from './tiktok-sync.mjs';

const SYSTEM_ORDER_ROUTE = '/pb/mp/order/v2/list';
const PLATFORM_CODE = 10011;
const PAGE_SIZE = 200; // 系统订单 length>=20; 用 200 提高吞吐
const SAMPLE_TAG_NO = '4-79'; // "样品订单"标签 = 达人/联盟样品

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// 某天(LA)的 UTC 时间戳窗口 [start, end]
function laDayWindow(date) {
  // date = 'YYYY-MM-DD'。LA = UTC-8(不处理夏令时差异, 与 saleStat 同口径近似)。
  const startMs = Date.parse(date + 'T00:00:00-08:00');
  const endMs = Date.parse(date + 'T23:59:59-08:00');
  return [Math.floor(startMs / 1000), Math.floor(endMs / 1000)];
}

function enumerateDays(startDate, endDate) {
  const out = [];
  const s = new Date(startDate + 'T00:00:00Z');
  const e = new Date(endDate + 'T00:00:00Z');
  for (let d = s; d <= e; d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

// 是否样品订单(送达人/联盟): order_tag 含 tag_no=4-79
export function isSampleOrder(order) {
  const tags = order?.order_tag;
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => String(t?.tag_no) === SAMPLE_TAG_NO);
}

// 拉一个区间的全部系统订单(分页)。按 purchase 时间归集到 LA 日。
async function fetchOrders({ startTs, endTs, sids }) {
  const orders = [];
  let offset = 0;
  for (let guard = 0; guard < 200; guard++) {
    const body = {
      offset, length: PAGE_SIZE,
      date_type: 'global_purchase_time', // 按下单时间(与销售日界一致)
      start_time: startTs, end_time: endTs,
      store_id: sids, platform_code: [PLATFORM_CODE],
    };
    const res = await signedRequest(SYSTEM_ORDER_ROUTE, { method: 'POST', body });
    if (String(res.code) !== '0') {
      throw new Error(`lingxing_order_list_failed code=${res.code} msg=${res.message || ''}`);
    }
    const data = res.data || {};
    const rows = data.list || [];
    orders.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return orders;
}

// 把订单归集为 { date: { storeId: {revenue, volume, sampleOrders} } } (剔除样品订单 + 零价项)
function aggregateRealSales(orders) {
  const byDay = {}; // date -> storeId -> {revenue, volume, sampleOrders, paidOrders}
  for (const o of orders) {
    const ts = num(o.global_purchase_time);
    if (!ts) continue;
    // 归到 LA 日 (UTC-8)
    const day = new Date((ts - 8 * 3600) * 1000).toISOString().slice(0, 10);
    const storeId = String(o.store_id || '');
    byDay[day] = byDay[day] || {};
    const cell = (byDay[day][storeId] = byDay[day][storeId] || { revenue: 0, volume: 0, sampleOrders: 0, paidOrders: 0 });
    if (isSampleOrder(o)) { cell.sampleOrders += 1; continue; }
    let orderHadPaid = false;
    for (const it of (o.item_info || [])) {
      const unit = num(it.unit_price_amount);
      const itemAmount = num(it.item_price_amount);
      if (unit <= 0 || itemAmount <= 0) continue; // 零价赠品项剔除
      const qty = Math.round(itemAmount / unit);
      cell.revenue += itemAmount;
      cell.volume += qty;
      orderHadPaid = true;
    }
    if (orderHadPaid) cell.paidOrders += 1;
  }
  return byDay;
}

function laYesterday() {
  const la = new Date(Date.now() - 8 * 3600 * 1000 - 24 * 3600 * 1000);
  return la.toISOString().slice(0, 10);
}

// 真实销售区间看板: 拉订单 -> 过滤 -> 逐日×店铺。结构对齐 tiktok-sync 的 range, 便于前端复用。
export async function fetchTikTokRealSalesRange({ startDate, endDate } = {}) {
  const end = endDate || laYesterday();
  const start = startDate || end;
  const sids = TIKTOK_STORES.map((s) => s.storeId);
  const [startTs] = laDayWindow(start);
  const [, endTs] = laDayWindow(end);
  const orders = await fetchOrders({ startTs, endTs, sids });
  const byDay = aggregateRealSales(orders);

  let rangeRevenue = 0;
  let rangeVolume = 0;
  let rangeSampleOrders = 0;
  const days = enumerateDays(start, end).map((day) => {
    const cells = byDay[day] || {};
    let dayRevenue = 0;
    let dayVolume = 0;
    let daySamples = 0;
    const stores = TIKTOK_STORES.map((s) => {
      const c = cells[s.storeId] || { revenue: 0, volume: 0, sampleOrders: 0 };
      dayRevenue += c.revenue; dayVolume += c.volume; daySamples += c.sampleOrders;
      return { storeId: s.storeId, storeName: s.storeName, revenue: round2(c.revenue), volume: c.volume, sampleOrders: c.sampleOrders };
    }).filter((s) => s.revenue > 0 || s.volume > 0 || s.sampleOrders > 0);
    rangeRevenue += dayRevenue; rangeVolume += dayVolume; rangeSampleOrders += daySamples;
    return { date: day, storeCount: stores.length, totalRevenue: round2(dayRevenue), totalVolume: dayVolume, sampleOrders: daySamples, stores };
  });
  days.reverse();

  return {
    startDate: start, endDate: end,
    timezone: 'America/Los_Angeles', currency: 'USD',
    dayCount: days.length,
    rangeRevenue: round2(rangeRevenue),
    rangeVolume,
    rangeSampleOrders,
    days,
    basis: 'order_detail_filtered', // 口径: 订单明细剔除样品订单(4-79)+零价项
    sourceMeta: { source: 'lingxing-openapi', platform: 'TikTok', mock: false, basis: 'real_paid_orders', fetchedAt: new Date().toISOString() },
  };
}

// 示例数据(无凭证/失败兜底)
export function mockTikTokRealSalesRange({ startDate, endDate } = {}) {
  const end = endDate || laYesterday();
  const start = startDate || end;
  const sample = [
    { storeId: '110573514571226624', storeName: 'TK Slushie 2' },
    { storeId: '110539253792477696', storeName: 'TK Slushie 1' },
  ];
  let rRev = 0, rVol = 0, rSamp = 0;
  const days = enumerateDays(start, end).map((day, i) => {
    const stores = sample.map((s, j) => {
      const volume = ((i + 2) * (j + 2)) % 11 + 1;
      const revenue = round2(volume * (120 + j * 30));
      const sampleOrders = (i + j) % 3;
      return { ...s, revenue, volume, sampleOrders };
    });
    const dRev = round2(stores.reduce((a, s) => a + s.revenue, 0));
    const dVol = stores.reduce((a, s) => a + s.volume, 0);
    const dSamp = stores.reduce((a, s) => a + s.sampleOrders, 0);
    rRev += dRev; rVol += dVol; rSamp += dSamp;
    return { date: day, storeCount: stores.length, totalRevenue: dRev, totalVolume: dVol, sampleOrders: dSamp, stores };
  });
  days.reverse();
  return {
    startDate: start, endDate: end, timezone: 'America/Los_Angeles', currency: 'USD',
    dayCount: days.length, rangeRevenue: round2(rRev), rangeVolume: rVol, rangeSampleOrders: rSamp, days,
    basis: 'order_detail_filtered',
    sourceMeta: { source: 'lingxing-openapi', platform: 'TikTok', mock: true, reason: 'lingxing_credentials_missing', basis: 'real_paid_orders', fetchedAt: new Date().toISOString() },
  };
}

// 看板入口
export async function getTikTokRealSalesDashboard(db, userId, storeId, { startDate, endDate } = {}) {
  const { isLingxingConfigured } = await import('./client.mjs');
  const end = endDate || laYesterday();
  let start = startDate || end;
  if (start > end) start = end;
  if (!isLingxingConfigured()) return mockTikTokRealSalesRange({ startDate: start, endDate: end });
  try {
    return await fetchTikTokRealSalesRange({ startDate: start, endDate: end });
  } catch (err) {
    const mock = mockTikTokRealSalesRange({ startDate: start, endDate: end });
    mock.sourceMeta.error = String(err.message || err);
    return mock;
  }
}
