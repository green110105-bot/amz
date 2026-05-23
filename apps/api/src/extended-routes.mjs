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
import { applyApiSecurity } from './security.mjs';
import {
  whoAmI, defaultStoreIdFor, getStoreSnapshot, getProduct,
  listReviews, getCompetitorSnapshots,
} from './data-store.mjs';

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


