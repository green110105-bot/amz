import { evaluateProviderRateLimit, evaluateTenantAccess } from '../../../packages/domain/src/governance-engine.mjs';

const rateBuckets = new Map();
const CORS_HEADERS = {
  'access-control-allow-origin': process.env.CORS_ALLOW_ORIGIN || '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-store-id,x-tenant-id,x-resource-tenant-id,x-role,x-permissions,x-action,x-rate-limit-key,x-rate-limit-max',
  'access-control-max-age': '600',
};

export function applyApiSecurity(request) {
  const url = new URL(request.url, 'http://localhost');
  const method = (request.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!url.pathname.startsWith('/api/')) return null;

  const tenantId = request.headers.get('x-tenant-id');
  if (process.env.REQUIRE_TENANT_HEADER === 'true' && !tenantId) {
    return securityJson({ error: 'tenant_header_required', message: 'x-tenant-id is required when tenant enforcement is enabled.' }, 401);
  }

  const actorTenantId = tenantId || 'tenant-demo';
  const action = request.headers.get('x-action') || inferAction(method);
  const explicitPermissions = request.headers.get('x-permissions');
  const permissions = explicitPermissions ? explicitPermissions.split(',').map((item) => item.trim()).filter(Boolean) : [action];
  const access = evaluateTenantAccess({
    actor: {
      tenantId: actorTenantId,
      role: request.headers.get('x-role') || 'admin',
      permissions,
    },
    resource: {
      tenantId: request.headers.get('x-resource-tenant-id') || actorTenantId,
    },
    action,
  });

  if (!access.allowed) {
    return securityJson({ error: 'access_denied', reason: access.reason, controls: access.controls }, 403);
  }

  const rateLimit = evaluateRequestRateLimit(request, url, actorTenantId);
  if (!rateLimit.allowed) {
    return securityJson({ error: 'rate_limited', rateLimit }, 429, { 'retry-after': String(Math.ceil(rateLimit.backoffMs / 1000)) });
  }

  return null;
}

export function securityHeaders(extra = {}) {
  return {
    ...CORS_HEADERS,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'x-real-write-policy': process.env.REAL_WRITES_ENABLED === 'true' ? 'requires-explicit-audit-approval' : 'blocked',
    ...extra,
  };
}

function evaluateRequestRateLimit(request, url, tenantId) {
  const limit = Number(request.headers.get('x-rate-limit-max') || process.env.API_RATE_LIMIT_MAX || 10000);
  const windowSeconds = Number(process.env.API_RATE_LIMIT_WINDOW_SECONDS || 60);
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = [
    request.headers.get('x-rate-limit-key') || tenantId,
    request.method || 'GET',
    url.pathname,
    windowId,
  ].join(':');
  const requests = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, requests);
  return evaluateProviderRateLimit({ provider: 'api-gateway', requests, limit, windowSeconds });
}

function securityJson(body, status, headers = {}) {
  return new Response(JSON.stringify({ sourceMode: 'mock', module: 'SECURITY', ...body }, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...securityHeaders(headers),
    },
  });
}

function inferAction(method) {
  if (method === 'GET') return 'read';
  if (method === 'DELETE') return 'delete';
  return 'execute';
}
