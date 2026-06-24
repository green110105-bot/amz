// 领星 Amazon 数据本地落库 + 同步 — 页面读 DB 秒开, 实时拉取只在后台定时跑。
// 存原始 mapPerformanceRow 行(按 区间 × 店 × ASIN), 三个看板(日报/风险/利润)各自从快照聚合。
// 每小时同步近30天(cron 调用 syncAmazonSnapshots), 严守领星限流(基座已退避)。
import {
  fetchActiveAmazonSellers,
  fetchProductPerformance,
} from './amazon.mjs';

// ---- schema ----
export function ensureAmazonSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS amazon_perf_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sid TEXT NOT NULL,
    store_name TEXT,
    currency_code TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    asin TEXT,
    payload TEXT NOT NULL,            -- mapPerformanceRow 的 JSON
    synced_at TEXT NOT NULL,
    UNIQUE(sid, start_date, end_date, asin)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_amz_snap_range ON amazon_perf_snapshot(start_date, end_date)`);
  db.exec(`CREATE TABLE IF NOT EXISTS amazon_sync_meta (
    k TEXT PRIMARY KEY,
    v TEXT
  )`);
}

function setMeta(db, k, v) {
  db.prepare(`INSERT INTO amazon_sync_meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).run(k, String(v));
}
export function getLastSyncAt(db) {
  try { ensureAmazonSchema(db); return db.prepare(`SELECT v FROM amazon_sync_meta WHERE k='last_sync_at'`).get()?.v || null; }
  catch { return null; }
}

// ---- 写入一店一区间的全部 ASIN 行(幂等 upsert) ----
function saveStoreRows(db, { sid, storeName, currencyCode, startDate, endDate, rows, syncedAt }) {
  const up = db.prepare(`INSERT INTO amazon_perf_snapshot
    (sid, store_name, currency_code, start_date, end_date, asin, payload, synced_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(sid, start_date, end_date, asin) DO UPDATE SET
      store_name=excluded.store_name, currency_code=excluded.currency_code,
      payload=excluded.payload, synced_at=excluded.synced_at`);
  const rawAsin = (m) => (m?.asins?.[0]?.asin) || m?.asin || null;
  const tx = db.transaction((list) => {
    // 先清掉该 sid+区间旧行(ASIN 集可能变化), 再插入本次全量。
    db.prepare(`DELETE FROM amazon_perf_snapshot WHERE sid=? AND start_date=? AND end_date=?`).run(sid, startDate, endDate);
    list.forEach((m, i) => {
      up.run(sid, storeName, currencyCode, startDate, endDate, rawAsin(m) || `__row_${i}`, JSON.stringify(m), syncedAt);
    });
  });
  tx(rows);
}

// ---- 同步: 拉美国店近 N 天, 【逐日】落库(每天 start=end=day 一份)。被 cron 调用。----
// productPerformance 是"区间聚合"接口: 给单日即得该日真实值。逐日存才能让页面按任意区间正确聚合。
export async function syncAmazonSnapshots(db, { days = 30 } = {}) {
  ensureAmazonSchema(db);
  const end = laToday();
  const sellers = await fetchActiveAmazonSellers(); // 默认仅美国 status=1
  const syncedAt = new Date().toISOString();
  const dayList = [];
  for (let i = 0; i < days; i++) dayList.push(shiftDay(end, -i));
  let cells = 0;
  const errors = [];
  for (const s of sellers) {
    for (const day of dayList) {
      try {
        const raw = await fetchProductPerformance({ sid: s.sid, startDate: day, endDate: day, summaryField: 'asin' });
        saveStoreRows(db, { sid: s.sid, storeName: s.name, currencyCode: s.currencyCode, startDate: day, endDate: day, rows: raw, syncedAt });
        cells += 1;
      } catch (err) {
        errors.push({ sid: s.sid, day, error: String(err.message || err) });
      }
    }
  }
  // 清理超出窗口的旧逐日数据(只保留最近 days+7 天)
  const cutoff = shiftDay(end, -(days + 7));
  db.prepare(`DELETE FROM amazon_perf_snapshot WHERE end_date < ?`).run(cutoff);
  setMeta(db, 'last_sync_at', syncedAt);
  setMeta(db, 'last_sync_range', `${dayList[dayList.length - 1]}~${end}`);
  setMeta(db, 'last_sync_cells', `${cells}/${sellers.length * days}`);
  return { syncedAt, startDate: dayList[dayList.length - 1], endDate: end, days, cells, sellerCount: sellers.length, errors };
}

// 数值字段(逐日相加得区间总值)。其余字段(评分/排名/库存/标题等)取区间内最新一天的值。
const SUM_FIELDS = ['volume', 'amount', 'net_amount', 'order_items', 'b2b_volume', 'spend',
  'ad_sales_amount', 'gross_profit', 'sessions', 'sessions_total', 'page_views', 'page_views_total',
  'return_count', 'ad_order_quantity', 'ad_direct_order_quantity', 'impressions', 'clicks'];

// 把某店在 [startDate..endDate] 的逐日行, 按 ASIN 聚合成"区间总值"行(数值相加, 快照模式透明返回)。
function aggregateRangeRowsForStore(db, sid, startDate, endDate) {
  const dayRows = db.prepare(`SELECT start_date, payload FROM amazon_perf_snapshot
    WHERE sid=? AND start_date>=? AND end_date<=? ORDER BY start_date ASC`).all(sid, startDate, endDate);
  const byAsin = new Map(); // asin -> 合并行
  for (const r of dayRows) {
    let row; try { row = JSON.parse(r.payload); } catch { continue; }
    const asin = row?.asins?.[0]?.asin || row?.asin || `__row`;
    if (!byAsin.has(asin)) {
      byAsin.set(asin, JSON.parse(JSON.stringify(row))); // 以首日为底(保留非数值字段)
      // 数值字段清零后重加, 避免首日值被算两次
      const base = byAsin.get(asin);
      for (const f of SUM_FIELDS) if (f in base) base[f] = 0;
    }
    const acc = byAsin.get(asin);
    for (const f of SUM_FIELDS) if (f in row || f in acc) acc[f] = (Number(acc[f]) || 0) + (Number(row[f]) || 0);
    // 非数值快照字段(评分/排名/库存)用最新一天覆盖(dayRows 已按日期升序, 最后覆盖=最新)
    for (const f of ['avg_star', 'cate_rank', 'small_cate_rank', 'available_inventory', 'available_days', 'reviews_count', 'currency_code', 'item_name']) {
      if (row[f] != null) acc[f] = row[f];
    }
  }
  return [...byAsin.values()];
}

// 取最新同步日(用于判断有无快照 + 新鲜度)
export function readLatestSnapshotMeta(db) {
  ensureAmazonSchema(db);
  const any = db.prepare(`SELECT MAX(end_date) AS maxd, MAX(synced_at) AS s FROM amazon_perf_snapshot`).get();
  if (!any || !any.maxd) return null;
  return { latestDay: any.maxd, syncedAt: any.s };
}

export function hasSnapshot(db) {
  try { ensureAmazonSchema(db); return !!db.prepare(`SELECT 1 FROM amazon_perf_snapshot LIMIT 1`).get(); }
  catch { return false; }
}

import { setSnapshotServer, clearSnapshotServer } from './amazon.mjs';

// 从逐日快照按【请求区间】聚合喂 builder(秒开, 不打领星)。
// requested = {startDate, endDate}: 页面真正想看的区间; 缺省=最新可用日单日。
// fn 收到的就是请求区间, 快照服务返回该区间内逐日相加的总值行 — 单日/7天/30天都正确。
export async function withSnapshot(db, fn, requested = {}) {
  const meta = readLatestSnapshotMeta(db);
  if (!meta) return null;
  const endDate = requested.endDate || meta.latestDay;
  const startDate = requested.startDate || endDate; // 缺省 = 单日(最新)
  // 为每个有快照的 sid 预计算区间聚合行
  const sids = db.prepare(`SELECT DISTINCT sid FROM amazon_perf_snapshot WHERE start_date>=? AND end_date<=?`).all(startDate, endDate).map((r) => r.sid);
  const bySid = {};
  for (const sid of sids) bySid[sid] = aggregateRangeRowsForStore(db, sid, startDate, endDate);
  if (sids.length === 0) return null; // 该区间无快照, 回退实时
  setSnapshotServer(bySid);
  try {
    const data = await fn({ startDate, endDate });
    if (data && typeof data === 'object') {
      data.fromSnapshot = true;
      data.snapshotSyncedAt = meta.syncedAt;
      data.snapshotRange = { startDate, endDate };
    }
    return data;
  } finally {
    clearSnapshotServer();
  }
}

// ---- LA 日期 helper ----
export function laToday() { return new Date(Date.now() - 8 * 3600 * 1000).toISOString().slice(0, 10); }
export function shiftDay(date, delta) {
  return new Date(new Date(date + 'T00:00:00Z').getTime() + delta * 86400000).toISOString().slice(0, 10);
}
