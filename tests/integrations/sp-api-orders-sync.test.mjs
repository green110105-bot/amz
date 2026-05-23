import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Isolate DB + env BEFORE importing any module that touches process.env.
const tmpDir = mkdtempSync(join(tmpdir(), 'amz-spapi-orders-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'test-client-id';
process.env.SPAPI_LWA_CLIENT_SECRET = 'test-client-secret';
process.env.SPAPI_USE_SANDBOX = 'true';

const { getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const { upsertSpApiCredentials, setSpApiAccessToken } = await import('../../apps/api/src/integrations/sp-api/credentials.mjs');
const { _resetForTests } = await import('../../apps/api/src/integrations/sp-api/rate-limiter.mjs');
const { syncOrders } = await import('../../apps/api/src/integrations/sp-api/sync/orders-sync.mjs');
const { mapOrder, mapOrderCosts } = await import('../../apps/api/src/integrations/sp-api/sync/orders-mapper.mjs');

const USER_ID = 'u-sync';
const STORE_ID = 's-sync-us';

// Seed the user/store row + creds once for the whole test file.
function seedUserAndCreds() {
  const db = getDbInstance();
  db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`)
    .run(USER_ID, 'sync', 'sync@amz.local', 'admin', 'x', new Date().toISOString());
  db.prepare(`INSERT OR REPLACE INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(STORE_ID, USER_ID, 'Sync US', 'NA', 'USD', 'ATVPDKIKX0DER', 0, 0, new Date().toISOString());
  upsertSpApiCredentials({
    userId: USER_ID, storeId: STORE_ID,
    sellingPartnerId: 'A1B2C3',
    region: 'NA',
    marketplaceIds: ['ATVPDKIKX0DER'],
    refreshToken: 'Atzr|TEST-refresh-' + randomBytes(4).toString('hex'),
  });
  // Pre-seed access token so we never hit the LWA endpoint (1h ahead).
  setSpApiAccessToken(USER_ID, STORE_ID, 'Atza|FAKE-access', new Date(Date.now() + 3600 * 1000).toISOString());
}
seedUserAndCreds();

// --- Fetch mocking infrastructure -----------------------------------------

const originalFetch = globalThis.fetch;

/**
 * Build a fetch responder from a route table.
 * Each route entry: { match: (url, opts) => bool, respond: (url, opts) => Response-like }
 * Falls back to 404. Tracks call counts on `responder.calls`.
 */
function makeResponder(routes) {
  const responder = async (url, opts) => {
    const u = typeof url === 'string' ? url : url.toString();
    responder.calls.push({ url: u, opts });
    for (const r of routes) {
      if (r.match(u, opts)) {
        const out = await r.respond(u, opts);
        const body = typeof out.body === 'string' ? out.body : JSON.stringify(out.body || {});
        return {
          status: out.status || 200,
          ok: (out.status || 200) < 400,
          headers: new Map(Object.entries(out.headers || {})),
          text: async () => body,
        };
      }
    }
    return {
      status: 404, ok: false,
      headers: new Map(),
      text: async () => JSON.stringify({ errors: [{ message: 'unmocked: ' + u }] }),
    };
  };
  responder.calls = [];
  return responder;
}

// Headers shim — the client calls res.headers.get(...). Map.get is compatible.

function tokenRoute() {
  return {
    match: (u) => u.includes('api.amazon.com/auth/o2/token'),
    respond: () => ({ status: 200, body: { access_token: 'Atza|mock', expires_in: 3600, token_type: 'bearer' } }),
  };
}

function makeOrder(id, overrides = {}) {
  return {
    AmazonOrderId: id,
    PurchaseDate: '2026-01-15T10:00:00Z',
    LastUpdateDate: '2026-01-16T10:00:00Z',
    OrderStatus: 'Shipped',
    OrderTotal: { Amount: '99.99', CurrencyCode: 'USD' },
    NumberOfItemsShipped: 1,
    NumberOfItemsUnshipped: 0,
    SalesChannel: 'Amazon.com',
    MarketplaceId: 'ATVPDKIKX0DER',
    ...overrides,
  };
}

function makeItem(orderItemId, overrides = {}) {
  return {
    ASIN: 'B0TESTASIN',
    OrderItemId: orderItemId,
    SellerSKU: 'SKU-' + orderItemId,
    Title: 'Test Item',
    QuantityOrdered: 1,
    ItemPrice: { Amount: '49.99', CurrencyCode: 'USD' },
    ShippingPrice: { Amount: '4.99', CurrencyCode: 'USD' },
    ItemTax: { Amount: '3.50', CurrencyCode: 'USD' },
    ShippingTax: { Amount: '0.50', CurrencyCode: 'USD' },
    PromotionDiscount: { Amount: '2.00', CurrencyCode: 'USD' },
    ...overrides,
  };
}

function ordersPath(u) { return u.includes('/orders/v0/orders') && !u.includes('/orderItems'); }
function itemsPath(u) { return u.includes('/orders/v0/orders/') && u.includes('/orderItems'); }
function orderIdFromItemsUrl(u) {
  const m = u.match(/\/orders\/v0\/orders\/([^/?]+)\/orderItems/);
  return m ? decodeURIComponent(m[1]) : null;
}

function clearOrderTables() {
  const db = getDbInstance();
  db.prepare(`DELETE FROM m2_orders WHERE user_id=? AND store_id=?`).run(USER_ID, STORE_ID);
  db.prepare(`DELETE FROM m2_order_costs WHERE user_id=? AND store_id=?`).run(USER_ID, STORE_ID);
  db.prepare(`DELETE FROM audit_logs WHERE user_id=? AND store_id=?`).run(USER_ID, STORE_ID);
}

function setFetch(responder) {
  globalThis.fetch = responder;
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// --- Tests ----------------------------------------------------------------

test('mapper: OrderTotal Amount string "99.99" → REAL 99.99', () => {
  const o = makeOrder('A1', { OrderTotal: { Amount: '99.99', CurrencyCode: 'USD' } });
  const items = [makeItem('I1', {
    ItemPrice: { Amount: '99.99', CurrencyCode: 'USD' },
    ShippingPrice: { Amount: '0', CurrencyCode: 'USD' },
    ItemTax: { Amount: '0', CurrencyCode: 'USD' },
    ShippingTax: { Amount: '0', CurrencyCode: 'USD' },
    PromotionDiscount: { Amount: '0', CurrencyCode: 'USD' },
  })];
  const row = mapOrder(o, items, 'u', 's');
  assert.equal(row.revenue, 99.99);
  assert.equal(typeof row.revenue, 'number');
  assert.equal(row.currency, 'USD');
});

test('syncOrders: 1 order with 2 items → 1 m2_orders row, ≥2 m2_order_costs rows', async (t) => {
  clearOrderTables();
  _resetForTests();
  const order = makeOrder('ORDER-A');
  const items = [makeItem('I1'), makeItem('I2')];
  const responder = makeResponder([
    tokenRoute(),
    { match: (u) => ordersPath(u), respond: () => ({ status: 200, body: { payload: { Orders: [order] } } }) },
    { match: (u) => itemsPath(u) && orderIdFromItemsUrl(u) === 'ORDER-A',
      respond: () => ({ status: 200, body: { payload: { OrderItems: items } } }) },
  ]);
  setFetch(responder);
  t.after(restoreFetch);

  const result = await syncOrders({ userId: USER_ID, storeId: STORE_ID, since: '2026-01-01T00:00:00Z' });

  assert.equal(result.ordersProcessed, 1);
  assert.equal(result.itemsProcessed, 2);
  assert.equal(result.errors.length, 0);
  const db = getDbInstance();
  const ordersCount = db.prepare(`SELECT COUNT(*) AS c FROM m2_orders WHERE user_id=? AND store_id=?`).get(USER_ID, STORE_ID).c;
  const costsCount = db.prepare(`SELECT COUNT(*) AS c FROM m2_order_costs WHERE user_id=? AND store_id=?`).get(USER_ID, STORE_ID).c;
  assert.equal(ordersCount, 1);
  assert.ok(costsCount >= 2, `expected >=2 cost rows, got ${costsCount}`);
});

test('syncOrders: pagination consumes 2 pages of orders', async (t) => {
  clearOrderTables();
  _resetForTests();
  let pageCallCount = 0;
  const responder = makeResponder([
    tokenRoute(),
    { match: (u) => ordersPath(u), respond: (u) => {
      pageCallCount += 1;
      if (pageCallCount === 1) {
        return { status: 200, body: { payload: {
          Orders: [makeOrder('P1A'), makeOrder('P1B')],
          NextToken: 'cursor-page-2',
        } } };
      }
      // Page 2 (no NextToken → end).
      return { status: 200, body: { payload: {
        Orders: [makeOrder('P2A'), makeOrder('P2B'), makeOrder('P2C')],
      } } };
    } },
    { match: (u) => itemsPath(u), respond: (u) => {
      const oid = orderIdFromItemsUrl(u);
      return { status: 200, body: { payload: { OrderItems: [makeItem('it-' + oid)] } } };
    } },
  ]);
  setFetch(responder);
  t.after(restoreFetch);

  const result = await syncOrders({ userId: USER_ID, storeId: STORE_ID });
  assert.equal(result.ordersProcessed, 5);
  assert.equal(pageCallCount, 2, 'expected 2 orders-page calls');
  const db = getDbInstance();
  const ordersCount = db.prepare(`SELECT COUNT(*) AS c FROM m2_orders WHERE user_id=? AND store_id=?`).get(USER_ID, STORE_ID).c;
  assert.equal(ordersCount, 5);
});

test('syncOrders: idempotency — syncing same order twice does not duplicate', async (t) => {
  clearOrderTables();
  _resetForTests();
  const order = makeOrder('IDEM-1');
  const items = [makeItem('I1')];
  const responder = makeResponder([
    tokenRoute(),
    { match: (u) => ordersPath(u), respond: () => ({ status: 200, body: { payload: { Orders: [order] } } }) },
    { match: (u) => itemsPath(u), respond: () => ({ status: 200, body: { payload: { OrderItems: items } } }) },
  ]);
  setFetch(responder);
  t.after(restoreFetch);

  await syncOrders({ userId: USER_ID, storeId: STORE_ID });
  await syncOrders({ userId: USER_ID, storeId: STORE_ID });

  const db = getDbInstance();
  const total = db.prepare(`SELECT COUNT(*) AS c FROM m2_orders WHERE user_id=? AND store_id=?`).get(USER_ID, STORE_ID).c;
  const distinct = db.prepare(`SELECT COUNT(DISTINCT order_id) AS c FROM m2_orders WHERE user_id=? AND store_id=?`).get(USER_ID, STORE_ID).c;
  assert.equal(total, distinct, 'row count should equal distinct order_id count');
  assert.equal(distinct, 1);
});

test('syncOrders: idempotency preserves original created_at on update', async (t) => {
  clearOrderTables();
  _resetForTests();
  const order = makeOrder('PRESERVE-1');
  const items = [makeItem('I1')];
  const responder = makeResponder([
    tokenRoute(),
    { match: (u) => ordersPath(u), respond: () => ({ status: 200, body: { payload: { Orders: [order] } } }) },
    { match: (u) => itemsPath(u), respond: () => ({ status: 200, body: { payload: { OrderItems: items } } }) },
  ]);
  setFetch(responder);
  t.after(restoreFetch);

  await syncOrders({ userId: USER_ID, storeId: STORE_ID });
  const db = getDbInstance();
  const firstCreatedAt = db.prepare(`SELECT created_at FROM m2_orders WHERE order_id=?`).get('PRESERVE-1').created_at;
  // Small delay so that any second-resolution timestamp would differ.
  await new Promise((r) => setTimeout(r, 25));
  await syncOrders({ userId: USER_ID, storeId: STORE_ID });
  const secondCreatedAt = db.prepare(`SELECT created_at FROM m2_orders WHERE order_id=?`).get('PRESERVE-1').created_at;
  assert.equal(secondCreatedAt, firstCreatedAt, 'created_at must be preserved across re-sync');
});

test('syncOrders: item-level error — 1 of 3 order items endpoint 500 → that order skipped, errors length 1', async (t) => {
  clearOrderTables();
  _resetForTests();
  const orders = [makeOrder('OK-1'), makeOrder('FAIL-2'), makeOrder('OK-3')];
  const responder = makeResponder([
    tokenRoute(),
    { match: (u) => ordersPath(u), respond: () => ({ status: 200, body: { payload: { Orders: orders } } }) },
    { match: (u) => itemsPath(u), respond: (u) => {
      const oid = orderIdFromItemsUrl(u);
      if (oid === 'FAIL-2') {
        return { status: 500, body: { errors: [{ message: 'internal' }] } };
      }
      return { status: 200, body: { payload: { OrderItems: [makeItem('it-' + oid)] } } };
    } },
  ]);
  setFetch(responder);
  t.after(restoreFetch);

  const result = await syncOrders({ userId: USER_ID, storeId: STORE_ID });
  assert.equal(result.errors.length, 1, `got errors=${JSON.stringify(result.errors)}`);
  assert.equal(result.errors[0].orderId, 'FAIL-2');
  assert.equal(result.ordersProcessed, 2);
  const db = getDbInstance();
  const persisted = db.prepare(`SELECT order_id FROM m2_orders WHERE user_id=? AND store_id=? ORDER BY order_id`).all(USER_ID, STORE_ID);
  assert.deepEqual(persisted.map((r) => r.order_id), ['OK-1', 'OK-3']);
}, { timeout: 120000 });

test('syncOrders: LastUpdatedAfter incremental — second call with later since filters earlier orders', async (t) => {
  clearOrderTables();
  _resetForTests();
  const allOrders = [
    makeOrder('E-1', { LastUpdateDate: '2026-01-10T00:00:00Z' }),
    makeOrder('E-2', { LastUpdateDate: '2026-01-12T00:00:00Z' }),
    makeOrder('LATE-3', { LastUpdateDate: '2026-01-20T00:00:00Z' }),
  ];
  const seenSinceValues = [];
  const responder = makeResponder([
    tokenRoute(),
    { match: (u) => ordersPath(u), respond: (u) => {
      const url = new URL(u);
      const since = url.searchParams.get('LastUpdatedAfter');
      seenSinceValues.push(since);
      const filtered = since
        ? allOrders.filter((o) => Date.parse(o.LastUpdateDate) >= Date.parse(since))
        : allOrders;
      return { status: 200, body: { payload: { Orders: filtered } } };
    } },
    { match: (u) => itemsPath(u), respond: (u) => {
      return { status: 200, body: { payload: { OrderItems: [makeItem('it-' + orderIdFromItemsUrl(u))] } } };
    } },
  ]);
  setFetch(responder);
  t.after(restoreFetch);

  const first = await syncOrders({ userId: USER_ID, storeId: STORE_ID, since: '2026-01-01T00:00:00Z' });
  assert.equal(first.ordersProcessed, 3);
  const second = await syncOrders({ userId: USER_ID, storeId: STORE_ID, since: '2026-01-15T00:00:00Z' });
  assert.equal(second.ordersProcessed, 1, 'only LATE-3 should match the later since');
  assert.deepEqual(seenSinceValues, ['2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z']);
});

test('syncOrders: appendAuditLog called once per syncOrders with correct shape', async (t) => {
  clearOrderTables();
  _resetForTests();
  const order = makeOrder('AUDIT-1');
  const responder = makeResponder([
    tokenRoute(),
    { match: (u) => ordersPath(u), respond: () => ({ status: 200, body: { payload: { Orders: [order] } } }) },
    { match: (u) => itemsPath(u), respond: () => ({ status: 200, body: { payload: { OrderItems: [makeItem('A1')] } } }) },
  ]);
  setFetch(responder);
  t.after(restoreFetch);

  await syncOrders({ userId: USER_ID, storeId: STORE_ID, since: '2026-01-01T00:00:00Z' });

  const db = getDbInstance();
  const rows = db.prepare(`SELECT * FROM audit_logs WHERE user_id=? AND store_id=? AND action_type='orders_sync_batch'`)
    .all(USER_ID, STORE_ID);
  assert.equal(rows.length, 1, 'exactly one audit_logs row');
  const row = rows[0];
  assert.equal(row.source_module, 'SPAPI');
  assert.equal(row.action_type, 'orders_sync_batch');
  const payload = JSON.parse(row.payload);
  assert.ok(payload.payload, 'has nested payload');
  assert.equal(payload.payload.ordersProcessed, 1);
  assert.equal(payload.payload.itemsProcessed, 1);
  assert.equal(typeof payload.payload.durationMs, 'number');
});
