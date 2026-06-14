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
import { enqueueAdAction } from './ad-action-queue.mjs';

// X-P0-06: pause / budget (and any M-module-initiated) Ads write intent must funnel
// through ad_action_queue via enqueueAdAction. This is the single gated boundary: the
// queue consults isRealMode() and clamps requiresRealStoreWrite. Direct entity helpers
// (toggleCampaign / updateCampaignBudget) remain local mock mutations; an intent that
// asks for a real store side-effect is recorded here so it can never bypass the queue.
export function enqueueAdsWriteIntent(db, userId, storeId, action = {}) {
  return enqueueAdAction(db, userId, storeId, action);
}

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
      next_eligible_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ad_sug_us ON ad_suggestions(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_ad_sug_state ON ad_suggestions(user_id, store_id, state);

    CREATE TABLE IF NOT EXISTS ad_action_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      suggestion_id TEXT,
      source_strategy_id TEXT,
      source_strategy_name TEXT,
      state TEXT NOT NULL DEFAULT 'queued',
      priority_score REAL DEFAULT 0,
      severity TEXT,
      entity TEXT,
      typed_action TEXT,
      evidence_refs TEXT,
      guardrail TEXT,
      rollback_plan TEXT,
      impact_estimate TEXT,
      source_meta TEXT,
      confidence_breakdown TEXT,
      dry_run INTEGER NOT NULL DEFAULT 1,
      audit_required INTEGER NOT NULL DEFAULT 1,
      approved_at TEXT,
      executed_at TEXT,
      removed_at TEXT,
      reverted_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ad_aq_us ON ad_action_queue(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_ad_aq_state ON ad_action_queue(user_id, store_id, state);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_aq_active_suggestion
      ON ad_action_queue(user_id, store_id, suggestion_id)
      WHERE suggestion_id IS NOT NULL AND state IN ('queued','approved','executing');

    CREATE TABLE IF NOT EXISTS ad_action_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      queue_item_id TEXT NOT NULL,
      batch_id TEXT,
      action_type TEXT,
      status TEXT NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 1,
      request_payload TEXT,
      response_payload TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ad_ar_us ON ad_action_runs(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_ad_ar_queue ON ad_action_runs(user_id, store_id, queue_item_id);

    CREATE TABLE IF NOT EXISTS ad_goal_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      primary_goal TEXT NOT NULL,
      risk_preference TEXT NOT NULL,
      automation_level TEXT NOT NULL,
      protected_entities TEXT,
      budget_boundary TEXT,
      guardrail_policy TEXT,
      evidence_policy TEXT,
      source_meta TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_goal_profiles_us ON ad_goal_profiles(user_id, store_id);

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
  // M3-P2-23: additive migration for pre-existing DBs — CREATE TABLE IF NOT
  // EXISTS does not add new columns to an already-created ad_suggestions table.
  ensureAdsColumn(db, 'ad_suggestions', 'next_eligible_at', 'TEXT');
  // N5-m3-observation-settle: explicit, assertable observation settlement.
  // observing → succeeded/failed once the observation window has elapsed. There is
  // NO real Amazon effect data without real credentials, so the outcome is a
  // deterministic simulation honestly flagged via settlement_meta.simulated=true.
  ensureAdsColumn(db, 'ad_suggestions', 'settled_at', 'TEXT');
  ensureAdsColumn(db, 'ad_suggestions', 'settlement_outcome', 'TEXT');
  ensureAdsColumn(db, 'ad_suggestions', 'settlement_meta', 'TEXT');
}

function ensureAdsColumn(db, table, column, type) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch { /* table may not exist yet in some harnesses */ }
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

const ACTION_PRIMITIVE_META = {
  ADJUST_BID: { label: '调竞价', risk: 'low', automationLevel: 'L3' },
  ADJUST_BUDGET: { label: '调预算', risk: 'medium', automationLevel: 'L2' },
  GOVERN_KEYWORD: { label: '治理关键词', risk: 'high', automationLevel: 'L1' },
  CREATE_OR_EVOLVE_STRUCTURE: { label: '创建/演化结构', risk: 'high', automationLevel: 'L1' },
  PAUSE_OR_THROTTLE: { label: '暂停/限流', risk: 'high', automationLevel: 'L1' },
  SYNC_CONTEXT: { label: '同步上下文', risk: 'low', automationLevel: 'L3' },
  CROSS_MODULE_TASK: { label: '跨模块任务', risk: 'medium', automationLevel: 'L2' },
  GUARDRAIL_ONLY: { label: '护栏保护', risk: 'medium', automationLevel: 'L2' },
};

const GUARDRAIL_REASON_LABELS = {
  low_confidence: '置信度偏低，需要人工复核',
  high_risk_action: '动作会改变关键词/结构/暂停状态',
  budget_risk: '预算变化需要确认总预算边界',
  cross_module: '需要跨模块协同，不应直接写广告',
  p0_urgent: 'P0 紧急项，需要优先处理',
  dry_run_only: '当前仍为 mock/sandbox，真实写入关闭',
  profile_manual_review: '目标档案要求人工确认',
  profile_protected_entity: '命中受保护实体',
  profile_blocked_primitive: '目标档案禁止该动作类型',
  profile_delta_too_large: '变化幅度超过目标档案护栏',
  profile_evidence_missing: '证据不足或未映射证据面',
};

const DEFAULT_GOAL_PROFILE = Object.freeze({
  primaryGoal: 'balanced_profit',
  riskPreference: 'balanced',
  automationLevel: 'assisted',
  protectedEntities: { skus: [], asins: [], campaigns: [], keywords: [] },
  budgetBoundary: {
    currency: 'USD',
    monthlySpendCap: 25000,
    dailyBudgetIncreasePctMax: 0.2,
    bidChangePctMax: 0.25,
    minGrossMarginPct: 0.18,
    minInventoryDays: 14,
  },
  guardrailPolicy: {
    realWriteEnabled: false,
    minConfidenceToAutoExecute: 0.72,
    requireReviewPrimitives: ['ADJUST_BUDGET', 'GOVERN_KEYWORD', 'CREATE_OR_EVOLVE_STRUCTURE', 'PAUSE_OR_THROTTLE', 'CROSS_MODULE_TASK'],
    blockedPrimitives: [],
    allowAutoExecutePrimitives: ['ADJUST_BID', 'SYNC_CONTEXT'],
  },
  evidencePolicy: { minEvidenceRefs: 1, maxFreshnessHours: 24, requireMetricKeys: true },
  sourceMeta: { source: 'mock', adapter: 'strategy_os_goal_profile', realWriteEnabled: false },
});

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function defaultGoalProfile(now = nowIso()) {
  return {
    id: null,
    ...cloneJson(DEFAULT_GOAL_PROFILE),
    createdAt: now,
    updatedAt: null,
  };
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.map((x) => String(x || '').trim()).filter(Boolean)));
}

function normalizeGoalProfilePatch(patch = {}, base = defaultGoalProfile()) {
  const allowedGoals = new Set(['balanced_profit', 'profit_first', 'growth_first', 'inventory_clearance', 'brand_defense']);
  const allowedRisk = new Set(['conservative', 'balanced', 'aggressive']);
  const allowedAutomation = new Set(['manual_review', 'assisted', 'guarded_auto']);
  const next = {
    ...base,
    protectedEntities: { ...(base.protectedEntities || {}) },
    budgetBoundary: { ...(base.budgetBoundary || {}) },
    guardrailPolicy: { ...(base.guardrailPolicy || {}) },
    evidencePolicy: { ...(base.evidencePolicy || {}) },
    sourceMeta: { ...(base.sourceMeta || {}) },
  };

  if (patch.primaryGoal !== undefined) {
    if (!allowedGoals.has(patch.primaryGoal)) throw new TypeError('invalid_primary_goal');
    next.primaryGoal = patch.primaryGoal;
  }
  if (patch.riskPreference !== undefined) {
    if (!allowedRisk.has(patch.riskPreference)) throw new TypeError('invalid_risk_preference');
    next.riskPreference = patch.riskPreference;
  }
  if (patch.automationLevel !== undefined) {
    if (!allowedAutomation.has(patch.automationLevel)) throw new TypeError('invalid_automation_level');
    next.automationLevel = patch.automationLevel;
  }
  if (patch.protectedEntities && typeof patch.protectedEntities === 'object') {
    next.protectedEntities = {
      skus: normalizeStringArray(patch.protectedEntities.skus ?? next.protectedEntities.skus),
      asins: normalizeStringArray(patch.protectedEntities.asins ?? next.protectedEntities.asins),
      campaigns: normalizeStringArray(patch.protectedEntities.campaigns ?? next.protectedEntities.campaigns),
      keywords: normalizeStringArray(patch.protectedEntities.keywords ?? next.protectedEntities.keywords),
    };
  }
  if (patch.budgetBoundary && typeof patch.budgetBoundary === 'object') {
    for (const key of ['monthlySpendCap', 'dailyBudgetIncreasePctMax', 'bidChangePctMax', 'minGrossMarginPct', 'minInventoryDays']) {
      if (patch.budgetBoundary[key] !== undefined) next.budgetBoundary[key] = Number(patch.budgetBoundary[key]);
    }
    if (patch.budgetBoundary.currency !== undefined) next.budgetBoundary.currency = String(patch.budgetBoundary.currency || 'USD').toUpperCase();
  }
  if (patch.guardrailPolicy && typeof patch.guardrailPolicy === 'object') {
    if (patch.guardrailPolicy.realWriteEnabled !== undefined) next.guardrailPolicy.realWriteEnabled = !!patch.guardrailPolicy.realWriteEnabled;
    if (patch.guardrailPolicy.minConfidenceToAutoExecute !== undefined) {
      next.guardrailPolicy.minConfidenceToAutoExecute = clampNumber(patch.guardrailPolicy.minConfidenceToAutoExecute, 0, 1);
    }
    for (const key of ['requireReviewPrimitives', 'blockedPrimitives', 'allowAutoExecutePrimitives']) {
      if (patch.guardrailPolicy[key] !== undefined) next.guardrailPolicy[key] = normalizeStringArray(patch.guardrailPolicy[key]);
    }
  }
  if (patch.evidencePolicy && typeof patch.evidencePolicy === 'object') {
    if (patch.evidencePolicy.minEvidenceRefs !== undefined) next.evidencePolicy.minEvidenceRefs = Math.max(0, Number(patch.evidencePolicy.minEvidenceRefs) || 0);
    if (patch.evidencePolicy.maxFreshnessHours !== undefined) next.evidencePolicy.maxFreshnessHours = Math.max(1, Number(patch.evidencePolicy.maxFreshnessHours) || 24);
    if (patch.evidencePolicy.requireMetricKeys !== undefined) next.evidencePolicy.requireMetricKeys = !!patch.evidencePolicy.requireMetricKeys;
  }
  next.guardrailPolicy.realWriteEnabled = false;
  next.sourceMeta = { ...next.sourceMeta, source: 'mock', realWriteEnabled: false };
  return next;
}

function clampNumber(n, min = 0, max = 1) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function safeLowerText(...parts) {
  return parts
    .filter((p) => p !== null && p !== undefined)
    .map((p) => {
      if (typeof p === 'string') return p;
      try { return JSON.stringify(p); } catch { return String(p); }
    })
    .join(' ')
    .toLowerCase();
}

function nonEmptyObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

function parseArrowAmount(text) {
  const raw = String(text || '');
  const m = raw.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:→|->|=>|至|到|to)\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from, to, delta: Number((to - from).toFixed(4)), deltaPct: from ? Number(((to - from) / from).toFixed(4)) : null };
}

function parseMoneyAmount(text) {
  const m = String(text || '').match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
}

function inferActionPrimitive(s) {
  const text = safeLowerText(s.actionType?.label, s.title, s.summary, s.detail, s.sourceStrategyName, s.crossModule);
  if (/guardrail|护栏|clamp|限流|skip|熔断|保护/.test(text)) return 'GUARDRAIL_ONLY';
  if (/listing|m1|跨模块|cross|改主图|改 listing|标题/.test(text)) return 'CROSS_MODULE_TASK';
  if (/budget|预算|调拨|reallocate|增加日预算|加预算/.test(text)) return 'ADJUST_BUDGET';
  if (/negative|否词|关键词|search term|升手动|manual exact|promote|加否/.test(text)) return 'GOVERN_KEYWORD';
  if (/pause|暂停|断货|stockout|throttle|限速/.test(text)) return 'PAUSE_OR_THROTTLE';
  if (/campaign|ad group|sd |asin-targeting|a\/b|ab test|创意|新建|结构|attack|攻击竞品/.test(text)) return 'CREATE_OR_EVOLVE_STRUCTURE';
  if (/bid|出价|竞价|placement|cpc|降/.test(text)) return 'ADJUST_BID';
  if (/sync|同步|data/.test(text)) return 'SYNC_CONTEXT';
  return 'ADJUST_BID';
}

function buildTypedAction(s) {
  const primitive = inferActionPrimitive(s);
  const meta = ACTION_PRIMITIVE_META[primitive] || ACTION_PRIMITIVE_META.ADJUST_BID;
  const entity = s.entity || {};
  const text = `${s.title || ''} ${s.summary || ''}`;
  const arrowAmount = parseArrowAmount(text);
  const moneyAmount = parseMoneyAmount(text);
  const primaryAlternative = (s.alternatives || []).find((a) => a?.primary) || (s.alternatives || [])[0] || null;
  const currentValue = {};
  const recommendedValue = {};
  const delta = {};

  if (arrowAmount) {
    if (primitive === 'ADJUST_BID') {
      currentValue.bid = arrowAmount.from;
      recommendedValue.bid = arrowAmount.to;
    } else if (primitive === 'ADJUST_BUDGET') {
      currentValue.budget = arrowAmount.from;
      recommendedValue.budget = arrowAmount.to;
    } else {
      currentValue.value = arrowAmount.from;
      recommendedValue.value = arrowAmount.to;
    }
    delta.absolute = arrowAmount.delta;
    delta.percent = arrowAmount.deltaPct;
  }

  if (primitive === 'ADJUST_BUDGET' && moneyAmount !== null) {
    recommendedValue.dailyBudgetShift = moneyAmount;
  }
  if (primitive === 'GOVERN_KEYWORD') {
    recommendedValue.keyword = entity.keyword || null;
    recommendedValue.matchType = /manual exact|精确|exact/i.test(text) ? 'exact' : 'negative_exact';
  }
  if (primitive === 'CREATE_OR_EVOLVE_STRUCTURE') {
    recommendedValue.structureIntent = /sd|asin-targeting|竞品|对手/i.test(text) ? 'sd_product_targeting' : 'campaign_or_creative_test';
  }
  if (primitive === 'CROSS_MODULE_TASK') {
    recommendedValue.targetModule = s.crossModule || primaryAlternative?.target || 'M1';
  }

  return {
    actionPrimitive: primitive,
    actionPrimitiveLabel: meta.label,
    actionType: s.actionType?.label || null,
    entityPath: nonEmptyObject({
      sku: entity.sku,
      asin: entity.asin,
      campaign: entity.campaign,
      campaignId: entity.campaignId,
      adGroup: entity.adGroup,
      adGroupId: entity.adGroupId,
      keyword: entity.keyword,
    }),
    currentValue,
    recommendedValue,
    delta,
    primaryAlternative: primaryAlternative?.label || null,
    dryRun: true,
    auditRequired: true,
    executionMode: 'sandbox_audit_first',
  };
}

function inferMetricKeys(e) {
  const text = safeLowerText(e?.label, e?.value, e?.baseline);
  const keys = [];
  const pairs = [
    ['acos', /acos/], ['roas', /roas/], ['ctr', /ctr|点击率/],
    ['cvr', /cvr|转化率/], ['cpc', /cpc/], ['clicks', /点击|click/],
    ['orders', /订单|转化数|转化/], ['spend', /花费|浪费|spend/],
    ['sales', /销售|sales/], ['inventoryDays', /库存|断货/],
    ['marginalRoi', /roi|边际/], ['rating', /评分/],
    ['reviews', /差评|review/], ['organicRank', /排名/],
    ['impressions', /曝光/], ['budget', /预算/],
  ];
  for (const [key, re] of pairs) if (re.test(text) && !keys.includes(key)) keys.push(key);
  return keys.length ? keys : ['metric'];
}

function inferEvidenceSurface(s, e, primitive) {
  const text = safeLowerText(s.title, s.summary, s.detail, e?.label, s.crossModule);
  if (/listing|主图|标题|m1/.test(text)) return { surfaceKey: 'listing_quality', tabKey: 'creative_cvr', entityKind: 'sku' };
  if (/竞品|对手|rival|asin-targeting|评分|差评/.test(text)) return { surfaceKey: 'competitor_window', tabKey: 'competitive_snapshot', entityKind: 'competitor_asin' };
  if (primitive === 'ADJUST_BUDGET' || /budget|预算|campaign/.test(text)) return { surfaceKey: 'sp_campaign', tabKey: 'budget_daily', entityKind: 'campaign' };
  if (primitive === 'GOVERN_KEYWORD' || /搜索词|关键词|negative|否词|manual/.test(text)) return { surfaceKey: 'sp_search_term', tabKey: 'user_search_terms', entityKind: 'keyword' };
  if (/placement|广告位/.test(text)) return { surfaceKey: 'sp_placement', tabKey: 'placement_daily', entityKind: 'campaign' };
  return { surfaceKey: 'sp_keyword', tabKey: 'daily', entityKind: s.entity?.keyword ? 'keyword' : 'sku' };
}

function buildEvidenceLink(s, surface) {
  const entity = s.entity || {};
  const query = nonEmptyObject({
    sku: entity.sku,
    asin: entity.asin,
    campaign: entity.campaign,
    keyword: entity.keyword,
    surface: surface.surfaceKey,
    tab: surface.tabKey,
  });
  if (surface.surfaceKey === 'listing_quality') return { routePath: '/listings/optimize', routeQuery: query };
  if (surface.surfaceKey === 'competitor_window') return { routePath: '/ads/competitor-attack', routeQuery: query };
  if (surface.surfaceKey === 'sp_campaign') return { routePath: '/ads/reports/campaigns', routeQuery: query };
  if (surface.surfaceKey === 'sp_search_term') return { routePath: '/ads/reports/search-terms', routeQuery: query };
  if (surface.surfaceKey === 'sp_placement') return { routePath: '/ads/placements', routeQuery: query };
  return { routePath: '/ads/keywords', routeQuery: query };
}

function buildEvidenceRefs(s, typedAction) {
  const legacyEvidence = Array.isArray(s.evidence) ? s.evidence : [];
  const primitive = typedAction?.actionPrimitive || inferActionPrimitive(s);
  const sourceRows = legacyEvidence.length ? legacyEvidence : [{ label: s.sourceStrategyName || s.title || 'strategy_signal', value: null, signal: 'info' }];
  return sourceRows.map((e, index) => {
    const surface = inferEvidenceSurface(s, e, primitive);
    const link = buildEvidenceLink(s, surface);
    return {
      id: `${s.id || 'sug'}-ev-${index + 1}`,
      surfaceKey: surface.surfaceKey,
      tabKey: surface.tabKey,
      entityKind: surface.entityKind,
      entityKey: s.entity?.keyword || s.entity?.campaign || s.entity?.sku || s.entity?.asin || null,
      metricKeys: inferMetricKeys(e),
      label: e?.label || null,
      legacyValue: e?.value ?? null,
      baseline: e?.baseline ?? null,
      signal: e?.signal || 'info',
      source: 'mock_lingxing_equivalent',
      freshness: 'mock_seed_2026-05-14',
      routePath: link.routePath,
      routeQuery: link.routeQuery,
    };
  });
}

function profileHitsProtectedEntity(profile, entity = {}) {
  const p = profile?.protectedEntities || {};
  const contains = (arr, value) => normalizeStringArray(arr).map((x) => x.toLowerCase()).includes(String(value || '').toLowerCase());
  return (
    contains(p.skus, entity.sku) ||
    contains(p.asins, entity.asin) ||
    contains(p.campaigns, entity.campaignId || entity.campaign) ||
    contains(p.keywords, entity.keyword)
  );
}

function actionDeltaPct(typedAction) {
  const pct = typedAction?.delta?.percent;
  if (Number.isFinite(Number(pct))) return Math.abs(Number(pct));
  const current = typedAction?.currentValue?.bid ?? typedAction?.currentValue?.budget ?? typedAction?.currentValue?.value;
  const recommended = typedAction?.recommendedValue?.bid ?? typedAction?.recommendedValue?.budget ?? typedAction?.recommendedValue?.value;
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(recommended)) || Number(current) === 0) return null;
  return Math.abs((Number(recommended) - Number(current)) / Number(current));
}

function buildGuardrailResult(s, typedAction, goalProfile = defaultGoalProfile()) {
  const primitive = typedAction?.actionPrimitive || inferActionPrimitive(s);
  const meta = ACTION_PRIMITIVE_META[primitive] || ACTION_PRIMITIVE_META.ADJUST_BID;
  const reasons = ['dry_run_only'];
  let status = 'passed';

  if ((s.confidence ?? 0.7) < 0.6) {
    status = 'needs_review';
    reasons.push('low_confidence');
  }
  if (['GOVERN_KEYWORD', 'CREATE_OR_EVOLVE_STRUCTURE', 'PAUSE_OR_THROTTLE'].includes(primitive)) {
    status = 'needs_review';
    reasons.push('high_risk_action');
  }
  if (primitive === 'ADJUST_BUDGET') {
    status = 'needs_review';
    reasons.push('budget_risk');
  }
  if (primitive === 'CROSS_MODULE_TASK') {
    status = 'needs_review';
    reasons.push('cross_module');
  }
  if (s.severity?.label === 'P0') {
    reasons.push('p0_urgent');
  }

  const profile = normalizeGoalProfilePatch({}, goalProfile || defaultGoalProfile());
  const blockedPrimitives = new Set(profile.guardrailPolicy?.blockedPrimitives || []);
  const requireReviewPrimitives = new Set(profile.guardrailPolicy?.requireReviewPrimitives || []);
  const allowAutoPrimitives = new Set(profile.guardrailPolicy?.allowAutoExecutePrimitives || []);
  const deltaPct = actionDeltaPct(typedAction);
  const maxDelta = primitive === 'ADJUST_BUDGET'
    ? profile.budgetBoundary?.dailyBudgetIncreasePctMax
    : profile.budgetBoundary?.bidChangePctMax;

  if (profile.automationLevel === 'manual_review') {
    status = 'needs_review';
    reasons.push('profile_manual_review');
  }
  if (blockedPrimitives.has(primitive)) {
    status = 'blocked';
    reasons.push('profile_blocked_primitive');
  } else if (requireReviewPrimitives.has(primitive)) {
    status = status === 'blocked' ? status : 'needs_review';
  }
  if (profileHitsProtectedEntity(profile, s.entity)) {
    status = status === 'blocked' ? status : 'needs_review';
    reasons.push('profile_protected_entity');
  }
  if (deltaPct !== null && Number.isFinite(Number(maxDelta)) && deltaPct > Number(maxDelta)) {
    status = status === 'blocked' ? status : 'needs_review';
    reasons.push('profile_delta_too_large');
  }
  if ((s.evidenceRefs?.length || s.evidence?.length || 0) < (profile.evidencePolicy?.minEvidenceRefs || 0)) {
    status = status === 'blocked' ? status : 'needs_review';
    reasons.push('profile_evidence_missing');
  }

  const automationLevel = status === 'passed' ? meta.automationLevel : (meta.risk === 'high' ? 'L1' : 'L2');
  const canAutoExecute = status === 'passed'
    && meta.risk === 'low'
    && profile.automationLevel === 'guarded_auto'
    && allowAutoPrimitives.has(primitive)
    && (s.confidence ?? 0.7) >= (profile.guardrailPolicy?.minConfidenceToAutoExecute ?? 0.72);
  return {
    status,
    statusLabel: status === 'passed' ? '护栏通过' : status === 'blocked' ? '已阻断' : '需要复核',
    reasons: Array.from(new Set(reasons)),
    reasonLabels: Array.from(new Set(reasons)).map((r) => GUARDRAIL_REASON_LABELS[r] || r),
    automationLevel: profile.automationLevel === 'manual_review' ? 'L1' : automationLevel,
    maxRisk: meta.risk,
    canAutoExecute,
    dryRunOnly: true,
    profileSnapshot: {
      primaryGoal: profile.primaryGoal,
      riskPreference: profile.riskPreference,
      automationLevel: profile.automationLevel,
    },
    gates: {
      budgetBoundary: primitive === 'ADJUST_BUDGET' ? 'needs_user_limit' : 'not_touched',
      protectedEntity: profileHitsProtectedEntity(profile, s.entity)
        ? 'profile_protected'
        : s.entity?.keyword && /brand|品牌/i.test(s.entity.keyword) ? 'brand_term_review' : 'passed',
      inventoryBoundary: /库存|断货|stockout/i.test(`${s.summary || ''} ${s.detail || ''}`) ? 'inventory_signal_present' : 'not_applicable',
      realWrite: profile.guardrailPolicy?.realWriteEnabled ? 'requested_but_adapter_mocked' : 'disabled',
    },
  };
}

function buildRollbackPlan(s, typedAction) {
  const primitive = typedAction?.actionPrimitive || inferActionPrimitive(s);
  const map = {
    ADJUST_BID: { method: 'restore_previous_bid', label: '恢复原竞价', windowDays: 7, needsManualReview: false },
    ADJUST_BUDGET: { method: 'restore_previous_budget', label: '恢复原预算/调拨', windowDays: 7, needsManualReview: true },
    GOVERN_KEYWORD: { method: 'delete_created_targeting_or_negative', label: '删除新增否词/投放词', windowDays: 7, needsManualReview: true },
    CREATE_OR_EVOLVE_STRUCTURE: { method: 'archive_created_structure', label: '归档新增 Campaign/实验', windowDays: 14, needsManualReview: true },
    PAUSE_OR_THROTTLE: { method: 'restore_previous_state', label: '恢复投放状态', windowDays: 3, needsManualReview: true },
    SYNC_CONTEXT: { method: 'no_write_to_revert', label: '仅同步，无需回滚', windowDays: 0, needsManualReview: false },
    CROSS_MODULE_TASK: { method: 'revert_linked_module_version', label: '回滚关联模块版本', windowDays: 7, needsManualReview: true },
    GUARDRAIL_ONLY: { method: 'release_guardrail_clamp', label: '解除护栏限制', windowDays: 3, needsManualReview: true },
  };
  const picked = map[primitive] || map.ADJUST_BID;
  return {
    reversible: primitive !== 'SYNC_CONTEXT',
    windowDays: picked.windowDays,
    method: picked.method,
    methodLabel: picked.label,
    needsManualReview: picked.needsManualReview,
    auditTrail: 'audit_logs + ad_suggestions state machine',
  };
}

function buildImpactEstimate(s) {
  const impact = s.impact || {};
  const saveMonthly = Number(impact.saveMonthly || 0);
  const gainMonthly = Number(impact.gainMonthly || 0);
  return {
    horizonDays: 30,
    currency: 'USD',
    monthly: {
      save: Number.isFinite(saveMonthly) ? saveMonthly : 0,
      gain: Number.isFinite(gainMonthly) ? gainMonthly : 0,
      net: (Number.isFinite(saveMonthly) ? saveMonthly : 0) + (Number.isFinite(gainMonthly) ? gainMonthly : 0),
    },
    label: impact.label || null,
    model: 'mock_rule_estimate_v1',
    confidence: s.confidence ?? null,
  };
}

function buildSourceMeta(s, evidenceRefs, goalProfile = defaultGoalProfile()) {
  return {
    source: 'mock',
    adapter: 'lingxing_equivalent_seed',
    freshness: 'mock_seed_2026-05-14',
    sourceConfidence: 'partial',
    dataLagHours: null,
    evidenceCount: evidenceRefs.length,
    generatedBy: 'm3_strategy_os_enrichment_v1',
    realWriteEnabled: false,
    goalProfile: {
      primaryGoal: goalProfile.primaryGoal,
      riskPreference: goalProfile.riskPreference,
      automationLevel: goalProfile.automationLevel,
    },
  };
}

function buildConfidenceBreakdown(s, evidenceRefs, guardrail, rollback, impactEstimate) {
  const dataScore = clampNumber(0.45 + evidenceRefs.length * 0.08, 0.45, 0.86);
  const ruleScore = clampNumber(s.historicalSuccessRate ?? 0.65, 0.35, 0.95);
  const impactScore = impactEstimate.monthly.net > 0 ? 0.74 : 0.55;
  const reversibilityScore = rollback.reversible ? (rollback.needsManualReview ? 0.78 : 0.92) : 0.55;
  const guardrailScore = guardrail.status === 'passed' ? 0.88 : guardrail.status === 'blocked' ? 0.3 : 0.66;
  return {
    data: dataScore,
    rule: ruleScore,
    impact: impactScore,
    reversibility: reversibilityScore,
    guardrail: guardrailScore,
    final: s.confidence ?? Number(((dataScore + ruleScore + impactScore + reversibilityScore + guardrailScore) / 5).toFixed(2)),
  };
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

function rowToSuggestion(r, goalProfile = defaultGoalProfile()) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v); } catch { return null; } };
  const base = {
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
    nextEligibleAt: r.next_eligible_at || null,
    settledAt: r.settled_at || null,
    settlementOutcome: r.settlement_outcome || null,
    settlementMeta: (() => { try { return r.settlement_meta ? JSON.parse(r.settlement_meta) : null; } catch { return null; } })(),
    createdAt: r.created_at,
  };
  // M3-P2-23: an accepted suggestion in its observation window is not
  // re-triggerable until next_eligible_at passes.
  base.eligible = !(base.nextEligibleAt && Date.parse(base.nextEligibleAt) > Date.now());
  const typedAction = buildTypedAction(base);
  const evidenceRefs = buildEvidenceRefs(base, typedAction);
  const guardrail = buildGuardrailResult(base, typedAction, goalProfile);
  const rollback = buildRollbackPlan(base, typedAction);
  const impactEstimate = buildImpactEstimate(base);
  const sourceMeta = buildSourceMeta(base, evidenceRefs, goalProfile);
  const confidenceBreakdown = buildConfidenceBreakdown(base, evidenceRefs, guardrail, rollback, impactEstimate);
  return {
    ...base,
    typedAction,
    evidenceRefs,
    guardrail,
    rollback,
    rollbackPlan: rollback,
    impactEstimate,
    sourceMeta,
    confidenceBreakdown,
  };
}

function rowToActionRun(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v || 'null'); } catch { return null; } };
  return {
    id: r.id,
    queueItemId: r.queue_item_id,
    batchId: r.batch_id,
    actionType: r.action_type,
    status: r.status,
    dryRun: !!r.dry_run,
    requestPayload: j(r.request_payload),
    responsePayload: j(r.response_payload),
    errorMessage: r.error_message,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

function rowToActionQueueItem(r) {
  if (!r) return null;
  const j = (v) => { try { return JSON.parse(v || 'null'); } catch { return null; } };
  return {
    id: r.id,
    suggestionId: r.suggestion_id,
    sourceStrategyId: r.source_strategy_id,
    sourceStrategyName: r.source_strategy_name,
    state: r.state,
    priorityScore: r.priority_score,
    severity: j(r.severity),
    entity: j(r.entity) || {},
    typedAction: j(r.typed_action),
    evidenceRefs: j(r.evidence_refs) || [],
    guardrail: j(r.guardrail),
    rollback: j(r.rollback_plan),
    rollbackPlan: j(r.rollback_plan),
    impactEstimate: j(r.impact_estimate),
    sourceMeta: j(r.source_meta),
    confidenceBreakdown: j(r.confidence_breakdown),
    dryRun: !!r.dry_run,
    auditRequired: !!r.audit_required,
    approvedAt: r.approved_at,
    executedAt: r.executed_at,
    removedAt: r.removed_at,
    revertedAt: r.reverted_at,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToGoalProfile(r) {
  if (!r) return null;
  const j = (v, fallback) => { try { return JSON.parse(v || 'null') ?? fallback; } catch { return fallback; } };
  return {
    id: r.id,
    primaryGoal: r.primary_goal,
    riskPreference: r.risk_preference,
    automationLevel: r.automation_level,
    protectedEntities: j(r.protected_entities, cloneJson(DEFAULT_GOAL_PROFILE.protectedEntities)),
    budgetBoundary: j(r.budget_boundary, cloneJson(DEFAULT_GOAL_PROFILE.budgetBoundary)),
    guardrailPolicy: j(r.guardrail_policy, cloneJson(DEFAULT_GOAL_PROFILE.guardrailPolicy)),
    evidencePolicy: j(r.evidence_policy, cloneJson(DEFAULT_GOAL_PROFILE.evidencePolicy)),
    sourceMeta: j(r.source_meta, cloneJson(DEFAULT_GOAL_PROFILE.sourceMeta)),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function buildActionPriority(s) {
  const severity = ({ P0: 1000, P1: 600, P2: 250 })[s?.severity?.label] ?? 100;
  const impact = s?.impactEstimate?.monthly?.net ?? ((s?.impact?.saveMonthly || 0) + (s?.impact?.gainMonthly || 0));
  const confidence = Math.round((s?.confidenceBreakdown?.final ?? s?.confidence ?? 0.5) * 100);
  const guardrailPenalty = s?.guardrail?.status === 'blocked' ? -500 : s?.guardrail?.status === 'needs_review' ? -50 : 50;
  return Number((severity + Math.min(impact || 0, 1000) + confidence + guardrailPenalty).toFixed(2));
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
    signal: r.signal, sku: r.sku, asin: r.asin,
    reportingDate: r.reporting_date, period: r.reporting_period,
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
// Goal Profile — store-level AI objective + guardrail contract
// ============================================================
export function getGoalProfile(db, userId, storeId) {
  const row = db.prepare('SELECT * FROM ad_goal_profiles WHERE user_id = ? AND store_id = ?').get(userId, storeId);
  return rowToGoalProfile(row) || defaultGoalProfile();
}

export function updateGoalProfile(db, userId, storeId, patch = {}) {
  const existingRow = db.prepare('SELECT * FROM ad_goal_profiles WHERE user_id = ? AND store_id = ?').get(userId, storeId);
  const existing = rowToGoalProfile(existingRow) || defaultGoalProfile();
  const next = normalizeGoalProfilePatch(patch, existing);
  const now = nowIso();
  const id = existing.id || patch.id || newId('gp');
  if (existingRow) {
    db.prepare(`UPDATE ad_goal_profiles SET
      primary_goal=?, risk_preference=?, automation_level=?, protected_entities=?,
      budget_boundary=?, guardrail_policy=?, evidence_policy=?, source_meta=?, updated_at=?
      WHERE id=? AND user_id=? AND store_id=?`).run(
        next.primaryGoal, next.riskPreference, next.automationLevel,
        JSON.stringify(next.protectedEntities || {}),
        JSON.stringify(next.budgetBoundary || {}),
        JSON.stringify(next.guardrailPolicy || {}),
        JSON.stringify(next.evidencePolicy || {}),
        JSON.stringify(next.sourceMeta || {}),
        now, existing.id, userId, storeId
      );
  } else {
    db.prepare(`INSERT INTO ad_goal_profiles(
      id, user_id, store_id, primary_goal, risk_preference, automation_level,
      protected_entities, budget_boundary, guardrail_policy, evidence_policy, source_meta,
      created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, next.primaryGoal, next.riskPreference, next.automationLevel,
        JSON.stringify(next.protectedEntities || {}),
        JSON.stringify(next.budgetBoundary || {}),
        JSON.stringify(next.guardrailPolicy || {}),
        JSON.stringify(next.evidencePolicy || {}),
        JSON.stringify(next.sourceMeta || {}),
        now, now
      );
  }
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3',
    actionType: 'GOAL_PROFILE_UPDATE',
    resourceType: 'ad_goal_profile',
    resourceId: id,
    previousValues: existingRow ? existing : null,
    payload: patch,
  });
  return getGoalProfile(db, userId, storeId);
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
  const profile = getGoalProfile(db, userId, storeId);
  let rows = db.prepare(sql).all(...params).map((r) => rowToSuggestion(r, profile));
  // M3-P2-23: triggerable/eligibleOnly callers must not see suggestions still
  // inside their observation window (next_eligible_at in the future).
  if (filters.eligibleOnly || filters.triggerable) {
    rows = rows.filter((s) => s.eligible !== false);
  }
  return rows;
}

export function getSuggestion(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM ad_suggestions WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  return rowToSuggestion(r, getGoalProfile(db, userId, storeId));
}

export function acceptSuggestion(db, userId, storeId, id, body = {}) {
  const cur = getSuggestion(db, userId, storeId, id);
  if (!cur) return null;
  if (cur.state === 'observing') {
    // Idempotent — already accepted
    return cur;
  }
  const now = nowIso();
  // M3-P2-23: land the observation window so the same suggestion cannot
  // re-trigger before it expires. listSuggestions filters/marks not-yet-eligible
  // items, making the "观察窗内不重复触发" promise real instead of cosmetic.
  const windowHours = Number(cur.observationWindowHours ?? cur.cooldownHours ?? 72) || 72;
  const nextEligibleAt = new Date(Date.now() + windowHours * 3600_000).toISOString();
  db.prepare(`UPDATE ad_suggestions SET state='observing', accepted_at=?, rejected_at=NULL, reject_reason=NULL, reverted_at=NULL, revert_reason=NULL, next_eligible_at=? WHERE id=? AND user_id=? AND store_id=?`).run(now, nextEligibleAt, id, userId, storeId);
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
// N5-m3-observation-settle — explicit observation settlement
// ============================================================
// Deterministic, simulation-only outcome for an observing suggestion whose
// observation window has elapsed. There is NO real回流/effect data without real
// Amazon credentials, so we never fabricate "real" performance. We derive a
// pass/fail verdict from data the system already holds (confidence,
// historicalSuccessRate, guardrail.status) using a stable rule, and we mark the
// verdict simulated:true so it can never be mistaken for a real副作用.
function simulateObservationOutcome(sug) {
  const confidence = Number(sug.confidence ?? 0.5);
  const histSuccess = Number(sug.historicalSuccessRate ?? 0.5);
  const guardrailStatus = sug.guardrail?.status || 'needs_review';
  // Blocked guardrail can never count as a real success.
  if (guardrailStatus === 'blocked') {
    return {
      outcome: 'failed',
      score: 0,
      reason: 'guardrail_blocked',
    };
  }
  // Deterministic score in [0,1]; threshold 0.6 ⇒ succeeded.
  const score = Number((0.5 * confidence + 0.5 * histSuccess).toFixed(4));
  return {
    outcome: score >= 0.6 ? 'succeeded' : 'failed',
    score,
    reason: score >= 0.6 ? 'simulated_threshold_met' : 'simulated_threshold_not_met',
  };
}

// settleObservations(db, userId, storeId) — on-demand (NON-cron) settlement.
// For every observing suggestion whose next_eligible_at (observation window) has
// passed, compute a deterministic simulated verdict, flip state to
// succeeded/failed, persist settlement_meta with simulated=true, write an audit
// log, and DO NOT touch real Amazon. Suggestions still inside their window are
// left untouched. Returns a summary { settled, succeeded, failed, items }.
export function settleObservations(db, userId, storeId, opts = {}) {
  const nowMs = opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  const nowIsoStr = new Date(nowMs).toISOString();
  const rows = db.prepare(
    `SELECT * FROM ad_suggestions WHERE user_id=? AND store_id=? AND state='observing'`
  ).all(userId, storeId);
  const profile = getGoalProfile(db, userId, storeId);
  const settledItems = [];
  let succeeded = 0;
  let failed = 0;
  const update = db.prepare(
    `UPDATE ad_suggestions SET state=?, settled_at=?, settlement_outcome=?, settlement_meta=? WHERE id=? AND user_id=? AND store_id=? AND state='observing'`
  );
  for (const r of rows) {
    // Window not elapsed yet (or never set) → not eligible to settle.
    const eligibleAt = r.next_eligible_at ? Date.parse(r.next_eligible_at) : NaN;
    if (!Number.isFinite(eligibleAt) || eligibleAt > nowMs) continue;
    const sug = rowToSuggestion(r, profile);
    const verdict = simulateObservationOutcome(sug);
    const settlementMeta = {
      // Honest labelling: this is a deterministic simulation, NOT a measured real
      // Amazon effect. Never present as real performance回流.
      simulated: true,
      source: 'mock',
      adapter: 'm3_observation_settlement_v1',
      realEffectMeasured: false,
      settledAt: nowIsoStr,
      observationWindowHours: sug.observationWindowHours ?? null,
      nextEligibleAt: r.next_eligible_at,
      acceptedAt: r.accepted_at,
      score: verdict.score,
      reason: verdict.reason,
      guardrailStatus: sug.guardrail?.status || null,
    };
    const info = update.run(
      verdict.outcome, nowIsoStr, verdict.outcome, JSON.stringify(settlementMeta),
      r.id, userId, storeId
    );
    if (!info.changes) continue;
    if (verdict.outcome === 'succeeded') succeeded += 1; else failed += 1;
    // Audit trail — no token/secret, no real store side-effect.
    appendAuditLog(userId, storeId, {
      sourceModule: 'M3', actionType: 'TIMELINE_SETTLE', resourceType: 'ad_suggestion', resourceId: r.id,
      status: 'completed',
      outcome: verdict.outcome,
      previousValues: { state: 'observing' },
      sourceMeta: { simulated: true, source: 'mock', realEffectMeasured: false, adapter: 'm3_observation_settlement_v1' },
    });
    settledItems.push(getSuggestion(db, userId, storeId, r.id));
  }
  return {
    settled: settledItems.length,
    succeeded,
    failed,
    simulated: true,
    realEffectMeasured: false,
    items: settledItems,
  };
}

// ============================================================
// Action Queue CRUD — execution basket for Strategy OS
// ============================================================
export function listActionQueue(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM ad_action_queue WHERE user_id = ? AND store_id = ? AND removed_at IS NULL';
  const params = [userId, storeId];
  if (filters.state) { sql += ' AND state = ?'; params.push(filters.state); }
  if (filters.suggestionId) { sql += ' AND suggestion_id = ?'; params.push(filters.suggestionId); }
  sql += ' ORDER BY priority_score DESC, created_at ASC';
  return db.prepare(sql).all(...params).map(rowToActionQueueItem);
}

export function getActionQueueItem(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM ad_action_queue WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  return rowToActionQueueItem(r);
}

export function listActionRuns(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM ad_action_runs WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.queueItemId) { sql += ' AND queue_item_id = ?'; params.push(filters.queueItemId); }
  if (filters.batchId) { sql += ' AND batch_id = ?'; params.push(filters.batchId); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(rowToActionRun);
}

export function enqueueSuggestionAction(db, userId, storeId, suggestionId, body = {}) {
  const s = getSuggestion(db, userId, storeId, suggestionId);
  if (!s) return null;
  const active = db.prepare(`SELECT * FROM ad_action_queue
    WHERE user_id=? AND store_id=? AND suggestion_id=? AND removed_at IS NULL
      AND state IN ('queued','approved','executing')`).get(userId, storeId, suggestionId);
  if (active) return { ...rowToActionQueueItem(active), duplicate: true };
  const id = body.id || newId('aq');
  const now = nowIso();
  const priority = body.priorityScore ?? buildActionPriority(s);
  db.prepare(`INSERT INTO ad_action_queue(
    id, user_id, store_id, suggestion_id, source_strategy_id, source_strategy_name,
    state, priority_score, severity, entity, typed_action, evidence_refs, guardrail,
    rollback_plan, impact_estimate, source_meta, confidence_breakdown,
    dry_run, audit_required, note, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, s.id, s.sourceStrategyId || null, s.sourceStrategyName || null,
      body.state || 'queued', priority,
      JSON.stringify(s.severity || null), JSON.stringify(s.entity || {}),
      JSON.stringify(s.typedAction || null), JSON.stringify(s.evidenceRefs || []),
      JSON.stringify(s.guardrail || null), JSON.stringify(s.rollback || s.rollbackPlan || null),
      JSON.stringify(s.impactEstimate || null), JSON.stringify(s.sourceMeta || null),
      JSON.stringify(s.confidenceBreakdown || null),
      s.typedAction?.dryRun === false ? 0 : 1,
      s.typedAction?.auditRequired === false ? 0 : 1,
      body.note || null, now, now
    );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'ACTION_QUEUE_ADD',
    resourceType: 'ad_action_queue', resourceId: id,
    suggestionId: s.id,
    payload: { typedAction: s.typedAction, guardrail: s.guardrail, rollback: s.rollback || s.rollbackPlan },
  });
  return getActionQueueItem(db, userId, storeId, id);
}

export function enqueueManualAction(db, userId, storeId, body = {}) {
  const typedAction = body.typedAction || null;
  if (!typedAction || typeof typedAction !== 'object') throw new TypeError('typedAction required');
  const entity = body.entity && typeof body.entity === 'object' ? body.entity : {};

  // M3-P1-10: dedupe active manual actions on
  // (storeId, entityKind, resourceId, actionPrimitive). Key granularity for
  // this phase: one active action per (entity, primitive).
  const entityKind = entity.kind || typedAction.entityKind || null;
  const resourceId = entity.id || typedAction.resourceId || null;
  const actionPrimitive = typedAction.actionPrimitive || null;
  if (entityKind && resourceId && actionPrimitive) {
    const existing = listActionQueue(db, userId, storeId).find((item) => (
      ['queued', 'approved', 'executing'].includes(item.state)
      && (item.entity?.kind || item.typedAction?.entityKind || null) === entityKind
      && (item.entity?.id || item.typedAction?.resourceId || null) === resourceId
      && (item.typedAction?.actionPrimitive || null) === actionPrimitive
    ));
    if (existing) return { ...existing, duplicate: true, existing };
  }

  const id = body.id || newId('aq');
  const now = nowIso();
  // M3-P0-04: server-side authoritative guardrail. body.guardrail / body.state
  // are NOT trusted — a raw POST can forge status='passed'. lx / non-system
  // sources are always state='queued'; the guardrail is recomputed server-side
  // (buildGuardrailResult). Since manual/LX writes have no decided auto-execute
  // threshold this phase, they hard-land needs_review. body.guardrail may only
  // be echoed for display, never persisted as authoritative.
  let guardrail;
  try {
    const computed = buildGuardrailResult(
      { confidence: 0.5, severity: body.severity, entity, evidenceRefs: body.evidenceRefs },
      typedAction,
      getGoalProfile(db, userId, storeId),
    );
    guardrail = computed && computed.status === 'passed'
      ? { ...computed, status: 'needs_review', reasons: Array.from(new Set([...(computed.reasons || []), 'manual_lx_write_requires_action_queue'])) }
      : computed;
  } catch {
    guardrail = null;
  }
  if (!guardrail || guardrail.status === 'passed') {
    guardrail = { status: 'needs_review', reasons: ['manual_lx_write_requires_action_queue'] };
  }
  const rollbackPlan = body.rollbackPlan || body.rollback || {
    method: 'manual_revert_required',
    needsManualReview: true,
  };
  db.prepare(`INSERT INTO ad_action_queue(
    id, user_id, store_id, suggestion_id, source_strategy_id, source_strategy_name,
    state, priority_score, severity, entity, typed_action, evidence_refs, guardrail,
    rollback_plan, impact_estimate, source_meta, confidence_breakdown,
    dry_run, audit_required, note, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, null, body.sourceStrategyId || null, body.sourceStrategyName || 'LX manual operation',
      'queued', body.priorityScore ?? 50,
      JSON.stringify(body.severity || { level: 'medium', reason: 'manual_lx_write' }),
      JSON.stringify(entity),
      JSON.stringify({
        dryRun: true,
        auditRequired: true,
        ...typedAction,
      }),
      JSON.stringify(Array.isArray(body.evidenceRefs) ? body.evidenceRefs : []),
      JSON.stringify(guardrail),
      JSON.stringify(rollbackPlan),
      JSON.stringify(body.impactEstimate || { type: 'manual_review_required' }),
      JSON.stringify(body.sourceMeta || { source: 'lx-ui', mode: 'queued-not-written' }),
      JSON.stringify(body.confidenceBreakdown || { evidence: 'operator_input', confidence: 0.7 }),
      1,
      1,
      body.note || null, now, now
    );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3',
    actionType: 'ACTION_QUEUE_ADD_MANUAL',
    resourceType: 'ad_action_queue',
    resourceId: id,
    payload: { typedAction, entity, guardrail, rollbackPlan },
  });
  return getActionQueueItem(db, userId, storeId, id);
}

export function approveActionQueueItem(db, userId, storeId, id, body = {}) {
  const cur = getActionQueueItem(db, userId, storeId, id);
  if (!cur || cur.removedAt) return null;
  if (cur.state === 'approved') return cur;
  if (!['queued', 'reverted'].includes(cur.state)) throw new TypeError('action_queue_state_not_approvable');
  // M3-P0-03: approval is gated on a passing guardrail. needs_review/blocked
  // items can never be approved here — this is the second auto-approve entry
  // point that previously bypassed the guardrail.
  if (cur.guardrail?.status !== 'passed') throw new TypeError('approve_requires_passed_guardrail');
  const now = nowIso();
  db.prepare(`UPDATE ad_action_queue SET state='approved', approved_at=?, note=COALESCE(?, note), updated_at=? WHERE id=? AND user_id=? AND store_id=?`)
    .run(now, body.note || null, now, id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'ACTION_QUEUE_APPROVE',
    resourceType: 'ad_action_queue', resourceId: id,
    previousValues: { state: cur.state },
  });
  return getActionQueueItem(db, userId, storeId, id);
}

export function removeActionQueueItem(db, userId, storeId, id, body = {}) {
  const cur = getActionQueueItem(db, userId, storeId, id);
  if (!cur || cur.removedAt) return null;
  if (cur.state === 'executed') throw new TypeError('executed_action_queue_item_cannot_be_removed');
  const now = nowIso();
  db.prepare(`UPDATE ad_action_queue SET state='removed', removed_at=?, note=COALESCE(?, note), updated_at=? WHERE id=? AND user_id=? AND store_id=?`)
    .run(now, body.reason || body.note || null, now, id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'ACTION_QUEUE_REMOVE',
    resourceType: 'ad_action_queue', resourceId: id,
    reason: body.reason,
    previousValues: { state: cur.state },
  });
  return getActionQueueItem(db, userId, storeId, id);
}

export function executeActionQueueItem(db, userId, storeId, id, body = {}) {
  const cur = getActionQueueItem(db, userId, storeId, id);
  if (!cur || cur.removedAt) return null;
  if (cur.state === 'executed') return cur;
  if (cur.guardrail?.status === 'blocked' && !body.force) throw new TypeError('guardrail_blocked');
  if (cur.guardrail?.status === 'needs_review' && cur.state !== 'approved' && !body.force) throw new TypeError('approval_required');
  if (!['queued', 'approved', 'reverted'].includes(cur.state)) throw new TypeError('action_queue_state_not_executable');

  const batchId = body.batchId || newId('batch');
  const runId = newId('ar');
  const now = nowIso();
  // M3-P1-09: this is the dry-run-only internal executor. Real Amazon writes
  // are exclusively handled by live-action-executor (executeRealAdsActionQueueItem)
  // behind isRealMode(). dryRun is hard-pinned to 1 here — body.realWriteEnabled
  // is intentionally ignored so this path can never produce a real or fake write.
  const dryRun = 1;
  const requestPayload = {
    queueItemId: id,
    suggestionId: cur.suggestionId,
    typedAction: cur.typedAction,
    guardrail: cur.guardrail,
    dryRun: true,
  };
  const responsePayload = {
    dryRun: true,
    acceptedSuggestion: !!cur.suggestionId,
    message: 'dry_run_success_no_external_write',
  };

  db.prepare(`INSERT INTO ad_action_runs(
    id, user_id, store_id, queue_item_id, batch_id, action_type, status, dry_run,
    request_payload, response_payload, error_message, created_at, completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      runId, userId, storeId, id, batchId, cur.typedAction?.actionPrimitive || null,
      'dry_run_success',
      dryRun,
      JSON.stringify(requestPayload), JSON.stringify(responsePayload), null, now, now
    );
  db.prepare(`UPDATE ad_action_queue SET state='executed', executed_at=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?`)
    .run(now, now, id, userId, storeId);

  if (cur.suggestionId) {
    acceptSuggestion(db, userId, storeId, cur.suggestionId, {
      chosenAlternativeIndex: body.chosenAlternativeIndex ?? 0,
      queueItemId: id,
      dryRun: !!dryRun,
    });
  }
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'ACTION_QUEUE_EXECUTE',
    resourceType: 'ad_action_queue', resourceId: id,
    batchId,
    payload: requestPayload,
    result: responsePayload,
  });
  return { ...getActionQueueItem(db, userId, storeId, id), latestRun: getActionRunById(db, userId, storeId, runId), batchId };
}

function getActionRunById(db, userId, storeId, id) {
  return rowToActionRun(db.prepare('SELECT * FROM ad_action_runs WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId));
}

// Redact LWA/refresh/access tokens from any payload before it is persisted to
// ad_action_runs / audit_logs. Tokens must never land in DB columns (X-P2-02).
const TOKEN_PATTERN = /(Atzr\|[A-Za-z0-9._~+/=-]+|Atza\|[A-Za-z0-9._~+/=-]+)/g;
const SENSITIVE_KEY_PATTERN = /(refresh_?token|access_?token|authorization|client_?secret|bearer)/i;

export function sanitizePersistedPayload(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'string') return value.replace(TOKEN_PATTERN, '[REDACTED]');
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => sanitizePersistedPayload(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) { out[k] = '[REDACTED]'; continue; }
    out[k] = sanitizePersistedPayload(v, seen);
  }
  return out;
}

export function recordActionQueueExternalResult(db, userId, storeId, id, result = {}) {
  const cur = getActionQueueItem(db, userId, storeId, id);
  if (!cur || cur.removedAt) return null;
  const batchId = result.batchId || newId('batch');
  const runId = result.runId || newId('ar');
  const now = nowIso();
  const status = result.status || (result.errorMessage ? 'failed' : 'real_write_success');
  const dryRun = result.dryRun === undefined ? false : !!result.dryRun;
  const requestPayload = result.requestPayload || {
    queueItemId: id,
    suggestionId: cur.suggestionId,
    typedAction: cur.typedAction,
    guardrail: cur.guardrail,
    dryRun,
  };
  const responsePayload = result.responsePayload || null;
  // Token-redact before any DB write (X-P2-02): refresh/access tokens must not
  // be persisted in request_payload / response_payload columns.
  const safeRequestPayload = sanitizePersistedPayload(requestPayload);
  const safeResponsePayload = responsePayload ? sanitizePersistedPayload(responsePayload) : null;

  db.prepare(`INSERT INTO ad_action_runs(
    id, user_id, store_id, queue_item_id, batch_id, action_type, status, dry_run,
    request_payload, response_payload, error_message, created_at, completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      runId, userId, storeId, id, batchId, cur.typedAction?.actionPrimitive || null,
      status, dryRun ? 1 : 0,
      JSON.stringify(safeRequestPayload), safeResponsePayload ? JSON.stringify(safeResponsePayload) : null,
      sanitizePersistedPayload(result.errorMessage) || null, now, now
    );

  if (!result.errorMessage && result.markExecuted !== false) {
    db.prepare(`UPDATE ad_action_queue SET state='executed', executed_at=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?`)
      .run(now, now, id, userId, storeId);
    if (cur.suggestionId) {
      acceptSuggestion(db, userId, storeId, cur.suggestionId, {
        chosenAlternativeIndex: result.chosenAlternativeIndex ?? 0,
        queueItemId: id,
        dryRun,
      });
    }
  }

  appendAuditLog(userId, storeId, {
    sourceModule: 'M3',
    actionType: result.auditActionType || (dryRun ? 'ACTION_QUEUE_DRY_RUN' : 'ACTION_QUEUE_REAL_WRITE'),
    resourceType: 'ad_action_queue',
    resourceId: id,
    batchId,
    payload: safeRequestPayload,
    result: safeResponsePayload,
    status: result.errorMessage ? 'failed' : 'success',
    errorMessage: sanitizePersistedPayload(result.errorMessage) || null,
    origin: dryRun ? 'mock-seed' : 'ads-real-write',
  });

  return { ...getActionQueueItem(db, userId, storeId, id), latestRun: getActionRunById(db, userId, storeId, runId), batchId };
}

export function executeActionQueueBatch(db, userId, storeId, body = {}) {
  const batchId = body.batchId || newId('batch');
  const ids = Array.isArray(body.ids) && body.ids.length
    ? body.ids
    : listActionQueue(db, userId, storeId, { state: body.state || null }).filter((x) => ['queued', 'approved'].includes(x.state)).map((x) => x.id);
  const items = [];
  const skipped = [];
  for (const id of ids) {
    try {
      if (body.approve === true) {
        const cur = getActionQueueItem(db, userId, storeId, id);
        // M3-P0-02: batch approve only releases queued items whose guardrail
        // passed. needs_review / blocked items are skipped (not approved, not
        // executed) and surfaced in skipped[] — never silently auto-approved.
        if (cur && cur.state === 'queued' && cur.guardrail?.status !== 'passed') {
          skipped.push({ id, reason: `guardrail_${cur.guardrail?.status || 'unknown'}` });
          continue;
        }
        if (cur && cur.state === 'queued') approveActionQueueItem(db, userId, storeId, id, { note: 'batch approve' });
      }
      items.push({ id, ok: true, item: executeActionQueueItem(db, userId, storeId, id, { ...body, batchId }) });
    } catch (err) {
      const msg = String(err?.message || err);
      const runId = newId('ar');
      const now = nowIso();
      db.prepare(`INSERT INTO ad_action_runs(
        id, user_id, store_id, queue_item_id, batch_id, action_type, status, dry_run,
        request_payload, response_payload, error_message, created_at, completed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          runId, userId, storeId, id, batchId, null, 'failed', 1,
          JSON.stringify({ queueItemId: id, dryRun: true }), null, msg, now, now
        );
      items.push({ id, ok: false, error: msg });
    }
  }
  return {
    batchId,
    total: items.length,
    succeeded: items.filter((x) => x.ok).length,
    failed: items.filter((x) => !x.ok).length,
    skipped,
    items,
  };
}

export function revertActionQueueItem(db, userId, storeId, id, body = {}) {
  const cur = getActionQueueItem(db, userId, storeId, id);
  if (!cur || cur.removedAt) return null;
  if (cur.state !== 'executed') throw new TypeError('only_executed_queue_item_can_revert');
  // X-P0-01 (queue parity): a real Amazon write cannot be silently flipped to
  // 'reverted'. There is no real inverse-write executor, so block and require
  // manual reversal rather than fake a rollback.
  const lastRealRun = db.prepare(
    `SELECT status, dry_run FROM ad_action_runs WHERE user_id=? AND store_id=? AND queue_item_id=? ORDER BY created_at DESC LIMIT 1`
  ).get(userId, storeId, id);
  if (lastRealRun && lastRealRun.dry_run === 0 && lastRealRun.status === 'real_write_success' && body.force !== true) {
    const err = new TypeError('real_write_revert_requires_manual_reversal');
    err.needsManualReversal = true;
    throw err;
  }
  const now = nowIso();
  if (cur.suggestionId) {
    const sug = getSuggestion(db, userId, storeId, cur.suggestionId);
    if (sug && sug.state !== 'pending') revertSuggestion(db, userId, storeId, cur.suggestionId, { reason: body.reason || 'action queue revert' });
  }
  db.prepare(`UPDATE ad_action_queue SET state='reverted', reverted_at=?, note=COALESCE(?, note), updated_at=? WHERE id=? AND user_id=? AND store_id=?`)
    .run(now, body.reason || null, now, id, userId, storeId);
  const runId = newId('ar');
  db.prepare(`INSERT INTO ad_action_runs(
    id, user_id, store_id, queue_item_id, batch_id, action_type, status, dry_run,
    request_payload, response_payload, error_message, created_at, completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      runId, userId, storeId, id, body.batchId || null, cur.typedAction?.actionPrimitive || null,
      'reverted', 1,
      JSON.stringify({ queueItemId: id, reason: body.reason || null }),
      JSON.stringify({ reverted: true, method: cur.rollback?.method || cur.rollbackPlan?.method || null }),
      null, now, now
    );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M3', actionType: 'ACTION_QUEUE_REVERT',
    resourceType: 'ad_action_queue', resourceId: id,
    reason: body.reason,
    previousValues: { state: cur.state },
  });
  return { ...getActionQueueItem(db, userId, storeId, id), latestRun: getActionRunById(db, userId, storeId, runId) };
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
// M3-P2-18 boundary: LOCAL DB mutation of the lx_campaigns mirror ONLY.
// This never touches Amazon. The sole path that writes to Amazon is
// live-action-executor.mjs, gated by assertRealWriteGate + isRealMode().
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
// M3-P2-18 boundary: LOCAL DB mutation only (lx_campaigns mirror + manual-change
// record). Never an Amazon write — real Amazon budget writes go through
// live-action-executor.executeCampaignBudget behind the gate.
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
// M3-P2-18 boundary: LOCAL DB mutation only (lx_targetings mirror). Real Amazon
// bid writes go through live-action-executor.executeKeywordBid behind the gate.
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
// M3-P2-18 boundary: LOCAL DB mutation only (creates a local lx_targetings row).
// Never an Amazon write — promotion to Amazon happens via the action queue +
// live-action-executor behind the gate.
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
  if (filters.asin) { sql += ' AND asin = ?'; params.push(filters.asin); }
  if (filters.sku) { sql += ' AND sku = ?'; params.push(filters.sku); }
  if (filters.from) { sql += ' AND reporting_date >= ?'; params.push(filters.from); }
  if (filters.to) { sql += ' AND reporting_date <= ?'; params.push(filters.to); }
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
  'ad_strategies', 'ad_goal_profiles', 'ad_suggestions', 'ad_action_queue', 'ad_action_runs', 'ad_manual_changes',
  'lx_portfolios', 'lx_campaigns', 'lx_ad_groups', 'lx_ads',
  'lx_targetings', 'lx_negatives', 'lx_user_search_terms',
  'lx_operation_logs', 'lx_daily_data', 'lx_kw_grabbing',
  'lx_placements', 'lx_amc_audiences',
  'sqp_queries', 'search_term_reports',
  'ad_strategy_bindings',
];
