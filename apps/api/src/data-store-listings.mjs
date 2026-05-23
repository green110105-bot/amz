// data-store-listings.mjs — M1 商品 Listing 优化模块 SQLite schema + CRUD + 种子数据
// 8 张新表：
//   m1_optimization_targets / m1_research_reports / m1_listing_scores /
//   m1_optimization_runs / m1_listing_versions / m1_generated_images /
//   m1_ab_tests / m1_ab_metrics
//
// 所有写操作走 appendAuditLog (sourceModule='M1')。
//
// 风格严格对齐 data-store-ads.mjs:
//   - initListingsSchema(db) 统一建表
//   - seedListingsForUser(db, userId, storeId) 用确定性 PRNG (mulberry32)
//   - rowToX / X CRUD helpers
//   - LISTINGS_TABLES_TO_CLEAN 给 removeUserStore 用

import { randomBytes, createHash } from 'node:crypto';
import { appendAuditLog } from './data-store.mjs';

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return prefix + '-' + randomBytes(4).toString('hex'); }

// ============================================================
// Deterministic PRNG (mulberry32) — used by seed only
// ============================================================
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// Schema
// ============================================================
export function initListingsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS m1_optimization_targets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      product_id TEXT,
      asin TEXT,
      asin_kind TEXT,
      is_competitor_only INTEGER DEFAULT 0,
      new_category TEXT,
      new_selling_points TEXT,
      new_target_audience TEXT,
      new_price_band TEXT,
      new_physical_specs TEXT,
      new_brand_positioning TEXT,
      new_target_keywords TEXT,
      competitor_pool TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m1_targets_us ON m1_optimization_targets(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m1_targets_status ON m1_optimization_targets(user_id, store_id, status);

    CREATE TABLE IF NOT EXISTS m1_research_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT,
      price_band TEXT,
      source_asins TEXT,
      title_pattern TEXT,
      bullet_structure TEXT,
      main_image_visual TEXT,
      a_plus_structure TEXT,
      review_keywords TEXT,
      cached_until TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m1_research_us ON m1_research_reports(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m1_research_target ON m1_research_reports(user_id, store_id, target_id);

    CREATE TABLE IF NOT EXISTS m1_listing_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      scored_at TEXT NOT NULL,
      total_score INTEGER NOT NULL,
      title_score INTEGER, title_detail TEXT,
      bullets_score INTEGER, bullets_detail TEXT,
      main_image_score INTEGER, main_image_detail TEXT,
      a_plus_score INTEGER, a_plus_detail TEXT,
      reviews_score INTEGER, reviews_detail TEXT,
      improvement_ranking TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m1_scores_us ON m1_listing_scores(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m1_scores_target ON m1_listing_scores(user_id, store_id, target_id);

    CREATE TABLE IF NOT EXISTS m1_optimization_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      round_no INTEGER NOT NULL,
      feedback_text TEXT,
      marked_fields TEXT,
      style_short_long REAL DEFAULT 0.5,
      style_rational_emotional REAL DEFAULT 0.5,
      style_seo_natural REAL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'pending',
      version_id TEXT,
      generation_time_ms INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m1_runs_us ON m1_optimization_runs(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m1_runs_target ON m1_optimization_runs(user_id, store_id, target_id, round_no DESC);

    CREATE TABLE IF NOT EXISTS m1_listing_versions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      run_id TEXT,
      round_no INTEGER NOT NULL,
      source TEXT NOT NULL,
      title TEXT,
      bullet_1 TEXT, bullet_2 TEXT, bullet_3 TEXT, bullet_4 TEXT, bullet_5 TEXT,
      description TEXT,
      a_plus_modules TEXT,
      main_image_id TEXT,
      side_image_ids TEXT,
      a_plus_image_ids TEXT,
      field_picks_hash TEXT,
      is_pinned INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      uploaded_to_amazon INTEGER DEFAULT 0,
      uploaded_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m1_versions_us ON m1_listing_versions(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m1_versions_target ON m1_listing_versions(user_id, store_id, target_id, round_no DESC);

    CREATE TABLE IF NOT EXISTS m1_generated_images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      version_id TEXT,
      slot TEXT NOT NULL,
      prompt TEXT NOT NULL,
      ref_image_url TEXT,
      style_ref_asin TEXT,
      model TEXT DEFAULT 'imagen-2',
      resolution TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      generated_url TEXT,
      post_processed INTEGER DEFAULT 0,
      error_message TEXT,
      generation_time_ms INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m1_images_us ON m1_generated_images(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m1_images_version ON m1_generated_images(user_id, store_id, version_id);

    CREATE TABLE IF NOT EXISTS m1_ab_tests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      asin TEXT NOT NULL,
      test_type TEXT NOT NULL,
      amazon_experiment_id TEXT,
      control_version_id TEXT NOT NULL,
      treatment_version_id TEXT NOT NULL,
      duration_days INTEGER DEFAULT 14,
      started_at TEXT,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      winner TEXT,
      lift REAL,
      significance REAL,
      manual_guidance TEXT,
      audit_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m1_ab_us ON m1_ab_tests(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m1_ab_status ON m1_ab_tests(user_id, store_id, status);

    CREATE TABLE IF NOT EXISTS m1_ab_metrics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      ab_test_id TEXT NOT NULL,
      date TEXT NOT NULL,
      arm TEXT NOT NULL,
      impressions INTEGER, clicks INTEGER, orders INTEGER, units INTEGER,
      ctr REAL, cvr REAL, sales REAL,
      raw TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m1_metrics_us ON m1_ab_metrics(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m1_metrics_test ON m1_ab_metrics(user_id, store_id, ab_test_id, date);
  `);
}

// ============================================================
// Row → object conversion helpers
// ============================================================
function _j(s) { try { return JSON.parse(s); } catch { return null; } }

export function rowToTarget(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_id: r.user_id,
    store_id: r.store_id,
    mode: r.mode,
    product_id: r.product_id,
    asin: r.asin,
    asin_kind: r.asin_kind,
    is_competitor_only: !!r.is_competitor_only,
    isCompetitorOnly: !!r.is_competitor_only,
    new_category: r.new_category,
    new_selling_points: _j(r.new_selling_points) || [],
    new_target_audience: r.new_target_audience,
    new_price_band: r.new_price_band,
    new_physical_specs: _j(r.new_physical_specs),
    new_brand_positioning: r.new_brand_positioning,
    new_target_keywords: _j(r.new_target_keywords) || [],
    competitor_pool: _j(r.competitor_pool) || [],
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    asinKind: r.asin_kind,
  };
}

export function rowToResearch(r) {
  if (!r) return null;
  return {
    id: r.id,
    target_id: r.target_id,
    targetId: r.target_id,
    source: r.source,
    category: r.category,
    price_band: r.price_band,
    source_asins: _j(r.source_asins) || [],
    title_pattern: _j(r.title_pattern),
    bullet_structure: _j(r.bullet_structure),
    main_image_visual: _j(r.main_image_visual),
    a_plus_structure: _j(r.a_plus_structure),
    review_keywords: _j(r.review_keywords),
    cached_until: r.cached_until,
    cachedUntil: r.cached_until,
    created_at: r.created_at,
  };
}

export function rowToScore(r) {
  if (!r) return null;
  return {
    id: r.id,
    target_id: r.target_id,
    targetId: r.target_id,
    scored_at: r.scored_at,
    total_score: r.total_score,
    totalScore: r.total_score,
    title_score: r.title_score, title_detail: _j(r.title_detail),
    bullets_score: r.bullets_score, bullets_detail: _j(r.bullets_detail),
    main_image_score: r.main_image_score, main_image_detail: _j(r.main_image_detail),
    a_plus_score: r.a_plus_score, a_plus_detail: _j(r.a_plus_detail),
    reviews_score: r.reviews_score, reviews_detail: _j(r.reviews_detail),
    improvement_ranking: _j(r.improvement_ranking) || [],
    improvementRanking: _j(r.improvement_ranking) || [],
  };
}

export function rowToRun(r) {
  if (!r) return null;
  return {
    id: r.id,
    target_id: r.target_id,
    targetId: r.target_id,
    round_no: r.round_no,
    roundNo: r.round_no,
    feedback_text: r.feedback_text,
    marked_fields: _j(r.marked_fields) || [],
    markedFields: _j(r.marked_fields) || [],
    style_short_long: r.style_short_long,
    style_rational_emotional: r.style_rational_emotional,
    style_seo_natural: r.style_seo_natural,
    status: r.status,
    version_id: r.version_id,
    versionId: r.version_id,
    generation_time_ms: r.generation_time_ms,
    created_at: r.created_at,
    completed_at: r.completed_at,
  };
}

export function rowToVersion(r) {
  if (!r) return null;
  return {
    id: r.id,
    target_id: r.target_id,
    targetId: r.target_id,
    run_id: r.run_id,
    runId: r.run_id,
    round_no: r.round_no,
    roundNo: r.round_no,
    source: r.source,
    title: r.title,
    bullet_1: r.bullet_1, bullet_2: r.bullet_2, bullet_3: r.bullet_3,
    bullet_4: r.bullet_4, bullet_5: r.bullet_5,
    description: r.description,
    a_plus_modules: _j(r.a_plus_modules),
    main_image_id: r.main_image_id,
    side_image_ids: _j(r.side_image_ids) || [],
    a_plus_image_ids: _j(r.a_plus_image_ids) || [],
    is_pinned: !!r.is_pinned,
    isPinned: !!r.is_pinned,
    is_archived: !!r.is_archived,
    isArchived: !!r.is_archived,
    uploaded_to_amazon: !!r.uploaded_to_amazon,
    uploaded_at: r.uploaded_at,
    created_at: r.created_at,
  };
}

export function rowToImage(r) {
  if (!r) return null;
  return {
    id: r.id,
    target_id: r.target_id,
    targetId: r.target_id,
    version_id: r.version_id,
    versionId: r.version_id,
    slot: r.slot,
    prompt: r.prompt,
    ref_image_url: r.ref_image_url,
    refImageUrl: r.ref_image_url,
    style_ref_asin: r.style_ref_asin,
    styleRefAsin: r.style_ref_asin,
    model: r.model,
    resolution: r.resolution,
    status: r.status,
    generated_url: r.generated_url,
    generatedUrl: r.generated_url,
    post_processed: !!r.post_processed,
    error_message: r.error_message,
    generation_time_ms: r.generation_time_ms,
    created_at: r.created_at,
    completed_at: r.completed_at,
  };
}

export function rowToAbTest(r) {
  if (!r) return null;
  return {
    id: r.id,
    target_id: r.target_id,
    targetId: r.target_id,
    asin: r.asin,
    test_type: r.test_type,
    testType: r.test_type,
    amazon_experiment_id: r.amazon_experiment_id,
    control_version_id: r.control_version_id,
    controlVersionId: r.control_version_id,
    treatment_version_id: r.treatment_version_id,
    treatmentVersionId: r.treatment_version_id,
    duration_days: r.duration_days,
    durationDays: r.duration_days,
    started_at: r.started_at,
    ends_at: r.ends_at,
    status: r.status,
    winner: r.winner,
    lift: r.lift,
    significance: r.significance,
    manual_guidance: r.manual_guidance,
    manualGuidance: r.manual_guidance,
    audit_id: r.audit_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function rowToAbMetric(r) {
  if (!r) return null;
  return {
    id: r.id,
    ab_test_id: r.ab_test_id,
    abTestId: r.ab_test_id,
    date: r.date,
    arm: r.arm,
    impressions: r.impressions,
    clicks: r.clicks,
    orders: r.orders,
    units: r.units,
    ctr: r.ctr,
    cvr: r.cvr,
    sales: r.sales,
  };
}

// ============================================================
// Common: own/external ASIN detection
// ============================================================
export function resolveAsinKind(db, userId, storeId, asin) {
  if (!asin) return 'external';
  const r = db.prepare('SELECT id FROM products WHERE user_id = ? AND store_id = ? AND asin = ? LIMIT 1').get(userId, storeId, asin);
  return r ? 'own' : 'external';
}

// ============================================================
// Targets CRUD
// ============================================================
export function listTargets(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m1_optimization_targets WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.mode) { sql += ' AND mode = ?'; params.push(filters.mode); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(rowToTarget);
}

export function getTarget(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m1_optimization_targets WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  return rowToTarget(r);
}

export function createTarget(db, userId, storeId, body) {
  if (!body || !body.mode) return { error: 'validation_failed', message: 'mode required' };
  if (!['existing', 'asin_input', 'new_listing'].includes(body.mode)) {
    return { error: 'validation_failed', message: 'invalid mode' };
  }
  const id = body.id || newId('m1t');
  const now = nowIso();
  let asin = body.asin || null;
  let productId = body.productId || body.product_id || null;
  let asinKind = null;
  let isCompetitorOnly = 0;

  if (body.mode === 'existing') {
    if (!productId && !asin) {
      return { error: 'validation_failed', message: 'productId or asin required for existing mode' };
    }
    asinKind = 'own';
  } else if (body.mode === 'asin_input') {
    if (!asin) return { error: 'validation_failed', message: 'asin required for asin_input mode' };
    asinKind = resolveAsinKind(db, userId, storeId, asin);
    if (asinKind === 'external') isCompetitorOnly = 1;
    if (asinKind === 'own') {
      // Find product_id for own ASIN
      const own = db.prepare('SELECT id FROM products WHERE user_id = ? AND store_id = ? AND asin = ?').get(userId, storeId, asin);
      if (own) productId = own.id;
    }
  } else if (body.mode === 'new_listing') {
    if (!body.new_category && !body.newCategory) {
      return { error: 'validation_failed', message: 'new_category required for new_listing mode' };
    }
    const sps = body.new_selling_points || body.newSellingPoints || [];
    if (!Array.isArray(sps) || sps.length < 3 || sps.length > 5) {
      return { error: 'validation_failed', message: 'new_selling_points must be 3-5 items' };
    }
  }

  db.prepare(`INSERT INTO m1_optimization_targets(
    id, user_id, store_id, mode, product_id, asin, asin_kind, is_competitor_only,
    new_category, new_selling_points, new_target_audience, new_price_band,
    new_physical_specs, new_brand_positioning, new_target_keywords,
    competitor_pool, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.mode, productId, asin, asinKind, isCompetitorOnly,
    body.new_category || body.newCategory || null,
    JSON.stringify(body.new_selling_points || body.newSellingPoints || []),
    body.new_target_audience || body.newTargetAudience || null,
    body.new_price_band || body.newPriceBand || null,
    JSON.stringify(body.new_physical_specs || body.newPhysicalSpecs || null),
    body.new_brand_positioning || body.newBrandPositioning || null,
    JSON.stringify(body.new_target_keywords || body.newTargetKeywords || []),
    JSON.stringify(body.competitor_pool || body.competitorPool || []),
    body.status || 'draft', now, null
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_TARGET_CREATE',
    resourceType: 'm1_optimization_target', resourceId: id,
    mode: body.mode, asin, productId, asinKind,
  });
  return getTarget(db, userId, storeId, id);
}

export function updateTarget(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM m1_optimization_targets WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = [], params = [];
  const map = {
    status: 'status', new_category: 'new_category', new_target_audience: 'new_target_audience',
    new_price_band: 'new_price_band', new_brand_positioning: 'new_brand_positioning',
  };
  for (const [k, c] of Object.entries(map)) {
    if (patch[k] !== undefined) { fields.push(`${c}=?`); params.push(patch[k]); }
  }
  if (patch.new_selling_points !== undefined) { fields.push('new_selling_points=?'); params.push(JSON.stringify(patch.new_selling_points)); }
  if (patch.new_target_keywords !== undefined) { fields.push('new_target_keywords=?'); params.push(JSON.stringify(patch.new_target_keywords)); }
  if (patch.new_physical_specs !== undefined) { fields.push('new_physical_specs=?'); params.push(JSON.stringify(patch.new_physical_specs)); }
  if (patch.competitor_pool !== undefined) { fields.push('competitor_pool=?'); params.push(JSON.stringify(patch.competitor_pool)); }
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  db.prepare(`UPDATE m1_optimization_targets SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_TARGET_UPDATE',
    resourceType: 'm1_optimization_target', resourceId: id, patch,
  });
  return getTarget(db, userId, storeId, id);
}

export function deleteTarget(db, userId, storeId, id) {
  const r = db.prepare('DELETE FROM m1_optimization_targets WHERE id = ? AND user_id = ? AND store_id = ?').run(id, userId, storeId);
  if (r.changes > 0) {
    appendAuditLog(userId, storeId, {
      sourceModule: 'M1', actionType: 'M1_TARGET_DELETE',
      resourceType: 'm1_optimization_target', resourceId: id,
    });
  }
  return r.changes > 0;
}

// ============================================================
// Research CRUD
// ============================================================
export function getResearch(db, userId, storeId, targetId) {
  const r = db.prepare(`SELECT * FROM m1_research_reports WHERE user_id = ? AND store_id = ? AND target_id = ?
    ORDER BY created_at DESC LIMIT 1`).get(userId, storeId, targetId);
  return rowToResearch(r);
}

export function triggerResearch(db, userId, storeId, targetId, body = {}) {
  const target = getTarget(db, userId, storeId, targetId);
  if (!target) return null;
  // Check cache (7-day)
  const existing = getResearch(db, userId, storeId, targetId);
  if (existing && existing.cached_until && new Date(existing.cached_until).getTime() > Date.now()) {
    return existing;
  }
  const rng = mulberry32(hashStr(targetId + '-research'));
  const id = newId('m1r');
  const now = nowIso();
  const cachedUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const competitorAsins = Array.isArray(body.competitorAsins) ? body.competitorAsins
    : (Array.isArray(body.competitor_asins) ? body.competitor_asins : (target.competitor_pool || []));
  const sourceAsins = competitorAsins.length ? competitorAsins : ['B0COMPCASE', 'B0COMPLAMP', 'B0COMPCABLE'];
  const category = target.new_category || target.asin || (target.product_id || '3C 配件');
  const priceBand = target.new_price_band || '$15-$25';

  const titlePattern = {
    theme: '品牌 + 功能 + 适用场景 + 长尾关键词',
    evidence: `头部 3 条平均长度 ${120 + Math.floor(rng() * 30)} 字符，长尾词覆盖率 ${(60 + Math.floor(rng() * 25))}%`,
    action: '建议标题前置核心功能关键词，控制在 140 字符',
  };
  const bulletStructure = {
    theme: '场景 + 痛点 + 解决方案 + 数据 + CTA',
    evidence: `Top 5 listings 平均 5 点结构相似度 ${(0.7 + rng() * 0.2).toFixed(2)}`,
    action: '5 点逐条以场景/痛点开头，控制 200-250 字符',
  };
  const mainImageVisual = {
    theme: '白底产品 + 角度展示 + 卖点叠字',
    evidence: `${Math.floor(70 + rng() * 20)}% 头部主图采用白底 + 1-2 叠字`,
    action: '主图保持 85% 留白，左上叠 1 行卖点',
  };
  const aPlusStructure = {
    theme: '品牌故事 → 功能对比 → 使用场景 → 规格表',
    evidence: '8/10 头部 listing 含品牌故事 + 对比模块',
    action: '至少 3 个 A+ 模块，含 1 张对比图',
  };
  const reviewKeywords = {
    theme: '正面：质量好/包装好/正品；负面：尺寸偏小/松动/胶水味',
    evidence: `近 90 天 ${Math.floor(80 + rng() * 50)} 条样本词频统计`,
    action: '在 5 点中正面回应"尺寸合身/牢固/无异味"',
  };

  db.prepare(`INSERT INTO m1_research_reports(
    id, user_id, store_id, target_id, source, category, price_band, source_asins,
    title_pattern, bullet_structure, main_image_visual, a_plus_structure, review_keywords,
    cached_until, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, targetId, 'auto', category, priceBand,
    JSON.stringify(sourceAsins),
    JSON.stringify(titlePattern), JSON.stringify(bulletStructure),
    JSON.stringify(mainImageVisual), JSON.stringify(aPlusStructure),
    JSON.stringify(reviewKeywords),
    cachedUntil, now
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_RESEARCH_TRIGGER',
    resourceType: 'm1_research_report', resourceId: id, targetId,
  });
  return getResearch(db, userId, storeId, targetId);
}

export function clearResearchCache(db, userId, storeId, targetId) {
  const r = db.prepare('DELETE FROM m1_research_reports WHERE user_id = ? AND store_id = ? AND target_id = ?').run(userId, storeId, targetId);
  if (r.changes > 0) {
    appendAuditLog(userId, storeId, {
      sourceModule: 'M1', actionType: 'M1_RESEARCH_CACHE_CLEAR',
      resourceType: 'm1_research_report', targetId,
    });
  }
  return r.changes > 0;
}

// ============================================================
// Scores CRUD
// ============================================================
export function getScore(db, userId, storeId, targetId) {
  const r = db.prepare(`SELECT * FROM m1_listing_scores WHERE user_id = ? AND store_id = ? AND target_id = ?
    ORDER BY scored_at DESC LIMIT 1`).get(userId, storeId, targetId);
  return rowToScore(r);
}

export function triggerScore(db, userId, storeId, targetId) {
  const target = getTarget(db, userId, storeId, targetId);
  if (!target) return { error: 'not_found' };
  if (target.mode === 'new_listing') {
    return { error: 'scoring_not_applicable', message: 'Mode 3 (new_listing) cannot be scored' };
  }
  const rng = mulberry32(hashStr(targetId + '-score'));
  const id = newId('m1s');
  const now = nowIso();
  const titleScore = 60 + Math.floor(rng() * 25);
  const bulletsScore = 55 + Math.floor(rng() * 30);
  const mainImageScore = 65 + Math.floor(rng() * 25);
  const aPlusScore = 50 + Math.floor(rng() * 35);
  const reviewsScore = 60 + Math.floor(rng() * 30);
  const total = Math.round((titleScore + bulletsScore + mainImageScore + aPlusScore + reviewsScore) / 5);

  const mkDetail = (label, score) => ({
    rationale: `${label} 当前得分 ${score}：核心关键词覆盖、结构完整性、转化导向三项综合。`,
    sub: [
      { label: '关键词覆盖', score: Math.max(40, Math.min(100, score + Math.floor(rng() * 10 - 5))) },
      { label: '结构完整性', score: Math.max(40, Math.min(100, score + Math.floor(rng() * 10 - 5))) },
      { label: '转化导向', score: Math.max(40, Math.min(100, score + Math.floor(rng() * 10 - 5))) },
    ],
  });

  const improvement = [
    { field: 'main_image', dimension: '主图', suggestion: '加 1 行卖点叠字 + 提升留白比', expected_lift: 8 },
    { field: 'bullets', dimension: '5 点', suggestion: '按 场景/痛点/方案/数据/CTA 结构重写', expected_lift: 7 },
    { field: 'title', dimension: '标题', suggestion: '前置核心关键词 + 长尾词补充', expected_lift: 5 },
    { field: 'a_plus', dimension: 'A+', suggestion: '增加对比模块 + 规格表', expected_lift: 4 },
    { field: 'reviews', dimension: '评论', suggestion: '在 5 点中正面回应负面评论关键词', expected_lift: 3 },
  ].sort((a, b) => b.expected_lift - a.expected_lift);

  db.prepare(`INSERT INTO m1_listing_scores(
    id, user_id, store_id, target_id, scored_at, total_score,
    title_score, title_detail, bullets_score, bullets_detail,
    main_image_score, main_image_detail, a_plus_score, a_plus_detail,
    reviews_score, reviews_detail, improvement_ranking)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, targetId, now, total,
    titleScore, JSON.stringify(mkDetail('标题', titleScore)),
    bulletsScore, JSON.stringify(mkDetail('5 点', bulletsScore)),
    mainImageScore, JSON.stringify(mkDetail('主图', mainImageScore)),
    aPlusScore, JSON.stringify(mkDetail('A+', aPlusScore)),
    reviewsScore, JSON.stringify(mkDetail('评论', reviewsScore)),
    JSON.stringify(improvement)
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_SCORE_TRIGGER',
    resourceType: 'm1_listing_score', resourceId: id, targetId, totalScore: total,
  });
  return getScore(db, userId, storeId, targetId);
}

// ============================================================
// Runs CRUD + Versions
// ============================================================
export function listRuns(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m1_optimization_runs WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.targetId) { sql += ' AND target_id = ?'; params.push(filters.targetId); }
  sql += ' ORDER BY round_no DESC, created_at DESC';
  return db.prepare(sql).all(...params).map(rowToRun);
}

export function getRun(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m1_optimization_runs WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  return rowToRun(r);
}

function nextRoundNo(db, userId, storeId, targetId) {
  const r = db.prepare(`SELECT MAX(round_no) AS mx FROM m1_optimization_runs
    WHERE user_id = ? AND store_id = ? AND target_id = ?`).get(userId, storeId, targetId);
  return (r?.mx || 0) + 1;
}

function getLatestVersionRow(db, userId, storeId, targetId) {
  return db.prepare(`SELECT * FROM m1_listing_versions
    WHERE user_id = ? AND store_id = ? AND target_id = ?
    ORDER BY round_no DESC, created_at DESC LIMIT 1`).get(userId, storeId, targetId);
}

function archiveOldestNonPinnedIfNeeded(db, userId, storeId, targetId) {
  // 5-round fold (spec §5.6): the most recent 5 non-archived non-pinned versions stay active.
  // When a new version push the active (non-pinned, non-archived) count over 5, archive the oldest non-pinned one.
  const active = db.prepare(`SELECT id, round_no FROM m1_listing_versions
    WHERE user_id = ? AND store_id = ? AND target_id = ? AND is_archived = 0 AND is_pinned = 0
    ORDER BY round_no ASC`).all(userId, storeId, targetId);
  if (active.length > 5) {
    const oldest = active[0];
    db.prepare('UPDATE m1_listing_versions SET is_archived = 1 WHERE id = ?').run(oldest.id);
  }
}

function buildBaselineVersion(target) {
  // Initial version content from target (existing/asin_input) or new_listing template
  if (target.mode === 'new_listing') {
    const sps = Array.isArray(target.new_selling_points) ? target.new_selling_points : [];
    return {
      title: `[新品] ${target.new_category || '商品'} · ${(sps[0] || '高性能').slice(0, 40)}`,
      bullet_1: sps[0] || '核心功能卖点 1',
      bullet_2: sps[1] || '差异化卖点 2',
      bullet_3: sps[2] || '使用场景卖点 3',
      bullet_4: sps[3] || '材质工艺卖点 4',
      bullet_5: sps[4] || '保障服务卖点 5',
      description: `面向 ${target.new_target_audience || '通用人群'} · 价格段 ${target.new_price_band || '—'}`,
    };
  }
  // existing/asin_input: synth a baseline from product_id/asin
  return {
    title: `[导入] ${target.product_id || target.asin || target.id} · 待优化标题`,
    bullet_1: 'Quality build for everyday durability',
    bullet_2: 'Designed for daily commute and travel',
    bullet_3: 'Compatible with major device sizes',
    bullet_4: 'Easy setup, no manual required',
    bullet_5: '12-month warranty + responsive support',
    description: 'Imported baseline. Trigger AI iteration for optimized copy.',
  };
}

function applyRewriteFields(baselineVersionRow, markedFields, rng) {
  // Deep-copy baselineVersionRow (already DB row → plain obj), only rewrite markedFields
  const next = { ...baselineVersionRow };
  const fieldKeys = ['title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5', 'description'];
  const toRewrite = (Array.isArray(markedFields) && markedFields.length) ? markedFields : fieldKeys;
  for (const k of toRewrite) {
    if (!fieldKeys.includes(k)) continue;
    const prev = next[k] || '';
    next[k] = mutateField(k, prev, rng);
  }
  return next;
}

function mutateField(key, prev, rng) {
  // Deterministic mutation: append a small variant marker so byte-not-equal but stable
  const suffixes = ['v2', 'v3', 'pro', 'plus', 'fast', 'durable'];
  const s = suffixes[Math.floor(rng() * suffixes.length)];
  if (key === 'title') return `${prev.replace(/\s*\[改\]\s*$/, '').trim()} [改·${s}]`;
  if (key === 'description') return `${prev}\n[refined · ${s}]`;
  return `${prev.replace(/\s*\(refined·.*\)$/, '').trim()} (refined·${s})`;
}

export function createRun(db, userId, storeId, body) {
  if (!body || !body.targetId) return { error: 'validation_failed', message: 'targetId required' };
  const target = getTarget(db, userId, storeId, body.targetId);
  if (!target) return { error: 'not_found' };
  if (target.is_competitor_only || target.isCompetitorOnly) {
    return { error: 'external_asin_cannot_optimize', message: 'External ASIN cannot be optimized (use only as competitor reference)' };
  }
  const roundNo = nextRoundNo(db, userId, storeId, body.targetId);
  const runId = newId('m1run');
  const verId = newId('m1v');
  const now = nowIso();
  const t0 = Date.now();

  const rng = mulberry32(hashStr(body.targetId + '-r' + roundNo));
  const styleToggles = body.styleToggles || body.style_toggles || {};
  const markedFields = body.markedFields || body.marked_fields || [];

  let content;
  if (roundNo === 1) {
    content = buildBaselineVersion(target);
  } else {
    // Round 2+: deep-copy previous version, only rewrite markedFields (or all if none marked)
    const prev = getLatestVersionRow(db, userId, storeId, body.targetId);
    const prevContent = prev ? {
      title: prev.title, bullet_1: prev.bullet_1, bullet_2: prev.bullet_2,
      bullet_3: prev.bullet_3, bullet_4: prev.bullet_4, bullet_5: prev.bullet_5,
      description: prev.description,
    } : buildBaselineVersion(target);
    content = applyRewriteFields(prevContent, markedFields, rng);
  }

  // Insert run
  db.prepare(`INSERT INTO m1_optimization_runs(
    id, user_id, store_id, target_id, round_no, feedback_text, marked_fields,
    style_short_long, style_rational_emotional, style_seo_natural,
    status, version_id, generation_time_ms, created_at, completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    runId, userId, storeId, body.targetId, roundNo,
    body.feedbackText || body.feedback_text || null,
    JSON.stringify(markedFields),
    styleToggles.short_long ?? 0.5,
    styleToggles.rational_emotional ?? 0.5,
    styleToggles.seo_natural ?? 0.5,
    'completed', verId, (Date.now() - t0), now, nowIso()
  );

  // Insert version
  const source = roundNo === 1 ? 'initial_import' : 'ai_iteration';
  db.prepare(`INSERT INTO m1_listing_versions(
    id, user_id, store_id, target_id, run_id, round_no, source,
    title, bullet_1, bullet_2, bullet_3, bullet_4, bullet_5, description,
    a_plus_modules, main_image_id, side_image_ids, a_plus_image_ids,
    field_picks_hash, is_pinned, is_archived, uploaded_to_amazon, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    verId, userId, storeId, body.targetId, runId, roundNo, source,
    content.title, content.bullet_1, content.bullet_2, content.bullet_3,
    content.bullet_4, content.bullet_5, content.description,
    JSON.stringify([]), null, JSON.stringify([]), JSON.stringify([]),
    null, 0, 0, 0, now
  );

  // 5-round fold
  archiveOldestNonPinnedIfNeeded(db, userId, storeId, body.targetId);

  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_RUN_CREATE',
    resourceType: 'm1_optimization_run', resourceId: runId,
    targetId: body.targetId, roundNo, versionId: verId,
    markedFields,
  });
  return getRun(db, userId, storeId, runId);
}

export function rewriteRunField(db, userId, storeId, runId, body) {
  const run = getRun(db, userId, storeId, runId);
  if (!run) return null;
  const field = body.field;
  const fieldKeys = ['title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5', 'description'];
  if (!fieldKeys.includes(field)) {
    return { error: 'validation_failed', message: `invalid field: ${field}` };
  }
  const verRow = db.prepare('SELECT * FROM m1_listing_versions WHERE id = ? AND user_id = ? AND store_id = ?').get(run.version_id, userId, storeId);
  if (!verRow) return null;
  const rng = mulberry32(hashStr(runId + '-' + field + '-' + Date.now()));
  const newVal = mutateField(field, verRow[field] || '', rng);
  db.prepare(`UPDATE m1_listing_versions SET ${field} = ? WHERE id = ?`).run(newVal, run.version_id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_RUN_REWRITE_FIELD',
    resourceType: 'm1_optimization_run', resourceId: runId,
    field, feedback: body.feedback || null,
  });
  return getRun(db, userId, storeId, runId);
}

// ============================================================
// Versions CRUD
// ============================================================
export function listVersions(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m1_listing_versions WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.targetId) { sql += ' AND target_id = ?'; params.push(filters.targetId); }
  if (!filters.includeArchived) sql += ' AND is_archived = 0';
  sql += ' ORDER BY round_no DESC, created_at DESC';
  return db.prepare(sql).all(...params).map(rowToVersion);
}

export function getVersion(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m1_listing_versions WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  return rowToVersion(r);
}

export function pinVersion(db, userId, storeId, id, pinned) {
  const cur = db.prepare('SELECT id FROM m1_listing_versions WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  db.prepare('UPDATE m1_listing_versions SET is_pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: pinned ? 'M1_VERSION_PIN' : 'M1_VERSION_UNPIN',
    resourceType: 'm1_listing_version', resourceId: id,
  });
  return getVersion(db, userId, storeId, id);
}

export function deleteVersion(db, userId, storeId, id) {
  const cur = db.prepare('SELECT round_no FROM m1_listing_versions WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return { error: 'not_found' };
  if (cur.round_no === 1) {
    return { error: 'cannot_delete_baseline', message: 'Cannot delete round_no=1 baseline version' };
  }
  db.prepare('DELETE FROM m1_listing_versions WHERE id = ? AND user_id = ? AND store_id = ?').run(id, userId, storeId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_VERSION_DELETE',
    resourceType: 'm1_listing_version', resourceId: id,
  });
  return { ok: true };
}

export function diffVersions(db, userId, storeId, aId, bId) {
  const a = getVersion(db, userId, storeId, aId);
  const b = getVersion(db, userId, storeId, bId);
  if (!a || !b) return null;
  const keys = ['title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5', 'description'];
  const fields = keys.map((k) => ({ key: k, a: a[k] || '', b: b[k] || '', changed: (a[k] || '') !== (b[k] || '') }));
  return { versionA: a, versionB: b, fields };
}

export function combinedPick(db, userId, storeId, targetId, fieldPicks) {
  const target = getTarget(db, userId, storeId, targetId);
  if (!target) return null;
  if (!fieldPicks || typeof fieldPicks !== 'object') {
    return { error: 'validation_failed', message: 'fieldPicks required' };
  }
  // Idempotent: hash fieldPicks; if a combined_pick version exists with same hash, return that
  const sortedKeys = Object.keys(fieldPicks).sort();
  const hashSrc = sortedKeys.map((k) => `${k}=${fieldPicks[k]}`).join('|');
  const fpHash = createHash('sha256').update(targetId + '::' + hashSrc).digest('hex').slice(0, 16);
  const existing = db.prepare(`SELECT * FROM m1_listing_versions
    WHERE user_id = ? AND store_id = ? AND target_id = ? AND source = 'combined_pick' AND field_picks_hash = ?
    ORDER BY created_at DESC LIMIT 1`).get(userId, storeId, targetId, fpHash);
  if (existing) return rowToVersion(existing);

  // Build content by reading each field's chosen version
  const keys = ['title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5', 'description'];
  const content = {};
  for (const k of keys) {
    const vId = fieldPicks[k];
    if (!vId) continue;
    const row = db.prepare('SELECT * FROM m1_listing_versions WHERE id = ? AND user_id = ? AND store_id = ?').get(vId, userId, storeId);
    if (row) content[k] = row[k];
  }
  const roundNo = nextRoundNo(db, userId, storeId, targetId);
  const id = newId('m1v');
  const now = nowIso();
  db.prepare(`INSERT INTO m1_listing_versions(
    id, user_id, store_id, target_id, run_id, round_no, source,
    title, bullet_1, bullet_2, bullet_3, bullet_4, bullet_5, description,
    a_plus_modules, main_image_id, side_image_ids, a_plus_image_ids,
    field_picks_hash, is_pinned, is_archived, uploaded_to_amazon, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, targetId, null, roundNo, 'combined_pick',
    content.title || null, content.bullet_1 || null, content.bullet_2 || null,
    content.bullet_3 || null, content.bullet_4 || null, content.bullet_5 || null,
    content.description || null,
    JSON.stringify([]), null, JSON.stringify([]), JSON.stringify([]),
    fpHash, 0, 0, 0, now
  );
  archiveOldestNonPinnedIfNeeded(db, userId, storeId, targetId);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_LISTING_UPLOAD',
    resourceType: 'm1_listing_version', resourceId: id,
    targetId, fieldPicks, source: 'combined_pick',
  });
  return getVersion(db, userId, storeId, id);
}

// ============================================================
// Images CRUD (mock generation < 500ms)
// ============================================================
export function listImages(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m1_generated_images WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.versionId) { sql += ' AND version_id = ?'; params.push(filters.versionId); }
  if (filters.targetId) { sql += ' AND target_id = ?'; params.push(filters.targetId); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(rowToImage);
}

export function generateImage(db, userId, storeId, body) {
  if (!body || !body.targetId || !body.slot || !body.prompt) {
    return { error: 'validation_failed', message: 'targetId, slot, prompt required' };
  }
  const id = newId('m1img');
  const now = nowIso();
  const t0 = Date.now();
  const generatedUrl = `https://picsum.photos/seed/${id}/1500/1500`;
  db.prepare(`INSERT INTO m1_generated_images(
    id, user_id, store_id, target_id, version_id, slot, prompt, ref_image_url,
    style_ref_asin, model, resolution, status, generated_url, post_processed,
    error_message, generation_time_ms, created_at, completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.targetId, body.versionId || null, body.slot, body.prompt,
    body.refImageUrl || null, body.styleRefAsin || null,
    'imagen-2', '1500x1500', 'completed', generatedUrl, 0,
    null, (Date.now() - t0), now, nowIso()
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_IMAGE_GENERATE',
    resourceType: 'm1_generated_image', resourceId: id,
    targetId: body.targetId, versionId: body.versionId, slot: body.slot,
  });
  return db.prepare('SELECT * FROM m1_generated_images WHERE id = ?').get(id);
}

export function regenerateImage(db, userId, storeId, id, body = {}) {
  const cur = db.prepare('SELECT * FROM m1_generated_images WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  if (!cur) return null;
  const t0 = Date.now();
  const newUrl = `https://picsum.photos/seed/${id}-${Date.now()}/1500/1500`;
  const fields = ['generated_url=?', 'status=?', 'completed_at=?', 'generation_time_ms=?'];
  const params = [newUrl, 'completed', nowIso(), 0];
  if (body.prompt !== undefined) { fields.push('prompt=?'); params.push(body.prompt); }
  if (body.refImageUrl !== undefined) { fields.push('ref_image_url=?'); params.push(body.refImageUrl); }
  if (body.styleRefAsin !== undefined) { fields.push('style_ref_asin=?'); params.push(body.styleRefAsin); }
  params.push(id);
  // Fix generation_time_ms with actual elapsed
  const placeholderIdx = fields.findIndex((f) => f.startsWith('generation_time_ms='));
  params[placeholderIdx] = Date.now() - t0;
  db.prepare(`UPDATE m1_generated_images SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_IMAGE_REGENERATE',
    resourceType: 'm1_generated_image', resourceId: id,
  });
  return rowToImage(db.prepare('SELECT * FROM m1_generated_images WHERE id = ?').get(id));
}

// ============================================================
// A/B tests CRUD
// ============================================================
const AUTO_AB_TYPES = ['title', 'main_image', 'a_plus'];

export function listAbTests(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m1_ab_tests WHERE user_id = ? AND store_id = ?';
  const params = [userId, storeId];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.targetId) { sql += ' AND target_id = ?'; params.push(filters.targetId); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(rowToAbTest);
}

export function getAbTest(db, userId, storeId, id) {
  const r = db.prepare('SELECT * FROM m1_ab_tests WHERE id = ? AND user_id = ? AND store_id = ?').get(id, userId, storeId);
  return rowToAbTest(r);
}

function manualGuidanceFor(testType) {
  const map = {
    bullets: '亚马逊 Manage Your Experiments 不支持 5 点描述 A/B。请手动 ① 准备 control / treatment 两份 5 点；② 周 1-7 用 control，周 8-14 切 treatment；③ 通过 SP-API report 拉对应日期段 sessions / purchases 计算 CVR 提升。',
    description: '亚马逊原生 A/B 不支持长描述。建议手动切换 control / treatment 两次 listing 编辑，间隔 7 天 + 用搜索词报告做 before/after 对照。',
    price: '亚马逊原生 A/B 不支持价格。请用 Listing Price Schedule + 7 天 control / 7 天 treatment + Business Reports 对比。',
    manual: '该类型需手动测试。准备 control 与 treatment 两套，分别上线 7 天后，用 SP-API session+conversion 报告做 CVR z-test。',
  };
  return map[testType] || map.manual;
}

export function createAbTest(db, userId, storeId, body) {
  if (!body || !body.targetId || !body.testType || !body.controlVersionId || !body.treatmentVersionId) {
    return { error: 'validation_failed', message: 'targetId, testType, controlVersionId, treatmentVersionId required' };
  }
  const target = getTarget(db, userId, storeId, body.targetId);
  if (!target) return { error: 'not_found' };
  const asin = target.asin || `B0${(body.targetId).slice(-8).toUpperCase()}`;
  const id = newId('m1ab');
  const now = nowIso();
  const isManual = !AUTO_AB_TYPES.includes(body.testType);
  const status = isManual ? 'manual_required' : 'draft';
  const manualGuidance = isManual ? manualGuidanceFor(body.testType) : null;

  db.prepare(`INSERT INTO m1_ab_tests(
    id, user_id, store_id, target_id, asin, test_type, amazon_experiment_id,
    control_version_id, treatment_version_id, duration_days, started_at, ends_at,
    status, winner, lift, significance, manual_guidance, audit_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.targetId, asin, body.testType, null,
    body.controlVersionId, body.treatmentVersionId, body.durationDays || 14,
    null, null, status, null, null, null, manualGuidance, null, now, null
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_AB_CREATE',
    resourceType: 'm1_ab_test', resourceId: id,
    testType: body.testType, status, manualRequired: isManual,
  });
  const result = getAbTest(db, userId, storeId, id);
  // 422 manual_required is signaled by error field; caller handles HTTP status
  if (isManual) return { ...result, _manualRequired: true };
  return result;
}

function zTestSignificance(controlMetrics, treatmentMetrics) {
  // Aggregate impressions/clicks/orders across days
  const agg = (arr) => arr.reduce((a, m) => ({
    impressions: a.impressions + (m.impressions || 0),
    clicks: a.clicks + (m.clicks || 0),
    orders: a.orders + (m.orders || 0),
  }), { impressions: 0, clicks: 0, orders: 0 });
  const c = agg(controlMetrics);
  const t = agg(treatmentMetrics);
  if (c.clicks === 0 || t.clicks === 0) return { z: 0, winner: 'no_difference', lift: 0, significance: 1 };
  const cvrC = c.orders / c.clicks;
  const cvrT = t.orders / t.clicks;
  const nC = c.clicks;
  const nT = t.clicks;
  const p = (c.orders + t.orders) / (nC + nT);
  const denom = Math.sqrt(p * (1 - p) * (1 / nT + 1 / nC));
  const z = denom === 0 ? 0 : (cvrT - cvrC) / denom;
  const lift = cvrC > 0 ? (cvrT - cvrC) / cvrC : 0;
  // significance as 2-sided p-value approximation; report 1-pvalue for "confidence"
  // Use rough lookup: |z|=1.96 → p~0.05, |z|=2.58 → p~0.01
  const absZ = Math.abs(z);
  // Simple normal CDF approximation
  const cdf = 0.5 * (1 + erf(absZ / Math.sqrt(2)));
  const pValue = 2 * (1 - cdf);
  let winner = 'no_difference';
  if (absZ > 1.96) winner = z > 0 ? 'treatment' : 'control';
  return { z, winner, lift, significance: 1 - pValue };
}

function erf(x) {
  // Abramowitz–Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function startAbTest(db, userId, storeId, id) {
  const cur = getAbTest(db, userId, storeId, id);
  if (!cur) return null;
  if (cur.status === 'manual_required') return cur;
  if (cur.status === 'running') return cur;
  const now = nowIso();
  const ends = new Date(Date.now() + (cur.duration_days || 14) * 24 * 3600 * 1000).toISOString();
  db.prepare(`UPDATE m1_ab_tests SET status = 'running', started_at = ?, ends_at = ?, updated_at = ? WHERE id = ?`).run(now, ends, now, id);

  // Mock 14 days of metrics, 2 rows / day
  const rng = mulberry32(hashStr(id + '-ab'));
  const baseDate = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const stmt = db.prepare(`INSERT INTO m1_ab_metrics(
    id, user_id, store_id, ab_test_id, date, arm,
    impressions, clicks, orders, units, ctr, cvr, sales, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const tx = db.transaction(() => {
    // Clear any existing
    db.prepare('DELETE FROM m1_ab_metrics WHERE user_id = ? AND store_id = ? AND ab_test_id = ?').run(userId, storeId, id);
    for (let d = 0; d < 14; d++) {
      const date = new Date(baseDate.getTime() + d * 24 * 3600 * 1000).toISOString().slice(0, 10);
      // Control arm
      const cImp = 800 + Math.floor(rng() * 400);
      const cClk = Math.floor(cImp * (0.04 + rng() * 0.02));
      const cOrd = Math.floor(cClk * (0.10 + rng() * 0.05));
      // Treatment arm (slight lift)
      const tImp = 800 + Math.floor(rng() * 400);
      const tClk = Math.floor(tImp * (0.045 + rng() * 0.025));
      const tOrd = Math.floor(tClk * (0.115 + rng() * 0.05));
      stmt.run(newId('m1met'), userId, storeId, id, date, 'control',
        cImp, cClk, cOrd, cOrd, cClk / cImp, cClk > 0 ? cOrd / cClk : 0, cOrd * 19.99, JSON.stringify({}));
      stmt.run(newId('m1met'), userId, storeId, id, date, 'treatment',
        tImp, tClk, tOrd, tOrd, tClk / tImp, tClk > 0 ? tOrd / tClk : 0, tOrd * 19.99, JSON.stringify({}));
    }
  });
  tx();

  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_AB_START',
    resourceType: 'm1_ab_test', resourceId: id,
  });
  return getAbTest(db, userId, storeId, id);
}

export function abortAbTest(db, userId, storeId, id) {
  const cur = getAbTest(db, userId, storeId, id);
  if (!cur) return null;
  const now = nowIso();
  db.prepare(`UPDATE m1_ab_tests SET status = 'aborted', updated_at = ? WHERE id = ?`).run(now, id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_AB_ABORT',
    resourceType: 'm1_ab_test', resourceId: id,
  });
  return getAbTest(db, userId, storeId, id);
}

export function getAbMetrics(db, userId, storeId, id) {
  const test = getAbTest(db, userId, storeId, id);
  if (!test) return null;
  const rows = db.prepare(`SELECT * FROM m1_ab_metrics WHERE user_id = ? AND store_id = ? AND ab_test_id = ?
    ORDER BY date ASC, arm ASC`).all(userId, storeId, id);
  const metrics = rows.map(rowToAbMetric);
  // Compute z-test on current metrics
  const control = metrics.filter((m) => m.arm === 'control');
  const treatment = metrics.filter((m) => m.arm === 'treatment');
  const stats = (control.length && treatment.length) ? zTestSignificance(control, treatment) : null;
  // Update test row if running & enough data
  if (stats && test.status === 'running' && metrics.length >= 14) {
    db.prepare(`UPDATE m1_ab_tests SET lift = ?, significance = ?, winner = ?, status = ?, updated_at = ? WHERE id = ?`).run(
      stats.lift, stats.significance, stats.winner,
      Math.abs(stats.z) > 1.96 ? 'completed' : 'running',
      nowIso(), id
    );
  }
  return { test: getAbTest(db, userId, storeId, id), metrics, stats };
}

export function adoptAbWinner(db, userId, storeId, id) {
  const cur = getAbTest(db, userId, storeId, id);
  if (!cur) return null;
  if (!cur.winner) {
    // Force compute first
    const m = getAbMetrics(db, userId, storeId, id);
    if (m?.test) Object.assign(cur, m.test);
  }
  const winnerVersionId = cur.winner === 'treatment' ? cur.treatment_version_id
    : (cur.winner === 'control' ? cur.control_version_id : null);
  if (winnerVersionId) {
    // Mark winner version uploaded_to_amazon = 1
    db.prepare(`UPDATE m1_listing_versions SET uploaded_to_amazon = 1, uploaded_at = ? WHERE id = ?`).run(nowIso(), winnerVersionId);
  }
  db.prepare(`UPDATE m1_ab_tests SET status = 'completed', updated_at = ? WHERE id = ?`).run(nowIso(), id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'M1_AB_ADOPT_WINNER',
    resourceType: 'm1_ab_test', resourceId: id,
    winner: cur.winner, winnerVersionId, lift: cur.lift,
  });
  return getAbTest(db, userId, storeId, id);
}

// ============================================================
// Seeding (deterministic)
// ============================================================
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function seedListingsForUser(db, userId, storeId) {
  const tx = db.transaction(() => {
    const seedTag = hashStr(userId + '::' + storeId + '::m1');
    const rng = mulberry32(seedTag);
    const now = nowIso();

    // ---------- 4 targets ----------
    // T1: existing CASE-001
    const t1Id = 'm1t-' + (seedTag.toString(16).slice(0, 6)) + 'a1';
    const caseProduct = db.prepare('SELECT id, asin FROM products WHERE user_id = ? AND store_id = ? AND sku = ?').get(userId, storeId, 'CASE-001');
    db.prepare(`INSERT OR IGNORE INTO m1_optimization_targets(
      id, user_id, store_id, mode, product_id, asin, asin_kind, is_competitor_only,
      new_category, new_selling_points, new_target_audience, new_price_band,
      new_physical_specs, new_brand_positioning, new_target_keywords,
      competitor_pool, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      t1Id, userId, storeId, 'existing',
      caseProduct?.id || 'prod-case-001', caseProduct?.asin || 'B0CASE001', 'own', 0,
      null, JSON.stringify([]), null, null, JSON.stringify(null), null, JSON.stringify([]),
      JSON.stringify(['B0COMPCASE']), 'in_progress', now, null
    );

    // T2: existing CABLE-002
    const t2Id = 'm1t-' + (seedTag.toString(16).slice(0, 6)) + 'b2';
    const cableProduct = db.prepare('SELECT id, asin FROM products WHERE user_id = ? AND store_id = ? AND sku = ?').get(userId, storeId, 'CABLE-002');
    db.prepare(`INSERT OR IGNORE INTO m1_optimization_targets(
      id, user_id, store_id, mode, product_id, asin, asin_kind, is_competitor_only,
      new_category, new_selling_points, new_target_audience, new_price_band,
      new_physical_specs, new_brand_positioning, new_target_keywords,
      competitor_pool, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      t2Id, userId, storeId, 'existing',
      cableProduct?.id || 'prod-cable-002', cableProduct?.asin || 'B0CABLE002', 'own', 0,
      null, JSON.stringify([]), null, null, JSON.stringify(null), null, JSON.stringify([]),
      JSON.stringify([]), 'draft', now, null
    );

    // T3: asin_input external
    const t3Id = 'm1t-' + (seedTag.toString(16).slice(0, 6)) + 'c3';
    db.prepare(`INSERT OR IGNORE INTO m1_optimization_targets(
      id, user_id, store_id, mode, product_id, asin, asin_kind, is_competitor_only,
      new_category, new_selling_points, new_target_audience, new_price_band,
      new_physical_specs, new_brand_positioning, new_target_keywords,
      competitor_pool, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      t3Id, userId, storeId, 'asin_input',
      null, 'B0EXTRIVAL', 'external', 1,
      null, JSON.stringify([]), null, null, JSON.stringify(null), null, JSON.stringify([]),
      JSON.stringify([]), 'draft', now, null
    );

    // T4: new_listing
    const t4Id = 'm1t-' + (seedTag.toString(16).slice(0, 6)) + 'd4';
    db.prepare(`INSERT OR IGNORE INTO m1_optimization_targets(
      id, user_id, store_id, mode, product_id, asin, asin_kind, is_competitor_only,
      new_category, new_selling_points, new_target_audience, new_price_band,
      new_physical_specs, new_brand_positioning, new_target_keywords,
      competitor_pool, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      t4Id, userId, storeId, 'new_listing',
      null, null, null, 0,
      '3C 配件 / 手机配件',
      JSON.stringify(['超薄防摔', 'MagSafe 兼容', '无线充电友好', '终身保修']),
      '商旅人士', '$15-$25',
      JSON.stringify({ material: 'TPU + PC', weight: '28g', dim: '15x8x1cm' }),
      '可靠 · 极简 · 高性价比',
      JSON.stringify(['phone case', 'magsafe case', 'slim iphone case']),
      JSON.stringify([]), 'draft', now, null
    );

    // ---------- Cached research for T1 ----------
    const r1Id = 'm1r-' + (seedTag.toString(16).slice(0, 6)) + 'r1';
    const cachedUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare(`INSERT OR IGNORE INTO m1_research_reports(
      id, user_id, store_id, target_id, source, category, price_band, source_asins,
      title_pattern, bullet_structure, main_image_visual, a_plus_structure, review_keywords,
      cached_until, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      r1Id, userId, storeId, t1Id, 'auto', '手机壳 / Phone Case', '$15-$25',
      JSON.stringify(['B0COMPCASE', 'B0CASE001']),
      JSON.stringify({ theme: '品牌 + Slim/Shockproof + 适配机型 + 关键词', evidence: '头部 3 条平均 132 字符', action: '前置 Slim Shockproof, 后接机型' }),
      JSON.stringify({ theme: '场景 + 防摔 + 兼容 + 工艺 + 服务', evidence: 'Top 5 5 点结构相似度 0.82', action: '逐条以使用场景开头' }),
      JSON.stringify({ theme: '白底 + 防摔测试图叠字 + 颜色 swatch', evidence: '78% 头部主图含防摔标识', action: '左上叠 1 行防摔测试结果' }),
      JSON.stringify({ theme: '品牌故事 → 防摔对比 → 机型适配表 → FAQ', evidence: '9/10 头部含对比模块', action: '至少 4 个 A+ 模块含 1 张对比图' }),
      JSON.stringify({ theme: '正面：保护好/合身；负面：尺寸偏小/松动', evidence: '近 90 天 142 条样本', action: '5 点正面回应"严丝合缝/久用不松"' }),
      cachedUntil, now
    );

    // ---------- 2 listing_scores (T1 + T2) ----------
    function insertScore(targetId, suffix) {
      const sid = 'm1s-' + (seedTag.toString(16).slice(0, 6)) + suffix;
      const rngS = mulberry32(hashStr(targetId + '-seed-score'));
      const ts = 60 + Math.floor(rngS() * 25);
      const bs = 55 + Math.floor(rngS() * 30);
      const ms = 65 + Math.floor(rngS() * 25);
      const aps = 50 + Math.floor(rngS() * 35);
      const rs = 60 + Math.floor(rngS() * 30);
      const total = Math.round((ts + bs + ms + aps + rs) / 5);
      const detail = (label, sc) => ({
        rationale: `${label} 当前 ${sc}：关键词覆盖 / 结构 / 转化导向综合。`,
        sub: [
          { label: '关键词覆盖', score: sc - 4 },
          { label: '结构完整性', score: sc + 2 },
          { label: '转化导向', score: sc - 1 },
        ],
      });
      const improvement = [
        { field: 'main_image', dimension: '主图', suggestion: '加 1 行卖点叠字', expected_lift: 8 },
        { field: 'bullets', dimension: '5 点', suggestion: '按场景/痛点/方案重写', expected_lift: 7 },
        { field: 'title', dimension: '标题', suggestion: '前置核心关键词', expected_lift: 5 },
      ];
      db.prepare(`INSERT OR IGNORE INTO m1_listing_scores(
        id, user_id, store_id, target_id, scored_at, total_score,
        title_score, title_detail, bullets_score, bullets_detail,
        main_image_score, main_image_detail, a_plus_score, a_plus_detail,
        reviews_score, reviews_detail, improvement_ranking)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        sid, userId, storeId, targetId, now, total,
        ts, JSON.stringify(detail('标题', ts)),
        bs, JSON.stringify(detail('5 点', bs)),
        ms, JSON.stringify(detail('主图', ms)),
        aps, JSON.stringify(detail('A+', aps)),
        rs, JSON.stringify(detail('评论', rs)),
        JSON.stringify(improvement)
      );
    }
    insertScore(t1Id, 's1');
    insertScore(t2Id, 's2');

    // ---------- T1: 3 rounds runs + versions ----------
    const versionIds = [];
    for (let round = 1; round <= 3; round++) {
      const runId = 'm1run-' + (seedTag.toString(16).slice(0, 6)) + round;
      const verId = 'm1v-' + (seedTag.toString(16).slice(0, 6)) + round;
      versionIds.push(verId);
      const rngR = mulberry32(hashStr(t1Id + '-seed-r' + round));
      const tag = ['baseline', 'iter2', 'iter3'][round - 1];
      const title = round === 1
        ? '[导入] CASE-001 · 待优化标题'
        : `[导入] CASE-001 · 待优化标题 [改·${tag}]`;
      const b1 = `Slim shockproof case for iPhone (${tag})`;
      const b2 = `Soft TPU + PC hybrid for daily drops (${tag})`;
      const b3 = `MagSafe & wireless charging compatible (${tag})`;
      const b4 = `Raised camera lip + button cutouts (${tag})`;
      const b5 = `12-month warranty + 30-day return (${tag})`;
      const desc = round === 1 ? '初始导入版本' : `第 ${round} 轮 AI 迭代 · 基于运营反馈调整 5 点结构`;

      db.prepare(`INSERT OR IGNORE INTO m1_optimization_runs(
        id, user_id, store_id, target_id, round_no, feedback_text, marked_fields,
        style_short_long, style_rational_emotional, style_seo_natural,
        status, version_id, generation_time_ms, created_at, completed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        runId, userId, storeId, t1Id, round,
        round === 1 ? null : `第 ${round} 轮 · 突出防摔 + 严丝合缝`,
        JSON.stringify(round === 1 ? [] : ['title', 'bullet_1']),
        0.5, 0.5, 0.5, 'completed', verId, 320 + Math.floor(rngR() * 80),
        now, now
      );

      db.prepare(`INSERT OR IGNORE INTO m1_listing_versions(
        id, user_id, store_id, target_id, run_id, round_no, source,
        title, bullet_1, bullet_2, bullet_3, bullet_4, bullet_5, description,
        a_plus_modules, main_image_id, side_image_ids, a_plus_image_ids,
        field_picks_hash, is_pinned, is_archived, uploaded_to_amazon, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        verId, userId, storeId, t1Id, runId, round,
        round === 1 ? 'initial_import' : 'ai_iteration',
        title, b1, b2, b3, b4, b5, desc,
        JSON.stringify([]), null, JSON.stringify([]), JSON.stringify([]),
        null, 0, 0, 0, now
      );
    }

    // ---------- T1: 5 images on latest version (round 3) ----------
    const v3Id = versionIds[2];
    const slots = ['main', 'side_1', 'side_2', 'side_3', 'side_4'];
    const imageIds = [];
    for (let i = 0; i < slots.length; i++) {
      const imgId = 'm1img-' + (seedTag.toString(16).slice(0, 6)) + 'i' + i;
      imageIds.push(imgId);
      db.prepare(`INSERT OR IGNORE INTO m1_generated_images(
        id, user_id, store_id, target_id, version_id, slot, prompt, ref_image_url,
        style_ref_asin, model, resolution, status, generated_url, post_processed,
        error_message, generation_time_ms, created_at, completed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        imgId, userId, storeId, t1Id, v3Id, slots[i],
        `${slots[i]} · CASE-001 ${slots[i] === 'main' ? '主图白底 + 叠字' : '副图 lifestyle 场景'}`,
        null, null, 'imagen-2', '1500x1500', 'completed',
        `https://picsum.photos/seed/${imgId}/1500/1500`, 1,
        null, 350, now, now
      );
    }
    // Update v3 with image ids
    db.prepare(`UPDATE m1_listing_versions SET main_image_id = ?, side_image_ids = ? WHERE id = ?`).run(
      imageIds[0], JSON.stringify(imageIds.slice(1)), v3Id
    );

    // ---------- T1: 1 A/B test 7 days mock metrics ----------
    const abId = 'm1ab-' + (seedTag.toString(16).slice(0, 6)) + 'ab1';
    const abStarted = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const abEnds = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare(`INSERT OR IGNORE INTO m1_ab_tests(
      id, user_id, store_id, target_id, asin, test_type, amazon_experiment_id,
      control_version_id, treatment_version_id, duration_days, started_at, ends_at,
      status, winner, lift, significance, manual_guidance, audit_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      abId, userId, storeId, t1Id, caseProduct?.asin || 'B0CASE001',
      'main_image', 'amzn-exp-mock-001',
      versionIds[1], versionIds[2], 14, abStarted, abEnds,
      'running', null, null, null, null, null, abStarted, now
    );

    const rngAb = mulberry32(hashStr(abId + '-seed'));
    const baseDay = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    for (let d = 0; d < 7; d++) {
      const date = new Date(baseDay.getTime() + d * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const cImp = 900 + Math.floor(rngAb() * 300);
      const cClk = Math.floor(cImp * (0.04 + rngAb() * 0.02));
      const cOrd = Math.floor(cClk * (0.10 + rngAb() * 0.04));
      const tImp = 900 + Math.floor(rngAb() * 300);
      const tClk = Math.floor(tImp * (0.045 + rngAb() * 0.025));
      const tOrd = Math.floor(tClk * (0.12 + rngAb() * 0.05));
      db.prepare(`INSERT OR IGNORE INTO m1_ab_metrics(
        id, user_id, store_id, ab_test_id, date, arm,
        impressions, clicks, orders, units, ctr, cvr, sales, raw)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        'm1met-' + (seedTag.toString(16).slice(0, 6)) + 'c' + d, userId, storeId, abId, date, 'control',
        cImp, cClk, cOrd, cOrd, cClk / cImp, cClk > 0 ? cOrd / cClk : 0, cOrd * 19.99, JSON.stringify({})
      );
      db.prepare(`INSERT OR IGNORE INTO m1_ab_metrics(
        id, user_id, store_id, ab_test_id, date, arm,
        impressions, clicks, orders, units, ctr, cvr, sales, raw)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        'm1met-' + (seedTag.toString(16).slice(0, 6)) + 't' + d, userId, storeId, abId, date, 'treatment',
        tImp, tClk, tOrd, tOrd, tClk / tImp, tClk > 0 ? tOrd / tClk : 0, tOrd * 19.99, JSON.stringify({})
      );
    }
  });
  tx();
}

// ============================================================
// Cleanup hook
// ============================================================
export const LISTINGS_TABLES_TO_CLEAN = [
  'm1_optimization_targets',
  'm1_research_reports',
  'm1_listing_scores',
  'm1_optimization_runs',
  'm1_listing_versions',
  'm1_generated_images',
  'm1_ab_tests',
  'm1_ab_metrics',
];
