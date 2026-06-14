// data-store-monitor.mjs — M4 监控 / 评价 / 申诉 / 恢复 / 跟卖 / 侵权 / 竞品 / 通知模块
// 13 张新 m4_* 表 + reviews ALTER + 跨模块联动 (M1/M3 ↔ M4)
//
// 所有写操作走 appendAuditLog(sourceModule='M4'); 跨模块联动调用 data-store-ads
// 的 pauseAdsForAsin/resumeAdsForAsin，调用 data-store-listings 的 createTarget。
// 种子数据走 mulberry32(hashStr(userId+':'+storeId+':'+tableName)) deterministic。

import { randomBytes } from 'node:crypto';
import { appendAuditLog } from './data-store.mjs';
import { enqueueAdAction } from './ad-action-queue.mjs';
import { isRealMode } from './integrations/provider-mode.mjs';

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return prefix + '-' + randomBytes(4).toString('hex'); }

// ============================================================
// Deterministic PRNG
// ============================================================
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ============================================================
// Schema (13 tables) + reviews ALTER
// ============================================================
export function initMonitorSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS m4_anomalies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      anomaly_code TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      sku TEXT,
      asin TEXT,
      title TEXT NOT NULL,
      evidence TEXT,
      recommended_action TEXT,
      ai_root_cause TEXT,
      expected_impact TEXT,
      assignee_user_id TEXT,
      assignee_label TEXT,
      detected_at TEXT NOT NULL,
      acknowledged_at TEXT,
      resolved_at TEXT,
      sla_minutes INTEGER NOT NULL,
      sla_deadline TEXT NOT NULL,
      sla_breached INTEGER DEFAULT 0,
      resolution_case_id TEXT,
      postmortem_id TEXT,
      source_module TEXT DEFAULT 'M4',
      skip_anomaly_emit INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_anom_us ON m4_anomalies(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m4_anom_sev ON m4_anomalies(user_id, store_id, severity, status);

    CREATE TABLE IF NOT EXISTS m4_sla_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      anomaly_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      operator_user_id TEXT,
      operator_label TEXT,
      elapsed_minutes INTEGER,
      detail TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m4_sla_us ON m4_sla_events(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m4_sla_anom ON m4_sla_events(user_id, store_id, anomaly_id, created_at);

    CREATE TABLE IF NOT EXISTS m4_resolution_cases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      anomaly_id TEXT,
      anomaly_code TEXT,
      scenario TEXT NOT NULL,
      action_plan TEXT NOT NULL,
      outcome TEXT,
      outcome_score REAL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      reusable INTEGER DEFAULT 0,
      reference_count INTEGER DEFAULT 0,
      tags TEXT,
      duration_minutes INTEGER,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_rc_us ON m4_resolution_cases(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m4_postmortems (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      anomaly_ids TEXT,
      resolution_case_ids TEXT,
      loss_estimate REAL,
      root_cause TEXT,
      resolution TEXT,
      verdict TEXT NOT NULL,
      improvements TEXT,
      timeline TEXT,
      generated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_pm_us ON m4_postmortems(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m4_hijacking (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      asin TEXT NOT NULL,
      sku TEXT,
      hijacker_seller TEXT NOT NULL,
      hijacker_price REAL,
      our_price REAL,
      detected_at TEXT NOT NULL,
      duration_min INTEGER,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_test_buy',
      test_buy_order_id TEXT,
      test_buy_received_at TEXT,
      proof_images TEXT,
      appeal_id TEXT,
      appeal_case_id TEXT,
      estimated_loss_per_hour REAL,
      m3_ads_paused INTEGER DEFAULT 0,
      m3_pause_dedup_key TEXT,
      m3_paused_campaign_ids TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_hj_us ON m4_hijacking(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m4_hj_asin ON m4_hijacking(user_id, store_id, asin);

    CREATE TABLE IF NOT EXISTS m4_infringement (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      asin TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT,
      reported_by TEXT,
      description TEXT,
      severity TEXT,
      status TEXT NOT NULL DEFAULT 'investigating',
      draft_content TEXT,
      amazon_complaint_id TEXT,
      detected_at TEXT NOT NULL,
      submitted_at TEXT,
      resolved_at TEXT,
      legal_disclaimer_ack INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_inf_us ON m4_infringement(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m4_review_clusters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      asin TEXT,
      sku TEXT,
      name TEXT NOT NULL,
      sentiment TEXT,
      root_cause TEXT,
      count INTEGER NOT NULL DEFAULT 0,
      percent REAL,
      samples TEXT,
      improvements TEXT,
      estimated_rating_lift REAL,
      confidence REAL,
      status TEXT NOT NULL DEFAULT 'new',
      pushed_m1_target_ids TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_rc2_us ON m4_review_clusters(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m4_review_trend_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      asin TEXT NOT NULL,
      sku TEXT,
      snapshot_date TEXT NOT NULL,
      avg_rating REAL,
      total_reviews INTEGER,
      added_7d INTEGER,
      avg_7d REAL,
      added_30d INTEGER,
      avg_30d REAL,
      trend TEXT,
      trend_delta REAL,
      distribution TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m4_rts_us ON m4_review_trend_snapshots(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m4_rts_asin_date ON m4_review_trend_snapshots(user_id, store_id, asin, snapshot_date DESC);

    CREATE TABLE IF NOT EXISTS m4_appeals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      review_id TEXT,
      hijacking_id TEXT,
      sku TEXT,
      asin TEXT,
      author TEXT,
      rating INTEGER,
      body TEXT,
      violation_type TEXT,
      confidence REAL,
      draft_content TEXT,
      drafted_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      amazon_case_id TEXT,
      submitted_at TEXT,
      reviewed_at TEXT,
      amazon_response TEXT,
      retry_count INTEGER DEFAULT 0,
      parent_appeal_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_ap_us ON m4_appeals(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m4_recovery_emails (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      review_id TEXT,
      sku TEXT,
      asin TEXT,
      author TEXT,
      rating INTEGER,
      template_id TEXT,
      subject TEXT,
      body TEXT,
      preview TEXT,
      round_no INTEGER DEFAULT 1,
      parent_email_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      drafted_at TEXT,
      sent_at TEXT,
      replied_at TEXT,
      replied_body TEXT,
      review_updated INTEGER DEFAULT 0,
      old_rating INTEGER,
      new_rating INTEGER,
      channel TEXT DEFAULT 'buyer_seller_messaging',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_re_us ON m4_recovery_emails(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m4_competitor_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      competitor_asin TEXT NOT NULL,
      our_asin TEXT,
      snapshot_at TEXT NOT NULL,
      title TEXT,
      price REAL,
      bsr INTEGER,
      rating REAL,
      review_count INTEGER,
      ad_positions TEXT,
      listing_changes TEXT,
      raw TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m4_cs_us ON m4_competitor_snapshots(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m4_cs_asin_at ON m4_competitor_snapshots(user_id, store_id, competitor_asin, snapshot_at DESC);

    CREATE TABLE IF NOT EXISTS m4_image_diffs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      competitor_asin TEXT NOT NULL,
      image_role TEXT,
      old_image_url TEXT,
      new_image_url TEXT,
      phash_distance INTEGER,
      change_type TEXT,
      ai_analysis TEXT,
      strategy_inferred TEXT,
      impact_on_us TEXT,
      detected_at TEXT NOT NULL,
      pushed_m1_target_id TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_id_us ON m4_image_diffs(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m4_brand_defense_layers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      layer_code TEXT NOT NULL,
      label TEXT,
      detail TEXT,
      status TEXT NOT NULL DEFAULT 'disabled',
      brand_registered INTEGER DEFAULT 0,
      brand_keywords TEXT,
      bound_strategy_ids TEXT,
      bound_campaign_ids TEXT,
      last_counter_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_bd_us ON m4_brand_defense_layers(user_id, store_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_m4_bd_unique ON m4_brand_defense_layers(user_id, store_id, layer_code);

    -- m4_notifications 可能已由 M2 (data-store-profit.mjs) 创建（占位表），
    -- 故仅 IF NOT EXISTS + 之后通过 migrateNotificationsTable 补全缺失列。
    CREATE TABLE IF NOT EXISTS m4_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      severity TEXT,
      source_module TEXT NOT NULL,
      source_event TEXT,
      title TEXT,
      body TEXT,
      link TEXT,
      related_resource_type TEXT,
      related_resource_id TEXT,
      channels TEXT,
      delivery_status TEXT,
      silent_window_skipped INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m4_notif_us ON m4_notifications(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m4_notif_sev ON m4_notifications(user_id, store_id, severity, created_at DESC);
  `);
  // reviews ALTER (idempotent)
  migrateReviewsTable(db);
  // m4_notifications ALTER (M2 placeholder compatibility)
  migrateNotificationsTable(db);
}

export function migrateNotificationsTable(db) {
  let info = [];
  try { info = db.prepare("PRAGMA table_info(m4_notifications)").all(); } catch { return; }
  const cols = new Set(info.map((c) => c.name));
  const need = [
    ['severity', 'TEXT'], ['source_event', 'TEXT'], ['body', 'TEXT'], ['link', 'TEXT'],
    ['related_resource_type', 'TEXT'], ['related_resource_id', 'TEXT'],
    ['channels', 'TEXT'], ['delivery_status', 'TEXT'],
    ['silent_window_skipped', 'INTEGER DEFAULT 0'], ['expires_at', 'TEXT'],
    ['title', 'TEXT'],
    // M2 占位表保留兼容列：
    ['type', 'TEXT'], ['detail', 'TEXT'], ['related_id', 'TEXT'],
    ['acknowledged', 'INTEGER DEFAULT 0'],
  ];
  for (const [c, def] of need) {
    if (!cols.has(c)) {
      try { db.exec(`ALTER TABLE m4_notifications ADD COLUMN ${c} ${def}`); } catch {}
    }
  }
}

export function migrateReviewsTable(db) {
  const info = db.prepare("PRAGMA table_info(reviews)").all();
  const cols = new Set(info.map((c) => c.name));
  const addCols = [
    ['asin', 'TEXT'], ['sku', 'TEXT'], ['reviewer', 'TEXT'],
    ['verified', 'INTEGER DEFAULT 0'], ['sentiment', 'TEXT'],
    ['cluster_id', 'TEXT'], ['appeal_eligible', 'INTEGER DEFAULT 0'],
    ['appeal_id', 'TEXT'], ['recovery_id', 'TEXT'], ['recovery_status', 'TEXT'],
    ['posted_at', 'TEXT'], ['updated_at', 'TEXT'],
  ];
  for (const [col, def] of addCols) {
    if (!cols.has(col)) {
      try { db.exec(`ALTER TABLE reviews ADD COLUMN ${col} ${def}`); }
      catch (e) { /* idempotent skip */ }
    }
  }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_asin ON reviews(user_id, store_id, asin);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_sent ON reviews(user_id, store_id, sentiment);`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_cluster ON reviews(user_id, store_id, cluster_id);`); } catch {}
}

// ============================================================
// JSON helpers
// ============================================================
function tryJSON(text, fallback) {
  try { return JSON.parse(text || ''); } catch { return fallback; }
}
function J(value) { return JSON.stringify(value); }

// ============================================================
// SLA defaults by severity
// ============================================================
const SLA_BY_SEV = { P0: 30, P1: 120, P2: 480 };

// ============================================================
// M4-P1-01: anomaly state machine — shared transition map.
// Exported so the frontend (apps/web-v2/src/composables/useM4State.js) can mirror
// the exact same legal-transition definition and a consistency test can pin them.
// Keys are current statuses; values are the set of allowed next statuses.
// 'resolved' / 'dismissed' / 'closed' are terminal (empty arrays).
// ============================================================
export const ANOMALY_TRANSITIONS = {
  open: ['assigned', 'investigating', 'resolved', 'dismissed', 'escalated'],
  assigned: ['investigating', 'resolved', 'dismissed', 'escalated'],
  investigating: ['resolved', 'dismissed', 'escalated'],
  escalated: ['investigating', 'resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
  closed: [],
};

function anomalyCanTransition(from, to) {
  const allowed = ANOMALY_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// ============================================================
// M4-P0-04 / M4-P0-06: revert coverage.
// Action types that are deliberately NOT auto-revertible (terminal scans / external
// manual submissions whose forward path is the documented undo) are whitelisted so the
// coverage gate passes without forcing a fake inverse. _MANUAL variants are stripped
// before lookup. NOTE: this whitelist must never be used to silence a real-write
// inverse that genuinely should dispatch.
// ============================================================
export const REVERT_NON_REVERTIBLE_WHITELIST = new Set([
  'REVIEW_SYNC',              // bulk read-sync, idempotent re-sync is the undo
  'REVIEW_CLUSTER_RECOMPUTE', // deterministic recompute, re-run is the undo
  'M3_PAUSE_DEDUP_SKIP',      // no-op marker (dedup), nothing to invert
  // M4_BRAND_COUNTER_BID only enqueues an ad_action_queue intent (dryRun=1/needs_review);
  // nothing is written to lx_targetings, so there is no direct write to invert here. The
  // queued intent is cancelled/reverted through the M3 action-queue, not via audit revert.
  'M4_BRAND_COUNTER_BID',
]);

function addMinutes(iso, mins) {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}
function elapsedMinutes(startIso, nowIsoVal) {
  const t = new Date(nowIsoVal || nowIso()).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(t / 60_000));
}

// ============================================================
// Audit helper (M4)
// ============================================================
function auditM4(userId, storeId, actionType, resourceType, resourceId, payload) {
  return appendAuditLog(userId, storeId, {
    sourceModule: 'M4', actionType, resourceType, resourceId, payload: payload || {},
  });
}

// ============================================================
// Notification helper (called both from internal M4 and external M1/M2/M3)
// ============================================================
const NOTIF_DEDUP_WINDOW_MS = 5 * 60_000; // 5 min

export function emitNotification(db, userId, storeId, evt) {
  if (!userId || !storeId) return null;
  const severity = evt.severity || 'P2';
  // dedup: same source_event + related_resource_id within 5min
  if (evt.sourceEvent && evt.relatedResourceId) {
    const cutoff = new Date(Date.now() - NOTIF_DEDUP_WINDOW_MS).toISOString();
    const dup = db.prepare(
      `SELECT id FROM m4_notifications WHERE user_id=? AND store_id=? AND source_event=? AND related_resource_id=? AND created_at>=? LIMIT 1`
    ).get(userId, storeId, evt.sourceEvent, evt.relatedResourceId, cutoff);
    if (dup) return { id: dup.id, deduped: true };
  }
  const id = newId('notif');
  const channels = evt.channels || (
    severity === 'P0' ? ['in_app', 'email', 'wechat']
    : severity === 'P1' ? ['in_app', 'email']
    : ['in_app']
  );
  const deliveryStatus = Object.fromEntries(channels.map((c) => [c, c === 'in_app' ? 'delivered' : 'queued']));
  // type/detail/related_id 兼容 M2 早建的 m4_notifications 表的 NOT NULL 约束
  const compatType = evt.type || evt.sourceEvent || 'M4_EVENT';
  db.prepare(`INSERT INTO m4_notifications(
    id, user_id, store_id, severity, source_module, source_event,
    title, body, link, related_resource_type, related_resource_id,
    channels, delivery_status, silent_window_skipped, created_at, expires_at,
    type, detail, related_id, acknowledged)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, severity,
    evt.sourceModule || 'M4', evt.sourceEvent || null,
    evt.title, evt.body || null, evt.link || null,
    evt.relatedResourceType || null, evt.relatedResourceId || null,
    J(channels), J(deliveryStatus), 0, nowIso(), evt.expiresAt || null,
    compatType, evt.body ? J({ body: evt.body }) : null,
    evt.relatedResourceId || null, 0
  );
  return { id, created: true };
}

// ============================================================
// Row mappers
// ============================================================
function rowAnomaly(r) {
  if (!r) return null;
  return {
    id: r.id, anomalyCode: r.anomaly_code, category: r.category,
    severity: r.severity, status: r.status, sku: r.sku, asin: r.asin,
    title: r.title, evidence: tryJSON(r.evidence, []),
    recommendedAction: r.recommended_action, aiRootCause: r.ai_root_cause,
    expectedImpact: tryJSON(r.expected_impact, null),
    assigneeUserId: r.assignee_user_id, assigneeLabel: r.assignee_label,
    detectedAt: r.detected_at, acknowledgedAt: r.acknowledged_at,
    resolvedAt: r.resolved_at, slaMinutes: r.sla_minutes,
    slaDeadline: r.sla_deadline, slaBreached: !!r.sla_breached,
    resolutionCaseId: r.resolution_case_id, postmortemId: r.postmortem_id,
    sourceModule: r.source_module, createdAt: r.created_at,
  };
}
function rowCase(r) {
  if (!r) return null;
  return {
    id: r.id, anomalyId: r.anomaly_id, anomalyCode: r.anomaly_code,
    scenario: r.scenario, actionPlan: r.action_plan, outcome: r.outcome,
    outcomeScore: r.outcome_score, status: r.status,
    reusable: !!r.reusable, referenceCount: r.reference_count,
    tags: tryJSON(r.tags, []), durationMinutes: r.duration_minutes,
    createdAt: r.created_at, resolvedAt: r.resolved_at, updatedAt: r.updated_at,
  };
}
function rowPostmortem(r) {
  if (!r) return null;
  return {
    id: r.id, title: r.title, eventDate: r.event_date,
    anomalyIds: tryJSON(r.anomaly_ids, []),
    resolutionCaseIds: tryJSON(r.resolution_case_ids, []),
    lossEstimate: r.loss_estimate, rootCause: r.root_cause,
    resolution: r.resolution, verdict: r.verdict,
    improvements: tryJSON(r.improvements, []),
    timeline: tryJSON(r.timeline, []),
    generatedBy: r.generated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowHijack(r) {
  if (!r) return null;
  return {
    id: r.id, asin: r.asin, sku: r.sku, hijackerSeller: r.hijacker_seller,
    hijackerPrice: r.hijacker_price, ourPrice: r.our_price,
    detectedAt: r.detected_at, durationMin: r.duration_min,
    type: r.type, status: r.status, testBuyOrderId: r.test_buy_order_id,
    testBuyReceivedAt: r.test_buy_received_at,
    proofImages: tryJSON(r.proof_images, []),
    appealId: r.appeal_id, appealCaseId: r.appeal_case_id,
    estimatedLossPerHour: r.estimated_loss_per_hour,
    m3AdsPaused: !!r.m3_ads_paused,
    m3PauseDedupKey: r.m3_pause_dedup_key,
    m3PausedCampaignIds: tryJSON(r.m3_paused_campaign_ids, []),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowInfringement(r) {
  if (!r) return null;
  return {
    id: r.id, asin: r.asin, type: r.type, source: r.source,
    reportedBy: r.reported_by, description: r.description,
    severity: r.severity, status: r.status,
    draftContent: r.draft_content, amazonComplaintId: r.amazon_complaint_id,
    detectedAt: r.detected_at, submittedAt: r.submitted_at,
    resolvedAt: r.resolved_at, legalDisclaimerAck: !!r.legal_disclaimer_ack,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowCluster(r) {
  if (!r) return null;
  return {
    id: r.id, asin: r.asin, sku: r.sku, name: r.name, sentiment: r.sentiment,
    rootCause: r.root_cause, count: r.count, percent: r.percent,
    samples: tryJSON(r.samples, []), improvements: tryJSON(r.improvements, []),
    estimatedRatingLift: r.estimated_rating_lift, confidence: r.confidence,
    status: r.status,
    pushedM1TargetIds: tryJSON(r.pushed_m1_target_ids, []),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowReview(r) {
  if (!r) return null;
  return {
    id: r.id, productId: r.product_id, asin: r.asin, sku: r.sku,
    reviewer: r.reviewer, rating: r.rating, title: r.title, body: r.body,
    verified: !!r.verified, sentiment: r.sentiment, clusterId: r.cluster_id,
    appealEligible: !!r.appeal_eligible, appealId: r.appeal_id,
    recoveryId: r.recovery_id, recoveryStatus: r.recovery_status,
    postedAt: r.posted_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowAppeal(r) {
  if (!r) return null;
  return {
    id: r.id, reviewId: r.review_id, hijackingId: r.hijacking_id,
    sku: r.sku, asin: r.asin, author: r.author, rating: r.rating, body: r.body,
    violationType: r.violation_type, confidence: r.confidence,
    draftContent: r.draft_content, draftedAt: r.drafted_at,
    status: r.status, amazonCaseId: r.amazon_case_id,
    submittedAt: r.submitted_at, reviewedAt: r.reviewed_at,
    amazonResponse: r.amazon_response, retryCount: r.retry_count,
    parentAppealId: r.parent_appeal_id, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowRecovery(r) {
  if (!r) return null;
  return {
    id: r.id, reviewId: r.review_id, sku: r.sku, asin: r.asin,
    author: r.author, rating: r.rating, templateId: r.template_id,
    subject: r.subject, body: r.body, preview: r.preview,
    roundNo: r.round_no, parentEmailId: r.parent_email_id,
    status: r.status, draftedAt: r.drafted_at, sentAt: r.sent_at,
    repliedAt: r.replied_at, repliedBody: r.replied_body,
    reviewUpdated: !!r.review_updated,
    oldRating: r.old_rating, newRating: r.new_rating,
    channel: r.channel, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowCompetitorSnap(r) {
  if (!r) return null;
  return {
    id: r.id, competitorAsin: r.competitor_asin, ourAsin: r.our_asin,
    snapshotAt: r.snapshot_at, title: r.title, price: r.price, bsr: r.bsr,
    rating: r.rating, reviewCount: r.review_count,
    adPositions: tryJSON(r.ad_positions, []),
    listingChanges: tryJSON(r.listing_changes, []),
    createdAt: r.created_at,
  };
}
function rowImageDiff(r) {
  if (!r) return null;
  return {
    id: r.id, competitorAsin: r.competitor_asin, imageRole: r.image_role,
    oldImageUrl: r.old_image_url, newImageUrl: r.new_image_url,
    phashDistance: r.phash_distance, changeType: r.change_type,
    aiAnalysis: r.ai_analysis, strategyInferred: r.strategy_inferred,
    impactOnUs: r.impact_on_us, detectedAt: r.detected_at,
    pushedM1TargetId: r.pushed_m1_target_id, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowBrandLayer(r) {
  if (!r) return null;
  return {
    id: r.id, layerCode: r.layer_code, label: r.label, detail: r.detail,
    status: r.status, brandRegistered: !!r.brand_registered,
    brandKeywords: tryJSON(r.brand_keywords, []),
    boundStrategyIds: tryJSON(r.bound_strategy_ids, []),
    boundCampaignIds: tryJSON(r.bound_campaign_ids, []),
    lastCounterAt: r.last_counter_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowNotification(r, readMap) {
  if (!r) return null;
  return {
    id: r.id, severity: r.severity, sourceModule: r.source_module,
    sourceEvent: r.source_event, title: r.title, body: r.body,
    link: r.link, relatedResourceType: r.related_resource_type,
    relatedResourceId: r.related_resource_id,
    channels: tryJSON(r.channels, []),
    deliveryStatus: tryJSON(r.delivery_status, {}),
    silentWindowSkipped: r.silent_window_skipped,
    createdAt: r.created_at, expiresAt: r.expires_at,
    readAt: readMap ? readMap[r.id] || null : null,
  };
}

// ============================================================
// Anomalies CRUD
// ============================================================
export function listAnomalies(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_anomalies WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.severity) { sql += ' AND severity=?'; p.push(filters.severity); }
  if (filters.status) { sql += ' AND status=?'; p.push(filters.status); }
  if (filters.assignee) { sql += ' AND assignee_user_id=?'; p.push(filters.assignee); }
  if (filters.sku) { sql += ' AND sku=?'; p.push(filters.sku); }
  if (filters.asin) { sql += ' AND asin=?'; p.push(filters.asin); }
  if (filters.q) { sql += ' AND (title LIKE ? OR anomaly_code LIKE ?)'; p.push('%' + filters.q + '%', '%' + filters.q + '%'); }
  sql += ' ORDER BY detected_at DESC LIMIT 500';
  return db.prepare(sql).all(...p).map(rowAnomaly);
}
export function anomalySummary(db, userId, storeId) {
  const all = db.prepare(`SELECT severity, status, sla_breached FROM m4_anomalies WHERE user_id=? AND store_id=?`).all(userId, storeId);
  let p0 = 0, p1 = 0, p2 = 0, totalOpen = 0, breached = 0;
  for (const r of all) {
    if (r.status !== 'resolved' && r.status !== 'dismissed') totalOpen++;
    if (r.severity === 'P0') p0++;
    if (r.severity === 'P1') p1++;
    if (r.severity === 'P2') p2++;
    if (r.sla_breached) breached++;
  }
  return { totalOpen, p0, p1, p2, breached };
}
export function getAnomaly(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!r) return null;
  const main = rowAnomaly(r);
  const slaEvents = db.prepare('SELECT * FROM m4_sla_events WHERE user_id=? AND store_id=? AND anomaly_id=? ORDER BY created_at').all(userId, storeId, id);
  main.slaEvents = slaEvents.map((e) => ({
    id: e.id, eventType: e.event_type, operatorLabel: e.operator_label,
    elapsedMinutes: e.elapsed_minutes, detail: tryJSON(e.detail, null), createdAt: e.created_at,
  }));
  if (main.resolutionCaseId) {
    const c = db.prepare('SELECT * FROM m4_resolution_cases WHERE id=? AND user_id=? AND store_id=?').get(main.resolutionCaseId, userId, storeId);
    main.linkedCase = rowCase(c);
  }
  if (main.postmortemId) {
    const p = db.prepare('SELECT * FROM m4_postmortems WHERE id=? AND user_id=? AND store_id=?').get(main.postmortemId, userId, storeId);
    main.linkedPostmortem = rowPostmortem(p);
  }
  return main;
}
function insertSlaEvent(db, userId, storeId, anomalyId, eventType, detail, operatorLabel) {
  const a = db.prepare('SELECT detected_at FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(anomalyId, userId, storeId);
  const id = newId('sla');
  const elapsed = a ? elapsedMinutes(a.detected_at) : 0;
  db.prepare(`INSERT INTO m4_sla_events(id, user_id, store_id, anomaly_id, event_type, operator_user_id, operator_label, elapsed_minutes, detail, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, anomalyId, eventType, userId, operatorLabel || null, elapsed, detail ? J(detail) : null, nowIso()
  );
  return id;
}

export function createAnomaly(db, userId, storeId, body) {
  if (!body || !body.anomalyCode || !body.category || !body.severity || !body.title) {
    return { error: 'validation_failed', message: 'anomalyCode/category/severity/title required' };
  }
  if (!['P0', 'P1', 'P2'].includes(body.severity)) return { error: 'validation_failed', message: 'invalid severity' };
  const id = body.id || newId('anom');
  const now = nowIso();
  const slaMin = body.slaMinutes || SLA_BY_SEV[body.severity] || 120;
  const slaDeadline = addMinutes(now, slaMin);
  db.prepare(`INSERT INTO m4_anomalies(
    id, user_id, store_id, anomaly_code, category, severity, status,
    sku, asin, title, evidence, recommended_action, ai_root_cause, expected_impact,
    detected_at, sla_minutes, sla_deadline, source_module, skip_anomaly_emit, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.anomalyCode, body.category, body.severity, 'open',
    body.sku || null, body.asin || null, body.title,
    J(body.evidence || []), body.recommendedAction || null,
    body.aiRootCause || null, J(body.expectedImpact || null),
    now, slaMin, slaDeadline, body.sourceModule || 'M4',
    body.skipAnomalyEmit ? 1 : 0, now
  );
  insertSlaEvent(db, userId, storeId, id, 'detected', { severity: body.severity });
  auditM4(userId, storeId, 'ANOMALY_CREATE', 'anomaly', id, { severity: body.severity, anomalyCode: body.anomalyCode });
  emitNotification(db, userId, storeId, {
    severity: body.severity, sourceModule: body.sourceModule || 'M4A',
    sourceEvent: 'ANOMALY_CREATE', title: body.title,
    body: body.recommendedAction || null,
    link: `/monitor/anomalies?anomalyId=${id}`,
    relatedResourceType: 'anomaly', relatedResourceId: id,
  });
  return rowAnomaly(db.prepare('SELECT * FROM m4_anomalies WHERE id=?').get(id));
}

export function assignAnomaly(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (!body.assigneeLabel) return { error: 'validation_failed', message: 'assigneeLabel required' };
  const prev = { assigneeUserId: cur.assignee_user_id, assigneeLabel: cur.assignee_label, status: cur.status };
  db.prepare(`UPDATE m4_anomalies SET assignee_user_id=?, assignee_label=?, status=CASE WHEN status='open' THEN 'assigned' ELSE status END, updated_at=? WHERE id=?`).run(
    body.assigneeUserId || null, body.assigneeLabel, nowIso(), id
  );
  insertSlaEvent(db, userId, storeId, id, 'assigned', { to: body.assigneeLabel }, body.assigneeLabel);
  auditM4(userId, storeId, 'ANOMALY_ASSIGN', 'anomaly', id, { previousValues: prev, assigneeLabel: body.assigneeLabel });
  return rowAnomaly(db.prepare('SELECT * FROM m4_anomalies WHERE id=?').get(id));
}

export function acknowledgeAnomaly(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  // M4-P1-01: acknowledging means moving into investigation. Only legal from a live
  // (non-terminal) status — terminal/closed must be a forbidden error, not a silent no-op.
  if (!anomalyCanTransition(cur.status, 'investigating')) {
    return { error: 'state_transition_forbidden', message: `cannot acknowledge from status=${cur.status}` };
  }
  const newStatus = 'investigating';
  db.prepare(`UPDATE m4_anomalies SET acknowledged_at=?, status=?, updated_at=? WHERE id=?`).run(nowIso(), newStatus, nowIso(), id);
  insertSlaEvent(db, userId, storeId, id, 'acknowledged');
  auditM4(userId, storeId, 'ANOMALY_ACK', 'anomaly', id, {});
  return rowAnomaly(db.prepare('SELECT * FROM m4_anomalies WHERE id=?').get(id));
}

export function resolveAnomaly(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  // M4-P1-01: from-guard — cannot resolve a terminal/closed anomaly.
  if (!anomalyCanTransition(cur.status, 'resolved')) {
    return { error: 'state_transition_forbidden', message: `cannot resolve from status=${cur.status}` };
  }
  const prev = { status: cur.status, resolutionCaseId: cur.resolution_case_id, resolvedAt: cur.resolved_at };
  db.prepare(`UPDATE m4_anomalies SET status='resolved', resolved_at=?, resolution_case_id=?, updated_at=? WHERE id=?`).run(
    nowIso(), body.resolutionCaseId || cur.resolution_case_id || null, nowIso(), id
  );
  insertSlaEvent(db, userId, storeId, id, 'resolved', { note: body.note || null });
  if (body.resolutionCaseId) {
    db.prepare(`UPDATE m4_resolution_cases SET status='successful', resolved_at=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(
      nowIso(), nowIso(), body.resolutionCaseId, userId, storeId
    );
  }
  auditM4(userId, storeId, 'ANOMALY_RESOLVE', 'anomaly', id, { previousValues: prev, resolutionCaseId: body.resolutionCaseId });
  return rowAnomaly(db.prepare('SELECT * FROM m4_anomalies WHERE id=?').get(id));
}

export function dismissAnomaly(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  // M4-P1-01: from-guard — cannot dismiss a terminal/closed anomaly.
  if (!anomalyCanTransition(cur.status, 'dismissed')) {
    return { error: 'state_transition_forbidden', message: `cannot dismiss from status=${cur.status}` };
  }
  const prev = { status: cur.status };
  db.prepare(`UPDATE m4_anomalies SET status='dismissed', updated_at=? WHERE id=?`).run(nowIso(), id);
  insertSlaEvent(db, userId, storeId, id, 'dismissed', { reason: body.reason || null });
  auditM4(userId, storeId, 'ANOMALY_DISMISS', 'anomaly', id, { previousValues: prev, reason: body.reason });
  return rowAnomaly(db.prepare('SELECT * FROM m4_anomalies WHERE id=?').get(id));
}

export function escalateAnomaly(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  // M4-P1-01: from-guard — cannot escalate a terminal/closed anomaly (blocks the
  // resolved↔escalated SLA-event loop).
  if (!anomalyCanTransition(cur.status, 'escalated')) {
    return { error: 'state_transition_forbidden', message: `cannot escalate from status=${cur.status}` };
  }
  const prev = { status: cur.status };
  db.prepare(`UPDATE m4_anomalies SET status='escalated', sla_breached=1, updated_at=? WHERE id=?`).run(nowIso(), id);
  insertSlaEvent(db, userId, storeId, id, 'escalated', { reason: body.reason, escalateTo: body.escalateTo });
  emitNotification(db, userId, storeId, {
    severity: 'P0', sourceModule: 'M4A', sourceEvent: 'ANOMALY_ESCALATE',
    title: `异常升级: ${cur.title}`, body: body.reason || null,
    link: `/monitor/anomalies?anomalyId=${id}`,
    relatedResourceType: 'anomaly', relatedResourceId: id,
  });
  auditM4(userId, storeId, 'ANOMALY_ESCALATE', 'anomaly', id, { previousValues: prev, reason: body.reason });
  return rowAnomaly(db.prepare('SELECT * FROM m4_anomalies WHERE id=?').get(id));
}

// ============================================================
// SLA Board / Events
// ============================================================
// M4-P1-02: a breach is DERIVED, not just the stored sla_breached flag (which only the
// escalate path sets). An anomaly is breached if its SLA deadline has passed while it is
// still live (not resolved/dismissed/closed), OR it carries a recorded breach flag.
function isAnomalyBreached(a, nowMs = Date.now()) {
  if (a.sla_breached) return true;
  const terminal = a.status === 'resolved' || a.status === 'dismissed' || a.status === 'closed';
  if (terminal) {
    // Late resolution still counts as a breach if it crossed the deadline.
    if (a.resolved_at && a.sla_deadline) {
      return new Date(a.resolved_at).getTime() > new Date(a.sla_deadline).getTime();
    }
    return false;
  }
  if (a.sla_deadline) return nowMs > new Date(a.sla_deadline).getTime();
  return false;
}

export function slaBoard(db, userId, storeId, range = '7d') {
  const days = range === 'today' ? 1 : range === '30d' ? 30 : 7;
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const anomalies = db.prepare('SELECT * FROM m4_anomalies WHERE user_id=? AND store_id=? AND detected_at>=?').all(userId, storeId, cutoff);
  const slaEvents = db.prepare('SELECT * FROM m4_sla_events WHERE user_id=? AND store_id=? AND created_at>=?').all(userId, storeId, cutoff);
  const nowMs = Date.now();
  const p0Items = anomalies.filter((a) => a.severity === 'P0');
  const p1Items = anomalies.filter((a) => a.severity === 'P1');
  const computeAvg = (items) => {
    const arr = items.filter((a) => a.acknowledged_at);
    if (!arr.length) return 0;
    let sum = 0;
    for (const a of arr) sum += elapsedMinutes(a.detected_at, a.acknowledged_at);
    return Math.round(sum / arr.length);
  };
  const slaRate = (items) => {
    if (!items.length) return 1;
    const ok = items.filter((a) => !isAnomalyBreached(a, nowMs)).length;
    return Math.round((ok / items.length) * 100) / 100;
  };
  // M4-P2-03: canonical block is rangeStats; todayStats kept as a back-compat alias.
  const rangeStats = {
    p0Total: p0Items.length, p0Avg: computeAvg(p0Items), p0Sla: slaRate(p0Items),
    p1Total: p1Items.length, p1Avg: computeAvg(p1Items), p1Sla: slaRate(p1Items),
    escalations: slaEvents.filter((e) => e.event_type === 'escalated').length,
  };
  // team
  const byUser = new Map();
  for (const a of anomalies) {
    if (!a.assignee_user_id && !a.assignee_label) continue;
    const k = a.assignee_label || a.assignee_user_id || 'unassigned';
    if (!byUser.has(k)) byUser.set(k, { user: k, anomaliesAssigned: 0, withinSla: 0, escalated: 0, ackSum: 0, ackN: 0 });
    const entry = byUser.get(k);
    entry.anomaliesAssigned++;
    if (!isAnomalyBreached(a, nowMs)) entry.withinSla++;
    if (a.status === 'escalated') entry.escalated++;
    if (a.acknowledged_at) { entry.ackSum += elapsedMinutes(a.detected_at, a.acknowledged_at); entry.ackN++; }
  }
  const team = [...byUser.values()].map((e) => ({
    user: e.user, anomaliesAssigned: e.anomaliesAssigned,
    avgResponseMin: e.ackN ? Math.round(e.ackSum / e.ackN) : 0,
    withinSla: e.withinSla, escalated: e.escalated,
    slaRate: e.anomaliesAssigned ? Math.round((e.withinSla / e.anomaliesAssigned) * 100) / 100 : 1,
  }));
  return { range, rangeStats, todayStats: rangeStats, team };
}

export function listSlaEvents(db, userId, storeId, anomalyId) {
  let sql = 'SELECT * FROM m4_sla_events WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (anomalyId) { sql += ' AND anomaly_id=?'; p.push(anomalyId); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  return db.prepare(sql).all(...p).map((e) => ({
    id: e.id, anomalyId: e.anomaly_id, eventType: e.event_type,
    operatorLabel: e.operator_label, elapsedMinutes: e.elapsed_minutes,
    detail: tryJSON(e.detail, null), createdAt: e.created_at,
  }));
}

// ============================================================
// Resolution Cases
// ============================================================
export function listCases(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_resolution_cases WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; p.push(filters.status); }
  if (filters.reusable === '1' || filters.reusable === 'true' || filters.reusable === true) {
    sql += ' AND reusable=1';
  }
  if (filters.q) { sql += ' AND (scenario LIKE ? OR action_plan LIKE ?)'; p.push('%' + filters.q + '%', '%' + filters.q + '%'); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  return db.prepare(sql).all(...p).map(rowCase);
}
export function getCase(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m4_resolution_cases WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  return rowCase(r);
}
export function createCase(db, userId, storeId, body) {
  if (!body.scenario || !body.actionPlan) return { error: 'validation_failed', message: 'scenario/actionPlan required' };
  const id = body.id || newId('rc');
  const now = nowIso();
  let anomalyCode = body.anomalyCode || null;
  if (body.anomalyId) {
    const a = db.prepare('SELECT anomaly_code FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(body.anomalyId, userId, storeId);
    if (a) anomalyCode = a.anomaly_code;
  }
  db.prepare(`INSERT INTO m4_resolution_cases(
    id, user_id, store_id, anomaly_id, anomaly_code, scenario, action_plan,
    outcome, outcome_score, status, reusable, reference_count, tags,
    duration_minutes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.anomalyId || null, anomalyCode,
    body.scenario, body.actionPlan, body.outcome || null,
    body.outcomeScore ?? null, body.status || 'in_progress',
    body.reusable ? 1 : 0, 0, J(body.tags || []), body.durationMinutes || null, now
  );
  auditM4(userId, storeId, 'CASE_CREATE', 'case', id, { anomalyId: body.anomalyId });
  return getCase(db, userId, storeId, id);
}
export function updateCase(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM m4_resolution_cases WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const before = rowCase(cur);
  const fields = [], p = [];
  const map = { status: 'status', outcome: 'outcome', outcomeScore: 'outcome_score', scenario: 'scenario', actionPlan: 'action_plan', durationMinutes: 'duration_minutes' };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) { fields.push(`${col}=?`); p.push(patch[k]); }
  }
  if (patch.reusable !== undefined) { fields.push('reusable=?'); p.push(patch.reusable ? 1 : 0); }
  if (patch.tags !== undefined) { fields.push('tags=?'); p.push(J(patch.tags)); }
  fields.push('updated_at=?'); p.push(nowIso());
  if (patch.status === 'successful' || patch.status === 'partial' || patch.status === 'failed') {
    fields.push('resolved_at=?'); p.push(nowIso());
  }
  p.push(id, userId, storeId);
  db.prepare(`UPDATE m4_resolution_cases SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...p);
  auditM4(userId, storeId, 'CASE_UPDATE', 'case', id, { before, patch });
  return getCase(db, userId, storeId, id);
}
export function recommendCases(db, userId, storeId, anomalyId) {
  if (!anomalyId) return [];
  const a = db.prepare('SELECT anomaly_code FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(anomalyId, userId, storeId);
  if (!a) return [];
  // Match by anomaly_code first, then by reusable+similar tag
  const direct = db.prepare(`SELECT * FROM m4_resolution_cases WHERE user_id=? AND store_id=? AND anomaly_code=? AND reusable=1 ORDER BY reference_count DESC LIMIT 5`).all(userId, storeId, a.anomaly_code).map(rowCase);
  // increment reference_count for matched direct hits FIRST (must run regardless of early return below)
  for (const c of direct) {
    db.prepare('UPDATE m4_resolution_cases SET reference_count=reference_count+1 WHERE id=?').run(c.id);
  }
  if (direct.length >= 5) return direct;
  const fill = db.prepare(`SELECT * FROM m4_resolution_cases WHERE user_id=? AND store_id=? AND reusable=1 AND anomaly_code<>? ORDER BY reference_count DESC LIMIT ?`).all(userId, storeId, a.anomaly_code, 5 - direct.length).map(rowCase);
  return direct.concat(fill);
}

// ============================================================
// Postmortems
// ============================================================
export function listPostmortems(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_postmortems WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.verdict) { sql += ' AND verdict=?'; p.push(filters.verdict); }
  sql += ' ORDER BY event_date DESC LIMIT 200';
  return db.prepare(sql).all(...p).map(rowPostmortem);
}
export function getPostmortem(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m4_postmortems WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  return rowPostmortem(r);
}
export function generatePostmortem(db, userId, storeId, body) {
  if (!body.anomalyIds || !Array.isArray(body.anomalyIds) || body.anomalyIds.length === 0) {
    return { error: 'validation_failed', message: 'anomalyIds[] required' };
  }
  const id = body.id || newId('pm');
  const now = nowIso();
  // gather anomalies + linked cases
  const anomalies = body.anomalyIds.map((aid) =>
    db.prepare('SELECT * FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').get(aid, userId, storeId)
  ).filter(Boolean);
  const caseIds = anomalies.map((a) => a.resolution_case_id).filter(Boolean);
  const lossSum = anomalies.reduce((s, a) => {
    const imp = tryJSON(a.expected_impact, {}) || {};
    return s + (Number(imp.lossEstimate || 0) || 0);
  }, 0);
  const timeline = anomalies.flatMap((a) => ([
    { at: a.detected_at, event: 'detected', note: a.title },
    a.acknowledged_at ? { at: a.acknowledged_at, event: 'acknowledged', note: a.assignee_label || '' } : null,
    a.resolved_at ? { at: a.resolved_at, event: 'resolved', note: '' } : null,
  ])).filter(Boolean).sort((x, y) => (x.at < y.at ? -1 : 1));
  const improvements = body.improvements || [
    '强化监控阈值',
    '增加自动化恢复脚本',
    `沉淀 ${anomalies.length} 个异常根因到案例库`,
  ];
  const verdict = body.verdict || (anomalies.every((a) => a.resolved_at) ? 'successful' : 'partial');
  db.prepare(`INSERT INTO m4_postmortems(
    id, user_id, store_id, title, event_date, anomaly_ids, resolution_case_ids,
    loss_estimate, root_cause, resolution, verdict, improvements, timeline,
    generated_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.title || `复盘报告 · ${now.slice(0, 10)}`, body.eventDate || now.slice(0, 10),
    J(body.anomalyIds), J(caseIds),
    lossSum || body.lossEstimate || 0, body.rootCause || (anomalies[0]?.ai_root_cause) || null,
    body.resolution || null, verdict, J(improvements), J(timeline),
    body.generatedBy || 'auto', now
  );
  // link postmortem back to anomalies
  for (const aid of body.anomalyIds) {
    db.prepare('UPDATE m4_anomalies SET postmortem_id=? WHERE id=? AND user_id=? AND store_id=?').run(id, aid, userId, storeId);
  }
  auditM4(userId, storeId, 'POSTMORTEM_GENERATE', 'postmortem', id, { anomalyIds: body.anomalyIds });
  return getPostmortem(db, userId, storeId, id);
}
export function updatePostmortem(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM m4_postmortems WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const before = rowPostmortem(cur);
  const fields = [], p = [];
  if (patch.verdict !== undefined) { fields.push('verdict=?'); p.push(patch.verdict); }
  if (patch.improvements !== undefined) { fields.push('improvements=?'); p.push(J(patch.improvements)); }
  if (patch.rootCause !== undefined) { fields.push('root_cause=?'); p.push(patch.rootCause); }
  if (patch.resolution !== undefined) { fields.push('resolution=?'); p.push(patch.resolution); }
  if (patch.title !== undefined) { fields.push('title=?'); p.push(patch.title); }
  fields.push('updated_at=?'); p.push(nowIso());
  p.push(id, userId, storeId);
  db.prepare(`UPDATE m4_postmortems SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...p);
  auditM4(userId, storeId, 'POSTMORTEM_UPDATE', 'postmortem', id, { before, patch });
  return getPostmortem(db, userId, storeId, id);
}

// ============================================================
// Hijacking + M3 cross-module linkage
// ============================================================
export function listHijacking(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_hijacking WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; p.push(filters.status); }
  if (filters.type) { sql += ' AND type=?'; p.push(filters.type); }
  sql += ' ORDER BY detected_at DESC LIMIT 200';
  return db.prepare(sql).all(...p).map(rowHijack);
}
export function getHijacking(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m4_hijacking WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  return rowHijack(r);
}
export function scanHijacking(db, userId, storeId, body = {}) {
  const seed = hashStr(userId + '::' + storeId + '::hjscan::' + Date.now().toString(36));
  const rng = mulberry32(seed);
  const now = nowIso();
  const newCount = 1 + Math.floor(rng() * 2); // 1-2 new rows
  const created = [];
  const asinPool = (body.asins && body.asins.length ? body.asins : ['B0CASE001', 'B0CABLE002', 'B0SCAN001']);
  for (let i = 0; i < newCount; i++) {
    const asin = asinPool[Math.floor(rng() * asinPool.length)];
    const id = newId('hj');
    const ourPrice = 19.99 + Math.round(rng() * 1000) / 100;
    const hijackerPrice = Math.max(5.99, ourPrice - 3 - rng() * 5);
    db.prepare(`INSERT INTO m4_hijacking(
      id, user_id, store_id, asin, sku, hijacker_seller, hijacker_price, our_price,
      detected_at, duration_min, type, status, estimated_loss_per_hour, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, asin, null, 'HijackerSeller-' + (Math.floor(rng() * 999)),
      Math.round(hijackerPrice * 100) / 100, Math.round(ourPrice * 100) / 100,
      now, 0, 'price_competition', 'pending_test_buy',
      Math.round(rng() * 50 * 100) / 100, now
    );
    created.push(id);
  }
  auditM4(userId, storeId, 'HIJACK_SCAN', 'hijacking', 'scan-' + Date.now(), { createdIds: created });
  emitNotification(db, userId, storeId, {
    severity: created.length ? 'P1' : 'P2', sourceModule: 'M4A',
    sourceEvent: 'HIJACK_SCAN', title: `跟卖扫描完成 (+${created.length})`,
    relatedResourceType: 'hijacking_scan', relatedResourceId: 'scan-' + Date.now(),
  });
  return { created, items: created.map((id) => getHijacking(db, userId, storeId, id)) };
}
export function startTestBuy(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m4_hijacking WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'pending_test_buy') return { error: 'state_transition_forbidden', message: `cannot start test-buy from status=${cur.status}` };
  const orderId = 'TB-' + randomBytes(4).toString('hex').toUpperCase();
  db.prepare(`UPDATE m4_hijacking SET status='test_buy_in_transit', test_buy_order_id=?, updated_at=? WHERE id=?`).run(orderId, nowIso(), id);
  auditM4(userId, storeId, 'HIJACK_START_TESTBUY', 'hijacking', id, { orderId });
  return getHijacking(db, userId, storeId, id);
}

/**
 * Confirm counterfeit. Triggers M3 ads pause + creates appeal draft + emits notification.
 * 24h dedup on m3_pause_dedup_key='hj-'+asin+'-'+yyyymmdd
 */
export function uploadHijackingProof(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_hijacking WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (!body.type || !['counterfeit_confirmed', 'genuine_authorized'].includes(body.type)) {
    return { error: 'validation_failed', message: 'type must be counterfeit_confirmed or genuine_authorized' };
  }
  const proofImages = body.proofImages || [];

  const tx = db.transaction(() => {
    const newStatus = body.type === 'counterfeit_confirmed' ? 'test_buy_received' : 'genuine';
    const newType = body.type;
    db.prepare(`UPDATE m4_hijacking SET status=?, type=?, test_buy_received_at=?, proof_images=?, updated_at=? WHERE id=?`).run(
      newStatus, newType, nowIso(), J(proofImages), nowIso(), id
    );

    if (body.type === 'counterfeit_confirmed') {
      // 24h dedup
      const dedupKey = 'hj-' + cur.asin + '-' + nowIso().slice(0, 10);
      const dedup = db.prepare(`SELECT id FROM m4_hijacking WHERE user_id=? AND store_id=? AND m3_pause_dedup_key=? AND id<>?`).get(userId, storeId, dedupKey, id);
      if (dedup) {
        auditM4(userId, storeId, 'M3_PAUSE_DEDUP_SKIP', 'campaign_set', cur.asin, { dedupKey, hijackingId: id });
      } else {
        // call M3 pauseAdsForAsin
        const pauseResult = pauseAdsForAsin(db, userId, storeId, cur.asin, { sourceModule: 'M4', sourceEvent: 'HIJACK_CONFIRM_COUNTERFEIT', hijackingId: id });
        db.prepare(`UPDATE m4_hijacking SET m3_ads_paused=1, m3_pause_dedup_key=?, m3_paused_campaign_ids=? WHERE id=?`).run(
          dedupKey, J(pauseResult.pausedCampaignIds || []), id
        );
        auditM4(userId, storeId, 'M3_PAUSE_ADS_FROM_M4', 'campaign_set', cur.asin, {
          dedupKey, pausedCampaignIds: pauseResult.pausedCampaignIds, hijackingId: id,
        });
      }
      // auto draft appeal
      const appealId = newId('ap');
      db.prepare(`INSERT INTO m4_appeals(
        id, user_id, store_id, review_id, hijacking_id, asin,
        violation_type, draft_content, drafted_at, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        appealId, userId, storeId, null, id, cur.asin,
        'hijacking_counterfeit',
        `跟卖侵权申诉草稿\nASIN: ${cur.asin}\n跟卖方: ${cur.hijacker_seller}\nTest Buy 订单: ${cur.test_buy_order_id || ''}\n证据图: ${proofImages.length} 张\n请求移除跟卖并退还损失。`,
        nowIso(), 'draft', nowIso()
      );
      db.prepare(`UPDATE m4_hijacking SET appeal_id=? WHERE id=?`).run(appealId, id);
      auditM4(userId, storeId, 'HIJACK_CONFIRM_COUNTERFEIT', 'hijacking', id, { appealId });
      emitNotification(db, userId, storeId, {
        severity: 'P0', sourceModule: 'M4A', sourceEvent: 'HIJACK_CONFIRM_COUNTERFEIT',
        title: '跟卖确认假货 → 已暂停 24h 广告', body: `ASIN ${cur.asin}`,
        link: `/monitor/hijacking?id=${id}`,
        relatedResourceType: 'hijacking', relatedResourceId: id,
      });
    } else {
      auditM4(userId, storeId, 'HIJACK_CONFIRM_GENUINE', 'hijacking', id, {});
    }
  });
  tx();
  return getHijacking(db, userId, storeId, id);
}

// M4-P0-01: transactional submission. The server self-fetches the draft appeal id that
// was created on counterfeit-confirm (never trusts a client-supplied appeal_id), enforces
// the four manual-evidence fields, and only flips both rows inside one transaction. Any
// step throwing rolls back both the hijacking and the appeal — no cross-table dirty write.
const HIJACK_APPEAL_MANUAL_FIELDS = ['amazonCaseId', 'submittedBy', 'manualSubmittedAt', 'evidenceAttachment'];

export function submitHijackingAppeal(db, userId, storeId, id, body = {}) {
  const cur = db.prepare('SELECT * FROM m4_hijacking WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  // No draft appeal → nothing to submit; do not touch any status.
  if (!cur.appeal_id) {
    return { error: 'validation_failed', message: 'no draft appeal' };
  }
  // Enforce manual-evidence: missing any of the four fields → validation_failed.missing,
  // no dirty write to hijacking or appeal.
  const missing = HIJACK_APPEAL_MANUAL_FIELDS.filter((k) => !body[k]);
  if (missing.length) {
    return { error: 'validation_failed', message: 'manual-evidence required', missing };
  }
  const manualEvidence = {
    amazonCaseId: body.amazonCaseId, submittedBy: body.submittedBy,
    manualSubmittedAt: body.manualSubmittedAt, evidenceAttachment: body.evidenceAttachment,
  };
  const tx = db.transaction(() => {
    // Submit the appeal first; if it cannot transition, abort the whole tx (throws).
    const appealResult = submitAppeal(db, userId, storeId, cur.appeal_id, manualEvidence);
    if (!appealResult || appealResult.error) {
      throw Object.assign(new Error('appeal submit failed'), { _appealError: appealResult });
    }
    db.prepare(`UPDATE m4_hijacking SET status='appeal_submitted', updated_at=? WHERE id=?`).run(nowIso(), id);
    auditM4(userId, storeId, 'HIJACK_SUBMIT_APPEAL', 'hijacking', id, { appealId: cur.appeal_id, manualEvidence });
  });
  try {
    tx();
  } catch (e) {
    if (e && e._appealError) return e._appealError;
    return { error: 'validation_failed', message: e && e.message || 'submit failed' };
  }
  return getHijacking(db, userId, storeId, id);
}

export function closeHijacking(db, userId, storeId, id, body = {}) {
  const cur = db.prepare('SELECT * FROM m4_hijacking WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  db.prepare(`UPDATE m4_hijacking SET status='closed', updated_at=? WHERE id=?`).run(nowIso(), id);
  // 24h auto-resume if dedup_key date older than yesterday
  if (cur.m3_ads_paused) {
    const pausedIds = tryJSON(cur.m3_paused_campaign_ids, []);
    resumeAdsForAsin(db, userId, storeId, cur.asin, pausedIds);
    auditM4(userId, storeId, 'M3_RESUME_ADS_FROM_M4', 'campaign_set', cur.asin, { hijackingId: id, resumedCampaignIds: pausedIds });
    emitNotification(db, userId, storeId, {
      severity: 'P2', sourceModule: 'M4A', sourceEvent: 'M3_RESUME_ADS_FROM_M4',
      title: '跟卖关闭 → 已恢复广告', body: `ASIN ${cur.asin}`,
      link: `/monitor/hijacking?id=${id}`,
      relatedResourceType: 'hijacking', relatedResourceId: id,
    });
  }
  auditM4(userId, storeId, 'HIJACK_CLOSE', 'hijacking', id, { outcome: body.outcome });
  return getHijacking(db, userId, storeId, id);
}

// ============================================================
// M3 bridge (pause/resume Ads for ASIN)
//
// SAFETY INVARIANT #1: M4 must NOT directly mutate the M3 shadow Ads tables
// (lx_campaigns). Any write to an Ads entity must go through ad_action_queue with
// dry_run=1 + audit_required=1, where M3 reviews and executes it. So these bridge
// functions only RESOLVE the affected campaign ids and ENQUEUE a typed M3 action;
// lx_campaigns.enabled is left untouched until M3's queue execution runs.
// ============================================================
function resolveCampaignsForAsin(db, userId, storeId, asin) {
  return db.prepare(`
    SELECT DISTINCT c.id, c.enabled
    FROM lx_campaigns c
    LEFT JOIN lx_ad_groups g ON g.campaign_id = c.id AND g.user_id=c.user_id AND g.store_id=c.store_id
    LEFT JOIN lx_ads a ON a.ad_group_id = g.id AND a.user_id=c.user_id AND a.store_id=c.store_id
    WHERE c.user_id=? AND c.store_id=? AND (a.asin=? OR c.id IN (
      SELECT campaign_id FROM lx_targetings WHERE user_id=? AND store_id=? AND asin=?
    ))
  `).all(userId, storeId, asin, userId, storeId, asin);
}

function enqueueM3Action(db, userId, storeId, { typedAction, asin, campaignIds, severity, ctx, payload }) {
  // M4 -> Ads writes MUST route through ad_action_queue via enqueueAdAction. There is
  // no direct execution path: dryRun defaults ON and requiresRealStoreWrite is clamped
  // to false unless the provider mode is 'real'. The frontend body flag is never trusted.
  const real = isRealMode();
  payload = payload || {};
  return enqueueAdAction(db, userId, storeId, {
    typedAction, asin, campaignIds,
    severity: severity || 'P0',
    sourceModule: 'M4',
    sourceEvent: (ctx && ctx.sourceEvent) || typedAction,
    hijackingId: ctx && ctx.hijackingId,
    entity: { asin, campaignIds },
    evidenceRefs: { source: 'M4→M3', asin },
    sourceStrategyName: 'M4 跟卖联动',
    // requiresRealStoreWrite is clamped to false outside real mode.
    requiresRealStoreWrite: real ? (payload.requiresRealStoreWrite === true) : false,
    // dryRun defaults ON; a real write requires real mode + explicit dryRun===false.
    dryRun: real ? payload.dryRun !== false : true,
  });
}

export function pauseAdsForAsin(db, userId, storeId, asin, ctx = {}) {
  const camps = resolveCampaignsForAsin(db, userId, storeId, asin);
  // campaigns that are currently live and would be paused by M3 on execution.
  const pausedCampaignIds = camps.filter((c) => c.enabled).map((c) => c.id);
  const queueItemId = enqueueM3Action(db, userId, storeId, {
    typedAction: 'M4_PAUSE_ADS_FOR_ASIN', asin, campaignIds: pausedCampaignIds,
    severity: 'P0', ctx,
  });
  return { pausedCampaignIds, queueItemId };
}

export function resumeAdsForAsin(db, userId, storeId, asin, campaignIds) {
  const ids = campaignIds && campaignIds.length ? campaignIds : [];
  const queueItemId = enqueueM3Action(db, userId, storeId, {
    typedAction: 'M4_RESUME_ADS_FOR_ASIN', asin, campaignIds: ids,
    severity: 'P2', ctx: { sourceEvent: 'M3_RESUME_ADS_FROM_M4' },
  });
  return { resumedCampaignIds: ids, queueItemId };
}

// ============================================================
// Infringement
// ============================================================
export function listInfringement(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_infringement WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; p.push(filters.status); }
  if (filters.type) { sql += ' AND type=?'; p.push(filters.type); }
  sql += ' ORDER BY detected_at DESC LIMIT 200';
  return db.prepare(sql).all(...p).map(rowInfringement);
}
export function createInfringement(db, userId, storeId, body) {
  if (!body.asin || !body.type) return { error: 'validation_failed', message: 'asin/type required' };
  const id = body.id || newId('inf');
  const now = nowIso();
  db.prepare(`INSERT INTO m4_infringement(
    id, user_id, store_id, asin, type, source, reported_by, description,
    severity, status, detected_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.asin, body.type, body.source || 'manual',
    body.reportedBy || null, body.description || null, body.severity || 'medium',
    'investigating', now, now
  );
  auditM4(userId, storeId, 'INFRINGEMENT_CREATE', 'infringement', id, { asin: body.asin, type: body.type });
  emitNotification(db, userId, storeId, {
    severity: body.severity === 'high' ? 'P0' : 'P1', sourceModule: 'M4A',
    sourceEvent: 'INFRINGEMENT_CREATE', title: `侵权告警 (${body.type}): ${body.asin}`,
    link: `/monitor/infringement?id=${id}`,
    relatedResourceType: 'infringement', relatedResourceId: id,
  });
  return rowInfringement(db.prepare('SELECT * FROM m4_infringement WHERE id=?').get(id));
}
export function draftInfringement(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_infringement WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (!body.legalDisclaimerAck) return { error: 'validation_failed', message: 'legalDisclaimerAck must be true' };
  if (cur.status !== 'investigating') return { error: 'state_transition_forbidden', message: `cannot draft from status=${cur.status}` };
  const draftContent = body.draftContent || `[AI 起草] 投诉对象 ASIN: ${cur.asin}\n侵权类型: ${cur.type}\n证据: ${cur.description || ''}\n请求 Amazon 立即下架相关 listing 并对侵权卖家采取行动。`;
  db.prepare(`UPDATE m4_infringement SET status='draft', draft_content=?, legal_disclaimer_ack=1, updated_at=? WHERE id=?`).run(
    draftContent, nowIso(), id
  );
  auditM4(userId, storeId, 'DRAFT_IP_COMPLAINT', 'infringement', id, { previousValues: { status: 'investigating' } });
  return rowInfringement(db.prepare('SELECT * FROM m4_infringement WHERE id=?').get(id));
}
export function submitInfringement(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_infringement WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'draft') return { error: 'state_transition_forbidden', message: `cannot submit from status=${cur.status}` };
  const complaintId = body.amazonComplaintId || ('IP-' + new Date().getFullYear() + '-' + randomBytes(2).toString('hex').toUpperCase());
  db.prepare(`UPDATE m4_infringement SET status='submitted', amazon_complaint_id=?, submitted_at=?, updated_at=? WHERE id=?`).run(
    complaintId, nowIso(), nowIso(), id
  );
  auditM4(userId, storeId, 'SUBMIT_IP_COMPLAINT', 'infringement', id, { complaintId });
  return rowInfringement(db.prepare('SELECT * FROM m4_infringement WHERE id=?').get(id));
}
export function resolveInfringement(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_infringement WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const outcome = body.outcome;
  if (!['accepted', 'rejected', 'dismissed'].includes(outcome)) return { error: 'validation_failed', message: 'invalid outcome' };
  const before = { status: cur.status };
  let newStatus = outcome === 'dismissed' ? 'dismissed' : (outcome === 'accepted' ? 'accepted' : 'rejected');
  db.prepare(`UPDATE m4_infringement SET status=?, resolved_at=?, updated_at=? WHERE id=?`).run(
    newStatus === 'accepted' ? 'resolved' : newStatus, nowIso(), nowIso(), id
  );
  auditM4(userId, storeId, 'IP_COMPLAINT_RESOLVE', 'infringement', id, { previousValues: before, outcome });
  return rowInfringement(db.prepare('SELECT * FROM m4_infringement WHERE id=?').get(id));
}

// ============================================================
// Reviews
// ============================================================
export function listReviewsM4(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM reviews WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.sentiment) { sql += ' AND sentiment=?'; p.push(filters.sentiment); }
  if (filters.rating) { sql += ' AND rating=?'; p.push(Number(filters.rating)); }
  if (filters.clusterId) { sql += ' AND cluster_id=?'; p.push(filters.clusterId); }
  if (filters.asin) { sql += ' AND asin=?'; p.push(filters.asin); }
  if (filters.q) { sql += ' AND (title LIKE ? OR body LIKE ?)'; p.push('%' + filters.q + '%', '%' + filters.q + '%'); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const items = db.prepare(sql).all(...p).map(rowReview);
  // M4-P1-07: 待挽回 backlog = pending + in_progress (reversible draft state). A drafted
  // recovery stays counted until it is actually sent / resolved.
  const totals = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS neg, SUM(appeal_eligible) AS aelig, SUM(CASE WHEN recovery_status IN ('pending','in_progress') THEN 1 ELSE 0 END) AS rpend FROM reviews WHERE user_id=? AND store_id=?").get(userId, storeId);
  return {
    items,
    summary: {
      total: totals?.total || 0,
      negative: totals?.neg || 0,
      appealCandidates: totals?.aelig || 0,
      recoveryPending: totals?.rpend || 0,
    },
  };
}
export function getReviewM4(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM reviews WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  return rowReview(r);
}
export function syncReviews(db, userId, storeId, body = {}) {
  const seed = hashStr(userId + '::' + storeId + '::reviewsync::' + (body.seedTag || Date.now().toString(36)));
  const rng = mulberry32(seed);
  const limit = Math.min(body.limit || 6, 12);
  const asinPool = body.asins && body.asins.length ? body.asins : ['B0CASE001', 'B0CABLE002'];
  const createdIds = [];
  const sentiments = ['negative', 'neutral', 'positive'];
  let negativeByAsin = {};
  for (let i = 0; i < limit; i++) {
    const id = newId('rev');
    const asin = asinPool[Math.floor(rng() * asinPool.length)];
    const rating = 1 + Math.floor(rng() * 5);
    const sentiment = rating <= 2 ? 'negative' : rating === 3 ? 'neutral' : 'positive';
    if (sentiment === 'negative') negativeByAsin[asin] = (negativeByAsin[asin] || 0) + 1;
    // reviews.product_id NOT NULL — look up from products by asin; fall back to placeholder
    const prodRow = db.prepare('SELECT id FROM products WHERE user_id=? AND store_id=? AND asin=? LIMIT 1').get(userId, storeId, asin);
    const productId = prodRow?.id || ('unknown-' + asin);
    db.prepare(`INSERT INTO reviews(id, user_id, store_id, product_id, asin, sku, reviewer,
      rating, title, body, verified, sentiment, appeal_eligible, recovery_status, posted_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, productId, asin, null, 'Reviewer-' + Math.floor(rng() * 9999),
      rating, sentiment === 'negative' ? '不满意' : '体验不错',
      sentiment === 'negative' ? '产品有缺陷，按钮松动' : '总体满意，符合预期。',
      Math.random() > 0.5 ? 1 : 0, sentiment, sentiment === 'negative' && rng() > 0.5 ? 1 : 0,
      'n/a', nowIso(), nowIso()
    );
    createdIds.push(id);
  }
  // Negative burst detection
  let burstAnomaly = null;
  for (const [asin, n] of Object.entries(negativeByAsin)) {
    if (n >= 3) {
      // dedup: burst:asin:date
      const dedupKey = `burst:${asin}:${nowIso().slice(0, 10)}`;
      const existing = db.prepare(`SELECT id FROM m4_anomalies WHERE user_id=? AND store_id=? AND anomaly_code=? AND asin=? AND created_at>=?`).get(userId, storeId, 'A_REVIEW_NEGATIVE_BURST', asin, new Date(Date.now() - 86400_000).toISOString());
      if (!existing) {
        burstAnomaly = createAnomaly(db, userId, storeId, {
          anomalyCode: 'A_REVIEW_NEGATIVE_BURST', category: 'review', severity: 'P1',
          asin, title: `负面差评爆发: ${asin} (${n} 条 1-2 星)`,
          evidence: [{ count: n, asin }],
          recommendedAction: '排查最近变更 → 起草申诉 / 发起挽回邮件',
          sourceModule: 'M4B',
        });
      }
    }
  }
  auditM4(userId, storeId, 'REVIEW_SYNC', 'review_set', 'sync-' + Date.now(), { createdIds, count: createdIds.length });
  return { created: createdIds.length, items: createdIds, burstAnomaly };
}
export function markReviewAppealable(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM reviews WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const prev = { appealEligible: !!cur.appeal_eligible };
  db.prepare(`UPDATE reviews SET appeal_eligible=?, updated_at=? WHERE id=?`).run(body.appealable ? 1 : 0, nowIso(), id);
  auditM4(userId, storeId, 'REVIEW_MARK_APPEAL', 'review', id, { previousValues: prev, appealable: body.appealable, violationType: body.violationType });
  return rowReview(db.prepare('SELECT * FROM reviews WHERE id=?').get(id));
}
export function pushReviewToM1(db, userId, storeId, reviewId, body) {
  const cur = db.prepare('SELECT * FROM reviews WHERE id=? AND user_id=? AND store_id=?').get(reviewId, userId, storeId);
  if (!cur) return null;
  // Try to find product by asin → create M1 target
  let targetResp = null;
  try {
    const m1 = require('./data-store-listings.mjs'); // sync require not available in ESM
  } catch {}
  // Use dynamic import via cached reference (lazy)
  const targetId = newId('m1t');
  const productRow = db.prepare('SELECT id FROM products WHERE user_id=? AND store_id=? AND asin=?').get(userId, storeId, cur.asin);
  try {
    db.prepare(`INSERT INTO m1_optimization_targets(
      id, user_id, store_id, mode, product_id, asin, asin_kind, is_competitor_only,
      new_category, new_selling_points, new_target_audience, new_price_band,
      new_physical_specs, new_brand_positioning, new_target_keywords,
      competitor_pool, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      targetId, userId, storeId, productRow ? 'existing' : 'asin_input',
      productRow?.id || null, cur.asin || null, productRow ? 'own' : 'external', productRow ? 0 : 1,
      null, J([]), null, null, J(null), null, J([]),
      J([]), 'draft', nowIso(), null
    );
    appendAuditLog(userId, storeId, {
      sourceModule: 'M1', actionType: 'M1_TARGET_CREATE',
      resourceType: 'm1_optimization_target', resourceId: targetId,
      mode: productRow ? 'existing' : 'asin_input', asin: cur.asin, source: 'm4_review:' + reviewId,
    });
    targetResp = { id: targetId, asin: cur.asin };
  } catch (e) {
    targetResp = { error: e.message };
  }
  emitNotification(db, userId, storeId, {
    severity: 'P2', sourceModule: 'M4B', sourceEvent: 'PUSH_M1_IMPROVEMENT',
    title: `Review → M1 优化目标已创建`, link: `/listings/optimize/${targetId}`,
    relatedResourceType: 'm1_target', relatedResourceId: targetId,
  });
  auditM4(userId, storeId, 'PUSH_M1_IMPROVEMENT', 'm1_target', targetId, { reviewId, asin: cur.asin });
  return { reviewId, m1TargetId: targetId, target: targetResp };
}

// ============================================================
// Review Clusters
// ============================================================
export function listClusters(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_review_clusters WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; p.push(filters.status); }
  if (filters.asin) { sql += ' AND asin=?'; p.push(filters.asin); }
  sql += ' ORDER BY count DESC LIMIT 200';
  return db.prepare(sql).all(...p).map(rowCluster);
}
export function getCluster(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m4_review_clusters WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  return rowCluster(r);
}
export function recomputeClusters(db, userId, storeId, body = {}) {
  // 简化：聚类基于已有负面 review 关键词
  const filterAsin = body.asin || null;
  const seed = hashStr(userId + '::' + storeId + '::cluster::' + (filterAsin || ''));
  const rng = mulberry32(seed);
  const reviews = db.prepare(`SELECT * FROM reviews WHERE user_id=? AND store_id=? ${filterAsin ? 'AND asin=?' : ''} ORDER BY created_at DESC LIMIT 200`).all(...(filterAsin ? [userId, storeId, filterAsin] : [userId, storeId]));
  if (filterAsin) {
    db.prepare(`DELETE FROM m4_review_clusters WHERE user_id=? AND store_id=? AND asin=?`).run(userId, storeId, filterAsin);
  }
  const clusterDefs = [
    { name: '按钮松动', rootCause: 'product_quality', layer: 'manufacturer' },
    { name: '包装破损', rootCause: 'packaging', layer: 'packaging' },
    { name: '充电慢', rootCause: 'expectation_mgmt', layer: 'listing' },
  ];
  const created = [];
  for (let i = 0; i < clusterDefs.length; i++) {
    const def = clusterDefs[i];
    const id = newId('cl');
    const count = 3 + Math.floor(rng() * 8);
    const samples = reviews.filter((r) => r.sentiment === 'negative').slice(0, 3).map((r) => (r.body || '').slice(0, 60));
    db.prepare(`INSERT INTO m4_review_clusters(
      id, user_id, store_id, asin, name, sentiment, root_cause,
      count, percent, samples, improvements, estimated_rating_lift, confidence,
      status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, filterAsin, def.name, 'negative', def.rootCause,
      count, Math.round((count / Math.max(1, reviews.length)) * 100) / 100,
      J(samples), J([{ layer: def.layer, action: '修复' + def.name }]),
      Math.round(rng() * 3 * 10) / 10, Math.round((0.6 + rng() * 0.4) * 100) / 100,
      'new', nowIso()
    );
    created.push(id);
  }
  auditM4(userId, storeId, 'REVIEW_CLUSTER_RECOMPUTE', 'cluster_set', 'recompute-' + Date.now(), { asin: filterAsin, createdIds: created });
  return { created: created.length, ids: created };
}
export function pushClusterToM1(db, userId, storeId, clusterId, body) {
  const cur = db.prepare('SELECT * FROM m4_review_clusters WHERE id=? AND user_id=? AND store_id=?').get(clusterId, userId, storeId);
  if (!cur) return null;
  const layer = body.layer || 'listing';
  let targetId = null;
  if (layer === 'listing' || layer === 'documentation') {
    targetId = newId('m1t');
    const productRow = cur.asin ? db.prepare('SELECT id FROM products WHERE user_id=? AND store_id=? AND asin=?').get(userId, storeId, cur.asin) : null;
    try {
      db.prepare(`INSERT INTO m1_optimization_targets(
        id, user_id, store_id, mode, product_id, asin, asin_kind, is_competitor_only,
        new_category, new_selling_points, new_target_audience, new_price_band,
        new_physical_specs, new_brand_positioning, new_target_keywords,
        competitor_pool, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        targetId, userId, storeId, productRow ? 'existing' : (cur.asin ? 'asin_input' : 'new_listing'),
        productRow?.id || null, cur.asin || null, productRow ? 'own' : (cur.asin ? 'external' : null),
        productRow ? 0 : 1, cur.asin ? null : '从聚类生成',
        J([cur.name]), null, null, J(null), null, J([]),
        J([]), 'draft', nowIso(), null
      );
      appendAuditLog(userId, storeId, {
        sourceModule: 'M1', actionType: 'M1_TARGET_CREATE',
        resourceType: 'm1_optimization_target', resourceId: targetId,
        mode: productRow ? 'existing' : 'asin_input', asin: cur.asin, source: 'm4_cluster:' + clusterId,
      });
    } catch (e) { targetId = null; }
  }
  const pushedIds = tryJSON(cur.pushed_m1_target_ids, []);
  if (targetId) pushedIds.push(targetId);
  db.prepare(`UPDATE m4_review_clusters SET status='pushed', pushed_m1_target_ids=?, updated_at=? WHERE id=?`).run(J(pushedIds), nowIso(), clusterId);
  if (targetId) {
    emitNotification(db, userId, storeId, {
      severity: 'P2', sourceModule: 'M4B', sourceEvent: 'CLUSTER_PUSH_M1',
      title: `聚类 ${cur.name} → M1 优化已创建`, link: `/listings/optimize/${targetId}`,
      relatedResourceType: 'm1_target', relatedResourceId: targetId,
    });
  }
  auditM4(userId, storeId, 'CLUSTER_PUSH_M1', 'cluster', clusterId, { layer, m1TargetId: targetId });
  return getCluster(db, userId, storeId, clusterId);
}

// ============================================================
// Review Trends
// ============================================================
export function listTrends(db, userId, storeId, asin) {
  let sql = 'SELECT * FROM m4_review_trend_snapshots WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (asin) { sql += ' AND asin=?'; p.push(asin); }
  sql += ' ORDER BY snapshot_date DESC LIMIT 90';
  const rows = db.prepare(sql).all(...p);
  return rows.map((r) => ({
    id: r.id, asin: r.asin, sku: r.sku, snapshotDate: r.snapshot_date,
    avgRating: r.avg_rating, totalReviews: r.total_reviews,
    added7d: r.added_7d, avg7d: r.avg_7d,
    added30d: r.added_30d, avg30d: r.avg_30d,
    trend: r.trend, trendDelta: r.trend_delta,
    distribution: tryJSON(r.distribution, {}),
    createdAt: r.created_at,
  }));
}
export function snapshotTrends(db, userId, storeId, body = {}) {
  const asins = body.asins && body.asins.length ? body.asins : ['B0CASE001', 'B0CABLE002'];
  const created = [];
  const today = nowIso().slice(0, 10);
  for (const asin of asins) {
    const seed = hashStr(userId + '::' + storeId + '::trend::' + asin + '::' + today);
    const rng = mulberry32(seed);
    const id = newId('rts');
    const avg = 3.8 + rng() * 0.9;
    db.prepare(`INSERT INTO m4_review_trend_snapshots(
      id, user_id, store_id, asin, snapshot_date,
      avg_rating, total_reviews, added_7d, avg_7d, added_30d, avg_30d,
      trend, trend_delta, distribution, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, asin, today,
      Math.round(avg * 10) / 10, 100 + Math.floor(rng() * 200),
      5 + Math.floor(rng() * 15), Math.round((avg - 0.1) * 10) / 10,
      20 + Math.floor(rng() * 30), Math.round(avg * 10) / 10,
      avg > 4.3 ? 'rising' : avg < 4.0 ? 'declining' : 'stable',
      Math.round((rng() - 0.5) * 0.4 * 100) / 100,
      J({ 1: 3, 2: 5, 3: 10, 4: 30, 5: 52 }), nowIso()
    );
    created.push(id);
  }
  auditM4(userId, storeId, 'TREND_SNAPSHOT', 'trend_set', 'snap-' + Date.now(), { asins, createdIds: created });
  return { created: created.length, ids: created };
}

// ============================================================
// Appeals (state machine)
// ============================================================
const APPEAL_TRANSITIONS = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'accepted', 'rejected', 'withdrawn'],
  under_review: ['accepted', 'rejected', 'withdrawn'],
  rejected: ['withdrawn'],
  accepted: [],
  withdrawn: [],
};

export function listAppeals(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_appeals WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; p.push(filters.status); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const items = db.prepare(sql).all(...p).map(rowAppeal);
  const all = db.prepare('SELECT status FROM m4_appeals WHERE user_id=? AND store_id=?').all(userId, storeId);
  const counts = { draft: 0, submitted: 0, under_review: 0, accepted: 0, rejected: 0, withdrawn: 0 };
  for (const r of all) counts[r.status] = (counts[r.status] || 0) + 1;
  const totalReviewed = counts.accepted + counts.rejected;
  return { items, summary: { ...counts, successRate: totalReviewed ? Math.round((counts.accepted / totalReviewed) * 100) / 100 : 0 } };
}
export function getAppeal(db, userId, storeId, id) {
  return rowAppeal(db.prepare('SELECT * FROM m4_appeals WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId));
}
export function draftAppeal(db, userId, storeId, body) {
  if (!body.violationType) return { error: 'validation_failed', message: 'violationType required' };
  if (!body.reviewId && !body.hijackingId) return { error: 'validation_failed', message: 'reviewId or hijackingId required' };
  const id = body.id || newId('ap');
  const now = nowIso();
  let asin = body.asin || null, sku = body.sku || null, author = body.author || null, rating = body.rating || null, bodyText = body.body || null;
  if (body.reviewId) {
    const rev = db.prepare('SELECT * FROM reviews WHERE id=? AND user_id=? AND store_id=?').get(body.reviewId, userId, storeId);
    if (rev) { asin = rev.asin || asin; sku = rev.sku || sku; author = rev.reviewer || author; rating = rev.rating || rating; bodyText = rev.body || bodyText; }
  }
  const payload = body.payload || {};
  const draftContent = payload.draftContent || `[AI 起草] ${body.violationType} 申诉。\n证据: ${payload.evidence || '请补充'}\n请求 Amazon 移除违规评论。`;
  db.prepare(`INSERT INTO m4_appeals(
    id, user_id, store_id, review_id, hijacking_id, sku, asin, author, rating, body,
    violation_type, confidence, draft_content, drafted_at, status, parent_appeal_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.reviewId || null, body.hijackingId || null,
    sku, asin, author, rating, bodyText,
    body.violationType, payload.confidence ?? 0.7, draftContent, now,
    'draft', body.parentAppealId || null, now
  );
  if (body.reviewId) {
    db.prepare(`UPDATE reviews SET appeal_id=?, updated_at=? WHERE id=?`).run(id, now, body.reviewId);
  }
  auditM4(userId, storeId, 'DRAFT_REVIEW_APPEAL', 'appeal', id, { reviewId: body.reviewId, hijackingId: body.hijackingId });
  return getAppeal(db, userId, storeId, id);
}
export function submitAppeal(db, userId, storeId, id, manualEvidence = null) {
  const cur = db.prepare('SELECT * FROM m4_appeals WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (!APPEAL_TRANSITIONS[cur.status] || !APPEAL_TRANSITIONS[cur.status].includes('submitted')) {
    return { error: 'state_transition_forbidden', message: `cannot submit from status=${cur.status}` };
  }
  // Manual external submission carries the operator-provided Amazon case id when present.
  const caseId = (manualEvidence && manualEvidence.amazonCaseId)
    || 'AMZ-CASE-' + new Date().getFullYear() + '-' + randomBytes(2).toString('hex').toUpperCase();
  db.prepare(`UPDATE m4_appeals SET status='submitted', amazon_case_id=?, submitted_at=?, updated_at=? WHERE id=?`).run(
    caseId, nowIso(), nowIso(), id
  );
  auditM4(userId, storeId, 'SUBMIT_APPEAL', 'appeal', id, { previousValues: { status: cur.status }, amazonCaseId: caseId, manualEvidence: manualEvidence || undefined });
  return getAppeal(db, userId, storeId, id);
}
export function reviewAppeal(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_appeals WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const outcome = body.outcome;
  if (!['accepted', 'rejected', 'under_review'].includes(outcome)) return { error: 'validation_failed', message: 'invalid outcome' };
  if (!APPEAL_TRANSITIONS[cur.status] || !APPEAL_TRANSITIONS[cur.status].includes(outcome)) {
    return { error: 'state_transition_forbidden', message: `cannot transition from ${cur.status} to ${outcome}` };
  }
  db.prepare(`UPDATE m4_appeals SET status=?, amazon_response=?, reviewed_at=?, updated_at=? WHERE id=?`).run(
    outcome, body.amazonResponse || null, nowIso(), nowIso(), id
  );
  auditM4(userId, storeId, 'APPEAL_REVIEW', 'appeal', id, { previousValues: { status: cur.status }, outcome });
  return getAppeal(db, userId, storeId, id);
}
export function retryAppeal(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_appeals WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'rejected') return { error: 'state_transition_forbidden', message: 'retry only allowed from rejected status' };
  const newId2 = newId('ap');
  const now = nowIso();
  db.prepare(`INSERT INTO m4_appeals(
    id, user_id, store_id, review_id, hijacking_id, sku, asin, author, rating, body,
    violation_type, confidence, draft_content, drafted_at, status, retry_count, parent_appeal_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    newId2, userId, storeId, cur.review_id, cur.hijacking_id, cur.sku, cur.asin,
    cur.author, cur.rating, cur.body, cur.violation_type, cur.confidence,
    (cur.draft_content || '') + '\n\n[补充] ' + (body.note || '补充证据后重提'),
    now, 'draft', (cur.retry_count || 0) + 1, id, now
  );
  auditM4(userId, storeId, 'APPEAL_RETRY', 'appeal', newId2, { parentAppealId: id });
  return getAppeal(db, userId, storeId, newId2);
}

// ============================================================
// Recovery emails
// ============================================================
export function listRecovery(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_recovery_emails WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; p.push(filters.status); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  return db.prepare(sql).all(...p).map(rowRecovery);
}
export function getRecovery(db, userId, storeId, id) {
  return rowRecovery(db.prepare('SELECT * FROM m4_recovery_emails WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId));
}
export function draftRecovery(db, userId, storeId, body) {
  if (!body.reviewId) return { error: 'validation_failed', message: 'reviewId required' };
  const rev = db.prepare('SELECT * FROM reviews WHERE id=? AND user_id=? AND store_id=?').get(body.reviewId, userId, storeId);
  if (!rev) return { error: 'not_found', message: 'review not found' };
  const id = body.id || newId('rec');
  const now = nowIso();
  let roundNo = 1;
  if (body.parentEmailId) {
    const parent = db.prepare('SELECT round_no FROM m4_recovery_emails WHERE id=? AND user_id=? AND store_id=?').get(body.parentEmailId, userId, storeId);
    if (parent) roundNo = (parent.round_no || 1) + 1;
  }
  const subject = body.subject || `关于您的评价 - ${rev.asin || ''}`;
  const bodyText = body.body || `您好 ${rev.reviewer || '客户'}, 我们注意到您给出了 ${rev.rating} 星评价。我们非常重视您的反馈，希望提供退款 / 换货以弥补不便。`;
  db.prepare(`INSERT INTO m4_recovery_emails(
    id, user_id, store_id, review_id, sku, asin, author, rating, template_id,
    subject, body, preview, round_no, parent_email_id, status, drafted_at,
    channel, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.reviewId, rev.sku || null, rev.asin || null,
    rev.reviewer || null, rev.rating || null, body.templateId || null,
    subject, bodyText, bodyText.slice(0, 80), roundNo, body.parentEmailId || null,
    'draft', now, body.channel || 'buyer_seller_messaging', now
  );
  // M4-P1-07: drafting does NOT move the review out of the待挽回 backlog. Use a reversible
  // 'in_progress' status that listReviewsM4 still counts in recoveryPending — so a drafted
  // (but not yet sent) recovery cannot silently leak out of the to-do view.
  db.prepare(`UPDATE reviews SET recovery_id=?, recovery_status='in_progress', updated_at=? WHERE id=?`).run(id, now, body.reviewId);
  auditM4(userId, storeId, 'DRAFT_RECOVERY_EMAIL', 'recovery', id, { reviewId: body.reviewId, roundNo });
  return getRecovery(db, userId, storeId, id);
}
// M4-P1-03: there is NO real Buyer-Seller-Messaging / email channel wired here, so this
// is a manual ticket-board action — never fake a real 'sent'. It requires manual-evidence
// (channel/sentBy/sentAt), marks the recovery 'marked_sent', leaves reviews.recovery_status
// untouched (must not flip to 'sent'), and audits as SEND_RECOVERY_EMAIL_MANUAL with
// externalWrite:false. Safety invariant: no mock/manual path may be dressed up as real.
const SEND_RECOVERY_MANUAL_FIELDS = ['channel', 'sentBy', 'sentAt'];

export function sendRecovery(db, userId, storeId, id, body = {}) {
  const cur = db.prepare('SELECT * FROM m4_recovery_emails WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'draft' && cur.status !== 'pending') return { error: 'state_transition_forbidden', message: `cannot send from status=${cur.status}` };
  const missing = SEND_RECOVERY_MANUAL_FIELDS.filter((k) => !body[k]);
  if (missing.length) {
    return { error: 'validation_failed', message: 'manual-evidence required (channel/sentBy/sentAt)', missing };
  }
  db.prepare(`UPDATE m4_recovery_emails SET status='marked_sent', channel=?, sent_at=?, updated_at=? WHERE id=?`).run(
    body.channel, body.sentAt || nowIso(), nowIso(), id
  );
  // NOTE: do NOT write reviews.recovery_status='sent'. The review stays in_progress
  // (still in the待挽回 backlog) until an actual buyer reply is recorded.
  auditM4(userId, storeId, 'SEND_RECOVERY_EMAIL_MANUAL', 'recovery', id, {
    previousValues: { status: cur.status }, externalWrite: false,
    channel: body.channel, sentBy: body.sentBy, sentAt: body.sentAt || nowIso(),
  });
  return getRecovery(db, userId, storeId, id);
}
export function recordRecoveryReply(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_recovery_emails WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  // M4-P2-04: must have been (manually) sent before a buyer reply can be recorded.
  // Guards against未发先回 polluting reviews.rating.
  if (cur.status !== 'sent' && cur.status !== 'marked_sent') {
    return { error: 'state_transition_forbidden', message: `cannot record reply from status=${cur.status}` };
  }
  const newStatus = body.reviewUpdated ? 'review_updated' : 'replied';
  db.prepare(`UPDATE m4_recovery_emails SET status=?, replied_at=?, replied_body=?, review_updated=?, old_rating=?, new_rating=?, updated_at=? WHERE id=?`).run(
    newStatus, nowIso(), body.repliedBody || null, body.reviewUpdated ? 1 : 0,
    cur.rating || null, body.newRating || null, nowIso(), id
  );
  if (cur.review_id) {
    db.prepare(`UPDATE reviews SET recovery_status=?, rating=?, updated_at=? WHERE id=?`).run(
      newStatus, body.reviewUpdated && body.newRating ? body.newRating : cur.rating,
      nowIso(), cur.review_id
    );
  }
  auditM4(userId, storeId, 'RECOVERY_REPLY', 'recovery', id, { reviewUpdated: !!body.reviewUpdated, newRating: body.newRating });
  return getRecovery(db, userId, storeId, id);
}
export function nextRoundRecovery(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m4_recovery_emails WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  return draftRecovery(db, userId, storeId, { reviewId: cur.review_id, templateId: body.templateId, parentEmailId: id });
}

// ============================================================
// Competitors
// ============================================================
export function listCompetitors(db, userId, storeId, asin) {
  let sql = 'SELECT * FROM m4_competitor_snapshots WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (asin) { sql += ' AND competitor_asin=?'; p.push(asin); }
  sql += ' ORDER BY snapshot_at DESC LIMIT 500';
  return db.prepare(sql).all(...p).map(rowCompetitorSnap);
}
export function addCompetitor(db, userId, storeId, body) {
  if (!body.competitorAsin) return { error: 'validation_failed', message: 'competitorAsin required' };
  const id = newId('cs');
  const now = nowIso();
  db.prepare(`INSERT INTO m4_competitor_snapshots(
    id, user_id, store_id, competitor_asin, our_asin, snapshot_at,
    title, price, bsr, rating, review_count, ad_positions, listing_changes, raw, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.competitorAsin, body.ourAsin || null, now,
    body.title || `竞品 ${body.competitorAsin}`, body.price || null,
    body.bsr || null, body.rating || null, body.reviewCount || null,
    J([]), J([]), null, now
  );
  auditM4(userId, storeId, 'COMPETITOR_ADD', 'competitor', body.competitorAsin, { id });
  return rowCompetitorSnap(db.prepare('SELECT * FROM m4_competitor_snapshots WHERE id=?').get(id));
}
export function snapshotCompetitors(db, userId, storeId, body = {}) {
  const asins = body.asins && body.asins.length ? body.asins
    : [...new Set(db.prepare('SELECT DISTINCT competitor_asin FROM m4_competitor_snapshots WHERE user_id=? AND store_id=?').all(userId, storeId).map((r) => r.competitor_asin))];
  if (!asins.length) asins.push('B0YYYY1');
  const created = [];
  for (const asin of asins) {
    const last = db.prepare('SELECT * FROM m4_competitor_snapshots WHERE user_id=? AND store_id=? AND competitor_asin=? ORDER BY snapshot_at DESC LIMIT 1').get(userId, storeId, asin);
    const seed = hashStr(userId + '::' + storeId + '::snap::' + asin + '::' + Date.now().toString(36));
    const rng = mulberry32(seed);
    const newPrice = last ? Math.max(5, (last.price || 20) + Math.round((rng() - 0.5) * 8 * 100) / 100) : 19.99 + Math.round(rng() * 1000) / 100;
    const changes = [];
    if (last) {
      const oldPrice = last.price || 0;
      if (Math.abs(newPrice - oldPrice) > 0.5) {
        changes.push({ dimension: 'price', from: oldPrice, to: newPrice, strategy: 'price_move', interpretation: newPrice < oldPrice ? '竞品降价' : '竞品涨价' });
      }
    }
    const id = newId('cs');
    db.prepare(`INSERT INTO m4_competitor_snapshots(
      id, user_id, store_id, competitor_asin, our_asin, snapshot_at,
      title, price, bsr, rating, review_count, ad_positions, listing_changes, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, asin, last?.our_asin || null, nowIso(),
      last?.title || `竞品 ${asin}`, newPrice,
      (last?.bsr || 2000) + Math.floor((rng() - 0.5) * 200),
      Math.round(((last?.rating || 4.2) + (rng() - 0.5) * 0.2) * 10) / 10,
      (last?.review_count || 100) + Math.floor(rng() * 10),
      J([]), J(changes), nowIso()
    );
    created.push(id);
  }
  auditM4(userId, storeId, 'COMPETITOR_SNAPSHOT', 'competitor_set', 'snap-' + Date.now(), { asins, createdIds: created });
  return { created: created.length, ids: created };
}
export function competitorTimeline(db, userId, storeId, asin, range = {}) {
  let sql = 'SELECT * FROM m4_competitor_snapshots WHERE user_id=? AND store_id=? AND competitor_asin=?';
  const p = [userId, storeId, asin];
  if (range.from) { sql += ' AND snapshot_at>=?'; p.push(range.from); }
  if (range.to) { sql += ' AND snapshot_at<=?'; p.push(range.to); }
  sql += ' ORDER BY snapshot_at ASC LIMIT 500';
  return db.prepare(sql).all(...p).map(rowCompetitorSnap);
}
export function dismissCompetitorChange(db, userId, storeId, asin, body) {
  const last = db.prepare('SELECT * FROM m4_competitor_snapshots WHERE user_id=? AND store_id=? AND competitor_asin=? ORDER BY snapshot_at DESC LIMIT 1').get(userId, storeId, asin);
  if (!last) return null;
  const changes = tryJSON(last.listing_changes, []);
  const idx = Number(body.changeIdx || 0);
  if (changes[idx]) {
    changes[idx].dismissed = true;
    changes[idx].dismissReason = body.reason || null;
    db.prepare('UPDATE m4_competitor_snapshots SET listing_changes=? WHERE id=?').run(J(changes), last.id);
  }
  auditM4(userId, storeId, 'COMPETITOR_DISMISS_CHANGE', 'competitor', asin, { changeIdx: idx, reason: body.reason });
  return rowCompetitorSnap(db.prepare('SELECT * FROM m4_competitor_snapshots WHERE id=?').get(last.id));
}

// ============================================================
// Image Diffs (cross-module to M1)
// ============================================================
export function listImageDiffs(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_image_diffs WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; p.push(filters.status); }
  if (filters.competitorAsin) { sql += ' AND competitor_asin=?'; p.push(filters.competitorAsin); }
  sql += ' ORDER BY detected_at DESC LIMIT 200';
  return db.prepare(sql).all(...p).map(rowImageDiff);
}
export function scanImageDiffs(db, userId, storeId, body = {}) {
  const seed = hashStr(userId + '::' + storeId + '::imgdiff::' + Date.now().toString(36));
  const rng = mulberry32(seed);
  const asins = body.competitorAsins && body.competitorAsins.length ? body.competitorAsins : ['B0YYYY1', 'B0ZZZZ1'];
  const created = [];
  const roles = ['main', 'gallery_2', 'a_plus_3'];
  for (const asin of asins) {
    const id = newId('imd');
    const role = roles[Math.floor(rng() * roles.length)];
    const phash = 20 + Math.floor(rng() * 40);
    db.prepare(`INSERT INTO m4_image_diffs(
      id, user_id, store_id, competitor_asin, image_role, old_image_url, new_image_url,
      phash_distance, change_type, ai_analysis, strategy_inferred, impact_on_us,
      detected_at, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, asin, role,
      `https://mock-cdn.amazon/old/${asin}/${role}.jpg`,
      `https://mock-cdn.amazon/new/${asin}/${role}.jpg`,
      phash, '主图角标新增 / 文案 swap',
      '从产品图换为强调"防摔测试 + MagSafe 兼容"',
      '差异化布局：突出场景图 + 用户证言',
      '我方需要调整主图，加强场景化',
      nowIso(), 'new', nowIso()
    );
    created.push(id);
  }
  auditM4(userId, storeId, 'IMAGE_DIFF_SCAN', 'image_diff_set', 'scan-' + Date.now(), { createdIds: created });
  return { created: created.length, ids: created };
}
export function pushImageDiffToM1(db, userId, storeId, diffId) {
  const cur = db.prepare('SELECT * FROM m4_image_diffs WHERE id=? AND user_id=? AND store_id=?').get(diffId, userId, storeId);
  if (!cur) return null;
  // find our_asin from competitor snapshot
  const snap = db.prepare(`SELECT our_asin FROM m4_competitor_snapshots WHERE user_id=? AND store_id=? AND competitor_asin=? LIMIT 1`).get(userId, storeId, cur.competitor_asin);
  const ourAsin = snap?.our_asin || null;
  const productRow = ourAsin ? db.prepare('SELECT id FROM products WHERE user_id=? AND store_id=? AND asin=?').get(userId, storeId, ourAsin) : null;
  const targetId = newId('m1t');
  try {
    db.prepare(`INSERT INTO m1_optimization_targets(
      id, user_id, store_id, mode, product_id, asin, asin_kind, is_competitor_only,
      new_category, new_selling_points, new_target_audience, new_price_band,
      new_physical_specs, new_brand_positioning, new_target_keywords,
      competitor_pool, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      targetId, userId, storeId, productRow ? 'existing' : 'asin_input',
      productRow?.id || null, ourAsin, productRow ? 'own' : 'external', productRow ? 0 : 1,
      null, J([]), null, null, J(null), null, J([cur.ai_analysis || '主图迭代']),
      J([cur.competitor_asin]), 'draft', nowIso(), null
    );
    appendAuditLog(userId, storeId, {
      sourceModule: 'M1', actionType: 'M1_TARGET_CREATE',
      resourceType: 'm1_optimization_target', resourceId: targetId,
      mode: productRow ? 'existing' : 'asin_input', asin: ourAsin, source: 'm4_image_diff:' + diffId,
    });
  } catch (e) { /* fallthrough — keep target id null */ }
  db.prepare(`UPDATE m4_image_diffs SET pushed_m1_target_id=?, status='pushed', updated_at=? WHERE id=?`).run(targetId, nowIso(), diffId);
  emitNotification(db, userId, storeId, {
    severity: 'P2', sourceModule: 'M4C', sourceEvent: 'IMAGE_DIFF_PUSH_M1',
    title: `竞品图片变化 → M1 优化已创建`, link: `/listings/optimize/${targetId}`,
    relatedResourceType: 'm1_target', relatedResourceId: targetId,
  });
  auditM4(userId, storeId, 'IMAGE_DIFF_PUSH_M1', 'image_diff', diffId, { m1TargetId: targetId, competitorAsin: cur.competitor_asin });
  return { ...rowImageDiff(db.prepare('SELECT * FROM m4_image_diffs WHERE id=?').get(diffId)), m1TargetId: targetId };
}

// ============================================================
// Brand Defense
// ============================================================
export function getBrandDefense(db, userId, storeId) {
  const rows = db.prepare('SELECT * FROM m4_brand_defense_layers WHERE user_id=? AND store_id=? ORDER BY layer_code').all(userId, storeId);
  return { layers: rows.map(rowBrandLayer), brandRegistered: rows.some((r) => r.brand_registered) };
}
export function enableBrandLayer(db, userId, storeId, layerCode, body) {
  const cur = db.prepare('SELECT * FROM m4_brand_defense_layers WHERE user_id=? AND store_id=? AND layer_code=?').get(userId, storeId, layerCode);
  if (!cur) return null;
  db.prepare(`UPDATE m4_brand_defense_layers SET status='enabled', bound_strategy_ids=?, bound_campaign_ids=?, updated_at=? WHERE id=?`).run(
    J(body.boundStrategyIds || tryJSON(cur.bound_strategy_ids, [])),
    J(body.boundCampaignIds || tryJSON(cur.bound_campaign_ids, [])),
    nowIso(), cur.id
  );
  auditM4(userId, storeId, 'ENABLE_BRAND_DEFENSE_LAYER', 'brand_layer', cur.id, { previousValues: { status: cur.status }, layerCode });
  return rowBrandLayer(db.prepare('SELECT * FROM m4_brand_defense_layers WHERE id=?').get(cur.id));
}
export function disableBrandLayer(db, userId, storeId, layerCode, body) {
  const cur = db.prepare('SELECT * FROM m4_brand_defense_layers WHERE user_id=? AND store_id=? AND layer_code=?').get(userId, storeId, layerCode);
  if (!cur) return null;
  db.prepare(`UPDATE m4_brand_defense_layers SET status='disabled', updated_at=? WHERE id=?`).run(nowIso(), cur.id);
  auditM4(userId, storeId, 'DISABLE_BRAND_DEFENSE_LAYER', 'brand_layer', cur.id, { previousValues: { status: cur.status }, reason: body.reason });
  return rowBrandLayer(db.prepare('SELECT * FROM m4_brand_defense_layers WHERE id=?').get(cur.id));
}
export function counterBrand(db, userId, storeId, body) {
  if (!body.term || body.bidIncrease == null) return { error: 'validation_failed', message: 'term/bidIncrease required' };
  const bid = Number(body.bidIncrease);
  // 安全不变量(1): M4 品牌反攻不得直写 lx_targetings.bid。改为产出 ad_action_queue intent
  // (M4_BRAND_COUNTER_BID, dryRun=1/auditRequired=1/guardrail needs_review), 由 M3 审计/审批/
  // 回滚接管。这里只解析"将被影响"的 targeting, 不做任何真实写入。
  const targets = db.prepare(`SELECT id, bid FROM lx_targetings WHERE user_id=? AND store_id=? AND term LIKE ?`).all(userId, storeId, '%' + body.term + '%');
  const affectedTargetingIds = targets.map((t) => t.id);
  const queuedActionId = enqueueAdAction(db, userId, storeId, {
    typedAction: 'M4_BRAND_COUNTER_BID',
    severity: 'P1',
    sourceModule: 'M4',
    sourceEvent: 'BRAND_COUNTER_ATTACK',
    entity: { kind: 'keyword_set', term: body.term, targetingIds: affectedTargetingIds },
    payload: {
      term: body.term, bidIncrease: bid, affectedTargetingIds,
      // bid 调整方案仅作为审批后由 M3 执行的建议值, 非已写入。
      proposedBidDelta: bid,
    },
    // requiresRealStoreWrite 由 enqueueAdAction 在非 real 模式强制 false; dryRun 默认 ON。
  });
  // mark any L4 layer as last_counter_at (本地防御层状态, 非广告外部写)
  db.prepare(`UPDATE m4_brand_defense_layers SET last_counter_at=?, updated_at=? WHERE user_id=? AND store_id=? AND layer_code='L4_COUNTER_MONITOR'`).run(nowIso(), nowIso(), userId, storeId);
  auditM4(userId, storeId, 'M4_BRAND_COUNTER_BID', 'keyword_set', body.term, { bidIncrease: bid, affectedTargetingIds, queuedActionId });
  emitNotification(db, userId, storeId, {
    severity: 'P1', sourceModule: 'M4D', sourceEvent: 'BRAND_COUNTER_ATTACK',
    title: `品牌词反攻击已进入审计队列: ${body.term}`, body: `建议加价 +$${bid}; 待审批后影响 ${affectedTargetingIds.length} 条 targeting`,
    relatedResourceType: 'brand_term', relatedResourceId: body.term,
  });
  // updatedTargetingIds 保留为"将被影响"的 targeting id 列表(向后兼容路由契约), 但它们尚未被写入。
  return { updatedTargetingIds: affectedTargetingIds, queuedActionId, queued: true, dryRun: true };
}

// ============================================================
// Notifications
// ============================================================
export function listNotifications(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m4_notifications WHERE user_id=? AND store_id=?';
  const p = [userId, storeId];
  if (filters.severity) { sql += ' AND severity=?'; p.push(filters.severity); }
  if (filters.source) { sql += ' AND source_module=?'; p.push(filters.source); }
  if (filters.since) { sql += ' AND created_at>=?'; p.push(filters.since); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const rows = db.prepare(sql).all(...p);
  // N3-notif-store-isolation: read-state is per (user_id, store_id, notif_id). Scope the
  // read map to this store so a read flag from storeA never leaks onto storeB's list.
  const reads = db.prepare('SELECT notif_id, read_at FROM notifications_read WHERE user_id=? AND store_id=?').all(userId, storeId);
  const readMap = Object.fromEntries(reads.map((r) => [r.notif_id, r.read_at]));
  let items = rows.map((r) => rowNotification(r, readMap));
  if (filters.unread === '1' || filters.unread === 'true' || filters.unread === true) {
    items = items.filter((n) => !n.readAt);
  }
  const unread = rows.filter((r) => !readMap[r.id]).length;
  const summary = {
    unread,
    p0: rows.filter((r) => r.severity === 'P0').length,
    p1: rows.filter((r) => r.severity === 'P1').length,
    p2: rows.filter((r) => r.severity === 'P2').length,
  };
  return { items, summary };
}
export function createNotification(db, userId, storeId, body) {
  if (!body.title || !body.severity || !body.sourceModule) return { error: 'validation_failed', message: 'title/severity/sourceModule required' };
  return emitNotification(db, userId, storeId, body);
}
export function markNotificationRead(db, userId, storeId, id) {
  // M4-P2-01: ownership guard — a notification id must belong to this user+store before
  // it can be marked read. Cross-store / unknown ids return not_found (route → 404).
  const owned = db.prepare('SELECT id FROM m4_notifications WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!owned) return { error: 'not_found', message: 'notification not found' };
  // N3-notif-store-isolation: write the read flag into this store's dimension. The
  // ownership guard above already proved the notif belongs to (user, store).
  db.prepare('INSERT OR IGNORE INTO notifications_read(user_id, store_id, notif_id, read_at) VALUES (?,?,?,?)').run(userId, storeId, id, nowIso());
  return { id, readAt: nowIso() };
}
export function markAllNotificationsRead(db, userId, storeId) {
  const all = db.prepare('SELECT id FROM m4_notifications WHERE user_id=? AND store_id=?').all(userId, storeId);
  let n = 0;
  for (const r of all) {
    // N3-notif-store-isolation: only this store's notifications are marked, into this
    // store's read dimension.
    const res = db.prepare('INSERT OR IGNORE INTO notifications_read(user_id, store_id, notif_id, read_at) VALUES (?,?,?,?)').run(userId, storeId, r.id, nowIso());
    n += res.changes || 0;
  }
  return { markedCount: n };
}
export function unreadNotificationCount(db, userId, storeId) {
  // N3-notif-store-isolation: the read-state correlation now matches on store_id too, so
  // marking a notif read in storeA does not decrement storeB's unread count.
  const row = db.prepare(`SELECT COUNT(*) AS n FROM m4_notifications n WHERE n.user_id=? AND n.store_id=? AND NOT EXISTS (SELECT 1 FROM notifications_read r WHERE r.user_id=n.user_id AND r.store_id=n.store_id AND r.notif_id=n.id)`).get(userId, storeId);
  return { unreadCount: row?.n || 0 };
}

// ============================================================
// Revert dispatch
// ============================================================
export function revertM4Action(db, userId, storeId, r) {
  if (!r) return false;
  let parsed = {};
  try { parsed = JSON.parse(r.payload || '{}'); } catch {}
  // M4 audit helper nests domain fields under .payload (see appendM4Audit in this file).
  // M3-style flat logs (no .payload subobject) are accepted via fallback for forward-compat.
  const payload = (parsed && typeof parsed.payload === 'object' && parsed.payload !== null) ? parsed.payload : parsed;
  // M4-P0-04: strip the _MANUAL suffix so manual external-submission variants
  // (SUBMIT_APPEAL_MANUAL / SUBMIT_IP_COMPLAINT_MANUAL / SEND_RECOVERY_EMAIL_MANUAL /
  // HIJACK_START_TESTBUY_MANUAL …) land on their existing base-case inverse instead of
  // silently falling through to the no-match fallback (which returns false).
  const rawActionType = r.action_type;
  const actionType = rawActionType.replace(/_MANUAL$/, '');
  const resourceId = r.resource_id;
  // Explicitly-non-revertible (terminal scan / no-op) actions resolve via the whitelist
  // so the coverage gate is satisfied without forging a fake inverse write.
  if (REVERT_NON_REVERTIBLE_WHITELIST.has(actionType) || REVERT_NON_REVERTIBLE_WHITELIST.has(rawActionType)) {
    return true;
  }
  switch (actionType) {
    case 'ANOMALY_CREATE': {
      db.prepare('DELETE FROM m4_sla_events WHERE user_id=? AND store_id=? AND anomaly_id=?').run(userId, storeId, resourceId);
      const res = db.prepare('DELETE FROM m4_anomalies WHERE id=? AND user_id=? AND store_id=?').run(resourceId, userId, storeId);
      return res.changes > 0;
    }
    case 'ANOMALY_ASSIGN': {
      const prev = payload.previousValues || {};
      db.prepare(`UPDATE m4_anomalies SET assignee_user_id=?, assignee_label=?, status=?, updated_at=? WHERE id=?`).run(
        prev.assigneeUserId || null, prev.assigneeLabel || null, prev.status || 'open', nowIso(), resourceId
      );
      return true;
    }
    case 'ANOMALY_ACK': {
      db.prepare('UPDATE m4_anomalies SET acknowledged_at=NULL, updated_at=? WHERE id=?').run(nowIso(), resourceId);
      return true;
    }
    case 'ANOMALY_RESOLVE': {
      const prev = payload.previousValues || {};
      db.prepare(`UPDATE m4_anomalies SET status=?, resolved_at=?, resolution_case_id=?, updated_at=? WHERE id=?`).run(
        prev.status || 'investigating', prev.resolvedAt || null, prev.resolutionCaseId || null, nowIso(), resourceId
      );
      return true;
    }
    case 'ANOMALY_DISMISS':
    case 'ANOMALY_ESCALATE': {
      const prev = payload.previousValues || {};
      db.prepare('UPDATE m4_anomalies SET status=?, updated_at=? WHERE id=?').run(prev.status || 'open', nowIso(), resourceId);
      return true;
    }
    case 'CASE_CREATE': {
      const res = db.prepare('DELETE FROM m4_resolution_cases WHERE id=? AND user_id=? AND store_id=?').run(resourceId, userId, storeId);
      return res.changes > 0;
    }
    case 'CASE_UPDATE': {
      const before = payload.before || {};
      const fields = [], p = [];
      const map = { status: 'status', outcome: 'outcome', outcomeScore: 'outcome_score', scenario: 'scenario', actionPlan: 'action_plan' };
      for (const [k, c] of Object.entries(map)) if (before[k] !== undefined) { fields.push(`${c}=?`); p.push(before[k]); }
      if (before.reusable !== undefined) { fields.push('reusable=?'); p.push(before.reusable ? 1 : 0); }
      if (!fields.length) return false;
      fields.push('updated_at=?'); p.push(nowIso());
      p.push(resourceId, userId, storeId);
      db.prepare(`UPDATE m4_resolution_cases SET ${fields.join(',')} WHERE id=? AND user_id=? AND store_id=?`).run(...p);
      return true;
    }
    case 'POSTMORTEM_GENERATE': {
      db.prepare('DELETE FROM m4_postmortems WHERE id=? AND user_id=? AND store_id=?').run(resourceId, userId, storeId);
      return true;
    }
    case 'POSTMORTEM_UPDATE': {
      const before = payload.before || {};
      const fields = [], p = [];
      if (before.verdict !== undefined) { fields.push('verdict=?'); p.push(before.verdict); }
      if (before.improvements !== undefined) { fields.push('improvements=?'); p.push(J(before.improvements)); }
      if (before.title !== undefined) { fields.push('title=?'); p.push(before.title); }
      if (!fields.length) return false;
      fields.push('updated_at=?'); p.push(nowIso());
      p.push(resourceId, userId, storeId);
      db.prepare(`UPDATE m4_postmortems SET ${fields.join(',')} WHERE id=? AND user_id=? AND store_id=?`).run(...p);
      return true;
    }
    case 'HIJACK_SCAN':
    case 'COMPETITOR_SNAPSHOT':
    case 'IMAGE_DIFF_SCAN':
    case 'TREND_SNAPSHOT': {
      const ids = payload.createdIds || [];
      const table = actionType === 'HIJACK_SCAN' ? 'm4_hijacking'
        : actionType === 'COMPETITOR_SNAPSHOT' ? 'm4_competitor_snapshots'
        : actionType === 'IMAGE_DIFF_SCAN' ? 'm4_image_diffs'
        : 'm4_review_trend_snapshots';
      let n = 0;
      for (const id of ids) {
        n += db.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=? AND store_id=?`).run(id, userId, storeId).changes;
      }
      return n > 0;
    }
    case 'M3_PAUSE_ADS_FROM_M4': {
      const paused = payload.pausedCampaignIds || [];
      for (const cid of paused) {
        db.prepare(`UPDATE lx_campaigns SET enabled=1, state='启用', service_state='正在投放', updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(nowIso(), cid, userId, storeId);
      }
      return paused.length > 0;
    }
    case 'M3_RESUME_ADS_FROM_M4': {
      const resumed = payload.resumedCampaignIds || [];
      for (const cid of resumed) {
        db.prepare(`UPDATE lx_campaigns SET enabled=0, state='已暂停', service_state='广告活动已暂停', updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(nowIso(), cid, userId, storeId);
      }
      return resumed.length > 0;
    }
    // M4-P0-04: hijacking action inverses. _MANUAL variants are already stripped above.
    case 'HIJACK_START_TESTBUY': {
      // revert: in_transit → back to pending_test_buy
      db.prepare(`UPDATE m4_hijacking SET status='pending_test_buy', test_buy_order_id=NULL, updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(nowIso(), resourceId, userId, storeId);
      return true;
    }
    case 'HIJACK_CONFIRM_COUNTERFEIT': {
      // revert: drop the auto-drafted appeal + restore to test_buy_in_transit. The M3 pause
      // is queued (dry-run) and undone via its own M3_PAUSE_ADS_FROM_M4 audit row.
      const appealId = payload.appealId;
      if (appealId) db.prepare('DELETE FROM m4_appeals WHERE id=? AND user_id=? AND store_id=?').run(appealId, userId, storeId);
      db.prepare(`UPDATE m4_hijacking SET status='test_buy_in_transit', appeal_id=NULL, updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(nowIso(), resourceId, userId, storeId);
      return true;
    }
    case 'HIJACK_CONFIRM_GENUINE': {
      db.prepare(`UPDATE m4_hijacking SET status='test_buy_in_transit', updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(nowIso(), resourceId, userId, storeId);
      return true;
    }
    case 'HIJACK_SUBMIT_APPEAL': {
      // revert: appeal_submitted → test_buy_received
      db.prepare(`UPDATE m4_hijacking SET status='test_buy_received', updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(nowIso(), resourceId, userId, storeId);
      return true;
    }
    case 'HIJACK_CLOSE': {
      // revert: re-open from closed. We cannot infer the exact prior status, so re-open to
      // a safe active state; the forward close path remains the documented resume mechanism.
      db.prepare(`UPDATE m4_hijacking SET status='test_buy_received', updated_at=? WHERE id=? AND user_id=? AND store_id=?`).run(nowIso(), resourceId, userId, storeId);
      return true;
    }
    case 'INFRINGEMENT_CREATE': {
      db.prepare('DELETE FROM m4_infringement WHERE id=? AND user_id=? AND store_id=?').run(resourceId, userId, storeId);
      return true;
    }
    case 'DRAFT_IP_COMPLAINT': {
      const prev = payload.previousValues || {};
      db.prepare(`UPDATE m4_infringement SET status=?, draft_content=NULL, legal_disclaimer_ack=0, updated_at=? WHERE id=?`).run(prev.status || 'investigating', nowIso(), resourceId);
      return true;
    }
    case 'SUBMIT_IP_COMPLAINT': {
      db.prepare(`UPDATE m4_infringement SET status='draft', submitted_at=NULL, amazon_complaint_id=NULL, updated_at=? WHERE id=?`).run(nowIso(), resourceId);
      return true;
    }
    case 'IP_COMPLAINT_RESOLVE': {
      const prev = payload.previousValues || {};
      db.prepare('UPDATE m4_infringement SET status=?, resolved_at=NULL, updated_at=? WHERE id=?').run(prev.status || 'submitted', nowIso(), resourceId);
      return true;
    }
    case 'REVIEW_MARK_APPEAL': {
      const prev = payload.previousValues || {};
      db.prepare('UPDATE reviews SET appeal_eligible=?, updated_at=? WHERE id=?').run(prev.appealEligible ? 1 : 0, nowIso(), resourceId);
      return true;
    }
    case 'DRAFT_REVIEW_APPEAL':
    case 'APPEAL_RETRY': {
      db.prepare('DELETE FROM m4_appeals WHERE id=? AND user_id=? AND store_id=?').run(resourceId, userId, storeId);
      return true;
    }
    case 'SUBMIT_APPEAL': {
      const prev = payload.previousValues || {};
      db.prepare(`UPDATE m4_appeals SET status=?, submitted_at=NULL, amazon_case_id=NULL, updated_at=? WHERE id=?`).run(prev.status || 'draft', nowIso(), resourceId);
      return true;
    }
    case 'APPEAL_REVIEW': {
      const prev = payload.previousValues || {};
      db.prepare(`UPDATE m4_appeals SET status=?, amazon_response=NULL, reviewed_at=NULL, updated_at=? WHERE id=?`).run(prev.status || 'submitted', nowIso(), resourceId);
      return true;
    }
    case 'DRAFT_RECOVERY_EMAIL':
    case 'RECOVERY_NEXT_ROUND': {
      db.prepare('DELETE FROM m4_recovery_emails WHERE id=? AND user_id=? AND store_id=?').run(resourceId, userId, storeId);
      return true;
    }
    case 'SEND_RECOVERY_EMAIL': {
      const prev = payload.previousValues || {};
      db.prepare(`UPDATE m4_recovery_emails SET status=?, sent_at=NULL, updated_at=? WHERE id=?`).run(prev.status || 'draft', nowIso(), resourceId);
      return true;
    }
    case 'RECOVERY_REPLY': {
      db.prepare(`UPDATE m4_recovery_emails SET status='marked_sent', replied_at=NULL, replied_body=NULL, review_updated=0, new_rating=NULL, updated_at=? WHERE id=?`).run(nowIso(), resourceId);
      return true;
    }
    case 'COMPETITOR_ADD': {
      db.prepare('DELETE FROM m4_competitor_snapshots WHERE id=? AND user_id=? AND store_id=?').run(payload.id || resourceId, userId, storeId);
      return true;
    }
    case 'COMPETITOR_DISMISS_CHANGE': {
      const last = db.prepare('SELECT * FROM m4_competitor_snapshots WHERE user_id=? AND store_id=? AND competitor_asin=? ORDER BY snapshot_at DESC LIMIT 1').get(userId, storeId, resourceId);
      if (!last) return false;
      const changes = tryJSON(last.listing_changes, []);
      const idx = Number(payload.changeIdx || 0);
      if (changes[idx]) { delete changes[idx].dismissed; delete changes[idx].dismissReason; }
      db.prepare('UPDATE m4_competitor_snapshots SET listing_changes=? WHERE id=?').run(J(changes), last.id);
      return true;
    }
    case 'IMAGE_DIFF_PUSH_M1': {
      const tid = payload.m1TargetId;
      if (tid) db.prepare('DELETE FROM m1_optimization_targets WHERE id=? AND user_id=? AND store_id=?').run(tid, userId, storeId);
      db.prepare(`UPDATE m4_image_diffs SET status='new', pushed_m1_target_id=NULL, updated_at=? WHERE id=?`).run(nowIso(), resourceId);
      return true;
    }
    case 'CLUSTER_PUSH_M1': {
      const tid = payload.m1TargetId;
      if (tid) db.prepare('DELETE FROM m1_optimization_targets WHERE id=? AND user_id=? AND store_id=?').run(tid, userId, storeId);
      db.prepare(`UPDATE m4_review_clusters SET status='new', pushed_m1_target_ids=?, updated_at=? WHERE id=?`).run(J([]), nowIso(), resourceId);
      return true;
    }
    case 'PUSH_M1_IMPROVEMENT': {
      const tid = resourceId;
      db.prepare('DELETE FROM m1_optimization_targets WHERE id=? AND user_id=? AND store_id=?').run(tid, userId, storeId);
      return true;
    }
    case 'ENABLE_BRAND_DEFENSE_LAYER':
    case 'DISABLE_BRAND_DEFENSE_LAYER': {
      const prev = payload.previousValues || {};
      db.prepare(`UPDATE m4_brand_defense_layers SET status=?, updated_at=? WHERE id=?`).run(prev.status || 'disabled', nowIso(), resourceId);
      return true;
    }
    case 'BRAND_COUNTER_ATTACK': {
      const bid = Number(payload.bidIncrease || 0);
      const ids = payload.updatedTargetingIds || [];
      for (const tid of ids) {
        db.prepare('UPDATE lx_targetings SET bid=bid - ?, updated_at=? WHERE id=?').run(bid, nowIso(), tid);
      }
      return ids.length > 0;
    }
    default:
      return false;
  }
}

// ============================================================
// Cleanup tables
// ============================================================
export const MONITOR_TABLES_TO_CLEAN = [
  'm4_anomalies', 'm4_sla_events', 'm4_resolution_cases', 'm4_postmortems',
  'm4_hijacking', 'm4_infringement', 'm4_review_clusters', 'm4_review_trend_snapshots',
  'm4_appeals', 'm4_recovery_emails', 'm4_competitor_snapshots', 'm4_image_diffs',
  'm4_brand_defense_layers', 'm4_notifications',
];

// ============================================================
// Seeding (deterministic)
// ============================================================
export function seedMonitorForUser(db, userId, storeId) {
  const seedTag = hashStr(userId + '::' + storeId + '::m4');
  const rng = mulberry32(seedTag);
  const now = nowIso();

  const tx = db.transaction(() => {
    // ---------- m4_anomalies (12) ----------
    const anomalies = [
      { code: 'A4_BB_LOST', sev: 'P0', cat: 'buybox', sku: 'CASE-001', asin: 'B0CASE001', title: 'Buy Box 丢失 12 小时' },
      { code: 'A8_REFUND_SPIKE', sev: 'P0', cat: 'refund', sku: 'CABLE-002', asin: 'B0CABLE002', title: '退款激增 +180% 1h' },
      { code: 'A1_SALES_DROP', sev: 'P0', cat: 'conversion', sku: 'CASE-001', asin: 'B0CASE001', title: '销量崩盘 -65% 24h' },
      { code: 'A11_HIJACK', sev: 'P0', cat: 'hijack', sku: null, asin: 'B0CASE001', title: '跟卖检测到低价跟卖方' },
      { code: 'A12_ODR', sev: 'P0', cat: 'account_health', sku: null, asin: null, title: '账号 ODR 突破阈值 1.2%' },
      { code: 'A2_TRAFFIC_DROP', sev: 'P1', cat: 'traffic', sku: 'CASE-001', asin: 'B0CASE001', title: '自然流量 -40%' },
      { code: 'A5_AD_ACOS_HIGH', sev: 'P1', cat: 'traffic', sku: 'CABLE-002', asin: 'B0CABLE002', title: 'ACOS 突破 80%' },
      { code: 'A9_INV_LOW', sev: 'P1', cat: 'inventory', sku: 'CASE-001', asin: 'B0CASE001', title: '可售库存 < 14 天' },
      { code: 'A13_NEG_REVIEW', sev: 'P1', cat: 'review', sku: 'CASE-001', asin: 'B0CASE001', title: '新增 1 星评价 3 条' },
      { code: 'A3_CTR_DROP', sev: 'P2', cat: 'traffic', sku: 'CABLE-002', asin: 'B0CABLE002', title: 'CTR 微降 -8%' },
      { code: 'A6_BSR_DROP', sev: 'P2', cat: 'conversion', sku: 'CASE-001', asin: 'B0CASE001', title: 'BSR 跌出前 100' },
      { code: 'A7_KW_DROP', sev: 'P2', cat: 'traffic', sku: 'CABLE-002', asin: 'B0CABLE002', title: '关键词排名下滑' },
    ];
    for (let i = 0; i < anomalies.length; i++) {
      const a = anomalies[i];
      const id = 'm4anom-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      const detected = new Date(Date.now() - (i + 1) * 3600_000).toISOString();
      let status = 'open';
      let resolved = null, ack = null, caseId = null;
      if (i < 3) { status = 'resolved'; resolved = nowIso(); ack = detected; caseId = 'm4rc-' + seedTag.toString(16).slice(0, 6) + '-' + i; }
      else if (i >= 3 && i < 5) { status = 'escalated'; ack = detected; }
      const slaMin = SLA_BY_SEV[a.sev];
      db.prepare(`INSERT OR IGNORE INTO m4_anomalies(
        id, user_id, store_id, anomaly_code, category, severity, status,
        sku, asin, title, evidence, recommended_action, ai_root_cause,
        detected_at, acknowledged_at, resolved_at, sla_minutes, sla_deadline,
        sla_breached, resolution_case_id, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, a.code, a.cat, a.sev, status,
        a.sku, a.asin, a.title,
        J([{ at: detected, metric: a.code, value: -0.5 }]),
        '排查 / 提交申诉 / 调价', a.code === 'A4_BB_LOST' ? '跟卖低价压制' : '自然波动 / 季节性',
        detected, ack, resolved, slaMin, addMinutes(detected, slaMin),
        status === 'escalated' ? 1 : 0,
        caseId, detected
      );
      // SLA events
      db.prepare(`INSERT OR IGNORE INTO m4_sla_events(id, user_id, store_id, anomaly_id, event_type, elapsed_minutes, created_at) VALUES (?,?,?,?,?,?,?)`).run(
        id + '-d', userId, storeId, id, 'detected', 0, detected
      );
      if (ack) {
        db.prepare(`INSERT OR IGNORE INTO m4_sla_events(id, user_id, store_id, anomaly_id, event_type, elapsed_minutes, created_at) VALUES (?,?,?,?,?,?,?)`).run(
          id + '-a', userId, storeId, id, 'acknowledged', elapsedMinutes(detected, ack), ack
        );
      }
      if (resolved) {
        db.prepare(`INSERT OR IGNORE INTO m4_sla_events(id, user_id, store_id, anomaly_id, event_type, elapsed_minutes, created_at) VALUES (?,?,?,?,?,?,?)`).run(
          id + '-r', userId, storeId, id, 'resolved', elapsedMinutes(detected, resolved), resolved
        );
      }
      if (status === 'escalated') {
        db.prepare(`INSERT OR IGNORE INTO m4_sla_events(id, user_id, store_id, anomaly_id, event_type, elapsed_minutes, created_at) VALUES (?,?,?,?,?,?,?)`).run(
          id + '-e', userId, storeId, id, 'escalated', slaMin + 5, addMinutes(detected, slaMin + 5)
        );
      }
    }

    // ---------- m4_resolution_cases (8) ----------
    const cases = [
      { scenario: 'BB 丢失 / 跟卖低价', plan: 'Test Buy → 申诉 → 暂停广告 24h', status: 'successful', reusable: 1, anomalyCode: 'A4_BB_LOST' },
      { scenario: '退款激增', plan: '排查质量 → 暂时下调广告预算', status: 'successful', reusable: 1, anomalyCode: 'A8_REFUND_SPIKE' },
      { scenario: '销量崩盘', plan: '排查 listing → 增加促销 → 评估广告', status: 'successful', reusable: 1, anomalyCode: 'A1_SALES_DROP' },
      { scenario: 'ACOS 超阈值', plan: '负面词 + 降 bid + 暂停高 ACOS', status: 'successful', reusable: 1, anomalyCode: 'A5_AD_ACOS_HIGH' },
      { scenario: '差评爆发', plan: '挽回邮件 + 申诉 + 推送 M1', status: 'successful', reusable: 1, anomalyCode: 'A13_NEG_REVIEW' },
      { scenario: '库存预警', plan: '紧急补货 / 调度 FBA', status: 'partial', reusable: 0, anomalyCode: 'A9_INV_LOW' },
      { scenario: 'CTR 下滑', plan: '更换主图 → A/B 测试', status: 'partial', reusable: 0, anomalyCode: 'A3_CTR_DROP' },
      { scenario: 'BSR 跌出前 100', plan: '加大广告投放 / 优化 listing', status: 'in_progress', reusable: 0, anomalyCode: 'A6_BSR_DROP' },
    ];
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const id = 'm4rc-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      db.prepare(`INSERT OR IGNORE INTO m4_resolution_cases(
        id, user_id, store_id, anomaly_id, anomaly_code, scenario, action_plan,
        outcome, outcome_score, status, reusable, reference_count, tags,
        duration_minutes, created_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, null, c.anomalyCode, c.scenario, c.plan,
        c.status === 'successful' ? '问题解决，恢复正常' : c.status === 'partial' ? '部分恢复' : '处理中',
        c.status === 'successful' ? 0.9 : c.status === 'partial' ? 0.6 : 0.4,
        c.status, c.reusable, 0, J([c.anomalyCode]),
        c.status === 'in_progress' ? null : 180, now, c.status === 'in_progress' ? null : now
      );
    }

    // ---------- m4_postmortems (3) ----------
    const pms = [
      { title: '5 月 BB 危机复盘', verdict: 'successful', anomalyIdxs: [0, 3], caseIdxs: [0] },
      { title: '退款激增事件复盘', verdict: 'partial', anomalyIdxs: [1], caseIdxs: [1] },
      { title: '差评爆发草稿复盘', verdict: 'draft', anomalyIdxs: [8], caseIdxs: [4] },
    ];
    for (let i = 0; i < pms.length; i++) {
      const p = pms[i];
      const id = 'm4pm-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      const anomalyIds = p.anomalyIdxs.map((idx) => 'm4anom-' + seedTag.toString(16).slice(0, 6) + '-' + idx);
      const caseIds = p.caseIdxs.map((idx) => 'm4rc-' + seedTag.toString(16).slice(0, 6) + '-' + idx);
      db.prepare(`INSERT OR IGNORE INTO m4_postmortems(
        id, user_id, store_id, title, event_date, anomaly_ids, resolution_case_ids,
        loss_estimate, root_cause, resolution, verdict, improvements, timeline,
        generated_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, p.title, now.slice(0, 10), J(anomalyIds), J(caseIds),
        Math.round(rng() * 5000), '跟卖 + 自然波动', '及时处置 + 复盘沉淀',
        p.verdict,
        J(['SLA 阈值收紧', '提高监控频率', '完善 Test Buy 流程']),
        J([{ at: now, event: 'detected', note: '触发监控' }, { at: now, event: 'resolved', note: '处置完成' }]),
        'auto', now
      );
    }

    // ---------- m4_hijacking (4) ----------
    const hijacks = [
      { status: 'pending_test_buy', type: 'price_competition', asin: 'B0CASE001', paused: 0 },
      { status: 'test_buy_in_transit', type: 'counterfeit_suspect', asin: 'B0CABLE002', paused: 0 },
      { status: 'test_buy_received', type: 'counterfeit_confirmed', asin: 'B0CASE001', paused: 1 },
      { status: 'closed', type: 'genuine_authorized', asin: 'B0CABLE002', paused: 0 },
    ];
    for (let i = 0; i < hijacks.length; i++) {
      const h = hijacks[i];
      const id = 'm4hj-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      const detected = new Date(Date.now() - (i + 1) * 7200_000).toISOString();
      db.prepare(`INSERT OR IGNORE INTO m4_hijacking(
        id, user_id, store_id, asin, sku, hijacker_seller, hijacker_price, our_price,
        detected_at, duration_min, type, status, test_buy_order_id,
        proof_images, estimated_loss_per_hour, m3_ads_paused, m3_pause_dedup_key, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, h.asin, null, 'Seller-' + (i + 100),
        Math.round((9.99 + rng() * 5) * 100) / 100, Math.round((19.99 + rng() * 5) * 100) / 100,
        detected, (i + 1) * 60, h.type, h.status,
        h.status !== 'pending_test_buy' ? 'TB-' + (1000 + i) : null,
        J([]), Math.round(rng() * 30 * 100) / 100, h.paused,
        h.paused ? `hj-${h.asin}-${detected.slice(0, 10)}` : null, detected
      );
    }

    // ---------- m4_infringement (3) ----------
    const inf = [
      { asin: 'B0CASE001', type: 'trademark', status: 'draft' },
      { asin: 'B0CABLE002', type: 'patent', status: 'submitted' },
      { asin: 'B0CASE001', type: 'counterfeit', status: 'resolved' },
    ];
    for (let i = 0; i < inf.length; i++) {
      const x = inf[i];
      const id = 'm4inf-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      const detected = new Date(Date.now() - (i + 1) * 86400_000).toISOString();
      db.prepare(`INSERT OR IGNORE INTO m4_infringement(
        id, user_id, store_id, asin, type, source, description, severity, status,
        draft_content, amazon_complaint_id, detected_at, submitted_at, resolved_at,
        legal_disclaimer_ack, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, x.asin, x.type, 'amazon_brand_registry',
        '检测到第三方使用我方商标', 'high', x.status,
        x.status === 'draft' ? '[草稿] 投诉内容...' : null,
        x.status === 'submitted' ? 'IP-2026-' + i : null,
        detected, x.status === 'submitted' || x.status === 'resolved' ? detected : null,
        x.status === 'resolved' ? nowIso() : null,
        x.status !== 'investigating' ? 1 : 0, detected
      );
    }

    // ---------- reviews ALTER fields (update existing) ----------
    try {
      const existingReviews = db.prepare('SELECT id, rating FROM reviews WHERE user_id=? AND store_id=?').all(userId, storeId);
      for (const r of existingReviews) {
        const sentiment = r.rating <= 2 ? 'negative' : r.rating === 3 ? 'neutral' : 'positive';
        const appeal = sentiment === 'negative' && rng() > 0.5 ? 1 : 0;
        db.prepare(`UPDATE reviews SET sentiment=COALESCE(sentiment, ?), appeal_eligible=COALESCE(appeal_eligible, ?), asin=COALESCE(asin, 'B0CASE001'), recovery_status=COALESCE(recovery_status, 'n/a') WHERE id=?`).run(sentiment, appeal, r.id);
      }
    } catch {}

    // ---------- m4_review_clusters (6) ----------
    const clusters = [
      { name: '按钮松动', sentiment: 'negative', root: 'product_quality' },
      { name: '包装破损', sentiment: 'negative', root: 'packaging' },
      { name: '充电慢', sentiment: 'negative', root: 'expectation_mgmt' },
      { name: '尺寸偏小', sentiment: 'negative', root: 'listing_issue' },
      { name: '说明不清', sentiment: 'negative', root: 'documentation' },
      { name: '颜值高', sentiment: 'positive', root: 'highlight' },
    ];
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const id = 'm4cl-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      const count = 5 + Math.floor(rng() * 10);
      const status = i < 2 ? 'pushed' : 'new';
      db.prepare(`INSERT OR IGNORE INTO m4_review_clusters(
        id, user_id, store_id, asin, name, sentiment, root_cause,
        count, percent, samples, improvements, estimated_rating_lift, confidence,
        status, pushed_m1_target_ids, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, 'B0CASE001', c.name, c.sentiment, c.root,
        count, Math.round((count / 100) * 100) / 100,
        J(['样本评论 1...', '样本评论 2...']),
        J([{ layer: 'listing', action: '更新 5 点描述' }, { layer: 'manufacturer', action: '联系供应商' }]),
        Math.round((rng() * 0.5) * 10) / 10, Math.round((0.7 + rng() * 0.25) * 100) / 100,
        status, J([]), now
      );
    }

    // ---------- m4_review_trend_snapshots (3 asin × 30 days = 90) ----------
    const trendAsins = ['B0CASE001', 'B0CABLE002', 'B0SCAN001'];
    for (const asin of trendAsins) {
      for (let d = 0; d < 30; d++) {
        const date = new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
        const id = 'm4rts-' + seedTag.toString(16).slice(0, 6) + '-' + asin.slice(-4) + '-' + d;
        const avg = asin === 'B0CASE001' ? 4.6 - d * 0.02 : 4.0 + rng() * 0.3;
        db.prepare(`INSERT OR IGNORE INTO m4_review_trend_snapshots(
          id, user_id, store_id, asin, snapshot_date,
          avg_rating, total_reviews, added_7d, avg_7d, added_30d, avg_30d,
          trend, trend_delta, distribution, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          id, userId, storeId, asin, date,
          Math.round(avg * 10) / 10, 100 + d * 2,
          5 + Math.floor(rng() * 10), Math.round(avg * 10) / 10,
          20 + Math.floor(rng() * 20), Math.round(avg * 10) / 10,
          asin === 'B0CASE001' ? 'declining' : 'stable',
          Math.round((rng() - 0.5) * 0.4 * 100) / 100,
          J({ 1: 3, 2: 5, 3: 10, 4: 30, 5: 52 }), now
        );
      }
    }

    // ---------- m4_appeals (6) ----------
    const appeals = [
      { status: 'draft', vt: 'unrelated_to_product' },
      { status: 'draft', vt: 'logistics_unrelated' },
      { status: 'submitted', vt: 'duplicate' },
      { status: 'submitted', vt: 'unrelated_to_product' },
      { status: 'accepted', vt: 'hateful' },
      { status: 'rejected', vt: 'conflict_of_interest' },
    ];
    for (let i = 0; i < appeals.length; i++) {
      const a = appeals[i];
      const id = 'm4ap-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      db.prepare(`INSERT OR IGNORE INTO m4_appeals(
        id, user_id, store_id, review_id, asin, violation_type, confidence,
        draft_content, drafted_at, status, amazon_case_id, submitted_at, reviewed_at,
        amazon_response, retry_count, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, null, 'B0CASE001', a.vt, 0.8,
        '[AI 起草] 违规申诉文案 ' + a.vt, now, a.status,
        ['submitted', 'accepted', 'rejected'].includes(a.status) ? 'AMZ-CASE-' + (2000 + i) : null,
        ['submitted', 'accepted', 'rejected'].includes(a.status) ? now : null,
        ['accepted', 'rejected'].includes(a.status) ? now : null,
        a.status === 'rejected' ? 'Insufficient evidence' : (a.status === 'accepted' ? 'Approved' : null),
        a.status === 'rejected' ? 1 : 0, now
      );
    }

    // ---------- m4_recovery_emails (5) ----------
    const recoveries = [
      { status: 'pending', round: 1 },
      { status: 'draft', round: 1 },
      { status: 'sent', round: 1 },
      { status: 'sent', round: 2 },
      { status: 'review_updated', round: 2 },
    ];
    for (let i = 0; i < recoveries.length; i++) {
      const r = recoveries[i];
      const id = 'm4re-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      db.prepare(`INSERT OR IGNORE INTO m4_recovery_emails(
        id, user_id, store_id, review_id, asin, author, rating, template_id,
        subject, body, preview, round_no, status, drafted_at, sent_at,
        replied_at, replied_body, review_updated, old_rating, new_rating, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, null, 'B0CASE001', 'Reviewer-' + i, 2, 'tpl-apology',
        '关于您的评价', '您好，我们注意到您给出了 2 星评价...',
        '您好，我们注意到您给出了 2 星评价...', r.round, r.status, now,
        r.status === 'sent' || r.status === 'review_updated' ? now : null,
        r.status === 'review_updated' ? now : null,
        r.status === 'review_updated' ? '感谢您的回复，已更新评分' : null,
        r.status === 'review_updated' ? 1 : 0,
        r.status === 'review_updated' ? 2 : null,
        r.status === 'review_updated' ? 4 : null,
        now
      );
    }

    // ---------- m4_competitor_snapshots (2 × 7 days = 14) ----------
    const compAsins = ['B0YYYY1', 'B0ZZZZ1'];
    for (const casin of compAsins) {
      for (let d = 0; d < 7; d++) {
        const id = 'm4cs-' + seedTag.toString(16).slice(0, 6) + '-' + casin.slice(-4) + '-' + d;
        const snapAt = new Date(Date.now() - d * 86400_000).toISOString();
        const price = casin === 'B0YYYY1' ? 18 + rng() * 6 : 22 + rng() * 2;
        const changes = casin === 'B0YYYY1' && d === 2 ? [{ dimension: 'price', from: 22.99, to: 18.99, strategy: 'price_cut', interpretation: '竞品大幅降价 -17%' }] : [];
        db.prepare(`INSERT OR IGNORE INTO m4_competitor_snapshots(
          id, user_id, store_id, competitor_asin, our_asin, snapshot_at,
          title, price, bsr, rating, review_count, ad_positions, listing_changes, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          id, userId, storeId, casin, 'B0CASE001', snapAt,
          '竞品 ' + casin, Math.round(price * 100) / 100,
          1500 + Math.floor(rng() * 500),
          Math.round((4.0 + rng() * 0.7) * 10) / 10,
          200 + Math.floor(rng() * 50),
          J([]), J(changes), snapAt
        );
      }
    }

    // ---------- m4_image_diffs (3) ----------
    const diffs = [
      { role: 'main', status: 'new', asin: 'B0YYYY1' },
      { role: 'gallery_3', status: 'pushed', asin: 'B0YYYY1' },
      { role: 'a_plus_2', status: 'new', asin: 'B0ZZZZ1' },
    ];
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i];
      const id = 'm4imd-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      db.prepare(`INSERT OR IGNORE INTO m4_image_diffs(
        id, user_id, store_id, competitor_asin, image_role,
        old_image_url, new_image_url, phash_distance, change_type,
        ai_analysis, strategy_inferred, impact_on_us, detected_at, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, d.asin, d.role,
        `https://mock-cdn/old/${d.asin}/${d.role}.jpg`,
        `https://mock-cdn/new/${d.asin}/${d.role}.jpg`,
        25 + Math.floor(rng() * 30), '主图角标新增',
        '从纯产品图改为强调"防摔"', '差异化主图占位', '我方需要调整主图',
        now, d.status, now
      );
    }

    // ---------- m4_brand_defense_layers (4) ----------
    const layers = [
      { code: 'L1_BRAND_CAMPAIGN', label: '品牌词战役', status: 'enabled' },
      { code: 'L2_LONG_TAIL', label: '长尾防御', status: 'partial' },
      { code: 'L3_SD_SELF', label: '自防御 SD', status: 'disabled' },
      { code: 'L4_COUNTER_MONITOR', label: '反攻击监控', status: 'monitoring' },
    ];
    for (const l of layers) {
      const id = 'm4bd-' + seedTag.toString(16).slice(0, 6) + '-' + l.code.slice(0, 2);
      db.prepare(`INSERT OR IGNORE INTO m4_brand_defense_layers(
        id, user_id, store_id, layer_code, label, detail, status,
        brand_registered, brand_keywords, bound_strategy_ids, bound_campaign_ids,
        created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, l.code, l.label, l.label + ' 详细配置',
        l.status, 1,
        J([
          { term: 'mybrand', impressions7d: 10000, ourBid: 1.2, ourPosition: 1 },
          { term: 'mybrand case', impressions7d: 5000, ourBid: 1.0, ourPosition: 2 },
          { term: 'mybrand cable', impressions7d: 3000, ourBid: 0.8, ourPosition: 3 },
          { term: 'mybrand pro', impressions7d: 2000, ourBid: 0.7, ourPosition: 1 },
          { term: 'mybrand magsafe', impressions7d: 1500, ourBid: 0.9, ourPosition: 1 },
        ]),
        J([]), J([]), now
      );
    }

    // ---------- m4_notifications (8) ----------
    const notifs = [
      { sev: 'P0', src: 'M4A', event: 'BB_LOST', title: 'Buy Box 丢失 12 小时', link: '/monitor/anomalies' },
      { sev: 'P0', src: 'M2', event: 'ROAS_LOSS', title: 'ROAS 持续亏损 5 天', link: '/monitor/anomalies' },
      { sev: 'P0', src: 'M4A', event: 'HIJACK_CONFIRMED', title: '跟卖确认假货 + 广告已暂停', link: '/monitor/hijacking' },
      { sev: 'P1', src: 'M4B', event: 'NEGATIVE_REVIEW', title: '新增 1 星评价', link: '/reviews/list' },
      { sev: 'P1', src: 'M3', event: 'ACOS_HIGH', title: 'ACOS 超 80%', link: '/ads/timeline' },
      { sev: 'P1', src: 'M2', event: 'LTS_30D', title: 'LTS 倒计时 30 天', link: '/inventory' },
      { sev: 'P2', src: 'M4C', event: 'COMPETITOR_PRICE', title: '竞品 B0YYYY1 降价 -17%', link: '/competitors/B0YYYY1' },
      { sev: 'P2', src: 'M1', event: 'LISTING_UPLOAD', title: 'Listing 上传完成', link: '/listings' },
    ];
    for (let i = 0; i < notifs.length; i++) {
      const n = notifs[i];
      const id = 'm4notif-' + seedTag.toString(16).slice(0, 6) + '-' + i;
      const channels = n.sev === 'P0' ? ['in_app', 'email', 'wechat'] : n.sev === 'P1' ? ['in_app', 'email'] : ['in_app'];
      db.prepare(`INSERT OR IGNORE INTO m4_notifications(
        id, user_id, store_id, severity, source_module, source_event,
        title, link, channels, delivery_status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, n.sev, n.src, n.event, n.title, n.link,
        J(channels), J(Object.fromEntries(channels.map((c) => [c, c === 'in_app' ? 'delivered' : 'sent']))),
        new Date(Date.now() - i * 3600_000).toISOString()
      );
    }
  });

  try { tx(); } catch (e) { console.warn('[data-store-monitor] seedMonitorForUser failed:', e?.message); }
}
