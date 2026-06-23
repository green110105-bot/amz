// store-routes-monitor.mjs — M4 监控 / 评价 / 申诉 / 恢复 / 跟卖 / 侵权 / 竞品 / 通知 HTTP 路由
// 路径前缀 /api/v1/store/m4/...
// 需 Bearer token + X-Store-Id; 写操作走 appendAuditLog(sourceModule='M4').

import { securityHeaders } from './security.mjs';
import { whoAmI, defaultStoreIdFor, getDbInstance, resolveStoreScope } from './data-store.mjs';
import { providerMode, realWritesEnabled } from './integrations/provider-mode.mjs';
import { getTikTokDashboard } from './integrations/lingxing/tiktok-sync.mjs';

// X-P0-04 / M4-P0-05: the server alone decides whether a real store write is requested
// for an M4 -> Ads linked action. When real writes are not enabled the flag is hard-
// forced false; the frontend body flag is never trusted on its own.
function clampRealWriteBody(body = {}) {
  return {
    ...body,
    requiresRealStoreWrite: realWritesEnabled() ? body.requiresRealStoreWrite === true : false,
  };
}
import {
  // Anomalies
  listAnomalies, anomalySummary, getAnomaly,
  createAnomaly, assignAnomaly, acknowledgeAnomaly, resolveAnomaly, dismissAnomaly, escalateAnomaly,
  // SLA
  slaBoard, listSlaEvents,
  // Cases
  listCases, getCase, createCase, updateCase, recommendCases,
  // Postmortems
  listPostmortems, getPostmortem, generatePostmortem, updatePostmortem,
  // Hijacking
  listHijacking, getHijacking, scanHijacking, startTestBuy, uploadHijackingProof, submitHijackingAppeal, closeHijacking,
  // Infringement
  listInfringement, createInfringement, draftInfringement, submitInfringement, resolveInfringement,
  // Reviews
  listReviewsM4, getReviewM4, syncReviews, markReviewAppealable, pushReviewToM1,
  // Clusters
  listClusters, getCluster, recomputeClusters, pushClusterToM1,
  // Trends
  listTrends, snapshotTrends,
  // Appeals
  listAppeals, getAppeal, draftAppeal, submitAppeal, reviewAppeal, retryAppeal,
  // Recovery
  listRecovery, getRecovery, draftRecovery, sendRecovery, recordRecoveryReply, nextRoundRecovery,
  // Competitors
  listCompetitors, addCompetitor, snapshotCompetitors, competitorTimeline, dismissCompetitorChange,
  // ImageDiffs
  listImageDiffs, scanImageDiffs, pushImageDiffToM1,
  // BrandDefense
  getBrandDefense, enableBrandLayer, disableBrandLayer, counterBrand,
  // Notifications
  listNotifications, createNotification, markNotificationRead, markAllNotificationsRead, unreadNotificationCount,
} from './data-store-monitor.mjs';

function getDb() { return getDbInstance(); }

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...securityHeaders() },
  });
}
async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}
function requireAuth(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return { error: json({ error: 'unauthorized' }, 401) };
  const u = whoAmI(token);
  if (!u) return { error: json({ error: 'unauthorized' }, 401) };
  // X-P1-04: x-store-id ownership check. A spoofed store-id owned by another tenant
  // must be rejected with 403 store_not_owned, never silently honored.
  const scope = resolveStoreScope(u.id, request.headers.get('x-store-id'));
  if (scope.error) return { error: json({ error: 'store_not_owned' }, 403) };
  if (!scope.storeId) return { error: json({ error: 'store_required' }, 403) };
  return { user: u, userId: u.id, storeId: scope.storeId };
}
function notFound() { return json({ error: 'not_found' }, 404); }
function badReq(message) { return json({ error: 'validation_failed', message }, 400); }
function badState(message) { return json({ error: 'state_transition_forbidden', message }, 400); }
function conflict(message) { return json({ error: 'conflict', message }, 409); }

function mapResult(r) {
  if (!r) return notFound();
  if (r.error === 'validation_failed') return json(r, 400);
  if (r.error === 'state_transition_forbidden') return json(r, 400);
  if (r.error === 'conflict') return json(r, 409);
  if (r.error === 'not_found') return notFound();
  return json(r);
}

// ============================================================
// M4 Daily Report (read-only operating snapshot)
//
// X-P1-02: dailySourceMetaFor decouples mock/real判定 from providerMode. There is NO
// `mode==='real'` hard gate — a dimension is "real" iff there is a genuine successful
// real sync row for its backing provider (hasSuccessfulSync). Under 'hybrid' a dimension
// with a successful spapi/ads sync therefore reports mock:false; a dimension that is
// always pseudo-random (competitorBsr/categoryRank — M4-P1-05 / M4-P2-05) is forced
// mock:true regardless of providerMode.
// ============================================================
function hasSuccessfulSync(db, userId, storeId, provider) {
  try {
    const row = db.prepare(
      "SELECT 1 FROM sync_runs WHERE user_id=? AND store_id=? AND provider=? AND status='success' LIMIT 1"
    ).get(userId, storeId, provider);
    return !!row;
  } catch {
    return false;
  }
}

function dailySourceMetaFor(db, userId, storeId) {
  const mode = providerMode();
  const spapiReal = hasSuccessfulSync(db, userId, storeId, 'spapi');
  const adsReal = hasSuccessfulSync(db, userId, storeId, 'ads')
    || hasSuccessfulSync(db, userId, storeId, 'ads-api')
    || hasSuccessfulSync(db, userId, storeId, 'adsApi');
  const meta = (mock, provider) => ({ mock, provider, mode });
  return {
    // spapi-backed sales dimensions: real iff a successful spapi sync exists.
    sales: meta(!spapiReal, 'spapi'),
    gmv: meta(!spapiReal, 'spapi'),
    rating: meta(!spapiReal, 'spapi'),
    // ads-backed spend dimension.
    adSpend: meta(!adsReal, 'ads'),
    // M4-P1-05 / M4-P2-05: competitor BSR (示意) + its legacy categoryRank alias are
    // produced by deterministic pseudo-random seeding with no real collector → always mock.
    competitorBsr: meta(true, 'pseudo_random'),
    categoryRank: meta(true, 'pseudo_random'),
    // alerts are derived from anomaly/notification tables (locally stored) → not a real
    // Amazon read, treated as non-real provenance for the realDataOnly gate.
    alerts: meta(true, 'local'),
    // B-5: recovered (已挽回) is a simulated per-review projection → always mock/simulated.
    recovered: meta(true, 'simulated'),
  };
}

// B-5: 已挽回口径水印 — recovered amount MUST be split into estimated vs realized
//双字段, never collapsed into a single ambiguous "已挽回¥X". `realized` counts only
// recovery emails whose buyer actually replied with an updated review
// (status='review_updated'); `estimated` is a modeled projection over the in-flight
// recovery backlog (drafted/marked_sent/replied but not yet review_updated). Because no
// real Amazon refund/GMV figure is wired, BOTH numbers are simulated and MUST carry a
// '模拟/预估' watermark so they are never presented as realized cash to外部.
const RECOVERED_PER_REVIEW_ESTIMATE = 120; // simulated per-review recovery value (USD)

function recoveredImpactFor(db, userId, storeIds) {
  let realizedCount = 0;
  let estimatedCount = 0;
  for (const sid of storeIds) {
    try {
      const realized = db.prepare(
        "SELECT COUNT(*) AS n FROM m4_recovery_emails WHERE user_id=? AND store_id=? AND status='review_updated'"
      ).get(userId, sid);
      realizedCount += realized?.n || 0;
      // in-flight backlog: every started recovery that has not yet realized a review update.
      const inflight = db.prepare(
        "SELECT COUNT(*) AS n FROM m4_recovery_emails WHERE user_id=? AND store_id=? AND status NOT IN ('review_updated','dismissed','cancelled')"
      ).get(userId, sid);
      estimatedCount += inflight?.n || 0;
    } catch { /* table may not exist yet */ }
  }
  return {
    // realized: based on actually recorded buyer review updates (still modeled $, hence simulated).
    realized: realizedCount * RECOVERED_PER_REVIEW_ESTIMATE,
    realizedCount,
    // estimated: projection over the in-flight backlog — strictly a forecast, not cash.
    estimated: estimatedCount * RECOVERED_PER_REVIEW_ESTIMATE,
    estimatedCount,
    currency: 'USD',
    simulated: true,
    mock: true,
    basis: 'simulated_per_review_estimate',
    perReviewEstimate: RECOVERED_PER_REVIEW_ESTIMATE,
    // 对外不混淆: explicit watermark text the UI must surface verbatim.
    watermark: '模拟/预估',
    disclaimer: '已挽回金额为模拟/预估口径, 非真实退款或 GMV; realized 仅统计已确认的评价更新, estimated 为在途挽回的预估。',
  };
}

export function buildDailyReport(db, userId, storeId, { storeIds, date, linkId, triggerType } = {}) {
  const reportDate = date || new Date().toISOString().slice(0, 10);

  // available stores (multi-store aware), but we render the requested store(s).
  const storeRows = db.prepare(
    'SELECT id, name, region, currency FROM user_stores WHERE user_id=? AND store_archived_at IS NULL ORDER BY added_at'
  ).all(userId);
  const availableStores = storeRows.map((s) => ({ id: s.id, name: s.name, region: s.region, currency: s.currency }));

  let availableLinks = [];
  try {
    availableLinks = db.prepare(
      'SELECT id, store_id FROM m2_inventory_link_config WHERE user_id=? ORDER BY updated_at DESC'
    ).all(userId).map((l) => ({ id: l.id, storeId: l.store_id, label: l.id }));
  } catch { availableLinks = []; }

  // resolve the target store list.
  const allStoreIds = storeRows.map((s) => s.id);
  let targetStoreIds;
  if (!storeIds || storeIds === 'all') targetStoreIds = allStoreIds.length ? allStoreIds : [storeId];
  else targetStoreIds = storeIds.split(',').filter((x) => allStoreIds.includes(x));
  if (!targetStoreIds.length) targetStoreIds = [storeId];

  const sourceMeta = dailySourceMetaFor(db, userId, storeId);

  // Deterministic per-store summary derived from locally available rows (read-only).
  const perStore = targetStoreIds.map((sid) => {
    const s = storeRows.find((r) => r.id === sid) || { id: sid, name: sid, region: '', currency: 'USD' };
    // alerts: M4-P2-02 — dedup anomaly+notification of the SAME event by
    // related_resource_type + related_resource_id so one event counts once.
    const openAnomalies = db.prepare(
      "SELECT id FROM m4_anomalies WHERE user_id=? AND store_id=? AND status NOT IN ('resolved','dismissed','closed')"
    ).all(userId, sid);
    const anomalyKeys = new Set(openAnomalies.map((a) => 'anomaly:' + a.id));
    let notifs = [];
    try {
      notifs = db.prepare(
        'SELECT related_resource_type, related_resource_id FROM m4_notifications WHERE user_id=? AND store_id=?'
      ).all(userId, sid);
    } catch { notifs = []; }
    let extraAlertKeys = 0;
    const seen = new Set(anomalyKeys);
    for (const n of notifs) {
      const key = (n.related_resource_type || 'notif') + ':' + (n.related_resource_id || '');
      if (n.related_resource_id && seen.has(key)) continue; // deduped against same-event anomaly
      if (seen.has(key)) continue;
      seen.add(key);
      extraAlertKeys++;
    }
    const alerts = anomalyKeys.size + extraAlertKeys;

    // sales/gmv/adSpend/rating from available rows (best-effort, read-only).
    let unitsSold = 0, gmv = 0, adSpend = 0, avgRating = 0;
    try {
      const r = db.prepare('SELECT AVG(rating) AS avg FROM reviews WHERE user_id=? AND store_id=?').get(userId, sid);
      avgRating = Math.round((r?.avg || 0) * 100) / 100;
    } catch {}

    // competitorBsr (示意): single-competitor lock — pick the latest competitor_asin and
    // compare ONLY against that same competitor's previous snapshot (M4-P1-05).
    let competitorBsr = null, competitorBsrDelta = null;
    try {
      const latest = db.prepare(
        'SELECT competitor_asin, bsr, snapshot_at FROM m4_competitor_snapshots WHERE user_id=? AND store_id=? AND bsr IS NOT NULL ORDER BY snapshot_at DESC LIMIT 1'
      ).get(userId, sid);
      if (latest) {
        competitorBsr = latest.bsr;
        const prev = db.prepare(
          'SELECT bsr FROM m4_competitor_snapshots WHERE user_id=? AND store_id=? AND competitor_asin=? AND snapshot_at < ? AND bsr IS NOT NULL ORDER BY snapshot_at DESC LIMIT 1'
        ).get(userId, sid, latest.competitor_asin, latest.snapshot_at);
        if (prev) competitorBsrDelta = latest.bsr - prev.bsr;
      }
    } catch {}

    return {
      storeId: sid, storeName: s.name, region: s.region, currency: s.currency,
      unitsSold, gmv, adSpend, avgRating, alerts,
      competitorBsr, competitorBsrDelta,
    };
  });

  // B-5: estimated vs realized recovered impact (simulated, watermarked).
  const recovered = recoveredImpactFor(db, userId, targetStoreIds);

  const summary = {
    unitsSold: perStore.reduce((a, b) => a + (b.unitsSold || 0), 0),
    gmv: perStore.reduce((a, b) => a + (b.gmv || 0), 0),
    adSpend: perStore.reduce((a, b) => a + (b.adSpend || 0), 0),
    acos: 0,
    avgRating: perStore.length ? Math.round((perStore.reduce((a, b) => a + (b.avgRating || 0), 0) / perStore.length) * 100) / 100 : 0,
    alerts: perStore.reduce((a, b) => a + (b.alerts || 0), 0),
    // 已挽回口径: 双字段 + 水印, 绝不合并为单一 "已挽回¥X"。
    recovered,
  };

  // 7-day real-data trend skeleton (read-only).
  const trends = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    trends.push({ date: d, unitsSold: 0, gmv: 0, adSpend: 0, avgRating: summary.avgRating });
  }

  // link dimension rows.
  let links = [];
  if (linkId) {
    const lk = availableLinks.find((l) => l.id === linkId);
    if (lk) links = [{ linkId: lk.id, storeId: lk.storeId, unitsSold: 0, gmv: 0, adSpend: 0, alerts: 0 }];
  } else {
    links = availableLinks.map((l) => ({ linkId: l.id, storeId: l.storeId, unitsSold: 0, gmv: 0, adSpend: 0, alerts: 0 }));
  }

  // realDataOnly: derived ONLY from real-capable dimensions (sales/gmv/adSpend/rating);
  // the always-mock competitorBsr/categoryRank/alerts never drag it permanently false.
  const realCapable = ['sales', 'gmv', 'adSpend', 'rating'];
  const realDataOnly = realCapable.every((k) => sourceMeta[k] && sourceMeta[k].mock === false);

  return {
    reportDate,
    triggerType: triggerType || 'on_demand',
    generatedAt: new Date().toISOString(),
    stores: perStore,
    links,
    availableStores,
    availableLinks,
    summary,
    sourceMeta,
    trends,
    filters: { storeIds: storeIds || 'all', linkId: linkId || null, realDataOnly },
    deepLinks: {
      ads: '/ads/reports',
      reviews: '/reviews/trends',
      anomalies: '/monitor/anomalies',
      competitors: '/competitors/image-diff',
    },
  };
}

export async function handleMonitorRequest(request) {
  try {
    return await _impl(request);
  } catch (err) {
    const msg = String(err && err.message || err);
    try { console.error('[m4-route]', request.method, request.url, msg); } catch {}
    return json({ error: 'internal_error', message: msg }, 500);
  }
}

async function _impl(request) {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname;
  const method = (request.method || 'GET').toUpperCase();
  if (!path.startsWith('/api/v1/store/m4/')) return null;

  const a = requireAuth(request);
  if (a.error) return a.error;
  const { userId, storeId } = a;
  const db = getDb();
  const params = url.searchParams;
  let m;

  // ============================================================
  // 3.0 Daily Report (read-only operating snapshot, no audit side effects)
  // ============================================================
  if (path === '/api/v1/store/m4/reports/daily' && method === 'GET') {
    return json(buildDailyReport(db, userId, storeId, {
      storeIds: params.get('storeIds'),
      date: params.get('date'),
      linkId: params.get('linkId'),
    }));
  }

  // TikTok 日报看板 (领星 OpenAPI; 无凭证时返回 mock 并诚实标注)
  if (path === '/api/v1/store/m4/tiktok/daily' && method === 'GET') {
    const data = await getTikTokDashboard(db, userId, storeId, {
      date: params.get('date') || undefined,
      refresh: params.get('refresh') === '1' || params.get('refresh') === 'true',
    });
    return json(data);
  }

  // ============================================================
  // 3.1 Anomalies (8)
  // ============================================================
  if (path === '/api/v1/store/m4/anomalies') {
    if (method === 'GET') {
      const filters = {
        severity: params.get('severity'), status: params.get('status'),
        assignee: params.get('assignee'), sku: params.get('sku'),
        asin: params.get('asin'), q: params.get('q'),
      };
      const items = listAnomalies(db, userId, storeId, filters);
      const summary = anomalySummary(db, userId, storeId);
      return json({ items, summary, total: items.length });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createAnomaly(db, userId, storeId, body);
      if (r && r.error) return json(r, 400);
      return json(r, 201);
    }
  }
  m = path.match(/^\/api\/v1\/store\/m4\/anomalies\/([\w-]+)$/);
  if (m && method === 'GET') {
    const r = getAnomaly(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/m4\/anomalies\/([\w-]+)\/(assign|acknowledge|resolve|dismiss|escalate)$/);
  if (m && method === 'POST') {
    const id = m[1], op = m[2];
    const body = await readJson(request);
    let r = null;
    if (op === 'assign') r = assignAnomaly(db, userId, storeId, id, body);
    else if (op === 'acknowledge') r = acknowledgeAnomaly(db, userId, storeId, id);
    else if (op === 'resolve') r = resolveAnomaly(db, userId, storeId, id, body);
    else if (op === 'dismiss') r = dismissAnomaly(db, userId, storeId, id, body);
    else if (op === 'escalate') r = escalateAnomaly(db, userId, storeId, id, body);
    return mapResult(r);
  }

  // ============================================================
  // 3.2 SLA (2)
  // ============================================================
  if (path === '/api/v1/store/m4/sla/board' && method === 'GET') {
    return json(slaBoard(db, userId, storeId, params.get('range') || '7d'));
  }
  if (path === '/api/v1/store/m4/sla/events' && method === 'GET') {
    return json({ items: listSlaEvents(db, userId, storeId, params.get('anomalyId')) });
  }

  // ============================================================
  // 3.3 Cases (5)
  // ============================================================
  if (path === '/api/v1/store/m4/cases') {
    if (method === 'GET') {
      return json({ items: listCases(db, userId, storeId, {
        status: params.get('status'), q: params.get('q'), reusable: params.get('reusable'),
      }) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createCase(db, userId, storeId, body);
      if (r && r.error) return json(r, 400);
      return json(r, 201);
    }
  }
  if (path === '/api/v1/store/m4/cases/recommend' && method === 'GET') {
    const r = recommendCases(db, userId, storeId, params.get('anomalyId'));
    return json({ items: r });
  }
  m = path.match(/^\/api\/v1\/store\/m4\/cases\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') return mapResult(getCase(db, userId, storeId, id));
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      return mapResult(updateCase(db, userId, storeId, id, body));
    }
  }

  // ============================================================
  // 3.4 Postmortems (4)
  // ============================================================
  if (path === '/api/v1/store/m4/postmortems' && method === 'GET') {
    return json({ items: listPostmortems(db, userId, storeId, { verdict: params.get('verdict') }) });
  }
  if (path === '/api/v1/store/m4/postmortems/generate' && method === 'POST') {
    const body = await readJson(request);
    const r = generatePostmortem(db, userId, storeId, body);
    if (r && r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/postmortems\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') return mapResult(getPostmortem(db, userId, storeId, id));
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      return mapResult(updatePostmortem(db, userId, storeId, id, body));
    }
  }

  // ============================================================
  // 3.5 Hijacking (6)
  // ============================================================
  if (path === '/api/v1/store/m4/hijacking' && method === 'GET') {
    return json({ items: listHijacking(db, userId, storeId, {
      status: params.get('status'), type: params.get('type'),
    }) });
  }
  if (path === '/api/v1/store/m4/hijacking/scan' && method === 'POST') {
    const body = await readJson(request);
    return json(scanHijacking(db, userId, storeId, body), 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/hijacking\/([\w-]+)\/(start-test-buy|upload-proof|submit-appeal|close)$/);
  if (m && method === 'POST') {
    const id = m[1], op = m[2];
    // M4 -> Ads linked ops must not trust the frontend real-write flag.
    const body = clampRealWriteBody(await readJson(request));
    let r = null;
    if (op === 'start-test-buy') r = startTestBuy(db, userId, storeId, id);
    else if (op === 'upload-proof') r = uploadHijackingProof(db, userId, storeId, id, body);
    else if (op === 'submit-appeal') r = submitHijackingAppeal(db, userId, storeId, id, body);
    else if (op === 'close') r = closeHijacking(db, userId, storeId, id, body);
    return mapResult(r);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/hijacking\/([\w-]+)$/);
  if (m && method === 'GET') return mapResult(getHijacking(db, userId, storeId, m[1]));

  // ============================================================
  // 3.6 Infringement (5)
  // ============================================================
  if (path === '/api/v1/store/m4/infringement') {
    if (method === 'GET') {
      return json({ items: listInfringement(db, userId, storeId, {
        status: params.get('status'), type: params.get('type'),
      }) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createInfringement(db, userId, storeId, body);
      if (r && r.error) return json(r, 400);
      return json(r, 201);
    }
  }
  m = path.match(/^\/api\/v1\/store\/m4\/infringement\/([\w-]+)\/(draft|submit|resolve)$/);
  if (m && method === 'POST') {
    const id = m[1], op = m[2];
    const body = await readJson(request);
    let r = null;
    if (op === 'draft') r = draftInfringement(db, userId, storeId, id, body);
    else if (op === 'submit') r = submitInfringement(db, userId, storeId, id, body);
    else if (op === 'resolve') r = resolveInfringement(db, userId, storeId, id, body);
    return mapResult(r);
  }

  // ============================================================
  // 3.7 Reviews (5)
  // ============================================================
  if (path === '/api/v1/store/m4/reviews' && method === 'GET') {
    return json(listReviewsM4(db, userId, storeId, {
      sentiment: params.get('sentiment'), rating: params.get('rating'),
      clusterId: params.get('clusterId'), asin: params.get('asin'),
      q: params.get('q'),
    }));
  }
  if (path === '/api/v1/store/m4/reviews/sync' && method === 'POST') {
    const body = await readJson(request);
    return json(syncReviews(db, userId, storeId, body), 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/reviews\/([\w-]+)$/);
  if (m && method === 'GET') {
    return mapResult(getReviewM4(db, userId, storeId, m[1]));
  }
  m = path.match(/^\/api\/v1\/store\/m4\/reviews\/([\w-]+)\/(mark-appealable|push-m1)$/);
  if (m && method === 'POST') {
    const id = m[1], op = m[2];
    const body = await readJson(request);
    if (op === 'mark-appealable') return mapResult(markReviewAppealable(db, userId, storeId, id, body));
    if (op === 'push-m1') return mapResult(pushReviewToM1(db, userId, storeId, id, body));
  }

  // ============================================================
  // 3.8 Review Clusters (4)
  // ============================================================
  if (path === '/api/v1/store/m4/review-clusters' && method === 'GET') {
    return json({ items: listClusters(db, userId, storeId, {
      status: params.get('status'), asin: params.get('asin'),
    }) });
  }
  if (path === '/api/v1/store/m4/review-clusters/recompute' && method === 'POST') {
    const body = await readJson(request);
    return json(recomputeClusters(db, userId, storeId, body), 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/review-clusters\/([\w-]+)$/);
  if (m && method === 'GET') return mapResult(getCluster(db, userId, storeId, m[1]));
  m = path.match(/^\/api\/v1\/store\/m4\/review-clusters\/([\w-]+)\/push-m1$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    return mapResult(pushClusterToM1(db, userId, storeId, m[1], body));
  }

  // ============================================================
  // 3.9 Review Trends (2)
  // ============================================================
  if (path === '/api/v1/store/m4/review-trends' && method === 'GET') {
    return json({ items: listTrends(db, userId, storeId, params.get('asin')) });
  }
  if (path === '/api/v1/store/m4/review-trends/snapshot' && method === 'POST') {
    const body = await readJson(request);
    return json(snapshotTrends(db, userId, storeId, body), 201);
  }

  // ============================================================
  // 3.10 Appeals (5)
  // ============================================================
  if (path === '/api/v1/store/m4/appeals' && method === 'GET') {
    return json(listAppeals(db, userId, storeId, { status: params.get('status') }));
  }
  if (path === '/api/v1/store/m4/appeals/draft' && method === 'POST') {
    const body = await readJson(request);
    const r = draftAppeal(db, userId, storeId, body);
    if (r && r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/appeals\/([\w-]+)\/(submit|review|retry)$/);
  if (m && method === 'POST') {
    const id = m[1], op = m[2];
    const body = await readJson(request);
    let r = null;
    if (op === 'submit') r = submitAppeal(db, userId, storeId, id);
    else if (op === 'review') r = reviewAppeal(db, userId, storeId, id, body);
    else if (op === 'retry') r = retryAppeal(db, userId, storeId, id, body);
    return mapResult(r);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/appeals\/([\w-]+)$/);
  if (m && method === 'GET') return mapResult(getAppeal(db, userId, storeId, m[1]));

  // ============================================================
  // 3.11 Recovery (5)
  // ============================================================
  if (path === '/api/v1/store/m4/recovery' && method === 'GET') {
    return json({ items: listRecovery(db, userId, storeId, { status: params.get('status') }) });
  }
  if (path === '/api/v1/store/m4/recovery/draft' && method === 'POST') {
    const body = await readJson(request);
    const r = draftRecovery(db, userId, storeId, body);
    if (r && r.error === 'validation_failed') return json(r, 400);
    if (r && r.error === 'not_found') return notFound();
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/recovery\/([\w-]+)\/(send|record-reply|next-round)$/);
  if (m && method === 'POST') {
    const id = m[1], op = m[2];
    const body = await readJson(request);
    let r = null;
    if (op === 'send') r = sendRecovery(db, userId, storeId, id, body);
    else if (op === 'record-reply') r = recordRecoveryReply(db, userId, storeId, id, body);
    else if (op === 'next-round') r = nextRoundRecovery(db, userId, storeId, id, body);
    return mapResult(r);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/recovery\/([\w-]+)$/);
  if (m && method === 'GET') return mapResult(getRecovery(db, userId, storeId, m[1]));

  // ============================================================
  // 3.12 Competitors (5)
  // ============================================================
  if (path === '/api/v1/store/m4/competitors') {
    if (method === 'GET') {
      return json({ items: listCompetitors(db, userId, storeId, params.get('asin')) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = addCompetitor(db, userId, storeId, body);
      if (r && r.error) return json(r, 400);
      return json(r, 201);
    }
  }
  if (path === '/api/v1/store/m4/competitors/snapshot' && method === 'POST') {
    const body = await readJson(request);
    return json(snapshotCompetitors(db, userId, storeId, body), 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/competitors\/([\w]+)\/timeline$/);
  if (m && method === 'GET') {
    return json({ items: competitorTimeline(db, userId, storeId, m[1], { from: params.get('from'), to: params.get('to') }) });
  }
  m = path.match(/^\/api\/v1\/store\/m4\/competitors\/([\w]+)\/dismiss-change$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    return mapResult(dismissCompetitorChange(db, userId, storeId, m[1], body));
  }

  // ============================================================
  // 3.13 Image Diffs (3)
  // ============================================================
  if (path === '/api/v1/store/m4/image-diffs' && method === 'GET') {
    return json({ items: listImageDiffs(db, userId, storeId, {
      status: params.get('status'), competitorAsin: params.get('competitorAsin'),
    }) });
  }
  if (path === '/api/v1/store/m4/image-diffs/scan' && method === 'POST') {
    const body = await readJson(request);
    return json(scanImageDiffs(db, userId, storeId, body), 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/image-diffs\/([\w-]+)\/push-m1$/);
  if (m && method === 'POST') {
    return mapResult(pushImageDiffToM1(db, userId, storeId, m[1]));
  }

  // ============================================================
  // 3.14 Brand Defense (4)
  // ============================================================
  if (path === '/api/v1/store/m4/brand-defense' && method === 'GET') {
    return json(getBrandDefense(db, userId, storeId));
  }
  if (path === '/api/v1/store/m4/brand-defense/counter' && method === 'POST') {
    const body = await readJson(request);
    const r = counterBrand(db, userId, storeId, body);
    if (r && r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m4\/brand-defense\/([\w_]+)\/(enable|disable)$/);
  if (m && method === 'POST') {
    const code = m[1], op = m[2];
    const body = await readJson(request);
    let r = null;
    if (op === 'enable') r = enableBrandLayer(db, userId, storeId, code, body);
    else if (op === 'disable') r = disableBrandLayer(db, userId, storeId, code, body);
    return mapResult(r);
  }

  // ============================================================
  // 3.15 Notifications (5)
  // ============================================================
  if (path === '/api/v1/store/m4/notifications') {
    if (method === 'GET') {
      return json(listNotifications(db, userId, storeId, {
        severity: params.get('severity'), source: params.get('source'),
        unread: params.get('unread'), since: params.get('since'),
      }));
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createNotification(db, userId, storeId, body);
      if (r && r.error) return json(r, 400);
      return json(r, 201);
    }
  }
  if (path === '/api/v1/store/m4/notifications/read-all' && method === 'POST') {
    return json(markAllNotificationsRead(db, userId, storeId));
  }
  if (path === '/api/v1/store/m4/notifications/unread-count' && method === 'GET') {
    return json(unreadNotificationCount(db, userId, storeId));
  }
  m = path.match(/^\/api\/v1\/store\/m4\/notifications\/([\w-]+)\/read$/);
  if (m && method === 'POST') {
    return mapResult(markNotificationRead(db, userId, storeId, m[1]));
  }

  return null;
}
