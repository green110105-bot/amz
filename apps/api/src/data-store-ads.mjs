// data-store-ads.mjs — M3 广告模块 SQLite schema + CRUD + 种子数据
// 17 张新表：ad_strategies / ad_suggestions / ad_manual_changes /
//   lx_portfolios / lx_campaigns / lx_ad_groups / lx_ads /
//   lx_targetings / lx_negatives / lx_user_search_terms / lx_operation_logs /
//   lx_daily_data / lx_kw_grabbing / lx_placements / lx_amc_audiences /
//   sqp_queries / search_term_reports
//
// 所有写操作走 appendAuditLog；lx 实体写操作同时写 lx_operation_logs。

import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { appendAuditLog } from './data-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_V2_UTILS_DIR = pathResolve(__dirname, '../../web-v2/src/utils');

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return prefix + '-' + randomBytes(4).toString('hex'); }

// ============================================================
// Schema
// ============================================================
export function initAdsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_strategies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      sovereignty TEXT NOT NULL DEFAULT 'semi',
      scope TEXT,
      trigger_condition TEXT,
      frequency TEXT,
      cooldown_hours INTEGER DEFAULT 24,
      action TEXT,
      guardrails TEXT,
      cross_module TEXT,
      binding_count INTEGER DEFAULT 0,
      trigger_count INTEGER DEFAULT 0,
      success_rate REAL,
      success_trend TEXT,
      last_triggered TEXT,
      extra TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ad_strategies_us ON ad_strategies(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_ad_strategies_cat ON ad_strategies(user_id, store_id, category);

    CREATE TABLE IF NOT EXISTS ad_suggestions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      time_bucket TEXT NOT NULL,
      severity TEXT,
      action_type TEXT,
      cross_module TEXT,
      source_strategy_id TEXT,
      source_strategy_name TEXT,
      entity TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      detail TEXT,
      confidence REAL,
      historical_success_rate REAL,
      impact TEXT,
      evidence TEXT,
      lifecycle TEXT,
      category TEXT,
      strategic_tags TEXT,
      alternatives TEXT,
      state TEXT NOT NULL DEFAULT 'pending',
      cooldown_hours INTEGER DEFAULT 6,
      observation_window_hours INTEGER DEFAULT 72,
      accepted_at TEXT,
      rejected_at TEXT,
      reject_reason TEXT,
      reverted_at TEXT,
      revert_reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ad_sug_us ON ad_suggestions(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_ad_sug_state ON ad_suggestions(user_id, store_id, state);

    CREATE TABLE IF NOT EXISTS ad_manual_changes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      operator TEXT,
      operator_label TEXT,
      operation TEXT,
      ai_verdict TEXT,
      ai_verdict_text TEXT,
      reason TEXT,
      suggested_alternative TEXT,
      state TEXT NOT NULL DEFAULT 'pending',
      resolved_at TEXT,
      resolved_action TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ad_mc_us ON ad_manual_changes(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_ad_mc_state ON ad_manual_changes(user_id, store_id, state);

    CREATE TABLE IF NOT EXISTS lx_portfolios (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      state TEXT,
      service_state TEXT,
      budget_cap REAL,
      msku TEXT,
      asin TEXT,
      sku TEXT,
      region TEXT,
      store_label TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      metrics TEXT,
      extra TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lx_pf_us ON lx_portfolios(user_id, store_id);

    CREATE TABLE IF NOT EXISTS lx_campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      portfolio_id TEXT,
      name TEXT NOT NULL,
      type TEXT,
      targeting_type TEXT,
      state TEXT,
      service_state TEXT,
      service_state_color TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      daily_budget REAL,
      bid_strategy TEXT,
      lifecycle_stage TEXT,
      tags TEXT,
      metrics TEXT,
      extra TEXT,
      started_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lx_cmp_us ON lx_campaigns(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_lx_cmp_pf ON lx_campaigns(user_id, store_id, portfolio_id);

    CREATE TABLE IF NOT EXISTS lx_ad_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      state TEXT,
      default_bid REAL,
      bid_adj REAL,
      metrics TEXT,
      extra TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lx_ag_us ON lx_ad_groups(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_lx_ag_cmp ON lx_ad_groups(user_id, store_id, campaign_id);

    CREATE TABLE IF NOT EXISTS lx_ads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      ad_group_id TEXT,
      asin TEXT,
      sku TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      state TEXT,
      headline TEXT,
      image_url TEXT,
      metrics TEXT,
      extra TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lx_ads_us ON lx_ads(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_lx_ads_ag ON lx_ads(user_id, store_id, ad_group_id);

    CREATE TABLE IF NOT EXISTS lx_targetings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      ad_group_id TEXT,
      type TEXT,
      term TEXT,
      asin TEXT,
      category TEXT,
      match_type TEXT,
      bid REAL,
      suggested_bid_low REAL,
      suggested_bid_high REAL,
      enabled INTEGER NOT NULL DEFAULT 1,
      state TEXT,
      position REAL,
      metrics TEXT,
      extra TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lx_t_us ON lx_targetings(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_lx_t_cmp ON lx_targetings(user_id, store_id, campaign_id);
    CREATE INDEX IF NOT EXISTS idx_lx_t_ag ON lx_targetings(user_id, store_id, ad_group_id);

    CREATE TABLE IF NOT EXISTS lx_negatives (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      ad_group_id TEXT,
      type TEXT,
      term TEXT,
      asin TEXT,
      match_type TEXT,
      scope TEXT,
      added_at TEXT,
      added_by TEXT,
      extra TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lx_neg_us ON lx_negatives(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_lx_neg_cmp ON lx_negatives(user_id, store_id, campaign_id);

    CREATE TABLE IF NOT EXISTS lx_user_search_terms (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      ad_group_id TEXT,
      user_query TEXT,
      matched_kw TEXT,
      match_type TEXT,
      state TEXT,
      signal TEXT,
      metrics TEXT,
      extra TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lx_ust_us ON lx_user_search_terms(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_lx_ust_cmp ON lx_user_search_terms(user_id, store_id, campaign_id);

    CREATE TABLE IF NOT EXISTS lx_operation_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      time TEXT NOT NULL,
      operator TEXT,
      action TEXT,
      detail TEXT,
      source TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lx_oplog_us ON lx_operation_logs(user_id, store_id, time DESC);
    CREATE INDEX IF NOT EXISTS idx_lx_oplog_cmp ON lx_operation_logs(user_id, store_id, campaign_id, time DESC);

    CREATE TABLE IF NOT EXISTS lx_daily_data (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      date TEXT NOT NULL,
      metrics TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lx_dd_us ON lx_daily_data(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_lx_dd_cmp ON lx_daily_data(user_id, store_id, campaign_id, date);

    CREATE TABLE IF NOT EXISTS lx_kw_grabbing (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      ad_group_id TEXT,
      keyword TEXT,
      target_position INTEGER,
      current_bid REAL,
      suggested_bid REAL,
      current_position REAL,
      status TEXT,
      extra TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lx_kwg_us ON lx_kw_grabbing(user_id, store_id);

    CREATE TABLE IF NOT EXISTS lx_placements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      placement TEXT,
      portfolio TEXT,
      bid_strategy TEXT,
      bid_adj REAL,
      metrics TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lx_pl_us ON lx_placements(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_lx_pl_cmp ON lx_placements(user_id, store_id, campaign_id);

    CREATE TABLE IF NOT EXISTS lx_amc_audiences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      name TEXT,
      size INTEGER,
      source TEXT,
      extra TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lx_amc_us ON lx_amc_audiences(user_id, store_id);

    CREATE TABLE IF NOT EXISTS sqp_queries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      asin TEXT,
      sku TEXT,
      search_term TEXT NOT NULL,
      reporting_date TEXT NOT NULL,
      total_search_volume INTEGER,
      impression_share REAL,
      click_share REAL,
      cart_share REAL,
      purchase_share REAL,
      bottleneck TEXT,
      severity TEXT,
      raw TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sqp_us ON sqp_queries(user_id, store_id);

    CREATE TABLE IF NOT EXISTS search_term_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      campaign_id TEXT,
      ad_group_id TEXT,
      search_term TEXT NOT NULL,
      matched_kw TEXT,
      match_type TEXT,
      signal TEXT,
      sku TEXT,
      asin TEXT,
      metrics TEXT,
      reporting_period TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_str_us ON search_term_reports(user_id, store_id);

    -- ===== Strategy ↔ Campaign 多对多关联表（M3 fix #3） =====
    CREATE TABLE IF NOT EXISTS ad_strategy_bindings (
      strategy_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      bound_at TEXT NOT NULL,
      PRIMARY KEY (strategy_id, campaign_id)
    );
    CREATE INDEX IF NOT EXISTS idx_asb_us ON ad_strategy_bindings(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_asb_cmp ON ad_strategy_bindings(user_id, store_id, campaign_id);
    CREATE INDEX IF NOT EXISTS idx_asb_strat ON ad_strategy_bindings(strategy_id);
  `);
}

// ============================================================
// Seeding — load mocks, freeze randomness, insert
// ============================================================

// Override Math.random with a deterministic PRNG during mock load so that
// the random metrics in mock files become reproducible across restarts.
async function withFrozenRandomAsync(seed, fn) {
  let s = seed >>> 0;
  const orig = Math.random;
  Math.random = function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return await fn();
  } finally {
    Math.random = orig;
  }
}

async function loadMocksFrozen() {
  const baseFs = pathToFileURL(WEB_V2_UTILS_DIR).href + '/';
  const files = [
    ['strategies', 'mock-data-strategies.js', 101],
    ['timeline', 'mock-data-ads-timeline.js', 202],
    ['lx', 'mock-data-lx.js', 303],
    ['sqp', 'mock-data-sqp.js', 404],
    ['reports', 'mock-data-ads-reports.js', 505],
  ];
  const out = {};
  for (const [key, file, seed] of files) {
    const url = baseFs + file + `?seed=${seed}`;
    out[key] = await withFrozenRandomAsync(seed, () => import(url));
  }
  return out;
}

// Mocks are loaded once at module-init time with deterministic randomness.
// This makes seedAdsForUser fully synchronous so it can be called from the
// existing sync seedSampleStoreData() codepath.
let _cachedMocks = null;
async function ensureMocks() {
  if (_cachedMocks) return _cachedMocks;
  _cachedMocks = await loadMocksFrozen();
  return _cachedMocks;
}
// Eagerly preload at import time (top-level await is supported in Node ESM).
await ensureMocks();

export function seedAdsForUser(db, userId, storeId) {
  if (!_cachedMocks) {
    console.warn('[data-store-ads] mocks not yet loaded — skipping ads seed');
    return;
  }
  const mocks = _cachedMocks;
  const tx = db.transaction(() => {
    seedStrategies(db, userId, storeId, mocks.strategies);
    seedSuggestions(db, userId, storeId, mocks.timeline);
    seedManualChanges(db, userId, storeId, mocks.timeline);
    seedLx(db, userId, storeId, mocks.lx);
    seedSqp(db, userId, storeId, mocks.sqp);
    seedSearchTermReports(db, userId, storeId, mocks.reports);
  });
  tx();
}

function seedStrategies(db, userId, storeId, mod) {
  const arr = mod.strategies || [];
  const stmt = db.prepare(`INSERT OR IGNORE INTO ad_strategies(
    id, user_id, store_id, category, name, description, enabled, sovereignty, scope,
    trigger_condition, frequency, cooldown_hours, action, guardrails, cross_module,
    binding_count, trigger_count, success_rate, success_trend, last_triggered,
    extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = nowIso();
  for (const s of arr) {
    stmt.run(
      s.id, userId, storeId, s.category, s.name, s.description || null,
      s.enabled ? 1 : 0, s.sovereignty || 'semi', s.scope || null,
      s.trigger?.condition || null, s.trigger?.frequency || null, s.trigger?.cooldownHours || 24,
      JSON.stringify(s.action || null), JSON.stringify(s.guardrails || null),
      s.crossModule || null,
      s.bindingsCount || 0, s.triggerCount || 0,
      s.successRate ?? null, s.successTrend || null,
      s.lastTriggered || null,
      JSON.stringify({
        scopeLabel: s.scopeLabel,
        categoryLabel: s.categoryLabel,
        categoryEmoji: s.categoryEmoji,
        categoryColor: s.categoryColor,
        sovereigntyLabel: s.sovereigntyLabel,
        isTemplate: !!s.isTemplate,
        source: s.source || 'system',
        triggerHistory: s.triggerHistory,
        recentSuggestions: s.recentSuggestions,
      }),
      now, null
    );
  }
}

function seedSuggestions(db, userId, storeId, mod) {
  const arr = mod.suggestions || [];
  const stmt = db.prepare(`INSERT OR IGNORE INTO ad_suggestions(
    id, user_id, store_id, time_bucket, severity, action_type, cross_module,
    source_strategy_id, source_strategy_name, entity, title, summary, detail,
    confidence, historical_success_rate, impact, evidence, lifecycle, category,
    strategic_tags, alternatives, state, cooldown_hours, observation_window_hours,
    accepted_at, rejected_at, reject_reason, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = nowIso();
  for (const s of arr) {
    stmt.run(
      s.id, userId, storeId, s.timeBucket || now,
      JSON.stringify(s.severity || null), JSON.stringify(s.actionType || null),
      s.crossModule || null,
      s.sourceStrategyId || null, s.sourceStrategyName || null,
      JSON.stringify(s.entity || {}),
      s.title || null, s.summary || null, s.detail || null,
      s.confidence ?? null, s.historicalSuccessRate ?? null,
      JSON.stringify(s.impact || null), JSON.stringify(s.evidence || []),
      s.lifecycle || null, s.category || null,
      JSON.stringify(s.strategicTags || []),
      JSON.stringify(s.alternatives || []),
      s.state || 'pending',
      s.cooldownHours || 6, s.observationWindowHours || 72,
      s.acceptedAt || null, s.rejectedAt || null, s.rejectReason || null,
      now
    );
  }
}

function seedManualChanges(db, userId, storeId, mod) {
  const arr = mod.manualChanges || [];
  const stmt = db.prepare(`INSERT OR IGNORE INTO ad_manual_changes(
    id, user_id, store_id, timestamp, operator, operator_label, operation,
    ai_verdict, ai_verdict_text, reason, suggested_alternative, state,
    resolved_at, resolved_action, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = nowIso();
  for (const m of arr) {
    stmt.run(
      m.id, userId, storeId, m.timestamp || now,
      JSON.stringify(m.operator || null), m.operatorLabel || null,
      JSON.stringify(m.operation || null),
      m.aiVerdict || null, m.aiVerdictText || null, m.reason || null,
      JSON.stringify(m.suggestedAlternative || null),
      m.state || 'pending', m.resolvedAt || null, m.resolvedAction || null,
      now
    );
  }
}

function seedLx(db, userId, storeId, mod) {
  const now = nowIso();
  // portfolios
  const pfStmt = db.prepare(`INSERT OR IGNORE INTO lx_portfolios(
    id, user_id, store_id, name, state, service_state, budget_cap, msku, asin, sku,
    region, store_label, enabled, metrics, extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const p of (mod.portfolios || [])) {
    pfStmt.run(
      p.id, userId, storeId, p.name, p.state || '启用',
      p.serviceState || '正在投放', p.budgetCap ?? null,
      p.msku || null, p.asin || null, p.sku || null,
      p.region || 'US', p.store || null, 1,
      JSON.stringify(extractMetrics(p)),
      JSON.stringify({ campaignCount: p.campaignCount, activeCampaignCount: p.activeCampaignCount }),
      now, null
    );
  }

  const cmpStmt = db.prepare(`INSERT OR IGNORE INTO lx_campaigns(
    id, user_id, store_id, portfolio_id, name, type, targeting_type, state,
    service_state, service_state_color, enabled, daily_budget, bid_strategy,
    lifecycle_stage, tags, metrics, extra, started_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const c of (mod.campaigns || [])) {
    cmpStmt.run(
      c.id, userId, storeId, c.portfolioId || null, c.name,
      c.type || null, c.targetingType || null, c.state || '启用',
      c.serviceState || '正在投放', c.serviceStateColor || '#10b981',
      c.enabled === false ? 0 : 1,
      c.dailyBudget ?? null, c.bidStrategy || null,
      c.lifecycleStage || null,
      JSON.stringify(c.tags || []),
      JSON.stringify(extractMetrics(c)),
      JSON.stringify({}),
      c.startedAt || null, now, null
    );
  }

  const agStmt = db.prepare(`INSERT OR IGNORE INTO lx_ad_groups(
    id, user_id, store_id, campaign_id, name, enabled, state, default_bid, bid_adj, metrics, extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const ag of (mod.adGroups || [])) {
    agStmt.run(
      ag.id, userId, storeId, ag.campaignId || null, ag.name,
      ag.enabled === false ? 0 : 1, ag.state || '启用',
      ag.defaultBid ?? null, ag.bidAdj ?? 0,
      JSON.stringify(extractMetrics(ag)),
      JSON.stringify({}),
      now, null
    );
  }

  const adStmt = db.prepare(`INSERT OR IGNORE INTO lx_ads(
    id, user_id, store_id, ad_group_id, asin, sku, enabled, state, headline, image_url, metrics, extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const a of (mod.ads || [])) {
    adStmt.run(
      a.id, userId, storeId, a.adGroupId || null, a.asin || null, a.sku || null,
      a.enabled === false ? 0 : 1, a.state || '启用',
      a.headline || null, a.imageUrl || null,
      JSON.stringify(extractMetrics(a)), JSON.stringify({}), now, null
    );
  }

  const tStmt = db.prepare(`INSERT OR IGNORE INTO lx_targetings(
    id, user_id, store_id, campaign_id, ad_group_id, type, term, asin, category,
    match_type, bid, suggested_bid_low, suggested_bid_high, enabled, state,
    position, metrics, extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const t of (mod.targetings || [])) {
    tStmt.run(
      t.id, userId, storeId, t.campaignId || null, t.adGroupId || null,
      t.type || null, t.term || null, t.asin || null, t.category || null,
      t.matchType || null,
      t.bid ?? null, t.suggestedBidLow ?? null, t.suggestedBidHigh ?? null,
      t.enabled === false ? 0 : 1, t.state || '启用',
      t.position ?? null,
      JSON.stringify(extractMetrics(t)), JSON.stringify({}), now, null
    );
  }

  const ntStmt = db.prepare(`INSERT OR IGNORE INTO lx_negatives(
    id, user_id, store_id, campaign_id, ad_group_id, type, term, asin, match_type, scope, added_at, added_by, extra, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const n of (mod.negativeTargetings || [])) {
    ntStmt.run(
      n.id, userId, storeId, n.campaignId || null, n.adGroupId || null,
      n.type || null, n.term || null, n.asin || null, n.matchType || null,
      n.scope || null, n.addedAt || null, n.addedBy || null,
      JSON.stringify({}), now
    );
  }

  const ustStmt = db.prepare(`INSERT OR IGNORE INTO lx_user_search_terms(
    id, user_id, store_id, campaign_id, ad_group_id, user_query, matched_kw, match_type, state, signal, metrics, extra, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const u of (mod.userSearchTerms || [])) {
    ustStmt.run(
      u.id, userId, storeId, u.campaignId || null, u.adGroupId || null,
      u.userQuery || null, u.matchedKw || null, u.matchType || null,
      u.state || null, u.signal || null,
      JSON.stringify(extractMetrics(u)), JSON.stringify({}), now
    );
  }

  const olStmt = db.prepare(`INSERT OR IGNORE INTO lx_operation_logs(
    id, user_id, store_id, campaign_id, entity_type, entity_id, time, operator, action, detail, source, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const o of (mod.operationLogs || [])) {
    olStmt.run(
      o.id, userId, storeId, o.campaignId || null, 'campaign', o.campaignId || null,
      o.time || now, o.operator || null, o.action || null, o.detail || null,
      o.source || '本工具', now
    );
  }

  const ddStmt = db.prepare(`INSERT OR IGNORE INTO lx_daily_data(
    id, user_id, store_id, campaign_id, date, metrics, created_at)
    VALUES (?,?,?,?,?,?,?)`);
  for (const d of (mod.dailyData || [])) {
    ddStmt.run(
      d.id, userId, storeId, d.campaignId || null, d.date,
      JSON.stringify(extractMetrics(d)), now
    );
  }

  // placements seed — for each campaign, generate the 4 standard rows
  if (typeof mod.placementsFor === 'function') {
    const plStmt = db.prepare(`INSERT OR IGNORE INTO lx_placements(
      id, user_id, store_id, campaign_id, placement, portfolio, bid_strategy, bid_adj, metrics, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    // Only seed for the first 5 campaigns to limit row count
    const seenIds = new Set();
    for (const c of (mod.campaigns || []).slice(0, 5)) {
      const rows = mod.placementsFor(c.id);
      for (const r of rows) {
        if (seenIds.has(r.id)) continue;
        seenIds.add(r.id);
        plStmt.run(
          r.id, userId, storeId, c.id, r.placement || null, r.portfolio || null,
          r.bidStrategy || null, r.bidAdj ?? 0, JSON.stringify(extractMetrics(r)), now, null
        );
      }
    }
  }

  // kw-grabbing: derive 3 rows from sample targetings
  const kwgStmt = db.prepare(`INSERT OR IGNORE INTO lx_kw_grabbing(
    id, user_id, store_id, campaign_id, ad_group_id, keyword, target_position, current_bid, suggested_bid, current_position, status, extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const kwgSeeds = [
    { id: 'kw-g-001', campaignId: 'cmp-001', adGroupId: 'ag-001', keyword: 'ice cream maker', targetPosition: 3, currentBid: 1.25, suggestedBid: 1.55, currentPosition: 4.5, status: 'active' },
    { id: 'kw-g-002', campaignId: 'cmp-001', adGroupId: 'ag-001', keyword: 'ice cream machine', targetPosition: 5, currentBid: 1.15, suggestedBid: 1.30, currentPosition: 6.2, status: 'active' },
    { id: 'kw-g-003', campaignId: 'cmp-021', adGroupId: null, keyword: 'usb c cable', targetPosition: 3, currentBid: 0.85, suggestedBid: 1.05, currentPosition: 4.8, status: 'paused' },
  ];
  for (const k of kwgSeeds) {
    kwgStmt.run(
      k.id, userId, storeId, k.campaignId, k.adGroupId, k.keyword,
      k.targetPosition, k.currentBid, k.suggestedBid, k.currentPosition, k.status,
      JSON.stringify({}), now, null
    );
  }

  // amc audiences
  const amcStmt = db.prepare(`INSERT OR IGNORE INTO lx_amc_audiences(
    id, user_id, store_id, name, size, source, extra, created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const a of (mod.amcAudiences || [])) {
    amcStmt.run(a.id, userId, storeId, a.name, a.size ?? null, a.source || 'AMC', JSON.stringify({}), now);
  }
}

function seedSqp(db, userId, storeId, mod) {
  const arr = mod.sqpRows || [];
  const stmt = db.prepare(`INSERT OR IGNORE INTO sqp_queries(
    id, user_id, store_id, asin, sku, search_term, reporting_date,
    total_search_volume, impression_share, click_share, cart_share, purchase_share,
    bottleneck, severity, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of arr) {
    stmt.run(
      r.id, userId, storeId, r.asin || null, r.sku || null,
      r.query, r.weekStart || '2026-05-12',
      r.totalSearchVolume || 0,
      r.shares?.impression ?? null, r.shares?.click ?? null,
      r.shares?.cart ?? null, r.shares?.purchase ?? null,
      r.diagnosis?.bottleneck || null, r.diagnosis?.severity || null,
      JSON.stringify(r)
    );
  }
}

function seedSearchTermReports(db, userId, storeId, mod) {
  const arr = mod.searchTermsReport || [];
  const stmt = db.prepare(`INSERT OR IGNORE INTO search_term_reports(
    id, user_id, store_id, campaign_id, ad_group_id, search_term, matched_kw,
    match_type, signal, sku, asin, metrics, reporting_period, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = nowIso();
  for (const r of arr) {
    stmt.run(
      r.id, userId, storeId, r.campaign || null, r.adGroup || null,
      r.term, null, r.match || null, r.signal || null,
      r.sku || null, r.asin || null,
      JSON.stringify({
        impressions: r.impressions, clicks: r.clicks, cpc: r.cpc, spend: r.spend,
        orders: r.orders, sales: r.sales, acos: r.acos, ctr: r.ctr, cvr: r.cvr,
        roas: r.roas, clickShare: r.clickShare,
      }),
      r.period || '7d', now
    );
  }
}

function extractMetrics(obj) {
  const fields = [
    'impressions','clicks','clickPct','ctr','cpc','spend','spendPct','sales','salesPct',
    'directSales','acos','orders','directOrders','cpa','cvr','adUnitPrice','adUnits',
  ];
  const out = {};
  for (const k of fields) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// ============================================================
// Row → object conversion helpers
// ============================================================
function rowToStrategy(r) {
  if (!r) return null;
  let action = null, guardrails = null, extra = null;
  try { action = JSON.parse(r.action || 'null'); } catch {}
  try { guardrails = JSON.parse(r.guardrails || 'null'); } catch {}
  try { extra = JSON.parse(r.extra || 'null'); } catch {}
  return {
    id: r.id, category: r.category, name: r.name, description: r.description,
    enabled: !!r.enabled, sovereignty: r.sovereignty, scope: r.scope,
    trigger: { condition: r.trigger_condition, frequency: r.frequency, cooldownHours: r.cooldown_hours },
    action, guardrails, crossModule: r.cross_module,
    bindingsCount: r.binding_count, triggerCount: r.trigger_count,
    successRate: r.success_rate, successTrend: r.success_trend,
    lastTriggered: r.last_triggered,
    createdAt: r.created_at, updatedAt: r.updated_at,
    ...(extra || {}),
  };
}

function rowToSuggestion(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, timeBucket: r.time_bucket,
    severity: j(r.severity), actionType: j(r.action_type),
    crossModule: r.cross_module,
    sourceStrategyId: r.source_strategy_id, sourceStrategyName: r.source_strategy_name,
    entity: j(r.entity),
    title: r.title, summary: r.summary, detail: r.detail,
    confidence: r.confidence, historicalSuccessRate: r.historical_success_rate,
    impact: j(r.impact), evidence: j(r.evidence) || [],
    lifecycle: r.lifecycle, category: r.category,
    strategicTags: j(r.strategic_tags) || [],
    alternatives: j(r.alternatives) || [],
    state: r.state,
    cooldownHours: r.cooldown_hours, observationWindowHours: r.observation_window_hours,
    acceptedAt: r.accepted_at, rejectedAt: r.rejected_at, rejectReason: r.reject_reason,
    revertedAt: r.reverted_at, revertReason: r.revert_reason,
    createdAt: r.created_at,
  };
}

function rowToManualChange(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, timestamp: r.timestamp,
    operator: j(r.operator), operatorLabel: r.operator_label,
    operation: j(r.operation),
    aiVerdict: r.ai_verdict, aiVerdictText: r.ai_verdict_text, reason: r.reason,
    suggestedAlternative: j(r.suggested_alternative),
    state: r.state, resolvedAt: r.resolved_at, resolvedAction: r.resolved_action,
  };
}

function rowToPortfolio(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, name: r.name, state: r.state, serviceState: r.service_state,
    budgetCap: r.budget_cap,
    msku: r.msku, asin: r.asin, sku: r.sku,
    region: r.region, store: r.store_label, enabled: !!r.enabled,
    ...(j(r.metrics) || {}), ...(j(r.extra) || {}),
  };
}

function rowToCampaign(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, portfolioId: r.portfolio_id, name: r.name,
    type: r.type, targetingType: r.targeting_type,
    state: r.state, serviceState: r.service_state, serviceStateColor: r.service_state_color,
    enabled: !!r.enabled,
    dailyBudget: r.daily_budget, bidStrategy: r.bid_strategy,
    lifecycleStage: r.lifecycle_stage,
    tags: j(r.tags) || [],
    startedAt: r.started_at,
    ...(j(r.metrics) || {}),
  };
}

function rowToAdGroup(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, campaignId: r.campaign_id, name: r.name,
    enabled: !!r.enabled, state: r.state,
    defaultBid: r.default_bid, bidAdj: r.bid_adj,
    ...(j(r.metrics) || {}),
  };
}

function rowToAd(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, adGroupId: r.ad_group_id, asin: r.asin, sku: r.sku,
    enabled: !!r.enabled, state: r.state, headline: r.headline, imageUrl: r.image_url,
    ...(j(r.metrics) || {}),
  };
}

function rowToTargeting(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, campaignId: r.campaign_id, adGroupId: r.ad_group_id,
    type: r.type, term: r.term, asin: r.asin, category: r.category,
    matchType: r.match_type,
    bid: r.bid, suggestedBidLow: r.suggested_bid_low, suggestedBidHigh: r.suggested_bid_high,
    enabled: !!r.enabled, state: r.state, position: r.position,
    ...(j(r.metrics) || {}),
  };
}

function rowToNegative(r) {
  if (!r) return null;
  return {
    id: r.id, campaignId: r.campaign_id, adGroupId: r.ad_group_id,
    type: r.type, term: r.term, asin: r.asin, matchType: r.match_type,
    scope: r.scope, addedAt: r.added_at, addedBy: r.added_by,
  };
}

function rowToUst(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, campaignId: r.campaign_id, adGroupId: r.ad_group_id,
    userQuery: r.user_query, matchedKw: r.matched_kw, matchType: r.match_type,
    state: r.state, signal: r.signal,
    ...(j(r.metrics) || {}),
  };
}

function rowToOpLog(r) {
  if (!r) return null;
  return {
    id: r.id, campaignId: r.campaign_id, entityType: r.entity_type, entityId: r.entity_id,
    time: r.time, operator: r.operator, action: r.action, detail: r.detail, source: r.source,
  };
}

function rowToDaily(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return { id: r.id, campaignId: r.campaign_id, date: r.date, ...(j(r.metrics) || {}) };
}

function rowToKwg(r) {
  if (!r) return null;
  return {
    id: r.id, campaignId: r.campaign_id, adGroupId: r.ad_group_id, keyword: r.keyword,
    targetPosition: r.target_position, currentBid: r.current_bid, suggestedBid: r.suggested_bid,
    currentPosition: r.current_position, status: r.status,
  };
}

function rowToPlacement(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, campaignId: r.campaign_id, placement: r.placement, portfolio: r.portfolio,
    bidStrategy: r.bid_strategy, bidAdj: r.bid_adj, ...(j(r.metrics) || {}),
  };
}

function rowToAmc(r) {
  if (!r) return null;
  return { id: r.id, name: r.name, size: r.size, source: r.source };
}

function rowToSqp(r) {
  if (!r) return null;
  let raw = null;
  try { raw = JSON.parse(r.raw); } catch {}
  return raw || {
    id: r.id, query: r.search_term, asin: r.asin, sku: r.sku,
    weekStart: r.reporting_date, totalSearchVolume: r.total_search_volume,
    shares: { impression: r.impression_share, click: r.click_share, cart: r.cart_share, purchase: r.purchase_share },
    diagnosis: { bottleneck: r.bottleneck, severity: r.severity },
  };
}

function rowToStr(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  return {
    id: r.id, campaignId: r.campaign_id, adGroupId: r.ad_group_id,
    term: r.search_term, matchedKw: r.matched_kw, matchType: r.match_type,
    signal: r.signal, sku: r.sku, asin: r.asin, period: r.reporting_period,
    ...(j(r.metrics) || {}),
  };
}

// ============================================================
// Helper: shared lx-write transaction (audit + lx_oplog)
// ============================================================
function writeLxOp(db, userId, storeId, op) {
  const id = newId('op');
  db.prepare(`INSERT INTO lx_operation_logs(
    id, user_id, store_id, campaign_id, entity_type, entity_id, time, operator, action, detail, source, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, op.campaignId || null, op.entityType || null, op.entityId || null,
    op.time || nowIso(), op.operator || 'operator', op.action || null, op.detail || null,
    op.source || '本工具', nowIso()
  );
}

// ============================================================
// Strategies CRUD
// ============================================================
export function listStrategies(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM ad_strategies WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.category) { sql += ' AND category = ?'; params.push(filters.category); }
  if (filters.status === 'enabled') { sql += ' AND enabled = 1'; }
  else if (filters.status === 'disabled') { sql += ' AND enabled = 0'; }
  if (filters.sov) { sql += ' AND sovereignty = ?'; params.push(filters.sov); }
  if (filters.scope) { sql += ' AND scope = ?'; params.push(filters.scope); }
  if (filters.q) { sql += ' AND (name LIKE ? OR description LIKE ?)'; const q = '%' + filters.q + '%'; params.push(q, q); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(rowToStrategy);
}

export function getStrategy(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM ad_strategies WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  const s = rowToStrategy(r);
  if (!s) return null;
  // Attach bindings list (join with lx_campaigns)
  s.bindings = getStrategyBindings(db, userId, storeId, id);
  return s;
}

// Multi-to-multi strategy ↔ campaign binding helpers (M3 fix #3)
export function getStrategyBindings(db, userId, storeId, strategyId) {
  return db.prepare(`
    SELECT b.campaign_id, c.name, c.type, c.portfolio_id
    FROM ad_strategy_bindings b
    LEFT JOIN lx_campaigns c ON c.id = b.campaign_id AND c.user_id = b.user_id AND c.store_id = b.store_id
    WHERE b.strategy_id = ? AND b.user_id = ? AND b.store_id = ?
  `).all(strategyId, userId, storeId).map((r) => ({
    id: r.campaign_id,
    name: r.name || r.campaign_id,
    type: r.type || '?',
    portfolioId: r.portfolio_id || null,
  }));
}

export function getStrategyBindingIds(db, userId, storeId, strategyId) {
  return db.prepare(
    'SELECT campaign_id FROM ad_strategy_bindings WHERE strategy_id = ? AND user_id = ? AND store_id = ?'
  ).all(strategyId, userId, storeId).map((r) => r.campaign_id);
}

export function getStrategiesByCampaign(db, userId, storeId, campaignId) {
  return db.prepare(`
    SELECT s.* FROM ad_strategy_bindings b
    JOIN ad_strategies s ON s.id = b.strategy_id AND s.user_id = b.user_id AND s.store_id = b.store_id
    WHERE b.campaign_id = ? AND b.user_id = ? AND b.store_id = ?
  `).all(campaignId, userId, storeId).map(rowToStrategy);
}

export function bindStrategyToCampaigns(db, userId, storeId, strategyId, campaignIds) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM ad_strategy_bindings WHERE strategy_id = ? AND user_id = ? AND store_id = ?').run(strategyId, userId, storeId);
    const ins = db.prepare(`INSERT OR IGNORE INTO ad_strategy_bindings(strategy_id, campaign_id, user_id, store_id, bound_at) VALUES (?,?,?,?,?)`);
    const now = nowIso();
    const seen = new Set();
    for (const cid of (campaignIds || [])) {
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      ins.run(strategyId, cid, userId, storeId, now);
    }
    const finalCount = db.prepare('SELECT COUNT(*) as n FROM ad_strategy_bindings WHERE strategy_id = ? AND user_id = ? AND store_id = ?').get(strategyId, userId, storeId).n;
    db.prepare('UPDATE ad_strategies SET binding_count=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(finalCount, now, strategyId, userId, storeId);
  });
  tx();
}

export function createStrategy(db, userId, storeId, body) {
  if (!body || !body.name || !body.category) return null;
  const id = body.id || newId('st-c');
  const now = nowIso();
  db.prepare(`INSERT INTO ad_strategies(
    id, user_id, store_id, category, name, description, enabled, sovereignty, scope,
    trigger_condition, frequency, cooldown_hours, action, guardrails, cross_module,
    binding_count, trigger_count, success_rate, success_trend, last_triggered,
    extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.category, body.name, body.description || null,
    body.enabled === false ? 0 : 1, body.sovereignty || 'semi', body.scope || 'account',
    body.trigger?.condition || null, body.trigger?.frequency || null, body.trigger?.cooldownHours ?? 24,
    JSON.stringify(body.action || null), JSON.stringify(body.guardrails || null),
    body.crossModule || null,
    body.bindingsCount || 0, body.triggerCount || 0,
    body.successRate ?? null, body.successTrend || null,
    body.lastTriggered || null,
    JSON.stringify({ source: 'user', isTemplate: false }),
    now, null
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'STRATEGY_CREATE', resourceType: 'ad_strategy', resourceId: id,
    name: body.name, category: body.category,
  });
  return getStrategy(db, userId, storeId, id);
}

export function updateStrategy(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM ad_strategies WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  // Capture previous values for the fields being touched (for revert)
  const previousValues = {};
  const colToVal = {
    name: cur.name, description: cur.description, sovereignty: cur.sovereignty, scope: cur.scope,
    frequency: cur.frequency, successTrend: cur.success_trend, crossModule: cur.cross_module,
    enabled: !!cur.enabled, cooldownHours: cur.cooldown_hours,
  };
  for (const k of Object.keys(patch || {})) {
    if (k in colToVal) previousValues[k] = colToVal[k];
  }
  if (patch.action !== undefined) { try { previousValues.action = JSON.parse(cur.action || 'null'); } catch { previousValues.action = null; } }
  if (patch.guardrails !== undefined) { try { previousValues.guardrails = JSON.parse(cur.guardrails || 'null'); } catch { previousValues.guardrails = null; } }
  if (patch.trigger?.condition !== undefined) previousValues.triggerCondition = cur.trigger_condition;

  const fields = [];
  const params = [];
  const map = {
    name: 'name', description: 'description', sovereignty: 'sovereignty', scope: 'scope',
    frequency: 'frequency', successTrend: 'success_trend', crossModule: 'cross_module',
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) { fields.push(`${col}=?`); params.push(patch[k]); }
  }
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  if (patch.cooldownHours !== undefined) { fields.push('cooldown_hours=?'); params.push(patch.cooldownHours); }
  if (patch.trigger?.condition !== undefined) { fields.push('trigger_condition=?'); params.push(patch.trigger.condition); }
  if (patch.action !== undefined) { fields.push('action=?'); params.push(JSON.stringify(patch.action)); }
  if (patch.guardrails !== undefined) { fields.push('guardrails=?'); params.push(JSON.stringify(patch.guardrails)); }
  if (patch.bindingsCount !== undefined) { fields.push('binding_count=?'); params.push(patch.bindingsCount); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  db.prepare(`UPDATE ad_strategies SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'STRATEGY_UPDATE', resourceType: 'ad_strategy', resourceId: id, patch,
    previousValues,
  });
  return getStrategy(db, userId, storeId, id);
}

export function deleteStrategy(db, userId, storeId, id) {
  const r = db.prepare('DELETE FROM ad_strategies WHERE id = ? AND user_id = ? AND store_id = ?').run(id, userId, storeId);
  if (r.changes > 0) {
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'STRATEGY_DELETE', resourceType: 'ad_strategy', resourceId: id,
    });
  }
  return r.changes > 0;
}

export function toggleStrategy(db, userId, storeId, id, enabled) {
  const cur = db.prepare('SELECT enabled FROM ad_strategies WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const newEnabled = enabled ? 1 : 0;
  db.prepare('UPDATE ad_strategies SET enabled=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(newEnabled, nowIso(), id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'STRATEGY_TOGGLE', resourceType: 'ad_strategy', resourceId: id,
    before: { enabled: !!cur.enabled }, after: { enabled: !!newEnabled },
  });
  return getStrategy(db, userId, storeId, id);
}

export function bindStrategy(db, userId, storeId, id, campaignIds) {
  const cur = getStrategy(db, userId, storeId, id);
  if (!cur) return null;
  const previousBindings = getStrategyBindingIds(db, userId, storeId, id);
  bindStrategyToCampaigns(db, userId, storeId, id, campaignIds);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'STRATEGY_BIND', resourceType: 'ad_strategy', resourceId: id,
    campaignIds: Array.isArray(campaignIds) ? campaignIds : [],
    previousValues: { bindings: previousBindings },
  });
  return getStrategy(db, userId, storeId, id);
}

// ============================================================
// Suggestions CRUD
// ============================================================
export function listSuggestions(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM ad_suggestions WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.state) { sql += ' AND state = ?'; params.push(filters.state); }
  if (filters.strategy) { sql += ' AND source_strategy_id = ?'; params.push(filters.strategy); }
  if (filters.sku) { sql += ` AND entity LIKE ?`; params.push('%"sku":"' + filters.sku + '"%'); }
  sql += ' ORDER BY time_bucket DESC';
  return db.prepare(sql).all(...params).map(rowToSuggestion);
}

export function getSuggestion(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM ad_suggestions WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  return rowToSuggestion(r);
}

export function acceptSuggestion(db, userId, storeId, id, body = {}) {
  const cur = getSuggestion(db, userId, storeId, id);
  if (!cur) return null;
  if (cur.state === 'observing') {
    // Idempotent — already accepted
    return cur;
  }
  const now = nowIso();
  db.prepare(`UPDATE ad_suggestions SET state='observing', accepted_at=?, rejected_at=NULL, reject_reason=NULL, reverted_at=NULL, revert_reason=NULL WHERE id=? AND user_id=? AND store_id=?`).run(now, id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'TIMELINE_ACCEPT', resourceType: 'ad_suggestion', resourceId: id,
    chosenAlternativeIndex: body.chosenAlternativeIndex ?? 0,
    previousValues: { state: cur.state, acceptedAt: cur.acceptedAt },
  });
  return getSuggestion(db, userId, storeId, id);
}

export function rejectSuggestion(db, userId, storeId, id, body = {}) {
  const cur = getSuggestion(db, userId, storeId, id);
  if (!cur) return null;
  if (cur.state === 'rejected') return cur;
  const now = nowIso();
  db.prepare(`UPDATE ad_suggestions SET state='rejected', rejected_at=?, reject_reason=? WHERE id=? AND user_id=? AND store_id=?`).run(now, body.reason || null, id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'TIMELINE_REJECT', resourceType: 'ad_suggestion', resourceId: id,
    reason: body.reason,
  });
  return getSuggestion(db, userId, storeId, id);
}

export function revertSuggestion(db, userId, storeId, id, body = {}) {
  const cur = getSuggestion(db, userId, storeId, id);
  if (!cur) return null;
  if (cur.state === 'pending') return cur;
  const now = nowIso();
  db.prepare(`UPDATE ad_suggestions SET state='pending', accepted_at=NULL, rejected_at=NULL, reject_reason=NULL, reverted_at=?, revert_reason=? WHERE id=? AND user_id=? AND store_id=?`).run(now, body.reason || null, id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'TIMELINE_REVERT', resourceType: 'ad_suggestion', resourceId: id,
    reason: body.reason,
    previousValues: { state: cur.state, acceptedAt: cur.acceptedAt, rejectedAt: cur.rejectedAt, rejectReason: cur.rejectReason },
  });
  return getSuggestion(db, userId, storeId, id);
}

// ============================================================
// Manual changes CRUD
// ============================================================
export function listManualChanges(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM ad_manual_changes WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.state) { sql += ' AND state = ?'; params.push(filters.state); }
  sql += ' ORDER BY timestamp DESC';
  return db.prepare(sql).all(...params).map(rowToManualChange);
}

export function applyManualChangeAlternative(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM ad_manual_changes WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.state === 'resolved') return rowToManualChange(cur);
  const now = nowIso();
  db.prepare(`UPDATE ad_manual_changes SET state='resolved', resolved_at=?, resolved_action='accepted-alternative' WHERE id=? AND user_id=? AND store_id=?`).run(now, id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'ACCEPT_ALTERNATIVE_TO_MANUAL_CHANGE', resourceType: 'ad_manual_change', resourceId: id,
    previousValues: { state: cur.state, resolvedAt: cur.resolved_at, resolvedAction: cur.resolved_action },
  });
  return rowToManualChange(db.prepare('SELECT * FROM ad_manual_changes WHERE id = ?').get(id));
}

export function ignoreManualChange(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM ad_manual_changes WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.state === 'resolved') return rowToManualChange(cur);
  const now = nowIso();
  db.prepare(`UPDATE ad_manual_changes SET state='resolved', resolved_at=?, resolved_action='ignored' WHERE id=? AND user_id=? AND store_id=?`).run(now, id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'MANUAL_CHANGE_IGNORE', resourceType: 'ad_manual_change', resourceId: id,
    previousValues: { state: cur.state, resolvedAt: cur.resolved_at, resolvedAction: cur.resolved_action },
  });
  return rowToManualChange(db.prepare('SELECT * FROM ad_manual_changes WHERE id = ?').get(id));
}

// Helper used internally when a lx write creates a manual change record
export function recordManualChange(db, userId, storeId, mc) {
  const id = mc.id || newId('mch');
  const now = nowIso();
  db.prepare(`INSERT INTO ad_manual_changes(
    id, user_id, store_id, timestamp, operator, operator_label, operation,
    ai_verdict, ai_verdict_text, reason, suggested_alternative, state,
    resolved_at, resolved_action, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, mc.timestamp || now,
    JSON.stringify(mc.operator || { name: 'operator', source: 'our-tool' }),
    mc.operatorLabel || 'operator (本工具)',
    JSON.stringify(mc.operation || null),
    mc.aiVerdict || 'neutral', mc.aiVerdictText || '中性', mc.reason || null,
    JSON.stringify(mc.suggestedAlternative || null),
    mc.state || 'pending', null, null, now
  );
  return id;
}

// ============================================================
// LX portfolios
// ============================================================
export function listPortfolios(db, userId, storeId) {
  return db.prepare('SELECT * FROM lx_portfolios WHERE user_id = ? AND store_id = ? ORDER BY created_at').all(userId, storeId).map(rowToPortfolio);
}
export function getPortfolio(db, userId, storeId, id) {
  return rowToPortfolio(db.prepare('SELECT * FROM lx_portfolios WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId));
}
export function createPortfolio(db, userId, storeId, body) {
  if (!body?.name) return null;
  const id = body.id || newId('pf');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_portfolios(
      id, user_id, store_id, name, state, service_state, budget_cap, msku, asin, sku,
      region, store_label, enabled, metrics, extra, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.name, body.state || '启用',
      body.serviceState || '正在投放', body.budgetCap ?? null,
      body.msku || null, body.asin || null, body.sku || null,
      body.region || 'US', body.store || null, 1,
      JSON.stringify({}), JSON.stringify({}), now, null
    );
    writeLxOp(db, userId, storeId, { entityType: 'portfolio', entityId: id, action: '创建广告组合', detail: body.name });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_PORTFOLIO_CREATE', resourceType: 'lx_portfolio', resourceId: id, name: body.name });
  });
  tx();
  return getPortfolio(db, userId, storeId, id);
}
export function updatePortfolio(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM lx_portfolios WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = [], params = [];
  if (patch.name !== undefined) { fields.push('name=?'); params.push(patch.name); }
  if (patch.state !== undefined) { fields.push('state=?'); params.push(patch.state); }
  if (patch.budgetCap !== undefined) { fields.push('budget_cap=?'); params.push(patch.budgetCap); }
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE lx_portfolios SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
    writeLxOp(db, userId, storeId, { entityType: 'portfolio', entityId: id, action: '修改广告组合', detail: JSON.stringify(patch) });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_PORTFOLIO_UPDATE', resourceType: 'lx_portfolio', resourceId: id, patch });
  });
  tx();
  return getPortfolio(db, userId, storeId, id);
}
export function deletePortfolio(db, userId, storeId, id) {
  const cur = getPortfolio(db, userId, storeId, id);
  if (!cur) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lx_portfolios WHERE id=? AND user_id=? AND store_id=?').run(id, userId, storeId);
    writeLxOp(db, userId, storeId, { entityType: 'portfolio', entityId: id, action: '删除广告组合', detail: cur.name });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_PORTFOLIO_DELETE', resourceType: 'lx_portfolio', resourceId: id });
  });
  tx();
  return true;
}
export function togglePortfolio(db, userId, storeId, id, enabled) {
  const cur = getPortfolio(db, userId, storeId, id);
  if (!cur) return null;
  const tx = db.transaction(() => {
    db.prepare('UPDATE lx_portfolios SET enabled=?, state=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(
      enabled ? 1 : 0, enabled ? '启用' : '已暂停', nowIso(), id, userId, storeId);
    writeLxOp(db, userId, storeId, { entityType: 'portfolio', entityId: id, action: enabled ? '启用' : '暂停', detail: cur.name });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'LX_PORTFOLIO_TOGGLE', resourceType: 'lx_portfolio', resourceId: id,
      before: { enabled: cur.enabled }, after: { enabled: !!enabled },
    });
  });
  tx();
  return getPortfolio(db, userId, storeId, id);
}
export function updatePortfolioBudget(db, userId, storeId, id, budgetCap) {
  const cur = getPortfolio(db, userId, storeId, id);
  if (!cur) return null;
  const tx = db.transaction(() => {
    db.prepare('UPDATE lx_portfolios SET budget_cap=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(budgetCap, nowIso(), id, userId, storeId);
    writeLxOp(db, userId, storeId, { entityType: 'portfolio', entityId: id, action: '修改预算上限', detail: `${cur.budgetCap} → ${budgetCap}` });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'LX_PORTFOLIO_BUDGET_UPDATE', resourceType: 'lx_portfolio', resourceId: id,
      before: { budgetCap: cur.budgetCap }, after: { budgetCap },
    });
  });
  tx();
  return getPortfolio(db, userId, storeId, id);
}

// ============================================================
// LX campaigns
// ============================================================
export function listCampaigns(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_campaigns WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.portfolioId) { sql += ' AND portfolio_id = ?'; params.push(filters.portfolioId); }
  sql += ' ORDER BY created_at';
  return db.prepare(sql).all(...params).map(rowToCampaign);
}
export function getCampaign(db, userId, storeId, id) {
  return rowToCampaign(db.prepare('SELECT * FROM lx_campaigns WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId));
}
export function createCampaign(db, userId, storeId, body) {
  if (!body?.name) return null;
  const id = body.id || newId('cmp');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_campaigns(
      id, user_id, store_id, portfolio_id, name, type, targeting_type, state,
      service_state, service_state_color, enabled, daily_budget, bid_strategy,
      lifecycle_stage, tags, metrics, extra, started_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.portfolioId || null, body.name,
      body.type || 'SP', body.targetingType || '手动', body.state || '启用',
      body.serviceState || '正在投放', body.serviceStateColor || '#10b981',
      body.enabled === false ? 0 : 1,
      body.dailyBudget ?? null, body.bidStrategy || '动态竞价 - 仅降低',
      body.lifecycleStage || 'launch', JSON.stringify(body.tags || []),
      JSON.stringify({}), JSON.stringify({}),
      body.startedAt || now.slice(0, 10), now, null
    );
    writeLxOp(db, userId, storeId, { campaignId: id, entityType: 'campaign', entityId: id, action: '创建活动', detail: body.name });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_CAMPAIGN_CREATE', resourceType: 'lx_campaign', resourceId: id, name: body.name });
  });
  tx();
  return getCampaign(db, userId, storeId, id);
}
export function updateCampaign(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM lx_campaigns WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = [], params = [];
  const map = { name: 'name', type: 'type', targetingType: 'targeting_type', state: 'state',
    serviceState: 'service_state', portfolioId: 'portfolio_id', bidStrategy: 'bid_strategy', lifecycleStage: 'lifecycle_stage' };
  for (const [k, c] of Object.entries(map)) if (patch[k] !== undefined) { fields.push(`${c}=?`); params.push(patch[k]); }
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  if (patch.dailyBudget !== undefined) { fields.push('daily_budget=?'); params.push(patch.dailyBudget); }
  if (patch.tags !== undefined) { fields.push('tags=?'); params.push(JSON.stringify(patch.tags)); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE lx_campaigns SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
    writeLxOp(db, userId, storeId, { campaignId: id, entityType: 'campaign', entityId: id, action: '修改活动', detail: JSON.stringify(patch) });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_CAMPAIGN_UPDATE', resourceType: 'lx_campaign', resourceId: id, patch });
  });
  tx();
  return getCampaign(db, userId, storeId, id);
}
export function deleteCampaign(db, userId, storeId, id) {
  const cur = getCampaign(db, userId, storeId, id);
  if (!cur) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lx_campaigns WHERE id=? AND user_id=? AND store_id=?').run(id, userId, storeId);
    writeLxOp(db, userId, storeId, { campaignId: id, entityType: 'campaign', entityId: id, action: '删除活动', detail: cur.name });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_CAMPAIGN_DELETE', resourceType: 'lx_campaign', resourceId: id });
  });
  tx();
  return true;
}
export function toggleCampaign(db, userId, storeId, id, enabled) {
  const cur = getCampaign(db, userId, storeId, id);
  if (!cur) return null;
  const tx = db.transaction(() => {
    db.prepare(`UPDATE lx_campaigns SET enabled=?, state=?, service_state=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(
      enabled ? 1 : 0, enabled ? '启用' : '已暂停', enabled ? '正在投放' : '广告活动已暂停',
      nowIso(), id, userId, storeId);
    writeLxOp(db, userId, storeId, { campaignId: id, entityType: 'campaign', entityId: id, action: enabled ? '启用' : '暂停', detail: cur.name });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'LX_CAMPAIGN_TOGGLE', resourceType: 'lx_campaign', resourceId: id,
      before: { enabled: cur.enabled }, after: { enabled: !!enabled },
    });
  });
  tx();
  return getCampaign(db, userId, storeId, id);
}
export function updateCampaignBudget(db, userId, storeId, id, dailyBudget, source = 'our-tool') {
  const cur = getCampaign(db, userId, storeId, id);
  if (!cur) return null;
  const before = cur.dailyBudget;
  const tx = db.transaction(() => {
    db.prepare('UPDATE lx_campaigns SET daily_budget=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(dailyBudget, nowIso(), id, userId, storeId);
    writeLxOp(db, userId, storeId, {
      campaignId: id, entityType: 'campaign', entityId: id, action: '修改预算',
      detail: `日预算 $${before} → $${dailyBudget}`, source: source === 'our-tool' ? '本工具' : 'Amazon 后台',
    });
    // External-change record: any budget update by the user creates a manual change for AI review
    recordManualChange(db, userId, storeId, {
      operator: { name: 'operator', source }, operatorLabel: 'operator (本工具)',
      operation: { entity: cur.name, action: '预算调整', before: `$${before}/日`, after: `$${dailyBudget}/日`, change: before ? `${Math.round((dailyBudget - before) / before * 100)}%` : '—' },
      aiVerdict: 'neutral', aiVerdictText: '待评估', reason: 'AI 评估生成中...',
      state: 'pending',
    });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'LX_CAMPAIGN_BUDGET_UPDATE', resourceType: 'lx_campaign', resourceId: id,
      before: { dailyBudget: before }, after: { dailyBudget },
    });
  });
  tx();
  return getCampaign(db, userId, storeId, id);
}
export function updateCampaignBidStrategy(db, userId, storeId, id, bidStrategy) {
  const cur = getCampaign(db, userId, storeId, id);
  if (!cur) return null;
  const tx = db.transaction(() => {
    db.prepare('UPDATE lx_campaigns SET bid_strategy=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(bidStrategy, nowIso(), id, userId, storeId);
    writeLxOp(db, userId, storeId, { campaignId: id, entityType: 'campaign', entityId: id, action: '修改竞价策略', detail: `${cur.bidStrategy} → ${bidStrategy}` });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'LX_CAMPAIGN_BID_STRATEGY_UPDATE', resourceType: 'lx_campaign', resourceId: id,
      before: { bidStrategy: cur.bidStrategy }, after: { bidStrategy },
    });
  });
  tx();
  return getCampaign(db, userId, storeId, id);
}

// ============================================================
// LX ad-groups
// ============================================================
export function listAdGroups(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_ad_groups WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  sql += ' ORDER BY created_at';
  return db.prepare(sql).all(...params).map(rowToAdGroup);
}
export function getAdGroup(db, userId, storeId, id) {
  return rowToAdGroup(db.prepare('SELECT * FROM lx_ad_groups WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId));
}
export function createAdGroup(db, userId, storeId, body) {
  if (!body?.name) return null;
  const id = body.id || newId('ag');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_ad_groups(
      id, user_id, store_id, campaign_id, name, enabled, state, default_bid, bid_adj, metrics, extra, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.campaignId || null, body.name,
      body.enabled === false ? 0 : 1, body.state || '启用',
      body.defaultBid ?? null, body.bidAdj ?? 0,
      JSON.stringify({}), JSON.stringify({}), now, null
    );
    writeLxOp(db, userId, storeId, { campaignId: body.campaignId, entityType: 'ad_group', entityId: id, action: '创建广告组', detail: body.name });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_AG_CREATE', resourceType: 'lx_ad_group', resourceId: id, name: body.name });
  });
  tx();
  return getAdGroup(db, userId, storeId, id);
}
export function updateAdGroup(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM lx_ad_groups WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = [], params = [];
  if (patch.name !== undefined) { fields.push('name=?'); params.push(patch.name); }
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  if (patch.defaultBid !== undefined) { fields.push('default_bid=?'); params.push(patch.defaultBid); }
  if (patch.bidAdj !== undefined) { fields.push('bid_adj=?'); params.push(patch.bidAdj); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE lx_ad_groups SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
    writeLxOp(db, userId, storeId, { campaignId: cur.campaign_id, entityType: 'ad_group', entityId: id, action: '修改广告组', detail: JSON.stringify(patch) });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_AG_UPDATE', resourceType: 'lx_ad_group', resourceId: id, patch });
  });
  tx();
  return getAdGroup(db, userId, storeId, id);
}
export function deleteAdGroup(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM lx_ad_groups WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lx_ad_groups WHERE id=? AND user_id=? AND store_id=?').run(id, userId, storeId);
    writeLxOp(db, userId, storeId, { campaignId: cur.campaign_id, entityType: 'ad_group', entityId: id, action: '删除广告组', detail: cur.name });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_AG_DELETE', resourceType: 'lx_ad_group', resourceId: id });
  });
  tx();
  return true;
}
export function updateAdGroupBid(db, userId, storeId, id, defaultBid) {
  const cur = getAdGroup(db, userId, storeId, id);
  if (!cur) return null;
  const tx = db.transaction(() => {
    db.prepare('UPDATE lx_ad_groups SET default_bid=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(defaultBid, nowIso(), id, userId, storeId);
    writeLxOp(db, userId, storeId, { campaignId: cur.campaignId, entityType: 'ad_group', entityId: id, action: '修改默认 bid', detail: `${cur.defaultBid} → ${defaultBid}` });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'LX_ADGROUP_BID_UPDATE', resourceType: 'lx_ad_group', resourceId: id,
      before: { defaultBid: cur.defaultBid }, after: { defaultBid },
      previousValues: { defaultBid: cur.defaultBid }, previousBid: cur.defaultBid,
    });
  });
  tx();
  return getAdGroup(db, userId, storeId, id);
}

// ============================================================
// LX ads
// ============================================================
export function listAds(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_ads WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.adGroupId) { sql += ' AND ad_group_id = ?'; params.push(filters.adGroupId); }
  return db.prepare(sql).all(...params).map(rowToAd);
}
export function createAd(db, userId, storeId, body) {
  const id = body.id || newId('ad');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_ads(
      id, user_id, store_id, ad_group_id, asin, sku, enabled, state, headline, image_url, metrics, extra, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.adGroupId || null, body.asin || null, body.sku || null,
      body.enabled === false ? 0 : 1, '启用', body.headline || null, body.imageUrl || null,
      JSON.stringify({}), JSON.stringify({}), now, null
    );
    writeLxOp(db, userId, storeId, { entityType: 'ad', entityId: id, action: '创建广告', detail: body.headline || body.asin });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_AD_CREATE', resourceType: 'lx_ad', resourceId: id });
  });
  tx();
  return rowToAd(db.prepare('SELECT * FROM lx_ads WHERE id = ?').get(id));
}
export function updateAd(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM lx_ads WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = [], params = [];
  if (patch.headline !== undefined) { fields.push('headline=?'); params.push(patch.headline); }
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  if (patch.imageUrl !== undefined) { fields.push('image_url=?'); params.push(patch.imageUrl); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE lx_ads SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
    writeLxOp(db, userId, storeId, { entityType: 'ad', entityId: id, action: '修改广告', detail: JSON.stringify(patch) });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_AD_UPDATE', resourceType: 'lx_ad', resourceId: id, patch });
  });
  tx();
  return rowToAd(db.prepare('SELECT * FROM lx_ads WHERE id = ?').get(id));
}
export function deleteAd(db, userId, storeId, id) {
  const r = db.prepare('DELETE FROM lx_ads WHERE id=? AND user_id=? AND store_id=?').run(id, userId, storeId);
  if (r.changes > 0) {
    writeLxOp(db, userId, storeId, { entityType: 'ad', entityId: id, action: '删除广告', detail: id });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_AD_DELETE', resourceType: 'lx_ad', resourceId: id });
  }
  return r.changes > 0;
}
export function toggleAd(db, userId, storeId, id, enabled) {
  return updateAd(db, userId, storeId, id, { enabled });
}

// ============================================================
// LX targetings
// ============================================================
export function listTargetings(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_targetings WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  if (filters.adGroupId) { sql += ' AND ad_group_id = ?'; params.push(filters.adGroupId); }
  return db.prepare(sql).all(...params).map(rowToTargeting);
}
export function getTargeting(db, userId, storeId, id) {
  return rowToTargeting(db.prepare('SELECT * FROM lx_targetings WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId));
}
export function createTargeting(db, userId, storeId, body) {
  const id = body.id || newId('t');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_targetings(
      id, user_id, store_id, campaign_id, ad_group_id, type, term, asin, category,
      match_type, bid, suggested_bid_low, suggested_bid_high, enabled, state,
      position, metrics, extra, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.campaignId || null, body.adGroupId || null,
      body.type || 'keyword', body.term || null, body.asin || null, body.category || null,
      body.matchType || null,
      body.bid ?? null, body.suggestedBidLow ?? null, body.suggestedBidHigh ?? null,
      body.enabled === false ? 0 : 1, body.state || '启用', body.position ?? null,
      JSON.stringify({}), JSON.stringify({}), now, null
    );
    writeLxOp(db, userId, storeId, { campaignId: body.campaignId, entityType: 'targeting', entityId: id, action: '创建投放', detail: body.term || body.asin });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_TARGETING_CREATE', resourceType: 'lx_targeting', resourceId: id });
  });
  tx();
  return getTargeting(db, userId, storeId, id);
}
export function updateTargeting(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM lx_targetings WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const previousValues = {};
  if (patch.bid !== undefined) previousValues.bid = cur.bid;
  if (patch.enabled !== undefined) previousValues.enabled = !!cur.enabled;
  if (patch.matchType !== undefined) previousValues.matchType = cur.match_type;

  const fields = [], params = [];
  if (patch.bid !== undefined) { fields.push('bid=?'); params.push(patch.bid); }
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  if (patch.matchType !== undefined) { fields.push('match_type=?'); params.push(patch.matchType); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  // Detect bid-only updates and use distinct action type per spec
  const onlyBid = Object.keys(patch || {}).length === 1 && patch.bid !== undefined;
  const actionType = onlyBid ? 'LX_TARGETING_BID_UPDATE' : 'LX_TARGETING_UPDATE';
  const tx = db.transaction(() => {
    db.prepare(`UPDATE lx_targetings SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
    writeLxOp(db, userId, storeId, { campaignId: cur.campaign_id, entityType: 'targeting', entityId: id, action: '修改投放', detail: JSON.stringify(patch) });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType, resourceType: 'lx_targeting', resourceId: id, patch,
      previousValues, previousBid: previousValues.bid,
    });
  });
  tx();
  return getTargeting(db, userId, storeId, id);
}
export function deleteTargeting(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM lx_targetings WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lx_targetings WHERE id=? AND user_id=? AND store_id=?').run(id, userId, storeId);
    writeLxOp(db, userId, storeId, { campaignId: cur.campaign_id, entityType: 'targeting', entityId: id, action: '删除投放', detail: cur.term || cur.asin });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_TARGETING_DELETE', resourceType: 'lx_targeting', resourceId: id });
  });
  tx();
  return true;
}
export function updateTargetingBid(db, userId, storeId, id, bid) {
  return updateTargeting(db, userId, storeId, id, { bid });
}
export function toggleTargeting(db, userId, storeId, id, enabled) {
  return updateTargeting(db, userId, storeId, id, { enabled });
}
export function bulkUpdateTargetingBids(db, userId, storeId, items = []) {
  const results = [];
  const tx = db.transaction(() => {
    for (const it of items) {
      if (!it.id || it.bid == null) continue;
      const r = updateTargeting(db, userId, storeId, it.id, { bid: it.bid });
      if (r) results.push(r);
    }
  });
  tx();
  return results;
}

// ============================================================
// LX negatives
// ============================================================
export function listNegatives(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_negatives WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  return db.prepare(sql).all(...params).map(rowToNegative);
}
export function createNegative(db, userId, storeId, body) {
  const id = body.id || newId('nt');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_negatives(
      id, user_id, store_id, campaign_id, ad_group_id, type, term, asin, match_type, scope, added_at, added_by, extra, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.campaignId || null, body.adGroupId || null,
      body.type || 'keyword', body.term || null, body.asin || null,
      body.matchType || 'exact', body.scope || 'Campaign',
      body.addedAt || now.slice(0, 10), body.addedBy || 'operator',
      JSON.stringify({}), now
    );
    writeLxOp(db, userId, storeId, { campaignId: body.campaignId, entityType: 'negative', entityId: id, action: '加否定', detail: body.term || body.asin });
    // Use ADD_NEGATIVE_KEYWORD as action type per spec #4 revert table; keep legacy LX_NEGATIVE_CREATE for back-compat by reusing single audit row
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'ADD_NEGATIVE_KEYWORD', resourceType: 'lx_negative', resourceId: id,
      term: body.term, payload: { negativeId: id, term: body.term, campaignId: body.campaignId, adGroupId: body.adGroupId, matchType: body.matchType },
      affectedIds: [id],
    });
  });
  tx();
  return rowToNegative(db.prepare('SELECT * FROM lx_negatives WHERE id = ?').get(id));
}
export function deleteNegative(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM lx_negatives WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lx_negatives WHERE id=? AND user_id=? AND store_id=?').run(id, userId, storeId);
    writeLxOp(db, userId, storeId, { campaignId: cur.campaign_id, entityType: 'negative', entityId: id, action: '删除否定', detail: cur.term || cur.asin });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_NEGATIVE_DELETE', resourceType: 'lx_negative', resourceId: id });
  });
  tx();
  return true;
}

// ============================================================
// LX user search terms
// ============================================================
export function listUserSearchTerms(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_user_search_terms WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  return db.prepare(sql).all(...params).map(rowToUst);
}
export function promoteUserSearchTerm(db, userId, storeId, body) {
  // Promote: create a new targeting in the chosen ad group with the search term as a keyword
  const id = newId('t');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_targetings(
      id, user_id, store_id, campaign_id, ad_group_id, type, term, match_type, bid, enabled, state, metrics, extra, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.campaignId || null, body.adGroupId || null,
      'keyword', body.term, body.matchType || 'exact', body.bid ?? 1.0, 1, '启用',
      JSON.stringify({}), JSON.stringify({}), now
    );
    writeLxOp(db, userId, storeId, { campaignId: body.campaignId, entityType: 'targeting', entityId: id, action: '搜索词升投放', detail: body.term });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_UST_PROMOTE', resourceType: 'lx_targeting', resourceId: id, term: body.term });
  });
  tx();
  return rowToTargeting(db.prepare('SELECT * FROM lx_targetings WHERE id = ?').get(id));
}
export function negateUserSearchTerm(db, userId, storeId, body) {
  return createNegative(db, userId, storeId, {
    campaignId: body.campaignId, adGroupId: body.adGroupId,
    type: 'keyword', term: body.term, matchType: body.matchType || 'exact', scope: body.scope || 'AdGroup',
    addedBy: 'operator',
  });
}

// ============================================================
// LX op log + daily
// ============================================================
export function listOpLogs(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_operation_logs WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  sql += ' ORDER BY time DESC';
  if (filters.limit) { sql += ' LIMIT ?'; params.push(Math.max(1, Math.min(500, Number(filters.limit) || 100))); }
  return db.prepare(sql).all(...params).map(rowToOpLog);
}
export function listDaily(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_daily_data WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  sql += ' ORDER BY date';
  return db.prepare(sql).all(...params).map(rowToDaily);
}

// ============================================================
// LX kw-grabbing
// ============================================================
export function listKwGrabbing(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_kw_grabbing WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  return db.prepare(sql).all(...params).map(rowToKwg);
}
export function createKwGrabbing(db, userId, storeId, body) {
  const id = body.id || newId('kw-g');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_kw_grabbing(
      id, user_id, store_id, campaign_id, ad_group_id, keyword, target_position, current_bid, suggested_bid, current_position, status, extra, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.campaignId || null, body.adGroupId || null, body.keyword,
      body.targetPosition ?? null, body.currentBid ?? null, body.suggestedBid ?? null,
      body.currentPosition ?? null, body.status || 'active', JSON.stringify({}), now, null
    );
    writeLxOp(db, userId, storeId, { campaignId: body.campaignId, entityType: 'kw_grabbing', entityId: id, action: '创建抢位', detail: body.keyword });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_KWG_CREATE', resourceType: 'lx_kw_grabbing', resourceId: id });
  });
  tx();
  return rowToKwg(db.prepare('SELECT * FROM lx_kw_grabbing WHERE id = ?').get(id));
}
export function updateKwGrabbing(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM lx_kw_grabbing WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = [], params = [];
  if (patch.targetPosition !== undefined) { fields.push('target_position=?'); params.push(patch.targetPosition); }
  if (patch.currentBid !== undefined) { fields.push('current_bid=?'); params.push(patch.currentBid); }
  if (patch.suggestedBid !== undefined) { fields.push('suggested_bid=?'); params.push(patch.suggestedBid); }
  if (patch.status !== undefined) { fields.push('status=?'); params.push(patch.status); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE lx_kw_grabbing SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
    writeLxOp(db, userId, storeId, { campaignId: cur.campaign_id, entityType: 'kw_grabbing', entityId: id, action: '修改抢位', detail: JSON.stringify(patch) });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_KWG_UPDATE', resourceType: 'lx_kw_grabbing', resourceId: id, patch });
  });
  tx();
  return rowToKwg(db.prepare('SELECT * FROM lx_kw_grabbing WHERE id = ?').get(id));
}
export function deleteKwGrabbing(db, userId, storeId, id) {
  const r = db.prepare('DELETE FROM lx_kw_grabbing WHERE id=? AND user_id=? AND store_id=?').run(id, userId, storeId);
  if (r.changes > 0) {
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_KWG_DELETE', resourceType: 'lx_kw_grabbing', resourceId: id });
  }
  return r.changes > 0;
}
export function applyKwGrabbingBid(db, userId, storeId, id) {
  const cur = rowToKwg(db.prepare('SELECT * FROM lx_kw_grabbing WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId));
  if (!cur) return null;
  const target = db.prepare(`SELECT id FROM lx_targetings WHERE user_id = ? AND store_id = ? AND term = ? LIMIT 1`).get(userId, storeId, cur.keyword);
  const tx = db.transaction(() => {
    db.prepare('UPDATE lx_kw_grabbing SET current_bid=?, updated_at=? WHERE id=?').run(cur.suggestedBid, nowIso(), id);
    if (target) {
      db.prepare('UPDATE lx_targetings SET bid=?, updated_at=? WHERE id=?').run(cur.suggestedBid, nowIso(), target.id);
    }
    writeLxOp(db, userId, storeId, { campaignId: cur.campaignId, entityType: 'kw_grabbing', entityId: id, action: '应用建议 bid', detail: `${cur.currentBid} → ${cur.suggestedBid}` });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'LX_KWG_APPLY_BID', resourceType: 'lx_kw_grabbing', resourceId: id,
      before: { bid: cur.currentBid }, after: { bid: cur.suggestedBid },
    });
  });
  tx();
  return rowToKwg(db.prepare('SELECT * FROM lx_kw_grabbing WHERE id = ?').get(id));
}

// ============================================================
// LX placements
// ============================================================
export function listPlacements(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM lx_placements WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  return db.prepare(sql).all(...params).map(rowToPlacement);
}
export function updatePlacement(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM lx_placements WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = [], params = [];
  if (patch.bidAdj !== undefined) { fields.push('bid_adj=?'); params.push(patch.bidAdj); }
  if (patch.bidStrategy !== undefined) { fields.push('bid_strategy=?'); params.push(patch.bidStrategy); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE lx_placements SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
    writeLxOp(db, userId, storeId, { campaignId: cur.campaign_id, entityType: 'placement', entityId: id, action: '修改广告位', detail: JSON.stringify(patch) });
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_PLACEMENT_UPDATE', resourceType: 'lx_placement', resourceId: id, patch });
  });
  tx();
  return rowToPlacement(db.prepare('SELECT * FROM lx_placements WHERE id = ?').get(id));
}

// ============================================================
// LX amc audiences
// ============================================================
export function listAmcAudiences(db, userId, storeId) {
  return db.prepare('SELECT * FROM lx_amc_audiences WHERE user_id = ? AND store_id = ? ORDER BY created_at DESC').all(userId, storeId).map(rowToAmc);
}
export function createAmcAudience(db, userId, storeId, body) {
  const id = body.id || newId('amc');
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_amc_audiences(id, user_id, store_id, name, size, source, extra, created_at) VALUES (?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, body.name || null, body.size ?? null, body.source || 'AMC', JSON.stringify({}), now);
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_AMC_CREATE', resourceType: 'lx_amc_audience', resourceId: id, name: body.name });
  });
  tx();
  return rowToAmc(db.prepare('SELECT * FROM lx_amc_audiences WHERE id = ?').get(id));
}
export function deleteAmcAudience(db, userId, storeId, id) {
  const r = db.prepare('DELETE FROM lx_amc_audiences WHERE id=? AND user_id=? AND store_id=?').run(id, userId, storeId);
  if (r.changes > 0) {
    appendAuditLog(userId, storeId, { sourceModule: 'M3', actionType: 'LX_AMC_DELETE', resourceType: 'lx_amc_audience', resourceId: id });
  }
  return r.changes > 0;
}

// ============================================================
// Reports / SQP
// ============================================================
export function listSearchTermReports(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM search_term_reports WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.campaignId) { sql += ' AND campaign_id = ?'; params.push(filters.campaignId); }
  if (filters.period) { sql += ' AND reporting_period = ?'; params.push(filters.period); }
  return db.prepare(sql).all(...params).map(rowToStr);
}
export function listSqp(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM sqp_queries WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.asin) { sql += ' AND asin = ?'; params.push(filters.asin); }
  if (filters.from) { sql += ' AND reporting_date >= ?'; params.push(filters.from); }
  if (filters.to) { sql += ' AND reporting_date <= ?'; params.push(filters.to); }
  return db.prepare(sql).all(...params).map(rowToSqp);
}
export function listCampaignReports(db, userId, storeId, filters = {}) {
  // Re-purpose lx_campaigns rows for the report
  return listCampaigns(db, userId, storeId);
}
export function takeSqpAction(db, userId, storeId, body) {
  // body: { queryId, action: 'add_targeting'|'add_negative', payload: {...} }
  const sqp = db.prepare('SELECT * FROM sqp_queries WHERE id = ? AND user_id = ? AND store_id = ?').get(body.queryId, userId, storeId);
  if (!sqp) return null;
  if (body.action === 'add_targeting') {
    const matchType = body.payload?.matchType || 'exact';
    const campaignId = body.payload?.campaignId || null;
    const adGroupId = body.payload?.adGroupId || null;
    // dedupe: existing targeting with same (campaign, ad_group, term, match_type)?
    const existing = db.prepare(
      'SELECT * FROM lx_targetings WHERE user_id=? AND store_id=? AND campaign_id IS ? AND ad_group_id IS ? AND term = ? AND match_type = ?'
    ).get(userId, storeId, campaignId, adGroupId, sqp.search_term, matchType);
    if (existing) {
      appendAuditLog(userId, storeId, {
        sourceModule: 'M3', actionType: 'SQP_ADD_TARGETING_CONFLICT', resourceType: 'lx_targeting',
        resourceId: existing.id, queryId: body.queryId, term: sqp.search_term,
      });
      return { conflict: true, existing: rowToTargeting(existing) };
    }
    const r = promoteUserSearchTerm(db, userId, storeId, {
      campaignId, adGroupId,
      term: sqp.search_term, matchType, bid: body.payload?.bid ?? 1.0,
    });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'SQP_ADD_TARGETING', resourceType: 'lx_targeting',
      resourceId: r?.id, queryId: body.queryId, term: sqp.search_term,
      payload: { targetingId: r?.id, term: sqp.search_term, campaignId, adGroupId, matchType },
      affectedIds: r?.id ? [r.id] : [],
    });
    return r;
  }
  if (body.action === 'add_negative') {
    return negateUserSearchTerm(db, userId, storeId, {
      campaignId: body.payload?.campaignId, adGroupId: body.payload?.adGroupId,
      term: sqp.search_term, matchType: body.payload?.matchType || 'exact', scope: body.payload?.scope || 'AdGroup',
    });
  }
  return null;
}

// ============================================================
// Bulk endpoints
// ============================================================
export function bulkCreateCampaigns(db, userId, storeId, body) {
  const { strategyId, portfolioId, campaigns: list = [] } = body || {};
  const created = [];
  const tx = db.transaction(() => {
    for (const c of list) {
      const cmp = createCampaign(db, userId, storeId, { ...c, portfolioId: portfolioId || c.portfolioId });
      if (cmp) created.push(cmp);
    }
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'LX_BULK_CREATE_CAMPAIGNS', resourceType: 'lx_campaign',
      strategyId, portfolioId, count: created.length,
      createdIds: created.map((c) => c.id), affectedIds: created.map((c) => c.id),
    });
  });
  tx();
  return { created: created.length, items: created };
}

// COPY_CAMPAIGN: duplicate a campaign + record copyId for revert
export function copyCampaign(db, userId, storeId, sourceId, overrides = {}) {
  const src = getCampaign(db, userId, storeId, sourceId);
  if (!src) return null;
  const copyId = overrides.id || newId('cmp');
  const body = {
    ...src, id: copyId, name: overrides.name || `${src.name} - 副本`,
    ...overrides,
  };
  // Manually run createCampaign with id override
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO lx_campaigns(
      id, user_id, store_id, portfolio_id, name, type, targeting_type, state,
      service_state, service_state_color, enabled, daily_budget, bid_strategy,
      lifecycle_stage, tags, metrics, extra, started_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      copyId, userId, storeId, body.portfolioId || src.portfolioId || null, body.name,
      body.type || src.type || 'SP', body.targetingType || src.targetingType || '手动',
      body.state || '启用', '正在投放', '#10b981',
      body.enabled === false ? 0 : 1, body.dailyBudget ?? src.dailyBudget,
      body.bidStrategy || src.bidStrategy, body.lifecycleStage || src.lifecycleStage,
      JSON.stringify(body.tags || src.tags || []), JSON.stringify({}), JSON.stringify({}),
      now.slice(0, 10), now, null
    );
    writeLxOp(db, userId, storeId, { campaignId: copyId, entityType: 'campaign', entityId: copyId, action: '复制活动', detail: `源 ${sourceId} → ${copyId}` });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'COPY_CAMPAIGN', resourceType: 'lx_campaign',
      resourceId: copyId, sourceId, copyId,
      payload: { copyId, sourceId },
    });
  });
  tx();
  return getCampaign(db, userId, storeId, copyId);
}

// BULK_CHANGE_BUDGET: update multiple campaign budgets in one shot
export function bulkChangeBudget(db, userId, storeId, items = []) {
  const previousValues = {}; // { cmpId: oldBudget }
  const results = [];
  const tx = db.transaction(() => {
    for (const it of items) {
      if (!it.id || it.dailyBudget == null) continue;
      const cur = getCampaign(db, userId, storeId, it.id);
      if (!cur) continue;
      previousValues[it.id] = cur.dailyBudget;
      db.prepare('UPDATE lx_campaigns SET daily_budget=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(it.dailyBudget, nowIso(), it.id, userId, storeId);
      writeLxOp(db, userId, storeId, { campaignId: it.id, entityType: 'campaign', entityId: it.id, action: '批量修改预算', detail: `$${cur.dailyBudget} → $${it.dailyBudget}` });
      results.push({ id: it.id, before: cur.dailyBudget, after: it.dailyBudget });
    }
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'BULK_CHANGE_BUDGET', resourceType: 'lx_campaign',
      previousValues, count: results.length, items: results,
    });
  });
  tx();
  return { updated: results.length, items: results };
}

// PROMOTE_TO_MANUAL: take an auto-found term, create a manual exact targeting + add as negative-exact in the originating auto group
export function promoteToManual(db, userId, storeId, body) {
  const { term, autoCampaignId, autoAdGroupId, manualCampaignId, manualAdGroupId, matchType = 'exact', bid = 1.0 } = body || {};
  if (!term || !manualCampaignId || !manualAdGroupId) return null;
  const targetingId = newId('t');
  const negativeId = newId('nt');
  const now = nowIso();
  const tx = db.transaction(() => {
    // Create the manual exact targeting
    db.prepare(`INSERT INTO lx_targetings(
      id, user_id, store_id, campaign_id, ad_group_id, type, term, match_type, bid, enabled, state, metrics, extra, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      targetingId, userId, storeId, manualCampaignId, manualAdGroupId,
      'keyword', term, matchType, bid, 1, '启用',
      JSON.stringify({}), JSON.stringify({}), now
    );
    // Add negative-exact in the auto group to prevent double-spend
    if (autoCampaignId) {
      db.prepare(`INSERT INTO lx_negatives(
        id, user_id, store_id, campaign_id, ad_group_id, type, term, match_type, scope, added_at, added_by, extra, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        negativeId, userId, storeId, autoCampaignId, autoAdGroupId || null,
        'keyword', term, 'exact', 'AdGroup', now.slice(0, 10), 'operator',
        JSON.stringify({}), now
      );
    }
    writeLxOp(db, userId, storeId, { campaignId: manualCampaignId, entityType: 'targeting', entityId: targetingId, action: '升手动', detail: term });
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'PROMOTE_TO_MANUAL', resourceType: 'lx_targeting',
      resourceId: targetingId, term,
      payload: { targetingId, negativeId: autoCampaignId ? negativeId : null, term, autoCampaignId, manualCampaignId },
      affectedIds: [targetingId, ...(autoCampaignId ? [negativeId] : [])],
    });
  });
  tx();
  return {
    targeting: rowToTargeting(db.prepare('SELECT * FROM lx_targetings WHERE id = ?').get(targetingId)),
    negative: autoCampaignId ? rowToNegative(db.prepare('SELECT * FROM lx_negatives WHERE id = ?').get(negativeId)) : null,
  };
}

export function bulkImport(db, userId, storeId, body) {
  // body: { type, rows: [...] }
  const type = body?.type;
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  let createdCount = 0;
  let errors = 0;
  const createdIds = [];
  const errorDetail = [];
  const tx = db.transaction(() => {
    for (const row of rows) {
      try {
        let created = null;
        if (type === 'campaigns') {
          created = createCampaign(db, userId, storeId, row);
        } else if (type === 'targetings') {
          created = createTargeting(db, userId, storeId, row);
        } else if (type === 'negatives') {
          created = createNegative(db, userId, storeId, row);
        } else {
          errors++; errorDetail.push({ row, error: 'unknown_type' });
          continue;
        }
        if (created?.id) { createdCount++; createdIds.push({ type, id: created.id }); }
        else { errors++; errorDetail.push({ row, error: 'create_returned_null' }); }
      } catch (e) {
        errors++; errorDetail.push({ row, error: String(e?.message || e) });
      }
    }
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'BULK_CSV_IMPORT', resourceType: type,
      created: createdCount, errors, rows: rows.length,
      createdIds, payload: { type, createdIds },
      affectedIds: createdIds.map((x) => x.id),
    });
  });
  tx();
  return { created: createdCount, errors, rows: rows.length, errorDetail, createdIds };
}

// ============================================================
// M3 revert dispatcher (called from data-store.revertAuditLog)
// Returns true if the action was handled (state reverted), false otherwise.
// ============================================================
export function revertM3Action(db, userId, storeId, logRow) {
  if (!logRow) return false;
  const actionType = logRow.action_type;
  const resourceId = logRow.resource_id;
  let payload = {};
  try { payload = JSON.parse(logRow.payload || '{}'); } catch {}

  switch (actionType) {
    case 'STRATEGY_TOGGLE': {
      const row = db.prepare('SELECT enabled FROM ad_strategies WHERE id=? AND user_id=? AND store_id=?').get(resourceId, userId, storeId);
      if (!row) return false;
      const newVal = row.enabled ? 0 : 1;
      db.prepare('UPDATE ad_strategies SET enabled=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(newVal, nowIso(), resourceId, userId, storeId);
      return true;
    }

    case 'STRATEGY_UPDATE': {
      const prev = payload.previousValues || {};
      const fields = [], params = [];
      const map = {
        name: 'name', description: 'description', sovereignty: 'sovereignty', scope: 'scope',
        frequency: 'frequency', successTrend: 'success_trend', crossModule: 'cross_module',
      };
      for (const [k, col] of Object.entries(map)) {
        if (prev[k] !== undefined) { fields.push(`${col}=?`); params.push(prev[k]); }
      }
      if (prev.enabled !== undefined) { fields.push('enabled=?'); params.push(prev.enabled ? 1 : 0); }
      if (prev.cooldownHours !== undefined) { fields.push('cooldown_hours=?'); params.push(prev.cooldownHours); }
      if (prev.triggerCondition !== undefined) { fields.push('trigger_condition=?'); params.push(prev.triggerCondition); }
      if (prev.action !== undefined) { fields.push('action=?'); params.push(JSON.stringify(prev.action)); }
      if (prev.guardrails !== undefined) { fields.push('guardrails=?'); params.push(JSON.stringify(prev.guardrails)); }
      if (!fields.length) return false;
      fields.push('updated_at=?'); params.push(nowIso());
      params.push(resourceId, userId, storeId);
      db.prepare(`UPDATE ad_strategies SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
      return true;
    }

    case 'STRATEGY_BIND': {
      // Restore the previous bindings list
      const prevBindings = payload?.previousValues?.bindings || [];
      bindStrategyToCampaigns(db, userId, storeId, resourceId, prevBindings);
      return true;
    }

    case 'TIMELINE_ACCEPT': {
      // observing → pending; clear acceptedAt
      const row = db.prepare('SELECT state FROM ad_suggestions WHERE id=? AND user_id=? AND store_id=?').get(resourceId, userId, storeId);
      if (!row) return false;
      db.prepare(`UPDATE ad_suggestions SET state='pending', accepted_at=NULL WHERE id=? AND user_id=? AND store_id=?`).run(resourceId, userId, storeId);
      return true;
    }

    case 'TIMELINE_REVERT': {
      // pending → observing (or original state from previousValues); restore acceptedAt
      const prev = payload.previousValues || {};
      const prevState = prev.state || 'observing';
      const prevAcceptedAt = prev.acceptedAt || nowIso();
      db.prepare(`UPDATE ad_suggestions SET state=?, accepted_at=?, rejected_at=?, reject_reason=? WHERE id=? AND user_id=? AND store_id=?`).run(
        prevState, prevAcceptedAt, prev.rejectedAt || null, prev.rejectReason || null, resourceId, userId, storeId
      );
      return true;
    }

    case 'TIMELINE_REJECT': {
      const prev = payload.previousValues || {};
      db.prepare(`UPDATE ad_suggestions SET state='pending', rejected_at=NULL, reject_reason=NULL WHERE id=? AND user_id=? AND store_id=?`).run(resourceId, userId, storeId);
      return true;
    }

    case 'ADD_NEGATIVE_KEYWORD':
    case 'LX_NEGATIVE_CREATE': {
      // DELETE the negative row created (id is resourceId or payload.negativeId)
      const negId = payload?.payload?.negativeId || resourceId;
      const r = db.prepare('DELETE FROM lx_negatives WHERE id=? AND user_id=? AND store_id=?').run(negId, userId, storeId);
      return r.changes > 0;
    }

    case 'PROMOTE_TO_MANUAL': {
      const p = payload?.payload || {};
      const ids = [];
      if (p.targetingId) ids.push(p.targetingId);
      let n = 0;
      if (p.targetingId) {
        const r = db.prepare('DELETE FROM lx_targetings WHERE id=? AND user_id=? AND store_id=?').run(p.targetingId, userId, storeId);
        n += r.changes;
      }
      if (p.negativeId) {
        const r = db.prepare('DELETE FROM lx_negatives WHERE id=? AND user_id=? AND store_id=?').run(p.negativeId, userId, storeId);
        n += r.changes;
      }
      return n > 0;
    }

    case 'BULK_CHANGE_BUDGET': {
      const prev = payload?.previousValues || {};
      let n = 0;
      for (const [cmpId, budget] of Object.entries(prev)) {
        const r = db.prepare('UPDATE lx_campaigns SET daily_budget=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(budget, nowIso(), cmpId, userId, storeId);
        n += r.changes;
      }
      return n > 0;
    }

    case 'COPY_CAMPAIGN': {
      const copyId = payload?.payload?.copyId || payload.copyId || resourceId;
      const r = db.prepare('DELETE FROM lx_campaigns WHERE id=? AND user_id=? AND store_id=?').run(copyId, userId, storeId);
      return r.changes > 0;
    }

    case 'SQP_ADD_TARGETING':
    case 'LX_UST_PROMOTE': {
      const tId = payload?.payload?.targetingId || resourceId;
      const r = db.prepare('DELETE FROM lx_targetings WHERE id=? AND user_id=? AND store_id=?').run(tId, userId, storeId);
      return r.changes > 0;
    }

    case 'LX_TARGETING_BID_UPDATE':
    case 'LX_TARGETING_UPDATE': {
      const prev = payload.previousValues || {};
      const fields = [], params = [];
      if (prev.bid !== undefined) { fields.push('bid=?'); params.push(prev.bid); }
      if (prev.enabled !== undefined) { fields.push('enabled=?'); params.push(prev.enabled ? 1 : 0); }
      if (prev.matchType !== undefined) { fields.push('match_type=?'); params.push(prev.matchType); }
      if (!fields.length) return false;
      fields.push('updated_at=?'); params.push(nowIso());
      params.push(resourceId, userId, storeId);
      const r = db.prepare(`UPDATE lx_targetings SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
      return r.changes > 0;
    }

    case 'LX_ADGROUP_BID_UPDATE':
    case 'LX_AG_BID_UPDATE': {
      const prev = payload?.previousValues?.defaultBid ?? payload?.before?.defaultBid;
      if (typeof prev !== 'number') return false;
      const r = db.prepare('UPDATE lx_ad_groups SET default_bid=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(prev, nowIso(), resourceId, userId, storeId);
      return r.changes > 0;
    }

    case 'BULK_CSV_IMPORT': {
      const createdIds = payload?.payload?.createdIds || payload.createdIds || [];
      let n = 0;
      for (const item of createdIds) {
        if (!item?.id || !item?.type) continue;
        const tbl = item.type === 'campaigns' ? 'lx_campaigns'
          : item.type === 'targetings' ? 'lx_targetings'
          : item.type === 'negatives' ? 'lx_negatives' : null;
        if (!tbl) continue;
        const r = db.prepare(`DELETE FROM ${tbl} WHERE id=? AND user_id=? AND store_id=?`).run(item.id, userId, storeId);
        n += r.changes;
      }
      return n > 0;
    }

    case 'ACCEPT_ALTERNATIVE_TO_MANUAL_CHANGE':
    case 'MANUAL_CHANGE_APPLY_ALT':
    case 'MANUAL_CHANGE_IGNORE': {
      // resolved → pending; clear resolvedAt / resolvedAction
      const r = db.prepare(`UPDATE ad_manual_changes SET state='pending', resolved_at=NULL, resolved_action=NULL WHERE id=? AND user_id=? AND store_id=?`).run(resourceId, userId, storeId);
      return r.changes > 0;
    }

    case 'LX_CAMPAIGN_BUDGET_UPDATE': {
      const prev = payload?.before?.dailyBudget ?? payload?.previousValues?.dailyBudget;
      if (typeof prev !== 'number') return false;
      const r = db.prepare('UPDATE lx_campaigns SET daily_budget=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(prev, nowIso(), resourceId, userId, storeId);
      return r.changes > 0;
    }

    case 'LX_CAMPAIGN_TOGGLE': {
      const prev = payload?.before?.enabled;
      if (typeof prev !== 'boolean') return false;
      db.prepare(`UPDATE lx_campaigns SET enabled=?, state=?, service_state=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(
        prev ? 1 : 0, prev ? '启用' : '已暂停', prev ? '正在投放' : '广告活动已暂停',
        nowIso(), resourceId, userId, storeId);
      return true;
    }

    case 'LX_KWG_APPLY_BID': {
      const prev = payload?.before?.bid ?? payload?.previousValues?.bid;
      if (typeof prev !== 'number') return false;
      const r = db.prepare('UPDATE lx_kw_grabbing SET current_bid=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?').run(prev, nowIso(), resourceId, userId, storeId);
      return r.changes > 0;
    }

    default:
      return false;
  }
}

// ============================================================
// Cleanup hook (for removeUserStore)
// ============================================================
export const ADS_TABLES_TO_CLEAN = [
  'ad_strategies', 'ad_suggestions', 'ad_manual_changes',
  'lx_portfolios', 'lx_campaigns', 'lx_ad_groups', 'lx_ads',
  'lx_targetings', 'lx_negatives', 'lx_user_search_terms',
  'lx_operation_logs', 'lx_daily_data', 'lx_kw_grabbing',
  'lx_placements', 'lx_amc_audiences',
  'sqp_queries', 'search_term_reports',
  'ad_strategy_bindings',
];
