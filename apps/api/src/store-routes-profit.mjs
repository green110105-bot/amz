// store-routes-profit.mjs — M2 利润 / 库存 / 采购 / 重定价 / 多维度财务模块 HTTP 路由
// 所有路径前缀 /api/v1/store/m2/...
// 需要 Bearer + X-Store-Id；写操作走 appendAuditLog (sourceModule='M2')

import { securityHeaders } from './security.mjs';
import { whoAmI, defaultStoreIdFor, getDbInstance, resolveStoreScope } from './data-store.mjs';
import {
  // 利润/订单
  getProfitOverview, recomputeProfit, listSkuProfit, getSkuWaterfall,
  listOrders, getOrderProfit,
  // 漏点
  listLeaks, startFixLeak, markFixedLeak, ignoreLeak,
  // 现金流
  getCashflowTimeline, getCashflowAlerts, addCashflowEvent,
  // 情景模拟
  previewScenario, saveScenario, listScenarios,
  // 库存补货
  listReorders, createPOFromReorder, dismissReorder,
  // 滞销
  listSlowMoving, executeSlowMoving, previewSlowMoving,
  // 调拨
  listTransfers, approveTransfer, cancelTransfer, receiveTransfer,
  // 采购单
  listPOs, getPO, createPO, updatePO, transitionPO, payPO,
  // 供应商
  listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier,
  // 重定价
  listRepricing, triggerRepricing, applyRepricing, rejectRepricing,
  // 汇率
  getFxExposures, getFxRates, getFxSensitivity,
  // 支付通道
  listPaymentChannels, createPaymentChannel, updatePaymentChannel, deletePaymentChannel,
  // 税务
  getTaxSummary, listTaxRecords, fileTaxRecord,
  // LTV
  listLtv,
  // 报警
  listAlertRules, createAlertRule, updateAlertRule, deleteAlertRule,
  listAlertEvents, ackAlertEvent, ackAlertEventsBatch, scanAlerts,
  // 维度
  listDimensions, updateDimension,
  // 库存联动
  getInvLinkConfig, updateInvLinkConfig, listInvLinkEvents, executeInvLinkEvent,
} from './data-store-profit.mjs';

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
  const scope = resolveStoreScope(u.id, request.headers.get('x-store-id'));
  if (scope.error) return { error: json({ error: 'store_not_owned' }, 403) };
  return { user: u, storeId: scope.storeId, userId: u.id };
}

function notFound() { return json({ error: 'not_found' }, 404); }
function validationError(message) { return json({ error: 'validation_error', message }, 400); }

export async function handleProfitRequest(request) {
  try {
    return await _impl(request);
  } catch (err) {
    const msg = String(err && err.message || err);
    if (/UNIQUE constraint|PRIMARY KEY|SQLITE_CONSTRAINT/i.test(msg)) {
      return json({ error: 'conflict', message: msg }, 409);
    }
    try { console.error('[m2-route]', request.method, request.url, msg); } catch {}
    return json({ error: 'internal_error', message: msg }, 500);
  }
}

async function _impl(request) {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname;
  const method = (request.method || 'GET').toUpperCase();
  if (!path.startsWith('/api/v1/store/m2/')) return null;

  const a = requireAuth(request);
  if (a.error) return a.error;
  const { userId, storeId } = a;
  const db = getDb();
  const params = url.searchParams;

  function rangeDays() {
    const r = params.get('range') || '30d';
    return Number(String(r).replace(/d$/, '')) || 30;
  }

  let m;

  // ============================================================
  // 3.1 利润 / 订单
  // ============================================================
  if (path === '/api/v1/store/m2/profit/overview' && method === 'GET') {
    return json(getProfitOverview(db, userId, storeId, rangeDays()));
  }
  if (path === '/api/v1/store/m2/profit/recompute' && method === 'POST') {
    const body = await readJson(request);
    const rng = body.range ? Number(String(body.range).replace(/d$/, '')) : 30;
    const r = recomputeProfit(db, userId, storeId, rng);
    const ov = getProfitOverview(db, userId, storeId, rng);
    return json({ ...r, ...ov });
  }
  if (path === '/api/v1/store/m2/profit/skus' && method === 'GET') {
    return json({
      skus: listSkuProfit(db, userId, storeId, {
        search: params.get('search'),
        lifecycle: params.get('lifecycle'),
        range: rangeDays(),
      }),
    });
  }
  m = path.match(/^\/api\/v1\/store\/m2\/profit\/skus\/([^/]+)\/waterfall$/);
  if (m && method === 'GET') {
    const r = getSkuWaterfall(db, userId, storeId, m[1], rangeDays());
    return r ? json(r) : notFound();
  }
  if (path === '/api/v1/store/m2/orders' && method === 'GET') {
    return json(listOrders(db, userId, storeId, {
      from: params.get('from'), to: params.get('to'), sku: params.get('sku'),
      minMargin: params.get('minMargin'), maxMargin: params.get('maxMargin'),
      accuracy: params.get('accuracy'), limit: params.get('limit'),
      cursor: params.get('cursor'),
    }));
  }
  m = path.match(/^\/api\/v1\/store\/m2\/orders\/([^/]+)\/profit$/);
  if (m && method === 'GET') {
    const r = getOrderProfit(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  if (path === '/api/v1/store/m2/profit/leaks' && method === 'GET') {
    return json(listLeaks(db, userId, storeId, {
      severity: params.get('severity'), status: params.get('status'),
    }));
  }

  // ============================================================
  // 3.2 现金流
  // ============================================================
  if (path === '/api/v1/store/m2/cashflow/timeline' && method === 'GET') {
    return json(getCashflowTimeline(db, userId, storeId, Number(params.get('days')) || 30));
  }
  if (path === '/api/v1/store/m2/cashflow/alerts' && method === 'GET') {
    return json(getCashflowAlerts(db, userId, storeId));
  }
  if (path === '/api/v1/store/m2/cashflow/events' && method === 'POST') {
    const body = await readJson(request);
    const r = addCashflowEvent(db, userId, storeId, body);
    if (r && r.error) return json(r, 400);
    return json(r, 201);
  }

  // ============================================================
  // 3.3 漏点
  // ============================================================
  m = path.match(/^\/api\/v1\/store\/m2\/leaks\/([^/]+)\/start-fix$/);
  if (m && method === 'POST') {
    const r = startFixLeak(db, userId, storeId, m[1]);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/leaks\/([^/]+)\/mark-fixed$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = markFixedLeak(db, userId, storeId, m[1], body.actualSaving);
    if (!r) return notFound();
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/leaks\/([^/]+)\/ignore$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = ignoreLeak(db, userId, storeId, m[1], body.reason);
    if (!r) return notFound();
    return json(r);
  }

  // ============================================================
  // 3.4 情景模拟
  // ============================================================
  if (path === '/api/v1/store/m2/scenarios/preview' && method === 'POST') {
    const body = await readJson(request);
    return json(previewScenario(body));
  }
  if (path === '/api/v1/store/m2/scenarios' && method === 'POST') {
    const body = await readJson(request);
    const r = saveScenario(db, userId, storeId, body);
    return json(r, 201);
  }
  if (path === '/api/v1/store/m2/scenarios' && method === 'GET') {
    return json({ scenarios: listScenarios(db, userId, storeId, params.get('sku')) });
  }

  // ============================================================
  // 3.5 库存 / 补货
  // ============================================================
  if (path === '/api/v1/store/m2/inventory/reorder' && method === 'GET') {
    return json({
      decisions: listReorders(db, userId, storeId, {
        urgency: params.get('urgency'), status: params.get('status'),
      }).map((r) => ({
        productId: r.productId, sku: r.sku,
        reorder: {
          id: r.id, urgency: r.urgency, recommendedQty: r.recommendedQty,
          capitalRequired: r.capitalRequired, daysRemaining: r.daysRemaining,
          leadDays: r.leadDays, safetyDays: r.safetyDays,
          forecastDaily: r.forecastDaily, supplierId: r.supplierId,
          status: r.status, poDraftId: r.poDraftId,
        },
      })),
    });
  }
  m = path.match(/^\/api\/v1\/store\/m2\/inventory\/reorder\/([^/]+)\/create-po$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = createPOFromReorder(db, userId, storeId, m[1], body);
    if (r.error === 'not_found') return notFound();
    if (r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/inventory\/reorder\/([^/]+)\/dismiss$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = dismissReorder(db, userId, storeId, m[1], body.reason);
    if (!r) return notFound();
    return json(r);
  }
  if (path === '/api/v1/store/m2/inventory/slow-moving' && method === 'GET') {
    return json({
      items: listSlowMoving(db, userId, storeId, { status: params.get('status') }),
    });
  }
  m = path.match(/^\/api\/v1\/store\/m2\/inventory\/slow-moving\/([^/]+)\/preview$/);
  if (m && (method === 'POST' || method === 'GET')) {
    const body = method === 'POST' ? await readJson(request) : {};
    const r = previewSlowMoving(db, userId, storeId, m[1], body.option || params.get('option') || 'A');
    if (!r) return notFound();
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/inventory\/slow-moving\/([^/]+)\/execute$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = executeSlowMoving(db, userId, storeId, m[1], body.option, body);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }

  // ============================================================
  // 3.6 调拨
  // ============================================================
  if (path === '/api/v1/store/m2/inventory/transfers' && method === 'GET') {
    return json({
      transfers: listTransfers(db, userId, storeId, { status: params.get('status') }),
    });
  }
  m = path.match(/^\/api\/v1\/store\/m2\/inventory\/transfers\/([^/]+)\/approve$/);
  if (m && method === 'POST') {
    const r = approveTransfer(db, userId, storeId, m[1]);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/inventory\/transfers\/([^/]+)\/cancel$/);
  if (m && method === 'POST') {
    const r = cancelTransfer(db, userId, storeId, m[1]);
    if (!r) return notFound();
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/inventory\/transfers\/([^/]+)\/receive$/);
  if (m && method === 'POST') {
    const r = receiveTransfer(db, userId, storeId, m[1]);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }

  // ============================================================
  // 3.7 采购单
  // ============================================================
  if (path === '/api/v1/store/m2/purchase-orders' && method === 'GET') {
    return json({
      pos: listPOs(db, userId, storeId, {
        status: params.get('status'), supplierId: params.get('supplierId'),
      }),
    });
  }
  if (path === '/api/v1/store/m2/purchase-orders' && method === 'POST') {
    const body = await readJson(request);
    const r = createPO(db, userId, storeId, body);
    if (r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/purchase-orders\/([^/]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') {
      const r = getPO(db, userId, storeId, id);
      return r ? json(r) : notFound();
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updatePO(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
  }
  m = path.match(/^\/api\/v1\/store\/m2\/purchase-orders\/([^/]+)\/transition$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = transitionPO(db, userId, storeId, m[1], body);
    if (!r) return notFound();
    if (r.error === 'invalid_transition') return json(r, 400);
    if (r.error) return json(r, 400);
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/purchase-orders\/([^/]+)\/payment$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = payPO(db, userId, storeId, m[1], body);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }

  // ============================================================
  // 3.8 供应商
  // ============================================================
  if (path === '/api/v1/store/m2/suppliers' && method === 'GET') {
    return json({ suppliers: listSuppliers(db, userId, storeId, { status: params.get('status') }) });
  }
  if (path === '/api/v1/store/m2/suppliers' && method === 'POST') {
    const body = await readJson(request);
    const r = createSupplier(db, userId, storeId, body);
    if (r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/suppliers\/([^/]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') {
      const r = getSupplier(db, userId, storeId, id);
      return r ? json(r) : notFound();
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateSupplier(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') {
      const r = deleteSupplier(db, userId, storeId, id);
      return r ? json(r) : notFound();
    }
  }

  // ============================================================
  // 3.9 重定价
  // ============================================================
  if (path === '/api/v1/store/m2/repricing' && method === 'GET') {
    return json({ items: listRepricing(db, userId, storeId, { status: params.get('status') }) });
  }
  if (path === '/api/v1/store/m2/repricing/trigger' && method === 'POST') {
    const body = await readJson(request);
    const r = triggerRepricing(db, userId, storeId, body);
    if (r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/repricing\/([^/]+)\/apply$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = applyRepricing(db, userId, storeId, m[1], body);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/repricing\/([^/]+)\/reject$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = rejectRepricing(db, userId, storeId, m[1], body);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }

  // ============================================================
  // 3.10 汇率
  // ============================================================
  if (path === '/api/v1/store/m2/fx/exposures' && method === 'GET') {
    return json(getFxExposures(db, userId, storeId));
  }
  if (path === '/api/v1/store/m2/fx/rates' && method === 'GET') {
    return json(getFxRates(db, userId, storeId, {
      base: params.get('base'), quote: params.get('quote'),
      days: params.get('days'),
    }));
  }
  if (path === '/api/v1/store/m2/fx/sensitivity' && method === 'GET') {
    return json(getFxSensitivity(db, userId, storeId));
  }

  // ============================================================
  // 3.11 支付通道
  // ============================================================
  if (path === '/api/v1/store/m2/payment-channels' && method === 'GET') {
    return json({ channels: listPaymentChannels(db, userId, storeId) });
  }
  if (path === '/api/v1/store/m2/payment-channels' && method === 'POST') {
    const body = await readJson(request);
    const r = createPaymentChannel(db, userId, storeId, body);
    if (r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/payment-channels\/([^/]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updatePaymentChannel(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') {
      const r = deletePaymentChannel(db, userId, storeId, id);
      if (!r) return notFound();
      if (r.error === 'cannot_delete_primary') return json(r, 409);
      return json(r);
    }
  }

  // ============================================================
  // 3.12 税务
  // ============================================================
  if (path === '/api/v1/store/m2/tax/summary' && method === 'GET') {
    return json(getTaxSummary(db, userId, storeId));
  }
  if (path === '/api/v1/store/m2/tax/records' && method === 'GET') {
    return json({
      records: listTaxRecords(db, userId, storeId, {
        type: params.get('type'), region: params.get('region'),
        status: params.get('status'),
      }),
    });
  }
  m = path.match(/^\/api\/v1\/store\/m2\/tax\/records\/([^/]+)\/file$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = fileTaxRecord(db, userId, storeId, m[1], body);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }

  // ============================================================
  // 3.13 LTV
  // ============================================================
  if (path === '/api/v1/store/m2/ltv/skus' && method === 'GET') {
    return json(listLtv(db, userId, storeId, rangeDays()));
  }

  // ============================================================
  // 3.14 报警规则 / 事件
  // ============================================================
  if (path === '/api/v1/store/m2/alerts/rules' && method === 'GET') {
    return json({ rules: listAlertRules(db, userId, storeId) });
  }
  if (path === '/api/v1/store/m2/alerts/rules' && method === 'POST') {
    const body = await readJson(request);
    const r = createAlertRule(db, userId, storeId, body);
    if (r.error) return json(r, 400);
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/alerts\/rules\/([^/]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateAlertRule(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') {
      const r = deleteAlertRule(db, userId, storeId, id);
      return r ? json(r) : notFound();
    }
  }
  if (path === '/api/v1/store/m2/alerts/events' && method === 'GET') {
    return json({
      events: listAlertEvents(db, userId, storeId, {
        ruleId: params.get('ruleId'),
        acknowledged: params.get('acknowledged'),
      }),
    });
  }
  if (path === '/api/v1/store/m2/alerts/scan' && method === 'POST') {
    const body = await readJson(request);
    return json(scanAlerts(db, userId, storeId, body));
  }
  if (path === '/api/v1/store/m2/alerts/events/ack-batch' && method === 'POST') {
    const body = await readJson(request);
    const r = ackAlertEventsBatch(db, userId, storeId, body);
    if (r && r.error) return json(r, 400);
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m2\/alerts\/events\/([^/]+)\/ack$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = ackAlertEvent(db, userId, storeId, m[1], body);
    if (!r) return notFound();
    return json(r);
  }

  // ============================================================
  // 3.15 维度
  // ============================================================
  if (path === '/api/v1/store/m2/dimensions' && method === 'GET') {
    return json(listDimensions(db, userId, storeId, params.get('by'), rangeDays()));
  }
  m = path.match(/^\/api\/v1\/store\/m2\/dimensions\/([^/]+)$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    const body = await readJson(request);
    const r = updateDimension(db, userId, storeId, m[1], body);
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.16 库存联动
  // ============================================================
  if (path === '/api/v1/store/m2/inventory-link/config' && method === 'GET') {
    return json(getInvLinkConfig(db, userId, storeId));
  }
  if (path === '/api/v1/store/m2/inventory-link/config' && (method === 'PUT' || method === 'PATCH')) {
    const body = await readJson(request);
    const r = updateInvLinkConfig(db, userId, storeId, body);
    if (r && r.error) return json(r, 400);
    return json(r);
  }
  if (path === '/api/v1/store/m2/inventory-link/events' && method === 'GET') {
    return json({
      events: listInvLinkEvents(db, userId, storeId, { status: params.get('status') }),
    });
  }
  m = path.match(/^\/api\/v1\/store\/m2\/inventory-link\/events\/([^/]+)\/execute$/);
  if (m && method === 'POST') {
    const r = executeInvLinkEvent(db, userId, storeId, m[1]);
    if (!r) return notFound();
    if (r.error) return json(r, 400);
    return json(r);
  }

  return null;
}
