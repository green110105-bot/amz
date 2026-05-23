// store-routes-monitor.mjs — M4 监控 / 评价 / 申诉 / 恢复 / 跟卖 / 侵权 / 竞品 / 通知 HTTP 路由
// 路径前缀 /api/v1/store/m4/...
// 需 Bearer token + X-Store-Id; 写操作走 appendAuditLog(sourceModule='M4').

import { securityHeaders } from './security.mjs';
import { whoAmI, defaultStoreIdFor, getDbInstance } from './data-store.mjs';
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
  const storeId = request.headers.get('x-store-id') || defaultStoreIdFor(u.id) || '';
  if (!storeId) return { error: json({ error: 'store_required' }, 403) };
  return { user: u, userId: u.id, storeId };
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
    const body = await readJson(request);
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
    if (op === 'send') r = sendRecovery(db, userId, storeId, id);
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
    return json(markNotificationRead(db, userId, m[1]));
  }

  return null;
}
