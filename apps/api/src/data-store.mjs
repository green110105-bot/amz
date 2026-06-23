// data-store.mjs — SQLite (better-sqlite3)
// 取代前端 LocalStorage / 之前的 JSON 文件
// 兼容性：保留旧 JSON store.json -> 自动迁移一次后改名为 store.json.bak
// schema：每用户多店铺；audit/keywords/alerts/sovereignty/products/... 按 (user_id, store_id) 隔离

import Database from 'better-sqlite3';
import { existsSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { sampleStore } from '../../../packages/mock-data/src/sample-store.mjs';
import { initAdsSchema, seedAdsForUser, ADS_TABLES_TO_CLEAN, revertM3Action as _revertM3AdsAction } from './data-store-ads.mjs';
import { initListingsSchema, seedListingsForUser, LISTINGS_TABLES_TO_CLEAN } from './data-store-listings.mjs';
import { initProfitSchema, seedProfitForUser, PROFIT_TABLES_TO_CLEAN } from './data-store-profit.mjs';
import { initMonitorSchema, seedMonitorForUser, MONITOR_TABLES_TO_CLEAN, revertM4Action as _revertM4Action } from './data-store-monitor.mjs';
import { initSpApiSchema } from './integrations/sp-api/schema.mjs';
import { initAdsApiSchema } from './integrations/ads-api/schema.mjs';

const __dirname_dsmjs = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = resolve(__dirname_dsmjs, '../data');
const DB_PATH = resolve(process.env.DATA_DB_PATH || `${DEFAULT_DATA_DIR}/store.db`);
const LEGACY_JSON = resolve(process.env.DATA_STORE_PATH || `${DEFAULT_DATA_DIR}/store.json`);

let _db = null;

export function getDbInstance() { return getDb(); }
function getDb() {
  if (_db) return _db;
  const d = dirname(DB_PATH);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  ensureDemoUser(_db);
  migrateFromLegacyJson(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      role TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_stores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT,
      region TEXT,
      currency TEXT,
      marketplace_id TEXT,
      sp_api_authorized INTEGER DEFAULT 0,
      ads_api_authorized INTEGER DEFAULT 0,
      added_at TEXT,
      updated_at TEXT,
      store_archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_stores_user ON user_stores(user_id);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT,
      source_module TEXT,
      action_type TEXT,
      resource_type TEXT,
      resource_id TEXT,
      status TEXT,
      reverted INTEGER DEFAULT 0,
      reverted_at TEXT,
      revert_reason TEXT,
      executed_at TEXT NOT NULL,
      payload TEXT,
      origin TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_user_store ON audit_logs(user_id, store_id, executed_at DESC);
    -- Audit trail must be retained after store deletion (X-P1-08): soft-archive here.
    CREATE TABLE IF NOT EXISTS archived_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT,
      source_module TEXT,
      action_type TEXT,
      resource_type TEXT,
      resource_id TEXT,
      status TEXT,
      reverted INTEGER DEFAULT 0,
      reverted_at TEXT,
      revert_reason TEXT,
      executed_at TEXT,
      payload TEXT,
      origin TEXT,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_arch_audit_user_store ON archived_audit_logs(user_id, store_id);
    CREATE TABLE IF NOT EXISTS keywords (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_keywords_us ON keywords(user_id, store_id);
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      data TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_us ON alerts(user_id, store_id);
    -- N3-notif-store-isolation: read-state must be isolated per (user_id, store_id, notif_id)
    -- so a notification marked read in storeA never masks an unread one in storeB.
    -- Fresh DBs get store_id in the PK directly; pre-existing DBs are migrated additively
    -- via ensureColumn + idx_notif_read_uss below (notif_id stays NOT NULL but store_id
    -- may be empty-string for backfilled legacy rows whose source notification is gone).
    CREATE TABLE IF NOT EXISTS notifications_read (
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL DEFAULT '',
      notif_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY(user_id, store_id, notif_id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sovereignty (
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY(user_id, store_id, scope)
    );

    -- ===== Sample store (商品/listings/reviews/...) =====
    CREATE TABLE IF NOT EXISTS products (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT,
      asin TEXT,
      title TEXT,
      data TEXT NOT NULL,
      PRIMARY KEY(user_id, store_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_products_us ON products(user_id, store_id);
    CREATE TABLE IF NOT EXISTS listings (
      product_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY(user_id, store_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      rating INTEGER,
      title TEXT,
      body TEXT,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_us ON reviews(user_id, store_id, product_id);
    CREATE TABLE IF NOT EXISTS competitors (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      product_id TEXT,
      asin TEXT,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_competitors_us ON competitors(user_id, store_id);
    CREATE TABLE IF NOT EXISTS competitor_snapshots (
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY(user_id, store_id, phase)
    );
    CREATE TABLE IF NOT EXISTS search_terms (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      product_id TEXT,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_search_terms_us ON search_terms(user_id, store_id);
    CREATE TABLE IF NOT EXISTS orders (
      amazon_order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      product_id TEXT,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_us ON orders(user_id, store_id);
    CREATE TABLE IF NOT EXISTS inventory (
      product_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY(user_id, store_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS ad_metrics (
      product_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY(user_id, store_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS monitor_signals (
      product_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY(user_id, store_id, product_id)
    );
  `);
  // M3 广告模块 — 17 张新表
  initAdsSchema(db);
  // M1 商品 Listing 优化模块 — 8 张新表
  initListingsSchema(db);
  // M2 利润 / 库存 / 采购 / 重定价 / 多维度财务模块 — 24 张新表 + m4_notifications 占位
  initProfitSchema(db);
  // M4 监控 / 评价 / 申诉 / 恢复 / 跟卖 / 侵权 / 竞品 / 通知 — 13 张新表 + reviews ALTER + m4_notifications 扩列
  initMonitorSchema(db);
  // 真实凭证集成 — store_credentials + sync_runs（M2/M3 真实数据落点）
  initSpApiSchema(db);
  // Ads API — additive: store_credentials.profile_id + country_code columns
  initAdsApiSchema(db);
  // Additive column migrations for pre-existing DBs (CREATE TABLE IF NOT EXISTS
  // won't add columns to an already-created table).
  ensureColumn(db, 'audit_logs', 'origin', 'TEXT');
  ensureColumn(db, 'user_stores', 'store_archived_at', 'TEXT');
  migrateNotificationsReadStoreId(db);
}

// N3-notif-store-isolation: idempotent migration that gives the read-state table a
// store_id dimension on pre-existing DBs (the fresh CREATE TABLE above already has it).
// 1) add the column (DEFAULT '' so the legacy unique PK never sees NULL);
// 2) backfill from m4_notifications by notif_id so rows read before this migration keep
//    their correct store; orphan rows (source notification deleted) stay '' which is a
//    distinct dimension and harmless;
// 3) add a unique index on (user_id, store_id, notif_id) so INSERT OR IGNORE dedups per
//    store even where the original PRIMARY KEY was only (user_id, notif_id).
function migrateNotificationsReadStoreId(db) {
  try {
    const cols = db.prepare(`PRAGMA table_info(notifications_read)`).all();
    if (!cols.length) return; // table not created yet in some harnesses
    const hasStore = cols.some((c) => c.name === 'store_id');
    if (!hasStore) {
      db.exec(`ALTER TABLE notifications_read ADD COLUMN store_id TEXT NOT NULL DEFAULT ''`);
      // Backfill from the source notifications table (best-effort; table may not exist).
      try {
        db.exec(`
          UPDATE notifications_read
             SET store_id = COALESCE((
               SELECT n.store_id FROM m4_notifications n WHERE n.id = notifications_read.notif_id
             ), '')
           WHERE store_id = ''`);
      } catch { /* m4_notifications may not exist yet */ }
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_read_uss ON notifications_read(user_id, store_id, notif_id)`);
  } catch { /* idempotent; ignore on partial harnesses */ }
}

function ensureColumn(db, table, column, type) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch { /* table may not exist yet in some test harnesses */ }
}

// ===== Auth helpers =====
export function hashPassword(plain) {
  return createHash('sha256').update(String(plain) + ':amz-salt-2026').digest('hex');
}
function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return prefix + '-' + randomBytes(4).toString('hex'); }

function isRealProviderMode() {
  return String(process.env.DATA_PROVIDER_MODE || 'hybrid').toLowerCase() === 'real';
}

function shouldSeedSampleData(db, userId, storeId) {
  if (isRealProviderMode()) return false;
  try {
    const row = db.prepare(
      `SELECT 1 FROM store_credentials WHERE user_id=? AND store_id=? AND status='active' LIMIT 1`
    ).get(userId, storeId);
    return !row;
  } catch {
    return true;
  }
}

function maybeSeedSampleStoreData(db, userId, storeId) {
  if (!shouldSeedSampleData(db, userId, storeId)) return false;
  seedSampleStoreData(db, userId, storeId);
  return true;
}

function ensureDemoUser(db) {
  // Production hardening: skip the public demo account entirely when explicitly
  // disabled. The weak demo/demo login must never be reachable once real store
  // credentials live on the host. Set DISABLE_DEMO_USER=true in production .env.
  if (String(process.env.DISABLE_DEMO_USER || '').toLowerCase() === 'true') return;
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@amz.local');
  if (exists) return;
  const id = 'u-demo';
  // The demo password is env-overridable so an operator can lock it down without a
  // code change; it falls back to 'demo' only for local/dev convenience.
  const demoPassword = process.env.DEMO_PASSWORD || 'demo';
  db.prepare(`INSERT INTO users(id, name, email, role, password_hash, created_at) VALUES (?,?,?,?,?,?)`).run(
    id, '演示用户', 'demo@amz.local', 'admin', hashPassword(demoPassword), nowIso()
  );
  const storeId = 's-mock-us';
  // AUTH-08 invariant: *_api_authorized=1 iff an active store_credentials row exists
  // for that provider. The demo seed creates NO credentials, so authorized MUST be 0;
  // otherwise the Settings badge claims "已接入" while diagnostics report missing creds.
  db.prepare(`INSERT INTO user_stores(id, user_id, name, region, currency, marketplace_id, sp_api_authorized, ads_api_authorized, added_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    storeId, id, 'Mock Store · US', 'US', 'USD', 'ATVPDKIKX0DER',
    0,
    0,
    nowIso()
  );
  maybeSeedSampleStoreData(db, id, storeId);
}

function migrateFromLegacyJson(db) {
  if (!existsSync(LEGACY_JSON)) return;
  try {
    const cnt = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    if (cnt > 1) { renameSync(LEGACY_JSON, LEGACY_JSON + '.bak'); return; } // 已有数据，备份旧文件
    const j = JSON.parse(readFileSync(LEGACY_JSON, 'utf-8'));
    const tx = db.transaction(() => {
      for (const u of Object.values(j.users || {})) {
        const has = db.prepare('SELECT id FROM users WHERE id = ?').get(u.id);
        if (!has) {
          db.prepare(`INSERT INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`).run(
            u.id, u.name, u.email, u.role || 'operator', u.passwordHash, u.createdAt || nowIso()
          );
        }
      }
      for (const [uid, stores] of Object.entries(j.userStores || {})) {
        for (const s of stores) {
          const has = db.prepare('SELECT id FROM user_stores WHERE id = ?').get(s.id);
          if (has) continue;
          db.prepare(`INSERT INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
            s.id, uid, s.name, s.region, s.currency, s.marketplaceId,
            s.spApiAuthorized ? 1 : 0, s.adsApiAuthorized ? 1 : 0, s.addedAt || nowIso(), s.updatedAt || null
          );
          maybeSeedSampleStoreData(db, uid, s.id);
        }
      }
      for (const log of (j.auditLogs || [])) {
        db.prepare(`INSERT OR IGNORE INTO audit_logs(id,user_id,store_id,source_module,action_type,resource_type,resource_id,status,reverted,reverted_at,revert_reason,executed_at,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          log.id, log.userId, log.storeId || null, log.sourceModule, log.actionType, log.resourceType || null,
          log.resourceId || null, log.status || 'success', log.reverted ? 1 : 0, log.revertedAt || null,
          log.revertReason || null, log.executedAt || nowIso(), JSON.stringify(log)
        );
      }
    });
    tx();
    renameSync(LEGACY_JSON, LEGACY_JSON + '.bak');
    console.log('[data-store] migrated legacy JSON -> SQLite, file renamed to store.json.bak');
  } catch (e) {
    console.warn('[data-store] legacy JSON migration failed:', e?.message);
  }
}

// ===== Auth =====
export function authenticate(email, password) {
  const db = getDb();
  // email 字段按原样精确匹配 —— 既支持邮箱(demo@amz.local), 也支持纯账号名(ssg / zl)。
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return null;
  if (user.password_hash !== hashPassword(password)) return null;
  return issueToken(toUser(user));
}

export function registerUser({ email, password, name, role }) {
  if (!email || !password) return { error: 'email_and_password_required' };
  if (password.length < 4) return { error: 'password_too_short' };
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return { error: 'email_exists' };
  const id = newId('u');
  db.prepare(`INSERT INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`).run(
    id, name || email.split('@')[0] || 'user', email, role || (email.includes('admin') ? 'admin' : 'operator'),
    hashPassword(password), nowIso()
  );
  // 自动开默认店铺 + 种子样本数据
  const storeId = newId('s');
  db.prepare(`INSERT INTO user_stores(id,user_id,name,region,currency,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?)`).run(
    storeId, id, 'My Store · US', 'US', 'USD', 0, 0, nowIso()
  );
  maybeSeedSampleStoreData(db, id, storeId);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return { user: toUser(u) };
}

export function createPasswordResetToken(email) {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u) return null;
  const token = 'rst-' + randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
  db.prepare(`INSERT INTO password_reset_tokens(token,user_id,expires_at,used,created_at) VALUES (?,?,?,?,?)`).run(
    token, u.id, expiresAt, 0, nowIso()
  );
  return { token, userId: u.id, expiresAt };
}

export function resetPassword({ token, newPassword }) {
  if (!token || !newPassword) return { error: 'token_and_password_required' };
  if (newPassword.length < 4) return { error: 'password_too_short' };
  const db = getDb();
  const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(token);
  if (!row) return { error: 'invalid_token' };
  if (row.used) return { error: 'token_used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { error: 'token_expired' };
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), row.user_id);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
  return { ok: true, userId: row.user_id };
}

export function issueToken(user) {
  const db = getDb();
  const token = 'tok-' + randomBytes(16).toString('hex');
  db.prepare('INSERT INTO auth_tokens(token,user_id,created_at) VALUES (?,?,?)').run(token, user.id, nowIso());
  return { token, user };
}

export function whoAmI(token) {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare('SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?').get(token);
  return row ? toUser(row) : null;
}

export function logout(token) {
  const db = getDb();
  db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
}

function toUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at, passwordHash: row.password_hash };
}

// ===== Stores =====
function rowToStore(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, region: r.region, currency: r.currency,
    marketplaceId: r.marketplace_id || undefined,
    spApiAuthorized: !!r.sp_api_authorized,
    adsApiAuthorized: !!r.ads_api_authorized,
    addedAt: r.added_at, updatedAt: r.updated_at || undefined,
  };
}
export function listUserStores(userId) {
  return getDb().prepare('SELECT * FROM user_stores WHERE user_id = ? ORDER BY added_at').all(userId).map(rowToStore);
}
export function addUserStore(userId, store) {
  const db = getDb();
  const id = newId('s');
  db.prepare(`INSERT INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, userId, store.name || 'Store', store.region || 'US', store.currency || 'USD',
    store.marketplaceId || null, store.spApiAuthorized ? 1 : 0, store.adsApiAuthorized ? 1 : 0, nowIso()
  );
  maybeSeedSampleStoreData(db, userId, id);
  return rowToStore(db.prepare('SELECT * FROM user_stores WHERE id = ?').get(id));
}
export function updateUserStore(userId, storeId, patch) {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM user_stores WHERE id = ? AND user_id = ?').get(storeId, userId);
  if (!cur) return null;
  const merged = { ...rowToStore(cur), ...patch };
  db.prepare(`UPDATE user_stores SET name=?, region=?, currency=?, sp_api_authorized=?, ads_api_authorized=?, updated_at=? WHERE id=? AND user_id=?`).run(
    merged.name, merged.region, merged.currency,
    merged.spApiAuthorized ? 1 : 0, merged.adsApiAuthorized ? 1 : 0, nowIso(), storeId, userId
  );
  return rowToStore(db.prepare('SELECT * FROM user_stores WHERE id = ?').get(storeId));
}
export function removeUserStore(userId, storeId) {
  const db = getDb();
  const all = db.prepare('SELECT id FROM user_stores WHERE user_id = ?').all(userId);
  if (all.length <= 1) return false;
  // X-P1-08: block deletion while real-write audits remain un-reverted. The audit
  // trail of a real Amazon mutation must not be destroyed before it is resolved.
  const realRows = db.prepare(
    `SELECT * FROM audit_logs WHERE user_id=? AND store_id=? AND reverted=0`
  ).all(userId, storeId);
  if (realRows.some((row) => isRealWriteAuditRow(row))) {
    return { error: 'store_has_unreverted_real_writes', blocked: true };
  }
  const tx = db.transaction(() => {
    // X-P1-08: archive audit_logs instead of hard-deleting (audit immutability).
    const auditRows = db.prepare('SELECT * FROM audit_logs WHERE user_id = ? AND store_id = ?').all(userId, storeId);
    const archivedAt = nowIso();
    const ins = db.prepare(`INSERT OR REPLACE INTO archived_audit_logs(
      id,user_id,store_id,source_module,action_type,resource_type,resource_id,status,
      reverted,reverted_at,revert_reason,executed_at,payload,origin,archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const r of auditRows) {
      ins.run(r.id, r.user_id, r.store_id, r.source_module, r.action_type, r.resource_type, r.resource_id,
        r.status, r.reverted, r.reverted_at, r.revert_reason, r.executed_at, r.payload, r.origin || null, archivedAt);
    }
    db.prepare('DELETE FROM user_stores WHERE id = ? AND user_id = ?').run(storeId, userId);
    db.prepare('DELETE FROM keywords WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM alerts WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM sovereignty WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM audit_logs WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM products WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM listings WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM reviews WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM competitors WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM competitor_snapshots WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM search_terms WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM orders WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM inventory WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM ad_metrics WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    db.prepare('DELETE FROM monitor_signals WHERE user_id = ? AND store_id = ?').run(userId, storeId);
    // M3 ads tables
    for (const tbl of ADS_TABLES_TO_CLEAN) {
      db.prepare(`DELETE FROM ${tbl} WHERE user_id = ? AND store_id = ?`).run(userId, storeId);
    }
    // M1 listings tables
    for (const tbl of LISTINGS_TABLES_TO_CLEAN) {
      db.prepare(`DELETE FROM ${tbl} WHERE user_id = ? AND store_id = ?`).run(userId, storeId);
    }
    // M2 profit tables
    for (const tbl of PROFIT_TABLES_TO_CLEAN) {
      db.prepare(`DELETE FROM ${tbl} WHERE user_id = ? AND store_id = ?`).run(userId, storeId);
    }
    // M4 monitor tables (含 m4_notifications)
    for (const tbl of MONITOR_TABLES_TO_CLEAN) {
      try { db.prepare(`DELETE FROM ${tbl} WHERE user_id = ? AND store_id = ?`).run(userId, storeId); } catch {}
    }
  });
  tx();
  return true;
}
export function defaultStoreIdFor(userId) {
  const r = getDb().prepare('SELECT id FROM user_stores WHERE user_id = ? ORDER BY added_at LIMIT 1').get(userId);
  return r?.id || null;
}

// X-P1-04: resolve + ownership-check a store scope. Returns the storeId only when
// the (header-supplied or default) store actually belongs to userId. Returns
// { error:'store_not_owned' } when a client supplies an x-store-id it does not own.
export function resolveStoreScope(userId, headerStoreId) {
  const db = getDb();
  const candidate = headerStoreId || defaultStoreIdFor(userId);
  if (!candidate) return { storeId: '' };
  const owned = db.prepare('SELECT id FROM user_stores WHERE id = ? AND user_id = ?').get(candidate, userId);
  if (!owned) return { error: 'store_not_owned' };
  return { storeId: candidate };
}

// ===== Audit Logs =====
export function listAuditLogs(userId, storeId, opts = {}) {
  const { limit = 200, offset = 0, sourceModule, actionType, reverted } = opts;
  const db = getDb();
  let sql = 'SELECT * FROM audit_logs WHERE user_id = ?';
  const params = [userId];
  if (storeId) { sql += ' AND store_id = ?'; params.push(storeId); }
  if (sourceModule) { sql += ' AND source_module = ?'; params.push(sourceModule); }
  if (actionType) { sql += ' AND action_type = ?'; params.push(actionType); }
  if (reverted !== undefined && reverted !== null && reverted !== '') {
    sql += ' AND reverted = ?'; params.push(reverted === '1' || reverted === 'true' || reverted === true ? 1 : 0);
  }
  sql += ' ORDER BY executed_at DESC LIMIT ? OFFSET ?';
  params.push(Math.max(1, Math.min(2000, Number(limit) || 200)));
  params.push(Math.max(0, Number(offset) || 0));
  const rows = db.prepare(sql).all(...params);
  return rows.map(rowToAudit);
}

export function countAuditLogs(userId, storeId, opts = {}) {
  const { sourceModule, actionType, reverted } = opts;
  const db = getDb();
  let sql = 'SELECT COUNT(*) as n FROM audit_logs WHERE user_id = ?';
  const params = [userId];
  if (storeId) { sql += ' AND store_id = ?'; params.push(storeId); }
  if (sourceModule) { sql += ' AND source_module = ?'; params.push(sourceModule); }
  if (actionType) { sql += ' AND action_type = ?'; params.push(actionType); }
  if (reverted !== undefined && reverted !== null && reverted !== '') {
    sql += ' AND reverted = ?'; params.push(reverted === '1' || reverted === 'true' || reverted === true ? 1 : 0);
  }
  return db.prepare(sql).get(...params).n;
}
function rowToAudit(r) {
  let payload = {};
  try { payload = JSON.parse(r.payload || '{}'); } catch {}
  return {
    ...payload,
    id: r.id, userId: r.user_id, storeId: r.store_id,
    sourceModule: r.source_module, actionType: r.action_type,
    resourceType: r.resource_type, resourceId: r.resource_id,
    status: r.status, reverted: !!r.reverted, revertedAt: r.reverted_at, revertReason: r.revert_reason,
    executedAt: r.executed_at,
    origin: r.origin || payload.origin || 'mock-seed',
  };
}

// Classify an audit row into one of three origins for the unified audit view (X-P1-07):
//   mock-seed     : dry-run / mock-only writes that never touched an external account
//   ads-real-write: real Amazon Ads mutations (require manual reversal)
//   local-real    : real local DB state changes that are programmatically reversible
function deriveAuditOrigin(log) {
  if (log.origin) return log.origin;
  const at = String(log.actionType || '');
  if (at === 'ACTION_QUEUE_REAL_WRITE') return 'ads-real-write';
  if (at === 'ACTION_QUEUE_DRY_RUN') return 'mock-seed';
  if (log.requiresRealStoreWrite === true) return 'ads-real-write';
  return 'local-real';
}

export function appendAuditLog(userId, storeId, log) {
  const db = getDb();
  const id = log.id || newId('a');
  const executedAt = log.executedAt || nowIso();
  const origin = deriveAuditOrigin(log);
  db.prepare(`INSERT INTO audit_logs(id,user_id,store_id,source_module,action_type,resource_type,resource_id,status,reverted,executed_at,payload,origin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId || null, log.sourceModule, log.actionType, log.resourceType || null,
    log.resourceId || null, log.status || 'success', log.reverted ? 1 : 0, executedAt, JSON.stringify({ ...log, origin }), origin
  );
  return rowToAudit(db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id));
}
// Action types that represent a real external (Amazon) write. Reverting these
// requires a genuine inverse dispatch — they must NEVER be marked reverted=1
// merely because the user clicked revert (audit-integrity invariant, X-P0-01).
const REAL_WRITE_ACTION_TYPES = new Set([
  'ACTION_QUEUE_REAL_WRITE',
]);

export function isRealWriteAuditRow(row) {
  if (!row) return false;
  if (REAL_WRITE_ACTION_TYPES.has(row.action_type)) return true;
  if (row.origin === 'ads-real-write') return true;
  let payload = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch {}
  if (payload.origin === 'ads-real-write') return true;
  // real_write_success run results carry realWrite:true in their stored result
  if (payload?.result?.realWrite === true) return true;
  return false;
}

export function revertAuditLog(userId, storeId, id, reason) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM audit_logs WHERE id = ? AND user_id = ?').get(id, userId);
  if (!r) return null;
  if (storeId && r.store_id && r.store_id !== storeId) return null;
  if (r.reverted) return rowToAudit(r);
  // Dispatch inverse action based on action_type before flipping the audit row
  let dispatched = false;
  try {
    dispatched = _revertM3AdsAction(db, userId, r.store_id || storeId, r);
  } catch (e) {
    try { console.warn('[revertAuditLog] inverse dispatch failed', e.message); } catch {}
  }
  if (!dispatched) {
    try {
      dispatched = _revertM4Action(db, userId, r.store_id || storeId, r);
    } catch (e) {
      try { console.warn('[revertAuditLog] M4 inverse dispatch failed', e.message); } catch {}
    }
  }
  // X-P0-01: A real-write audit row may only be marked reverted=1 when a genuine
  // inverse write actually dispatched. If not, leave reverted=0 and signal that
  // manual reversal is required (route layer downgrades to HTTP 409).
  if (!dispatched && isRealWriteAuditRow(r)) {
    const out = rowToAudit(r);
    out.status = 'revert_failed';
    out.needsManualReversal = true;
    out.dispatchedInverse = false;
    return out;
  }
  db.prepare('UPDATE audit_logs SET reverted=1, reverted_at=?, revert_reason=?, status=? WHERE id=?').run(nowIso(), reason || 'user_revert', 'reverted', id);
  const out = rowToAudit(db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id));
  out.dispatchedInverse = dispatched;
  out.needsManualReversal = false;
  return out;
}

// ===== Keywords =====
export function listKeywords(userId, storeId) {
  return getDb().prepare('SELECT * FROM keywords WHERE user_id = ? AND store_id = ? ORDER BY created_at DESC').all(userId, storeId).map((r) => ({ id: r.id, ...JSON.parse(r.data || '{}') }));
}
export function addKeyword(userId, storeId, kw) {
  const db = getDb();
  const id = kw.id || newId('kw');
  const createdAt = kw.createdAt || nowIso();
  const item = { ...kw, id, createdAt };
  db.prepare('INSERT INTO keywords(id,user_id,store_id,data,created_at) VALUES (?,?,?,?,?)').run(id, userId, storeId, JSON.stringify(item), createdAt);
  return item;
}
export function removeKeyword(userId, storeId, id) {
  const r = getDb().prepare('DELETE FROM keywords WHERE id = ? AND user_id = ? AND store_id = ?').run(id, userId, storeId);
  return r.changes > 0;
}

// ===== Alerts =====
export function listAlerts(userId, storeId) {
  return getDb().prepare('SELECT * FROM alerts WHERE user_id = ? AND store_id = ? ORDER BY created_at DESC').all(userId, storeId).map((r) => ({ id: r.id, ...JSON.parse(r.data || '{}'), enabled: !!r.enabled }));
}
export function addAlert(userId, storeId, rule) {
  const db = getDb();
  const id = rule.id || newId('rule');
  const createdAt = rule.createdAt || nowIso();
  const item = { ...rule, id, createdAt, enabled: rule.enabled !== false, triggerCount: rule.triggerCount || 0 };
  db.prepare('INSERT INTO alerts(id,user_id,store_id,enabled,data,created_at) VALUES (?,?,?,?,?,?)').run(id, userId, storeId, item.enabled ? 1 : 0, JSON.stringify(item), createdAt);
  return item;
}
export function updateAlert(userId, storeId, id, patch) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM alerts WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!r) return null;
  const merged = { ...JSON.parse(r.data || '{}'), ...patch, id, updatedAt: nowIso() };
  if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled;
  db.prepare('UPDATE alerts SET data=?, enabled=?, updated_at=? WHERE id=?').run(JSON.stringify(merged), merged.enabled ? 1 : 0, merged.updatedAt, id);
  return merged;
}
export function removeAlert(userId, storeId, id) {
  const r = getDb().prepare('DELETE FROM alerts WHERE id = ? AND user_id = ? AND store_id = ?').run(id, userId, storeId);
  return r.changes > 0;
}

// ===== Notifications =====
export function listNotificationsRead(userId) {
  // Legacy (storeless) endpoint: returns the read-state map across all of the user's
  // stores. notif ids are globally unique per store so the flattened map is unambiguous.
  const rows = getDb().prepare('SELECT notif_id, read_at FROM notifications_read WHERE user_id = ?').all(userId);
  return Object.fromEntries(rows.map((r) => [r.notif_id, r.read_at]));
}
export function markNotificationRead(userId, id) {
  // N3-notif-store-isolation: the legacy endpoint carries no store header, so derive the
  // owning store from the notification itself and write the read-state into that store's
  // dimension. Unknown/foreign ids resolve to '' and are simply not surfaced.
  const db = getDb();
  const owned = db.prepare('SELECT store_id FROM m4_notifications WHERE id=? AND user_id=?').get(id, userId);
  const storeId = owned ? owned.store_id : '';
  db.prepare('INSERT OR IGNORE INTO notifications_read(user_id, store_id, notif_id, read_at) VALUES (?,?,?,?)').run(userId, storeId, id, nowIso());
}

// ===== Settings =====
export function getSettings(userId) {
  const r = getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(userId);
  return r ? JSON.parse(r.data) : {};
}
export function updateSettings(userId, patch) {
  const db = getDb();
  const cur = getSettings(userId);
  const merged = { ...cur, ...patch, updatedAt: nowIso() };
  db.prepare('INSERT INTO settings(user_id,data,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(userId, JSON.stringify(merged), merged.updatedAt);
  return merged;
}

// ===== Sovereignty =====
const DEFAULT_SOV = { global: 'semi', m1: 'manual', m2: 'semi', m3: 'auto', m4: 'semi' };
export function getSovereignty(userId, storeId) {
  const rows = getDb().prepare('SELECT scope, value FROM sovereignty WHERE user_id = ? AND store_id = ?').all(userId, storeId);
  const out = { ...DEFAULT_SOV };
  for (const r of rows) out[r.scope] = r.value;
  return out;
}
export function setSovereignty(userId, storeId, scope, value) {
  getDb().prepare('INSERT INTO sovereignty(user_id, store_id, scope, value) VALUES (?,?,?,?) ON CONFLICT(user_id, store_id, scope) DO UPDATE SET value=excluded.value').run(userId, storeId, scope, value);
  return getSovereignty(userId, storeId);
}

// ===== Sample store: seed =====
function seedSampleStoreData(db, userId, storeId) {
  const tx = db.transaction(() => {
    for (const p of (sampleStore.products || [])) {
      db.prepare(`INSERT OR IGNORE INTO products(id,user_id,store_id,sku,asin,title,data) VALUES (?,?,?,?,?,?,?)`).run(p.id, userId, storeId, p.sku, p.asin, p.title, JSON.stringify(p));
    }
    for (const [pid, listing] of Object.entries(sampleStore.listings || {})) {
      db.prepare(`INSERT OR IGNORE INTO listings(product_id,user_id,store_id,data) VALUES (?,?,?,?)`).run(pid, userId, storeId, JSON.stringify(listing));
    }
    for (const r of (sampleStore.reviews || [])) {
      const id = newId('rev');
      db.prepare(`INSERT INTO reviews(id,user_id,store_id,product_id,rating,title,body,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(id, userId, storeId, r.productId, r.rating, r.title, r.body, nowIso());
    }
    for (const c of (sampleStore.competitors || [])) {
      const id = newId('cmp');
      db.prepare(`INSERT INTO competitors(id,user_id,store_id,product_id,asin,data) VALUES (?,?,?,?,?,?)`).run(id, userId, storeId, c.productId, c.asin, JSON.stringify(c));
    }
    for (const phase of ['previous', 'current']) {
      const arr = sampleStore.competitorSnapshots?.[phase] || [];
      db.prepare(`INSERT OR REPLACE INTO competitor_snapshots(user_id,store_id,phase,data) VALUES (?,?,?,?)`).run(userId, storeId, phase, JSON.stringify(arr));
    }
    for (const t of (sampleStore.searchTerms || [])) {
      const id = newId('st');
      db.prepare(`INSERT INTO search_terms(id,user_id,store_id,product_id,data) VALUES (?,?,?,?,?)`).run(id, userId, storeId, t.productId, JSON.stringify(t));
    }
    for (const o of (sampleStore.orders || [])) {
      db.prepare(`INSERT OR IGNORE INTO orders(amazon_order_id,user_id,store_id,product_id,data) VALUES (?,?,?,?,?)`).run(o.amazonOrderId, userId, storeId, o.productId, JSON.stringify(o));
    }
    for (const inv of (sampleStore.inventory || [])) {
      db.prepare(`INSERT OR IGNORE INTO inventory(product_id,user_id,store_id,data) VALUES (?,?,?,?)`).run(inv.productId, userId, storeId, JSON.stringify(inv));
    }
    for (const a of (sampleStore.adMetrics || [])) {
      db.prepare(`INSERT OR IGNORE INTO ad_metrics(product_id,user_id,store_id,data) VALUES (?,?,?,?)`).run(a.productId, userId, storeId, JSON.stringify(a));
    }
    for (const [pid, sig] of Object.entries(sampleStore.monitorSignals || {})) {
      db.prepare(`INSERT OR IGNORE INTO monitor_signals(product_id,user_id,store_id,data) VALUES (?,?,?,?)`).run(pid, userId, storeId, JSON.stringify(sig));
    }
  });
  tx();
  // M3 ads seeding (sync — mocks pre-loaded at module init)
  try {
    seedAdsForUser(db, userId, storeId);
  } catch (e) {
    console.warn('[data-store] seedAdsForUser failed:', e?.message);
  }
  // M1 listings seeding
  try {
    seedListingsForUser(db, userId, storeId);
  } catch (e) {
    console.warn('[data-store] seedListingsForUser failed:', e?.message);
  }
  // M2 profit seeding
  try {
    seedProfitForUser(db, userId, storeId);
  } catch (e) {
    console.warn('[data-store] seedProfitForUser failed:', e?.message);
  }
  // M4 monitor seeding
  try {
    seedMonitorForUser(db, userId, storeId);
  } catch (e) {
    console.warn('[data-store] seedMonitorForUser failed:', e?.message);
  }
}

// ===== Sample store: read APIs =====
export function listProducts(userId, storeId) {
  return getDb().prepare('SELECT data FROM products WHERE user_id = ? AND store_id = ?').all(userId, storeId).map((r) => JSON.parse(r.data));
}
export function getProduct(userId, storeId, productId) {
  const r = getDb().prepare('SELECT data FROM products WHERE user_id = ? AND store_id = ? AND id = ?').get(userId, storeId, productId);
  return r ? JSON.parse(r.data) : null;
}
export function upsertProduct(userId, storeId, product) {
  const db = getDb();
  const id = product.id || newId('prod');
  const item = { ...product, id };
  db.prepare(`INSERT INTO products(id,user_id,store_id,sku,asin,title,data) VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(user_id,store_id,id) DO UPDATE SET sku=excluded.sku, asin=excluded.asin, title=excluded.title, data=excluded.data`).run(
    id, userId, storeId, item.sku || null, item.asin || null, item.title || null, JSON.stringify(item)
  );
  return item;
}
export function removeProduct(userId, storeId, productId) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM products WHERE id = ? AND user_id = ? AND store_id = ?').run(productId, userId, storeId);
    db.prepare('DELETE FROM listings WHERE product_id = ? AND user_id = ? AND store_id = ?').run(productId, userId, storeId);
    db.prepare('DELETE FROM reviews WHERE product_id = ? AND user_id = ? AND store_id = ?').run(productId, userId, storeId);
    db.prepare('DELETE FROM search_terms WHERE product_id = ? AND user_id = ? AND store_id = ?').run(productId, userId, storeId);
    db.prepare('DELETE FROM competitors WHERE product_id = ? AND user_id = ? AND store_id = ?').run(productId, userId, storeId);
  });
  tx();
}

export function getListing(userId, storeId, productId) {
  const r = getDb().prepare('SELECT data FROM listings WHERE user_id = ? AND store_id = ? AND product_id = ?').get(userId, storeId, productId);
  return r ? JSON.parse(r.data) : null;
}
export function upsertListing(userId, storeId, productId, data) {
  getDb().prepare(`INSERT INTO listings(product_id,user_id,store_id,data) VALUES (?,?,?,?)
                   ON CONFLICT(user_id,store_id,product_id) DO UPDATE SET data=excluded.data`).run(productId, userId, storeId, JSON.stringify({ ...data, productId }));
  return { ...data, productId };
}

export function listReviews(userId, storeId, productId) {
  const sql = productId
    ? 'SELECT * FROM reviews WHERE user_id = ? AND store_id = ? AND product_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM reviews WHERE user_id = ? AND store_id = ? ORDER BY created_at DESC';
  const rows = productId ? getDb().prepare(sql).all(userId, storeId, productId) : getDb().prepare(sql).all(userId, storeId);
  return rows.map((r) => ({ id: r.id, productId: r.product_id, rating: r.rating, title: r.title, body: r.body, createdAt: r.created_at }));
}
export function addReview(userId, storeId, review) {
  const id = review.id || newId('rev');
  getDb().prepare('INSERT INTO reviews(id,user_id,store_id,product_id,rating,title,body,created_at) VALUES (?,?,?,?,?,?,?,?)').run(
    id, userId, storeId, review.productId, review.rating || 0, review.title || '', review.body || '', review.createdAt || nowIso()
  );
  return { id, ...review };
}

export function listCompetitors(userId, storeId, productId) {
  const sql = productId
    ? 'SELECT data FROM competitors WHERE user_id = ? AND store_id = ? AND product_id = ?'
    : 'SELECT data FROM competitors WHERE user_id = ? AND store_id = ?';
  const rows = productId ? getDb().prepare(sql).all(userId, storeId, productId) : getDb().prepare(sql).all(userId, storeId);
  return rows.map((r) => JSON.parse(r.data));
}
export function addCompetitor(userId, storeId, c) {
  const id = newId('cmp');
  getDb().prepare('INSERT INTO competitors(id,user_id,store_id,product_id,asin,data) VALUES (?,?,?,?,?,?)').run(id, userId, storeId, c.productId || null, c.asin, JSON.stringify({ id, ...c }));
  return { id, ...c };
}
export function getCompetitorSnapshots(userId, storeId) {
  const rows = getDb().prepare('SELECT phase, data FROM competitor_snapshots WHERE user_id = ? AND store_id = ?').all(userId, storeId);
  const out = { previous: [], current: [] };
  for (const r of rows) out[r.phase] = JSON.parse(r.data);
  return out;
}

export function listSearchTerms(userId, storeId, productId) {
  const sql = productId
    ? 'SELECT data FROM search_terms WHERE user_id = ? AND store_id = ? AND product_id = ?'
    : 'SELECT data FROM search_terms WHERE user_id = ? AND store_id = ?';
  const rows = productId ? getDb().prepare(sql).all(userId, storeId, productId) : getDb().prepare(sql).all(userId, storeId);
  return rows.map((r) => JSON.parse(r.data));
}
export function listOrders(userId, storeId) {
  return getDb().prepare('SELECT data FROM orders WHERE user_id = ? AND store_id = ?').all(userId, storeId).map((r) => JSON.parse(r.data));
}
export function listInventory(userId, storeId) {
  return getDb().prepare('SELECT data FROM inventory WHERE user_id = ? AND store_id = ?').all(userId, storeId).map((r) => JSON.parse(r.data));
}
export function listAdMetrics(userId, storeId) {
  return getDb().prepare('SELECT data FROM ad_metrics WHERE user_id = ? AND store_id = ?').all(userId, storeId).map((r) => JSON.parse(r.data));
}
export function getMonitorSignals(userId, storeId) {
  const rows = getDb().prepare('SELECT product_id, data FROM monitor_signals WHERE user_id = ? AND store_id = ?').all(userId, storeId);
  const out = {};
  for (const r of rows) out[r.product_id] = JSON.parse(r.data);
  return out;
}

// 全部按用户+店铺取出，用于 diagnoseListing 输入
export function getStoreSnapshot(userId, storeId) {
  return {
    products: listProducts(userId, storeId),
    listings: Object.fromEntries(getDb().prepare('SELECT product_id, data FROM listings WHERE user_id = ? AND store_id = ?').all(userId, storeId).map((r) => [r.product_id, JSON.parse(r.data)])),
    reviews: listReviews(userId, storeId),
    competitors: listCompetitors(userId, storeId),
    competitorSnapshots: getCompetitorSnapshots(userId, storeId),
    searchTerms: listSearchTerms(userId, storeId),
    orders: listOrders(userId, storeId),
    inventory: listInventory(userId, storeId),
    adMetrics: listAdMetrics(userId, storeId),
    monitorSignals: getMonitorSignals(userId, storeId),
  };
}

// 维护接口
export function reset() {
  if (_db) { _db.close(); _db = null; }
  if (existsSync(DB_PATH)) {
    try { renameSync(DB_PATH, DB_PATH + '.' + Date.now() + '.bak'); } catch {}
  }
}
export function snapshot() {
  const db = getDb();
  return {
    users: db.prepare('SELECT id, name, email, role FROM users').all(),
    stores: db.prepare('SELECT * FROM user_stores').all(),
    auditLogCount: db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,
    productCount: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
  };
}
