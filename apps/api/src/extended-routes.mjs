import { handleRequest, json } from './routes.mjs';
import { sampleStore } from '../../../packages/mock-data/src/sample-store.mjs';
import { diagnoseListing } from '../../../packages/domain/src/listing-engine.mjs';
import { clusterReviews, detectCompetitorChanges } from '../../../packages/domain/src/market-intel-engine.mjs';
import { createCodexLocalDecision } from '../../../packages/domain/src/ai-decision-engine.mjs';
import { documentedRoutes } from '../../../packages/contracts/generated/documented-routes.mjs';
import { tryHandleFullScopeRoute } from './full-scope-routes.mjs';
import { handleStoreRequest } from './store-routes.mjs';
import { handleAdsRequest } from './store-routes-ads.mjs';
import { handleListingsRequest } from './store-routes-listings.mjs';
import { handleProfitRequest } from './store-routes-profit.mjs';
import { handleMonitorRequest } from './store-routes-monitor.mjs';
import { handleSyncRequest } from './integrations/sync-routes.mjs';
import { listActionQueue, listSuggestions } from './data-store-ads.mjs';
import { getProfitOverview, listLeaks, listReorders } from './data-store-profit.mjs';
import { unreadNotificationCount } from './data-store-monitor.mjs';
import { applyApiSecurity } from './security.mjs';
import { realWritesEnabled } from './integrations/provider-mode.mjs';
import {
  whoAmI, defaultStoreIdFor, getDbInstance, getStoreSnapshot, getProduct,
  listReviews, getCompetitorSnapshots,
} from './data-store.mjs';

// W10: normalize DB ad suggestions into the same card schema the dashboard mock
// audits use, so the frontend normalizeCard can unify both into one Action Inbox.
function listActionSuggestionsForScope(db, userId, storeId) {
  const rows = listSuggestions(db, userId, storeId, {}) || [];
  return rows.map((s) => {
    const severity = s.severity?.level || s.severity || 'medium';
    const requiresApproval = s.guardrail?.status !== 'auto_ok';
    const entityId = s.entity?.id || s.entity?.campaignId || s.id;
    return {
      id: s.id,
      sourceModule: 'M3',
      actionType: s.actionType,
      target: { id: entityId },
      payload: { id: entityId, requiresRealStoreWrite: false },
      expectedImpact: s.impact || {},
      requestedBy: 'system',
      sovereignty: 'manual',
      risk: {
        severity,
        requiresApproval,
        allowed: s.guardrail?.status !== 'blocked',
        reasons: s.guardrail?.reasons || [],
        canRollback: !!(s.rollback || s.rollbackPlan),
        executionMode: 'mock',
      },
      guardrail: s.guardrail || null,
      state: s.state,
      createdAt: s.createdAt,
    };
  });
}

// W17: Single source of truth for the scoped "今日待处理" action cards.
// Both GET /api/v1/dashboard (full body) and GET /api/v1/dashboard/summary
// (lightweight top-bar badge poll) derive their card list / counts from here,
// so NotificationBell 与 Workbench cardSummary 永远同源、不会对不上。
function buildScopedActionCards(db, scope) {
  const queue = listActionQueue(db, scope.userId, scope.storeId, { state: 'queued' }).slice(0, 8);
  const cards = [];
  // ad_suggestion 卡：来自 ad_action_queue（M3）
  for (const item of queue) {
    cards.push({
      type: 'ad_suggestion',
      priority: item.severity?.level || 'medium',
      title: item.sourceStrategyName || item.typedAction?.actionPrimitive || 'Queued action',
      payload: {
        id: item.id,
        evidence: item.typedAction?.currentValue || {},
        expectedImpact: item.expectedImpact || item.impact || {},
        confidence: item.confidence != null ? item.confidence : null,
        recommendation: item.typedAction?.actionPrimitive || item.sourceStrategyName || null,
        auditRequired: item.auditRequired !== false,
        module: 'M3',
        status: item.state,
        href: `/ads/action-queue?id=${item.id}`,
      },
    });
  }
  // profit_leak 卡：来自 M2 漏点
  try {
    const { leaks = [] } = listLeaks(db, scope.userId, scope.storeId, { status: 'pending' }) || {};
    for (const leak of leaks.slice(0, 3)) {
      cards.push({
        type: 'profit_leak',
        priority: leak.severity || 'medium',
        title: leak.type || leak.title || 'PROFIT_LEAK',
        payload: {
          id: leak.id,
          evidence: leak.evidence || {},
          expectedImpact: { monthlyImpact: leak.monthlyImpact || 0 },
          confidence: leak.confidence != null ? leak.confidence : null,
          recommendation: leak.recommendation || null,
          auditRequired: true,
          sku: leak.sku, asin: leak.asin,
        },
      });
    }
  } catch { /* M2 schema not present — skip */ }
  // inventory 卡：来自 M2 补货建议
  try {
    const reorders = listReorders(db, scope.userId, scope.storeId, { status: 'pending' }) || [];
    for (const ro of reorders.filter((r) => r.urgency && r.urgency !== 'low').slice(0, 2)) {
      cards.push({
        type: 'inventory',
        priority: ro.urgency || 'medium',
        title: 'REORDER_DECISION',
        payload: {
          id: ro.id,
          evidence: { daysRemaining: ro.daysRemaining, forecastDaily: ro.forecastDaily },
          expectedImpact: { capitalRequired: ro.capitalRequired || 0 },
          confidence: null,
          recommendation: `补货 ${ro.recommendedQty} 件`,
          auditRequired: true,
          sku: ro.sku,
        },
      });
    }
  } catch { /* skip */ }
  return { cards, queuedActions: queue.length };
}

// W17: derive the {total,p0,p1,p2} counts the same way Workbench.vue cardSummary
// does, so the top-bar badge and the workbench summary stay byte-for-byte aligned.
function summarizeCards(cards) {
  return {
    total: cards.length,
    p0: cards.filter((c) => c.priority === 'P0' || c.priority === 'high' || c.priority === 'critical').length,
    p1: cards.filter((c) => c.priority === 'P1' || c.priority === 'medium').length,
    p2: cards.filter((c) => c.priority === 'P2' || c.priority === 'low').length,
  };
}

function resolveScope(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const user = whoAmI(token);
  if (!user) return null;
  const storeId = request.headers.get('x-store-id') || defaultStoreIdFor(user.id) || '';
  return { userId: user.id, storeId };
}

export async function handleExtendedRequest(request) {
  const url = new URL(request.url, 'http://localhost');
  const method = request.method || 'GET';

  const securityResponse = applyApiSecurity(request);
  if (securityResponse) return securityResponse;

  // 真实凭证 / Sync 触发端点 — 独立前缀，必须先于其他 store 路由
  if (url.pathname.startsWith('/api/v1/integrations/')) {
    const syncResp = await handleSyncRequest(request);
    if (syncResp) return syncResp;
  }

  // M3 广告模块 — 必须先于 handleStoreRequest，避免被通用前缀拦截
  if (url.pathname.startsWith('/api/v1/store/ads/')) {
    const adsResp = await handleAdsRequest(request);
    if (adsResp) return adsResp;
  }

  // M1 商品 Listing 优化模块 — 必须先于 handleStoreRequest
  if (url.pathname.startsWith('/api/v1/store/m1/')) {
    const m1Resp = await handleListingsRequest(request);
    if (m1Resp) return m1Resp;
  }

  // M2 利润 / 库存 / 采购 / 重定价 / 多维度财务模块 — 必须先于 handleStoreRequest
  if (url.pathname.startsWith('/api/v1/store/m2/')) {
    const m2Resp = await handleProfitRequest(request);
    if (m2Resp) return m2Resp;
  }

  // M4 监控 / 评价 / 申诉 / 恢复 / 跟卖 / 侵权 / 竞品 / 通知 — 必须先于 handleStoreRequest
  if (url.pathname.startsWith('/api/v1/store/m4/')) {
    const m4Resp = await handleMonitorRequest(request);
    if (m4Resp) return m4Resp;
  }

  // 真后端 store / auth 路由（替代前端 LocalStorage）
  if (url.pathname.startsWith('/api/v1/auth/') || url.pathname.startsWith('/api/v1/store/')) {
    const storeResp = await handleStoreRequest(request);
    if (storeResp) return storeResp;
  }

  if (method === 'GET' && url.pathname.startsWith('/api/v1/listings/') && url.pathname.endsWith('/diagnosis')) {
    const productId = url.pathname.split('/')[4];
    const scope = resolveScope(request);
    if (scope) {
      const product = getProduct(scope.userId, scope.storeId, productId);
      if (!product) return json({ error: 'product_not_found' }, 404);
      const snap = getStoreSnapshot(scope.userId, scope.storeId);
      return json(diagnoseListing({
        sourceMode: 'db',
        product,
        listing: snap.listings?.[productId],
        searchTerms: snap.searchTerms.filter((item) => item.productId === productId),
        reviews: snap.reviews.filter((item) => item.productId === productId),
        competitors: snap.competitors.filter((item) => item.productId === productId),
      }));
    }
    const product = sampleStore.products.find((item) => item.id === productId);
    if (!product) return json({ error: 'product_not_found' }, 404);
    return json(diagnoseListing({
      sourceMode: 'mock',
      product,
      listing: sampleStore.listings?.[productId],
      searchTerms: sampleStore.searchTerms.filter((item) => item.productId === productId),
      reviews: sampleStore.reviews.filter((item) => item.productId === productId),
      competitors: sampleStore.competitors.filter((item) => item.productId === productId),
    }));
  }

  if (method === 'GET' && url.pathname.startsWith('/api/v1/reviews/') && url.pathname.endsWith('/clusters')) {
    const productId = url.pathname.split('/')[4];
    const scope = resolveScope(request);
    const reviews = scope
      ? listReviews(scope.userId, scope.storeId, productId)
      : sampleStore.reviews.filter((item) => item.productId === productId);
    return json({ sourceMode: scope ? 'db' : 'mock', clusters: clusterReviews(reviews) });
  }

  if (method === 'GET' && url.pathname === '/api/v1/competitors/changes') {
    const scope = resolveScope(request);
    if (scope) {
      const snaps = getCompetitorSnapshots(scope.userId, scope.storeId);
      return json({ sourceMode: 'db', changes: detectCompetitorChanges(snaps.previous, snaps.current) });
    }
    return json({
      sourceMode: 'mock',
      changes: detectCompetitorChanges(sampleStore.competitorSnapshots.previous, sampleStore.competitorSnapshots.current),
    });
  }

  if (method === 'GET' && url.pathname === '/api/v1/dashboard') {
    const scope = resolveScope(request);
    if (scope) {
      const db = getDbInstance();
      const auditCount = db.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE user_id=? AND store_id=?`).get(scope.userId, scope.storeId).n;
      const store = db.prepare(`SELECT id, name, marketplace_id AS marketplaceId, region FROM user_stores WHERE id=? AND user_id=?`).get(scope.storeId, scope.userId);
      // W1: overview 由 aggregateProfit 产出（含 revenue/netProfit/totalCosts/
      // profitMargin/orders/confidence），与 mock 路径同构。
      const { overview } = getProfitOverview(db, scope.userId, scope.storeId, 30);

      // W1/W17: actionCards 统一卡片契约 —— 由 buildScopedActionCards 单一来源
      // 产出，dashboard/summary 角标轮询消费同一份卡片，保证两处计数同源。
      const { cards, queuedActions } = buildScopedActionCards(db, scope);

      return json({
        generatedAt: new Date().toISOString(),
        sourceMode: 'db',
        sourceMeta: { source: 'store-db', mock: false, realWritesEnabled: realWritesEnabled() },
        store: store || { id: scope.storeId },
        summary: {
          queuedActions,
          auditLogs: auditCount,
        },
        overview,
        actionCards: cards,
      });
    }
  }

  // W17: lightweight GET /api/v1/dashboard/summary — 顶栏角标轮询专用。
  // 返回的 cardSummary 与 /api/v1/dashboard 的 actionCards 同源（buildScopedActionCards
  // + summarizeCards），unreadCount 与 NotificationBell 同一通知计数源；前端 bus
  // 轮询此端点即可让铃铛未读数与 Workbench cardSummary.total 永远一致。
  if (method === 'GET' && url.pathname === '/api/v1/dashboard/summary') {
    const scope = resolveScope(request);
    if (scope) {
      const db = getDbInstance();
      const { cards, queuedActions } = buildScopedActionCards(db, scope);
      const cardSummary = summarizeCards(cards);
      const { unreadCount } = unreadNotificationCount(db, scope.userId, scope.storeId);
      return json({
        generatedAt: new Date().toISOString(),
        sourceMode: 'db',
        sourceMeta: { source: 'store-db', mock: false },
        cardSummary,
        queuedActions,
        unreadCount,
      });
    }
    // unauthenticated → fall through to mock (handleRequest) below; the dashboard
    // mock fallback stays intact so the demo surface keeps working.
  }

  // W10: GET /api/v1/ads/suggestions — when scoped (Bearer + x-store-id) serve the
  // DB branch (sourceMode:'db') in a shape normalizeCard can unify with the
  // dashboard schema (risk.severity / risk.requiresApproval / payload.id).
  if (method === 'GET' && url.pathname === '/api/v1/ads/suggestions') {
    const scope = resolveScope(request);
    if (scope) {
      const db = getDbInstance();
      const rows = listActionSuggestionsForScope(db, scope.userId, scope.storeId);
      return json({ sourceMode: 'db', audits: rows });
    }
    // unauthenticated → fall through to mock (handleRequest) below
  }

  if (method === 'POST' && url.pathname === '/api/v1/ai/decisions') {
    const body = await request.json().catch(() => ({}));
    return json(createCodexLocalDecision(body));
  }


  const baseResponse = await handleRequest(request);
  if (baseResponse.status !== 404) return baseResponse;

  const fullScopeResponse = await tryHandleFullScopeRoute(request);
  if (fullScopeResponse) return fullScopeResponse;

  const documented = matchDocumentedRoute(method, url.pathname);
  if (documented) {
    return json({
      sourceMode: 'mock',
      status: 'contract_stub_until_implemented',
      module: documented.module,
      method: documented.method.toUpperCase(),
      path: documented.path,
      source: documented.source,
      message: 'Documented endpoint is tracked and mock-gated; full implementation will replace this stub.',
    });
  }

  return baseResponse;
}

function matchDocumentedRoute(method, pathname) {
  return documentedRoutes.find((route) => route.method.toUpperCase() === method.toUpperCase() && pathMatches(route.path, pathname));
}

function pathMatches(pattern, pathname) {
  const regex = new RegExp('^' + pattern.replace(/\{[^/]+\}/g, '[^/]+') + '$');
  return regex.test(pathname);
}


