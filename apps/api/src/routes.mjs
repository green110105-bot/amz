import { sampleStore } from '../../../packages/mock-data/src/sample-store.mjs';
import { buildAdSuggestionAudits, buildDashboard, buildInventoryDecisions, buildProfitOverview } from '../../../packages/domain/src/dashboard-engine.mjs';
import { buildMonitorOverview } from '../../../packages/domain/src/monitor-engine.mjs';
import { mockExecuteAuditAction, createAuditAction } from '../../../packages/domain/src/audit-center.mjs';
import { securityHeaders } from './security.mjs';
import { realWritesEnabled } from './integrations/provider-mode.mjs';
import { whoAmI, resolveStoreScope, appendAuditLog } from './data-store.mjs';

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
        realWritesEnabled: realWritesEnabled(),
        auditRequired: process.env.AUDIT_REQUIRED !== 'false',
      },
      blockers: realWritesEnabled() ? [] : ['real_writes_disabled_until_credentials_and_approval'],
      timestamp: new Date().toISOString(),
    });
  }

  if (method === 'GET' && url.pathname === '/api/v1/dashboard') {
    return json(buildDashboard(sampleStore));
  }

  // W17: mock fallback for the top-bar badge poll — derives cardSummary from the
  // same buildDashboard cards so the unauthenticated demo surface keeps a coherent
  // (honestly mock-labelled) badge. Authenticated callers get the DB branch in
  // extended-routes.mjs before this fallback is reached.
  if (method === 'GET' && url.pathname === '/api/v1/dashboard/summary') {
    const dash = buildDashboard(sampleStore);
    const cards = dash.actionCards || [];
    const cardSummary = {
      total: cards.length,
      p0: cards.filter((c) => c.priority === 'P0' || c.priority === 'high' || c.priority === 'critical').length,
      p1: cards.filter((c) => c.priority === 'P1' || c.priority === 'medium').length,
      p2: cards.filter((c) => c.priority === 'P2' || c.priority === 'low').length,
    };
    return json({
      generatedAt: dash.generatedAt,
      sourceMode: 'mock',
      sourceMeta: { source: 'mock', mock: true },
      cardSummary,
      queuedActions: cardSummary.total,
      unreadCount: 0,
    });
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
    // W3: never trust the client. When real writes are disabled, force the
    // requiresRealStoreWrite flag to false on the server side regardless of body,
    // so a malicious/buggy client cannot escalate a mock action into a real write.
    const realWritesOn = realWritesEnabled();
    const safeBody = body && typeof body === 'object' ? { ...body } : {};
    if (!realWritesOn) {
      if (safeBody.payload && typeof safeBody.payload === 'object') {
        safeBody.payload = { ...safeBody.payload, requiresRealStoreWrite: false };
      }
      if (safeBody.risk && typeof safeBody.risk === 'object') {
        // a pre-evaluated risk object must not assert a real-store execution mode
        safeBody.risk = { ...safeBody.risk, executionMode: 'mock' };
      }
    }
    // 如果 body 缺 risk（前端只传业务参数），先 createAuditAction 评估再执行
    const action = safeBody.risk ? safeBody : createAuditAction(safeBody);
    return json(mockExecuteAuditAction(action));
  }

  // B-2 / N6-w11: 工作台「忽略」决策卡 -> 落一条 DASHBOARD_CARD_DISMISS 审计行。
  // 产品决定留痕：reject 不再只是会话内隐藏，而是持久化到 audit_logs，可被
  // GET /api/v1/store/audit-logs?actionType=DASHBOARD_CARD_DISMISS 查询。
  // 安全：
  //  - 必须 Bearer 鉴权（401），否则无法落库（无身份不留痕）。
  //  - storeId 走 resolveStoreScope 校验多租户归属，伪造他人 store -> 403。
  //  - operator 一律取服务端鉴权出的 user.id，绝不信任 body.operator（防伪造）。
  //  - 这是本地审计留痕，非真实店铺写：origin 归类 local-real，无 requiresRealStoreWrite，
  //    不触发任何真实外部副作用。
  if (method === 'POST' && url.pathname === '/api/v1/audit/dismiss') {
    const user = whoAmI((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (!user) return json({ error: 'unauthorized' }, 401);
    const scope = resolveStoreScope(user.id, request.headers.get('x-store-id'));
    if (scope.error) return json({ error: 'store_not_owned' }, 403);

    const body = await readJson(request);
    const resourceId = body && (body.resourceId || body.id || body.cardId);
    if (!resourceId) return json({ error: 'resource_id_required' }, 400);
    // reason 仅取标量文本，避免把任意对象/敏感 payload 整体写入审计明文。
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : '';
    const dismissedAt = new Date().toISOString();

    const saved = appendAuditLog(user.id, scope.storeId, {
      sourceModule: 'DASHBOARD',
      actionType: 'DASHBOARD_CARD_DISMISS',
      resourceType: 'dashboard_card',
      resourceId: String(resourceId),
      status: 'dismissed',
      // operator 取服务端真值，不信任客户端传入的 operator 字段。
      operator: user.id,
      reason,
      dismissedAt,
    });
    return json({
      ok: true,
      id: saved.id,
      actionType: 'DASHBOARD_CARD_DISMISS',
      resourceId: String(resourceId),
      operator: user.id,
      dismissedAt,
    }, 201);
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

