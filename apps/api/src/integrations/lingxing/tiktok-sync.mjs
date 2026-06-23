// 领星 TikTok 日报数据同步 — 拉 saleStat (销量 result_type=1 / 销售额 result_type=3),
// 按店铺聚合 + 全站汇总, 落库 tiktok_daily, 返回看板契约。
// 复刻自 lobster 服务器 lingxing/scripts (get_tiktok_data.py + generate_tiktok_sales_report.py)。
import { signedRequest, isLingxingConfigured } from './client.mjs';

const SALE_STAT_ROUTE = '/basicOpen/platformStatisticsV2/saleStat/pageList';

// 4 个 TikTok 店铺 (来自 lobster get_tiktok_data.py TARGET_ACTIVE_STORES)
export const TIKTOK_STORES = [
  { storeId: '110539253792477696', storeName: 'TK Slushie 1' },
  { storeId: '110573514571226624', storeName: 'TK Slushie 2' },
  { storeId: '110579228387271168', storeName: 'TK Slushie 3' },
  { storeId: '110613892520482304', storeName: 'NSY ProTool Hub' },
];

const PAGE_SIZE = 100;

function laYesterday() {
  // 洛杉矶时间(UTC-8)的"昨天"。领星 TikTok 日报以 LA 日界计。
  const la = new Date(Date.now() - 8 * 3600 * 1000 - 24 * 3600 * 1000);
  return la.toISOString().slice(0, 10);
}

function firstNonEmpty(v, def = '') {
  if (Array.isArray(v)) { for (const x of v) if (x != null && x !== '') return String(x); return def; }
  return v == null || v === '' ? def : String(v);
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// 拉单个 result_type 的全部行 (分页)
async function fetchSaleStat({ date, resultType, sids }) {
  const rows = [];
  let offset = 0;
  for (let guard = 0; guard < 50; guard++) {
    const body = {
      start_date: date, end_date: date,
      result_type: String(resultType), date_unit: '4', data_type: '6',
      offset, length: PAGE_SIZE, sids,
    };
    const res = await signedRequest(SALE_STAT_ROUTE, { method: 'POST', body });
    if (String(res.code) !== '0') {
      throw new Error(`lingxing_salestat_failed result_type=${resultType} code=${res.code} msg=${res.message || ''}`);
    }
    const page = res.data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

// 把行聚合成 { storeName: metricValue }
function aggregateByStore(rows) {
  const map = {};
  for (const row of rows) {
    const storeName = firstNonEmpty(row.store_name);
    if (!storeName) continue;
    map[storeName] = (map[storeName] || 0) + num(row.volumeTotal);
  }
  return map;
}

// 真实拉取 + 聚合, 返回看板数据结构 (mock=false)
export async function fetchTikTokDaily({ date } = {}) {
  const day = date || laYesterday();
  const sids = TIKTOK_STORES.map((s) => s.storeId);
  const volumeRows = await fetchSaleStat({ date: day, resultType: 1, sids });
  const revenueRows = await fetchSaleStat({ date: day, resultType: 3, sids });
  const volumeMap = aggregateByStore(volumeRows);
  const revenueMap = aggregateByStore(revenueRows);

  let totalRevenue = 0;
  let totalVolume = 0;
  const stores = TIKTOK_STORES.map((s) => {
    const revenue = revenueMap[s.storeName] || 0;
    const volume = volumeMap[s.storeName] || 0;
    totalRevenue += revenue;
    totalVolume += volume;
    return { storeId: s.storeId, storeName: s.storeName, revenue: round2(revenue), volume };
  }).filter((s) => s.revenue > 0 || s.volume > 0);

  return {
    date: day,
    timezone: 'America/Los_Angeles',
    currency: 'USD',
    storeCount: stores.length,
    totalRevenue: round2(totalRevenue),
    totalVolume,
    stores,
    sourceMeta: { source: 'lingxing-openapi', platform: 'TikTok', mock: false, fetchedAt: new Date().toISOString() },
  };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// 示例数据 (无凭证/未配置时返回, 结构与真实一致, 明确标 mock)
export function mockTikTokDaily({ date } = {}) {
  const day = date || laYesterday();
  const stores = [
    { storeId: '110573514571226624', storeName: 'TK Slushie 2', revenue: 16861.99, volume: 30 },
    { storeId: '110539253792477696', storeName: 'TK Slushie 1', revenue: 3619.99, volume: 7 },
  ];
  return {
    date: day, timezone: 'America/Los_Angeles', currency: 'USD',
    storeCount: stores.length,
    totalRevenue: round2(stores.reduce((a, s) => a + s.revenue, 0)),
    totalVolume: stores.reduce((a, s) => a + s.volume, 0),
    stores,
    sourceMeta: { source: 'lingxing-openapi', platform: 'TikTok', mock: true, reason: 'lingxing_credentials_missing', fetchedAt: new Date().toISOString() },
  };
}

// ---- 持久化 (tiktok_daily 表; 幂等 upsert by user/store/date) ----
export function ensureTikTokSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS tiktok_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    report_date TEXT NOT NULL,
    payload TEXT NOT NULL,
    is_mock INTEGER NOT NULL DEFAULT 1,
    fetched_at TEXT NOT NULL,
    UNIQUE(user_id, store_id, report_date)
  )`);
}

export function saveTikTokDaily(db, userId, storeId, daily) {
  ensureTikTokSchema(db);
  db.prepare(`INSERT INTO tiktok_daily(user_id, store_id, report_date, payload, is_mock, fetched_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id, store_id, report_date) DO UPDATE SET
      payload=excluded.payload, is_mock=excluded.is_mock, fetched_at=excluded.fetched_at`).run(
    userId, storeId, daily.date, JSON.stringify(daily), daily.sourceMeta?.mock ? 1 : 0, daily.sourceMeta?.fetchedAt || new Date().toISOString()
  );
}

export function getStoredTikTokDaily(db, userId, storeId, date) {
  ensureTikTokSchema(db);
  const row = db.prepare(`SELECT payload FROM tiktok_daily WHERE user_id=? AND store_id=? AND report_date=?`).get(userId, storeId, date);
  return row ? JSON.parse(row.payload) : null;
}

// 看板入口: 配置了凭证就真实拉取并落库, 否则返回 mock。失败时降级到已存快照或 mock, 并诚实标注。
export async function getTikTokDashboard(db, userId, storeId, { date, refresh = false } = {}) {
  const day = date || laYesterday();
  if (!isLingxingConfigured()) {
    return mockTikTokDaily({ date: day });
  }
  if (!refresh) {
    const cached = getStoredTikTokDaily(db, userId, storeId, day);
    if (cached) return cached;
  }
  try {
    const daily = await fetchTikTokDaily({ date: day });
    saveTikTokDaily(db, userId, storeId, daily);
    return daily;
  } catch (err) {
    const cached = getStoredTikTokDaily(db, userId, storeId, day);
    if (cached) return { ...cached, sourceMeta: { ...cached.sourceMeta, stale: true, error: String(err.message || err) } };
    const mock = mockTikTokDaily({ date: day });
    mock.sourceMeta.error = String(err.message || err);
    return mock;
  }
}
