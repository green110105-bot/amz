// HTTP routes for triggering syncs + reading provider status.
// Mounted at /api/v1/integrations/* by extended-routes.mjs.
//
// Endpoints:
//   GET  /api/v1/integrations/status                       - mode + credential + last-sync per store
//   GET  /api/v1/integrations/oauth/config                 - server OAuth readiness for one-click auth
//   POST /api/v1/integrations/oauth/:provider/start        - create one-click OAuth URL (spapi|ads)
//   GET  /api/v1/integrations/oauth/spapi/login            - SP-API public-app Login URI handoff
//   GET  /api/v1/integrations/oauth/:provider/callback     - Amazon OAuth callback, state based
//   GET  /api/v1/integrations/diagnostics                  - offline Amazon auth readiness, no token exposure
//   POST /api/v1/integrations/diagnostics                  - optional live LWA/read probe, explicit only
//   POST /api/v1/integrations/credentials/spapi            - body: { refreshToken, sellingPartnerId?, region?, marketplaceIds: [] }
//   POST /api/v1/integrations/credentials/ads              - body: { refreshToken, profileId?, region? }
//   POST /api/v1/integrations/credentials/ads/profile      - body: { profileId }
//   POST /api/v1/integrations/spapi/sync/orders            - body: { since?, until?, includeOrderItems? }
//   POST /api/v1/integrations/spapi/sync/settlement        - body: { since, until }
//   POST /api/v1/integrations/spapi/sync/inventory         - body: { marketplaceIds? }
//   POST /api/v1/integrations/spapi/sync/catalog           - body: { asins: [], marketplaceIds? }
//   POST /api/v1/integrations/ads/sync/all                 - body: { profileId? }
//   POST /api/v1/integrations/sync/all                     - run everything in serial (best effort)
//
// All endpoints require Bearer token; scope (userId, storeId) resolved like other store routes.

import { whoAmI, defaultStoreIdFor, appendAuditLog } from '../data-store.mjs';
import { upsertSpApiCredentials, getSpApiCredentials, revokeSpApiCredentials } from './sp-api/credentials.mjs';
import { upsertAdsCredentials, setAdsProfileId, getAdsCredentials, revokeAdsCredentials } from './ads-api/credentials.mjs';
import { syncOrders } from './sp-api/sync/orders-sync.mjs';
import { syncSettlement } from './sp-api/sync/settlement-sync.mjs';
import { syncInventory } from './sp-api/sync/inventory-sync.mjs';
import { syncCatalogItems } from './sp-api/sync/catalog-sync.mjs';
import { syncAdsHierarchy } from './ads-api/sync/campaigns-sync.mjs';
import { listProviderStatus, providerMode } from './provider-mode.mjs';
import { buildAmazonAuthorizationDiagnostics, normalizeDiagnosticProvider } from './authorization-diagnostics.mjs';
import { buildOAuthConfig, handleOAuthCallback, handleSpApiLoginHandoff, startOAuth } from './oauth-flow.mjs';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
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

async function readBody(request) {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fail(code, message, status = 400) {
  return json({ error: code, message }, status);
}

function ok(data) { return json({ ok: true, ...data }); }

async function runWithGuard(label, fn) {
  const startedAt = new Date().toISOString();
  try {
    const result = await fn();
    return { label, startedAt, endedAt: new Date().toISOString(), status: 'ok', result };
  } catch (err) {
    return {
      label, startedAt, endedAt: new Date().toISOString(),
      status: 'error',
      errorCode: err?.code || err?.message?.split(':')[0] || 'sync_failed',
      errorMessage: String(err?.message || err).slice(0, 500),
    };
  }
}

export async function handleSyncRequest(request) {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/v1/integrations/')) return null;

  const method = request.method || 'GET';
  const path = url.pathname.slice('/api/v1/integrations/'.length);

  // OAuth callbacks / public-app login handoff are intentionally unauthenticated:
  // trust is established by short-lived state created by the authenticated start endpoint.
  if (method === 'GET' && path === 'oauth/spapi/login') {
    return handleSpApiLoginHandoff({ request });
  }
  const callbackMatch = path.match(/^oauth\/(spapi|ads)\/callback$/);
  if (method === 'GET' && callbackMatch) {
    return handleOAuthCallback({ request, provider: callbackMatch[1] });
  }

  const scope = resolveScope(request);
  if (!scope) return fail('unauthorized', 'auth_token_required', 401);
  if (!scope.storeId) return fail('no_store', 'x-store-id_header_required_or_user_has_no_store', 400);
  const { userId, storeId } = scope;

  // GET /status
  if (method === 'GET' && path === 'status') {
    return ok(listProviderStatus(userId, storeId));
  }

  // GET /oauth/config
  if (method === 'GET' && path === 'oauth/config') {
    return json(buildOAuthConfig(request));
  }

  // POST /oauth/:provider/start
  const oauthStartMatch = path.match(/^oauth\/(spapi|ads)\/start$/);
  if (method === 'POST' && oauthStartMatch) {
    const body = await readBody(request);
    if (!body) return fail('bad_json', 'invalid_json_body');
    return startOAuth({ request, userId, storeId, provider: oauthStartMatch[1], body });
  }

  // GET /diagnostics (offline only)
  if (method === 'GET' && path === 'diagnostics') {
    try {
      const provider = normalizeDiagnosticProvider(url.searchParams.get('provider') || 'all');
      const result = await buildAmazonAuthorizationDiagnostics({ userId, storeId, provider });
      return json(result);
    } catch (err) {
      return fail(err?.message === 'invalid_provider' ? 'invalid_provider' : 'diagnostics_failed', err?.message || String(err), 400);
    }
  }

  // POST /diagnostics (liveProbe/API probe must be explicit)
  if (method === 'POST' && path === 'diagnostics') {
    const body = await readBody(request);
    if (!body) return fail('bad_json', 'invalid_json_body');
    try {
      const provider = normalizeDiagnosticProvider(body.provider || 'all');
      const result = await buildAmazonAuthorizationDiagnostics({
        userId,
        storeId,
        provider,
        liveProbe: body.liveProbe === true,
        apiProbe: body.apiProbe === true,
      });
      return json(result);
    } catch (err) {
      return fail(err?.message === 'invalid_provider' ? 'invalid_provider' : 'diagnostics_failed', err?.message || String(err), 400);
    }
  }

  // POST /credentials/spapi
  if (method === 'POST' && path === 'credentials/spapi') {
    const body = await readBody(request);
    if (!body) return fail('bad_json', 'invalid_json_body');
    const { refreshToken, sellingPartnerId, region, marketplaceIds } = body;
    if (!refreshToken) return fail('refresh_token_required', 'body.refreshToken_required');
    if (!Array.isArray(marketplaceIds) || marketplaceIds.length === 0) {
      return fail('marketplace_ids_required', 'body.marketplaceIds_must_be_non_empty_array');
    }
    try {
      upsertSpApiCredentials({ userId, storeId, refreshToken, sellingPartnerId, region: region || 'NA', marketplaceIds });
      appendAuditLog(userId, storeId, {
        sourceModule: 'WORKBENCH',
        actionType: 'AMAZON_SPAPI_CREDENTIALS_SAVED',
        resourceType: 'store_credentials',
        resourceId: storeId,
        payload: {
          provider: 'spapi',
          region: region || 'NA',
          sellingPartnerId: sellingPartnerId || null,
          marketplaceIds,
          tokenStored: true,
          tokenRedacted: true,
        },
      });
      return ok({ stored: true, provider: 'spapi' });
    } catch (err) {
      return fail('credential_store_failed', err?.message || String(err), 500);
    }
  }

  // POST /credentials/ads
  if (method === 'POST' && path === 'credentials/ads') {
    const body = await readBody(request);
    if (!body) return fail('bad_json', 'invalid_json_body');
    const { refreshToken, profileId, region } = body;
    if (!refreshToken) return fail('refresh_token_required', 'body.refreshToken_required');
    try {
      upsertAdsCredentials({ userId, storeId, refreshToken, profileId, region: region || 'NA' });
      appendAuditLog(userId, storeId, {
        sourceModule: 'WORKBENCH',
        actionType: 'AMAZON_ADS_CREDENTIALS_SAVED',
        resourceType: 'store_credentials',
        resourceId: storeId,
        payload: {
          provider: 'ads',
          region: region || 'NA',
          profileId: profileId ? String(profileId) : null,
          tokenStored: true,
          tokenRedacted: true,
        },
      });
      return ok({ stored: true, provider: 'ads' });
    } catch (err) {
      return fail('credential_store_failed', err?.message || String(err), 500);
    }
  }

  // POST /credentials/ads/profile
  if (method === 'POST' && path === 'credentials/ads/profile') {
    const body = await readBody(request);
    if (!body) return fail('bad_json', 'invalid_json_body');
    if (!body.profileId) return fail('profile_id_required', 'body.profileId_required');
    try {
      const updated = setAdsProfileId(userId, storeId, body.profileId);
      if (!updated) return fail('ads_credentials_missing', 'store_ads_refresh_token_before_profile_id', 404);
      appendAuditLog(userId, storeId, {
        sourceModule: 'WORKBENCH',
        actionType: 'AMAZON_ADS_PROFILE_SAVED',
        resourceType: 'store_credentials',
        resourceId: storeId,
        payload: {
          provider: 'ads',
          profileId: String(body.profileId),
          tokenRedacted: true,
        },
      });
      return ok({ stored: true, provider: 'ads', profileId: String(body.profileId) });
    } catch (err) {
      return fail('credential_store_failed', err?.message || String(err), 500);
    }
  }

  // DELETE /credentials/:provider  (AUTH-06: revoke / unbind authorization)
  const revokeMatch = path.match(/^credentials\/(spapi|ads)$/);
  if (method === 'DELETE' && revokeMatch) {
    const provider = revokeMatch[1];
    try {
      if (provider === 'spapi') {
        // Read the previous identity BEFORE revoking so we can write it to audit
        // (审计闭环不变量 — a revoke must record what was unbound).
        const prev = getSpApiCredentials(userId, storeId);
        const previousSellingPartnerId = prev?.sellingPartnerId || null;
        revokeSpApiCredentials(userId, storeId);
        appendAuditLog(userId, storeId, {
          sourceModule: 'AMAZON_AUTH',
          actionType: 'AMAZON_SPAPI_CREDENTIALS_REVOKED',
          resourceType: 'store_credentials',
          resourceId: 'spapi',
          payload: {
            provider: 'spapi',
            previousSellingPartnerId,
            tokenRedacted: true,
          },
        });
      } else {
        const prev = getAdsCredentials(userId, storeId);
        const previousProfileId = prev?.profileId ? String(prev.profileId) : null;
        revokeAdsCredentials(userId, storeId);
        appendAuditLog(userId, storeId, {
          sourceModule: 'AMAZON_AUTH',
          actionType: 'AMAZON_ADS_CREDENTIALS_REVOKED',
          resourceType: 'store_credentials',
          resourceId: 'ads',
          payload: {
            provider: 'ads',
            previousProfileId,
            tokenRedacted: true,
          },
        });
      }
      return ok({ provider, status: 'revoked' });
    } catch (err) {
      return fail('credential_revoke_failed', err?.message || String(err), 500);
    }
  }

  // POST /spapi/sync/orders
  if (method === 'POST' && path === 'spapi/sync/orders') {
    const body = await readBody(request) || {};
    const result = await runWithGuard('orders', () => syncOrders({
      userId, storeId,
      since: body.since,
      until: body.until,
      includeOrderItems: body.includeOrderItems !== false,
    }));
    return ok(result);
  }

  // POST /spapi/sync/settlement
  if (method === 'POST' && path === 'spapi/sync/settlement') {
    const body = await readBody(request) || {};
    if (!body.since) return fail('since_required', 'body.since_iso_required');
    const result = await runWithGuard('settlement', () => syncSettlement({
      userId, storeId, since: body.since, until: body.until,
    }));
    return ok(result);
  }

  // POST /spapi/sync/inventory
  if (method === 'POST' && path === 'spapi/sync/inventory') {
    const body = await readBody(request) || {};
    const result = await runWithGuard('inventory', () => syncInventory({
      userId, storeId, marketplaceIds: body.marketplaceIds,
    }));
    return ok(result);
  }

  // POST /spapi/sync/catalog
  if (method === 'POST' && path === 'spapi/sync/catalog') {
    const body = await readBody(request);
    if (!body) return fail('bad_json', 'invalid_json_body');
    if (!Array.isArray(body.asins) || body.asins.length === 0) {
      return fail('asins_required', 'body.asins_must_be_non_empty_array');
    }
    const result = await runWithGuard('catalog', () => syncCatalogItems({
      userId, storeId, asins: body.asins, marketplaceIds: body.marketplaceIds,
    }));
    return ok(result);
  }

  // POST /ads/sync/all
  if (method === 'POST' && path === 'ads/sync/all') {
    const body = await readBody(request) || {};
    const result = await runWithGuard('ads', () => syncAdsHierarchy({
      userId, storeId, profileId: body.profileId, region: body.region,
    }));
    return ok(result);
  }

  // POST /sync/all
  if (method === 'POST' && path === 'sync/all') {
    const body = await readBody(request) || {};
    const out = [];
    out.push(await runWithGuard('orders',    () => syncOrders({ userId, storeId, since: body.since, until: body.until })));
    if (body.settlementSince) {
      out.push(await runWithGuard('settlement', () => syncSettlement({ userId, storeId, since: body.settlementSince, until: body.settlementUntil })));
    }
    out.push(await runWithGuard('inventory', () => syncInventory({ userId, storeId, marketplaceIds: body.marketplaceIds })));
    if (Array.isArray(body.asins) && body.asins.length > 0) {
      out.push(await runWithGuard('catalog',  () => syncCatalogItems({ userId, storeId, asins: body.asins, marketplaceIds: body.marketplaceIds })));
    }
    out.push(await runWithGuard('ads',         () => syncAdsHierarchy({ userId, storeId, profileId: body.profileId, region: body.region })));
    const okCount = out.filter((r) => r.status === 'ok').length;
    return ok({ mode: providerMode(), steps: out, summary: { okCount, total: out.length } });
  }

  return null;
}
