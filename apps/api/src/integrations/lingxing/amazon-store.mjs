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

// ---- 同步: 拉美国店近 N 天, 落库。被 cron / 启动时调用。----
export async function syncAmazonSnapshots(db, { days = 30 } = {}) {
  ensureAmazonSchema(db);
  const end = laToday();
  const start = shiftDay(end, -(days - 1));
  const sellers = await fetchActiveAmazonSellers(); // 默认仅美国 status=1
  const syncedAt = new Date().toISOString();
  let storesOk = 0;
  const errors = [];
  for (const s of sellers) {
    try {
      // 存原始 API 行(不 map), 供 fetchProductPerformance 快照模式透明返回, 三模块逻辑零改动。
      const raw = await fetchProductPerformance({ sid: s.sid, startDate: start, endDate: end, summaryField: 'asin' });
      saveStoreRows(db, { sid: s.sid, storeName: s.name, currencyCode: s.currencyCode, startDate: start, endDate: end, rows: raw, syncedAt });
      storesOk += 1;
    } catch (err) {
      errors.push({ sid: s.sid, error: String(err.message || err) });
    }
  }
  setMeta(db, 'last_sync_at', syncedAt);
  setMeta(db, 'last_sync_range', `${start}~${end}`);
  setMeta(db, 'last_sync_stores', `${storesOk}/${sellers.length}`);
  return { syncedAt, startDate: start, endDate: end, storesOk, sellerCount: sellers.length, errors };
}

// ---- 读: 取最新同步快照的原始 API 行, 按 sid 分组(供 fetchProductPerformance 快照模式)。----
// 同步存的是近30天大区间; 取最新一份快照区间的全部行。
export function readLatestSnapshot(db) {
  ensureAmazonSchema(db);
  const range = db.prepare(`SELECT start_date, end_date FROM amazon_perf_snapshot ORDER BY synced_at DESC LIMIT 1`).get();
  if (!range) return null;
  const dbRows = db.prepare(`SELECT sid, payload, synced_at FROM amazon_perf_snapshot
    WHERE start_date=? AND end_date=?`).all(range.start_date, range.end_date);
  const bySid = {};
  for (const r of dbRows) {
    const row = JSON.parse(r.payload);
    (bySid[r.sid] = bySid[r.sid] || []).push(row);
  }
  return {
    startDate: range.start_date,
    endDate: range.end_date,
    bySid,
    syncedAt: dbRows[0]?.synced_at || getLastSyncAt(db),
  };
}

export function hasSnapshot(db) {
  try { ensureAmazonSchema(db); return !!db.prepare(`SELECT 1 FROM amazon_perf_snapshot LIMIT 1`).get(); }
  catch { return false; }
}

import { setSnapshotServer, clearSnapshotServer } from './amazon.mjs';

// 用最新快照"喂"一个看板 builder(秒开, 不打领星)。builder 收到的 startDate/endDate 被强制为快照区间,
// 这样区间口径一致。fn(range) 返回 dashboard 对象, 自动附上 fromSnapshot/syncedAt。
// 无快照 -> 返回 null(调用方回退实时拉取)。
export async function withSnapshot(db, fn) {
  const snap = readLatestSnapshot(db);
  if (!snap) return null;
  setSnapshotServer(snap.bySid);
  try {
    const data = await fn({ startDate: snap.startDate, endDate: snap.endDate });
    if (data && typeof data === 'object') {
      data.fromSnapshot = true;
      data.snapshotSyncedAt = snap.syncedAt;
      data.snapshotRange = { startDate: snap.startDate, endDate: snap.endDate };
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
