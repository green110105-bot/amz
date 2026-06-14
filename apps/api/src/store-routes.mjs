// store-routes.mjs — 真后端 DB CRUD endpoints (SQLite)
// schema：每店铺数据隔离 — 通过 X-Store-Id 头携带 storeId

import {
  authenticate, registerUser, createPasswordResetToken, resetPassword,
  whoAmI, logout,
  listUserStores, addUserStore, updateUserStore, removeUserStore, defaultStoreIdFor, resolveStoreScope,
  listAuditLogs, countAuditLogs, appendAuditLog, revertAuditLog,
  listKeywords, addKeyword, removeKeyword,
  listAlerts, addAlert, updateAlert, removeAlert,
  listNotificationsRead, markNotificationRead,
  getSettings, updateSettings,
  getSovereignty, setSovereignty,
  listProducts, getProduct, upsertProduct, removeProduct,
  getListing, upsertListing,
  listReviews, addReview,
  listCompetitors, addCompetitor, getCompetitorSnapshots,
  listSearchTerms, listOrders, listInventory, listAdMetrics, getMonitorSignals,
} from './data-store.mjs';
import { securityHeaders } from './security.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...securityHeaders() },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function getUserFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return whoAmI(token);
}

function requireAuth(request) {
  const u = getUserFromRequest(request);
  if (!u) return { error: json({ error: 'unauthorized' }, 401) };
  const scope = resolveStoreScope(u.id, request.headers.get('x-store-id'));
  if (scope.error) return { error: json({ error: 'store_not_owned' }, 403) };
  return { user: u, storeId: scope.storeId };
}

export async function handleStoreRequest(request) {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname;
  const method = request.method || 'GET';

  // ===== Auth =====
  if (method === 'POST' && path === '/api/v1/auth/login') {
    const body = await readJson(request);
    const result = authenticate(body.email, body.password || '');
    if (!result) return json({ error: 'invalid_credentials' }, 401);
    const stores = listUserStores(result.user.id);
    return json({
      token: result.token,
      user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role },
      stores,
      defaultStoreId: stores[0]?.id || null,
    });
  }

  if (method === 'POST' && path === '/api/v1/auth/register') {
    const body = await readJson(request);
    const r = registerUser(body);
    if (r.error) {
      const map = { email_exists: 409, password_too_short: 400, email_and_password_required: 400 };
      return json({ error: r.error }, map[r.error] || 400);
    }
    return json({ ok: true, user: { id: r.user.id, name: r.user.name, email: r.user.email, role: r.user.role } }, 201);
  }

  if (method === 'POST' && path === '/api/v1/auth/forgot-password') {
    const body = await readJson(request);
    const r = createPasswordResetToken(body.email);
    if (!r) return json({ ok: true, message: 'if_email_exists_reset_was_sent' }); // 防枚举：永远 200
    // 演示：直接返回 token 让前端展示；生产应通过邮件发送 reset 链接
    return json({ ok: true, message: 'reset_token_issued', resetToken: r.token, expiresAt: r.expiresAt });
  }

  if (method === 'POST' && path === '/api/v1/auth/reset-password') {
    const body = await readJson(request);
    const r = resetPassword(body);
    if (r.error) {
      const map = { invalid_token: 404, token_used: 410, token_expired: 410, password_too_short: 400, token_and_password_required: 400 };
      return json({ error: r.error }, map[r.error] || 400);
    }
    return json({ ok: true });
  }

  if (method === 'POST' && path === '/api/v1/auth/logout') {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (token) logout(token);
    return json({ ok: true });
  }

  if (method === 'GET' && path === '/api/v1/auth/me') {
    const u = getUserFromRequest(request);
    if (!u) return json({ error: 'unauthorized' }, 401);
    return json({ id: u.id, name: u.name, email: u.email, role: u.role });
  }

  // ===== Stores =====
  if (path === '/api/v1/store/stores') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') return json({ items: listUserStores(a.user.id) });
    if (method === 'POST') {
      const body = await readJson(request);
      return json(addUserStore(a.user.id, body), 201);
    }
  }
  const storeMatch = path.match(/^\/api\/v1\/store\/stores\/([\w-]+)$/);
  if (storeMatch) {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateUserStore(a.user.id, storeMatch[1], body);
      if (!r) return json({ error: 'not_found' }, 404);
      return json(r);
    }
    if (method === 'DELETE') {
      const ok = removeUserStore(a.user.id, storeMatch[1]);
      // X-P1-08: blocked when un-reverted real writes exist → 409.
      if (ok && typeof ok === 'object' && ok.blocked) {
        return json({ error: ok.error, message: '存在未回滚的真实写入，删店已阻断', blocked: true }, 409);
      }
      return json({ ok: !!ok }, ok ? 200 : 400);
    }
  }

  // ===== Audit Logs =====
  if (path === '/api/v1/store/audit-logs') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') {
      const opts = {
        sourceModule: url.searchParams.get('sourceModule') || undefined,
        actionType: url.searchParams.get('actionType') || undefined,
        reverted: url.searchParams.get('reverted') ?? undefined,
        limit: url.searchParams.get('limit') ?? undefined,
        offset: url.searchParams.get('offset') ?? undefined,
      };
      const items = listAuditLogs(a.user.id, a.storeId, opts);
      const total = countAuditLogs(a.user.id, a.storeId, opts);
      return json({ items, total, limit: opts.limit || 200, offset: opts.offset || 0 });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      return json(appendAuditLog(a.user.id, a.storeId, body), 201);
    }
  }
  const auditRevertMatch = path.match(/^\/api\/v1\/store\/audit-logs\/([\w-]+)\/revert$/);
  if (auditRevertMatch && method === 'POST') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    const body = await readJson(request);
    const log = revertAuditLog(a.user.id, a.storeId, auditRevertMatch[1], body.reason);
    if (!log) return json({ error: 'not_found' }, 404);
    // X-P0-01: real-write reverts that did not actually dispatch an inverse write
    // must NOT report success — surface as 409 so the UI prompts manual reversal.
    if (log.needsManualReversal === true) {
      return json({ error: 'revert_failed', message: '申请人工回滚', ...log }, 409);
    }
    return json(log);
  }

  // ===== Keywords =====
  if (path === '/api/v1/store/keywords') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') return json({ items: listKeywords(a.user.id, a.storeId) });
    if (method === 'POST') {
      const body = await readJson(request);
      return json(addKeyword(a.user.id, a.storeId, body), 201);
    }
  }
  const kwDeleteMatch = path.match(/^\/api\/v1\/store\/keywords\/([\w-]+)$/);
  if (kwDeleteMatch && method === 'DELETE') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    const ok = removeKeyword(a.user.id, a.storeId, kwDeleteMatch[1]);
    return json({ ok }, ok ? 200 : 404);
  }

  // ===== Alerts =====
  if (path === '/api/v1/store/alerts') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') return json({ items: listAlerts(a.user.id, a.storeId) });
    if (method === 'POST') {
      const body = await readJson(request);
      return json(addAlert(a.user.id, a.storeId, body), 201);
    }
  }
  const alertMatch = path.match(/^\/api\/v1\/store\/alerts\/([\w-]+)$/);
  if (alertMatch) {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateAlert(a.user.id, a.storeId, alertMatch[1], body);
      if (!r) return json({ error: 'not_found' }, 404);
      return json(r);
    }
    if (method === 'DELETE') {
      const ok = removeAlert(a.user.id, a.storeId, alertMatch[1]);
      return json({ ok }, ok ? 200 : 404);
    }
  }

  // ===== Notifications =====
  if (path === '/api/v1/store/notifications/read' && method === 'GET') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    return json({ read: listNotificationsRead(a.user.id) });
  }
  const notifReadMatch = path.match(/^\/api\/v1\/store\/notifications\/([\w-]+)\/read$/);
  if (notifReadMatch && method === 'POST') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    markNotificationRead(a.user.id, notifReadMatch[1]);
    return json({ ok: true });
  }

  // ===== Settings =====
  if (path === '/api/v1/store/settings') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') return json(getSettings(a.user.id));
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      return json(updateSettings(a.user.id, body));
    }
  }

  // ===== Sovereignty =====
  if (path === '/api/v1/store/sovereignty') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') return json(getSovereignty(a.user.id, a.storeId));
    if (method === 'PUT') {
      const body = await readJson(request);
      for (const k of Object.keys(body)) setSovereignty(a.user.id, a.storeId, k, body[k]);
      return json(getSovereignty(a.user.id, a.storeId));
    }
  }

  // ===== Products =====
  if (path === '/api/v1/store/products') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') return json({ items: listProducts(a.user.id, a.storeId) });
    if (method === 'POST') {
      const body = await readJson(request);
      return json(upsertProduct(a.user.id, a.storeId, body), 201);
    }
  }
  const productMatch = path.match(/^\/api\/v1\/store\/products\/([\w-]+)$/);
  if (productMatch) {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') {
      const p = getProduct(a.user.id, a.storeId, productMatch[1]);
      if (!p) return json({ error: 'not_found' }, 404);
      return json(p);
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      return json(upsertProduct(a.user.id, a.storeId, { ...body, id: productMatch[1] }));
    }
    if (method === 'DELETE') {
      removeProduct(a.user.id, a.storeId, productMatch[1]);
      return json({ ok: true });
    }
  }

  // ===== Listings (绑定 product) =====
  const listingMatch = path.match(/^\/api\/v1\/store\/products\/([\w-]+)\/listing$/);
  if (listingMatch) {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') {
      const l = getListing(a.user.id, a.storeId, listingMatch[1]);
      if (!l) return json({ error: 'not_found' }, 404);
      return json(l);
    }
    if (method === 'PUT') {
      const body = await readJson(request);
      return json(upsertListing(a.user.id, a.storeId, listingMatch[1], body));
    }
  }

  // ===== Reviews =====
  if (path === '/api/v1/store/reviews') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') {
      const productId = url.searchParams.get('productId') || null;
      return json({ items: listReviews(a.user.id, a.storeId, productId) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      return json(addReview(a.user.id, a.storeId, body), 201);
    }
  }

  // ===== Competitors =====
  if (path === '/api/v1/store/competitors') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    if (method === 'GET') {
      const productId = url.searchParams.get('productId') || null;
      return json({ items: listCompetitors(a.user.id, a.storeId, productId) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      return json(addCompetitor(a.user.id, a.storeId, body), 201);
    }
  }
  if (path === '/api/v1/store/competitors/snapshots' && method === 'GET') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    return json(getCompetitorSnapshots(a.user.id, a.storeId));
  }

  // ===== Search terms / Orders / Inventory / Ad metrics / Monitor signals =====
  if (path === '/api/v1/store/search-terms' && method === 'GET') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    const productId = url.searchParams.get('productId') || null;
    return json({ items: listSearchTerms(a.user.id, a.storeId, productId) });
  }
  if (path === '/api/v1/store/orders' && method === 'GET') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    return json({ items: listOrders(a.user.id, a.storeId) });
  }
  if (path === '/api/v1/store/inventory' && method === 'GET') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    return json({ items: listInventory(a.user.id, a.storeId) });
  }
  if (path === '/api/v1/store/ad-metrics' && method === 'GET') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    return json({ items: listAdMetrics(a.user.id, a.storeId) });
  }
  if (path === '/api/v1/store/monitor-signals' && method === 'GET') {
    const a = requireAuth(request);
    if (a.error) return a.error;
    return json(getMonitorSignals(a.user.id, a.storeId));
  }

  return null;
}
