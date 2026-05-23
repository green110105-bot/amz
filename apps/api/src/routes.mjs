import { sampleStore } from '../../../packages/mock-data/src/sample-store.mjs';
import { buildAdSuggestionAudits, buildDashboard, buildInventoryDecisions, buildProfitOverview } from '../../../packages/domain/src/dashboard-engine.mjs';
import { buildMonitorOverview } from '../../../packages/domain/src/monitor-engine.mjs';
import { mockExecuteAuditAction, createAuditAction } from '../../../packages/domain/src/audit-center.mjs';
import { securityHeaders } from './security.mjs';

export async function handleRequest(request) {
  const url = new URL(request.url, 'http://localhost');
  const method = request.method || 'GET';

  if (method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, service: 'amz-api', mode: 'mock', timestamp: new Date().toISOString() });
  }

  if (method === 'GET' && url.pathname === '/ready') {
    return json({
      ok: true,
      service: 'amz-api',
      mode: 'mock',
      checks: {
        routeTable: true,
        mockMode: process.env.MOCK_MODE !== 'false',
        realWritesEnabled: process.env.REAL_WRITES_ENABLED === 'true',
        auditRequired: process.env.AUDIT_REQUIRED !== 'false',
      },
      blockers: process.env.REAL_WRITES_ENABLED === 'true' ? [] : ['real_writes_disabled_until_credentials_and_approval'],
      timestamp: new Date().toISOString(),
    });
  }

  if (method === 'GET' && url.pathname === '/api/v1/dashboard') {
    return json(buildDashboard(sampleStore));
  }

  if (method === 'GET' && url.pathname === '/api/v1/profit/overview') {
    return json(buildProfitOverview(sampleStore));
  }

  if (method === 'POST' && url.pathname === '/api/v1/profit/recompute') {
    return json({ status: 'queued_mock_recompute', result: buildProfitOverview(sampleStore) }, 202);
  }

  if (method === 'GET' && url.pathname === '/api/v1/inventory/decisions') {
    return json({ sourceMode: 'mock', decisions: buildInventoryDecisions(sampleStore) });
  }

  if (method === 'GET' && url.pathname === '/api/v1/ads/suggestions') {
    return json({ sourceMode: 'mock', audits: buildAdSuggestionAudits(sampleStore) });
  }

  if (method === 'GET' && url.pathname === '/api/v1/monitor/overview') {
    return json(buildMonitorOverview(sampleStore));
  }

  if (method === 'POST' && url.pathname === '/api/v1/audit/mock-execute') {
    const body = await readJson(request);
    // 如果 body 缺 risk（前端只传业务参数），先 createAuditAction 评估再执行
    const action = body?.risk ? body : createAuditAction(body || {});
    return json(mockExecuteAuditAction(action));
  }

  return json({ error: 'not_found', path: url.pathname }, 404);
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...securityHeaders() },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

