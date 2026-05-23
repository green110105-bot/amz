import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';

// Isolated DB + creds BEFORE imports.
const tmpDir = mkdtempSync(join(tmpdir(), 'amz-spapi-rep-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'test-client-id';
process.env.SPAPI_LWA_CLIENT_SECRET = 'test-client-secret';

const { getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const { upsertSpApiCredentials, setSpApiAccessToken } = await import('../../apps/api/src/integrations/sp-api/credentials.mjs');
const { _resetForTests: resetRateLimiter } = await import('../../apps/api/src/integrations/sp-api/rate-limiter.mjs');
const reports = await import('../../apps/api/src/integrations/sp-api/endpoints/reports.mjs');
const settlementSync = await import('../../apps/api/src/integrations/sp-api/sync/settlement-sync.mjs');
const inventorySync = await import('../../apps/api/src/integrations/sp-api/sync/inventory-sync.mjs');

const USER_ID = 'u-test';
const STORE_ID = 's-test';
const MP = ['ATVPDKIKX0DER'];

// ---------------------------------------------------------------------------
// One-time seed: user, user_store, spapi credentials, cached access token.
// ---------------------------------------------------------------------------
function seedCreds() {
  const db = getDbInstance();
  db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`)
    .run(USER_ID, 'Test', 'test-rep@amz.local', 'admin', 'x', new Date().toISOString());
  db.prepare(`INSERT OR REPLACE INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(STORE_ID, USER_ID, 'Test US', 'US', 'USD', 'ATVPDKIKX0DER', 0, 0, new Date().toISOString());
  upsertSpApiCredentials({
    userId: USER_ID, storeId: STORE_ID,
    sellingPartnerId: 'AX', region: 'NA',
    marketplaceIds: MP, refreshToken: 'Atzr|FAKE',
  });
  setSpApiAccessToken(USER_ID, STORE_ID, 'Atza|CACHED-ACCESS', new Date(Date.now() + 3600 * 1000).toISOString());
}

seedCreds();
resetRateLimiter();

// ---------------------------------------------------------------------------
// fetch mocking — install a programmable router on globalThis.fetch.
// ---------------------------------------------------------------------------
const origFetch = globalThis.fetch;
let nextResponses = []; // FIFO of { match, status, json, body, headers }

function makeResponse({ status = 200, json, body, headers = {} }) {
  const text = json !== undefined ? JSON.stringify(json) : (body ?? '');
  const hdrs = new Headers({ 'content-type': 'application/json', ...headers });
  return new Response(text, { status, headers: hdrs });
}

function setMockSequence(specs) {
  nextResponses = specs.slice();
}

globalThis.fetch = async (url, opts) => {
  const u = typeof url === 'string' ? url : url?.toString();
  // Default-pass anything not in the mock queue if it's the LWA endpoint and we have cached token (shouldn't hit).
  if (!nextResponses.length) {
    throw new Error('mock_fetch_unexpected_call: ' + u);
  }
  const next = nextResponses.shift();
  if (next.match && !next.match(u, opts)) {
    throw new Error('mock_fetch_match_failed for url=' + u + ' expected ' + next.matchDesc);
  }
  if (typeof next.respond === 'function') return next.respond(u, opts);
  return makeResponse(next);
};

test.after(() => { globalThis.fetch = origFetch; });

// ===========================================================================
// 1. createReport returns reportId
// ===========================================================================
test('reports.createReport returns reportId', async () => {
  setMockSequence([
    { match: (u) => u.includes('/reports/2021-06-30/reports'), json: { reportId: 'r-123' } },
  ]);
  const id = await reports.createReport({
    userId: USER_ID, storeId: STORE_ID,
    reportType: 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2',
    marketplaceIds: MP,
  });
  assert.equal(id, 'r-123');
});

// ===========================================================================
// 2. pollReport: IN_PROGRESS x3 then DONE
// ===========================================================================
test('reports.pollReport polls IN_PROGRESS 3x then returns DONE with documentId', async () => {
  setMockSequence([
    { match: (u) => u.includes('/reports/r-poll'), json: { processingStatus: 'IN_PROGRESS' } },
    { match: (u) => u.includes('/reports/r-poll'), json: { processingStatus: 'IN_PROGRESS' } },
    { match: (u) => u.includes('/reports/r-poll'), json: { processingStatus: 'IN_PROGRESS' } },
    { match: (u) => u.includes('/reports/r-poll'), json: { processingStatus: 'DONE', reportDocumentId: 'doc-1' } },
  ]);
  const res = await reports.pollReport({
    userId: USER_ID, storeId: STORE_ID, reportId: 'r-poll',
    maxAttempts: 10, baseDelayMs: 1,
  });
  assert.equal(res.status, 'DONE');
  assert.equal(res.reportDocumentId, 'doc-1');
  assert.equal(nextResponses.length, 0);
});

// ===========================================================================
// 3. pollReport: maxAttempts → clear error (no infinite loop)
// ===========================================================================
test('reports.pollReport throws on maxAttempts exceeded', async () => {
  setMockSequence([
    { match: (u) => u.includes('/reports/r-loop'), json: { processingStatus: 'IN_PROGRESS' } },
    { match: (u) => u.includes('/reports/r-loop'), json: { processingStatus: 'IN_PROGRESS' } },
    { match: (u) => u.includes('/reports/r-loop'), json: { processingStatus: 'IN_PROGRESS' } },
  ]);
  await assert.rejects(
    reports.pollReport({
      userId: USER_ID, storeId: STORE_ID, reportId: 'r-loop',
      maxAttempts: 3, baseDelayMs: 1,
    }),
    /report_poll_timeout/,
  );
});

// ===========================================================================
// 4. FATAL / CANCELLED raise distinguishable errors
// ===========================================================================
test('reports.pollReport raises distinct error on FATAL', async () => {
  setMockSequence([
    { match: (u) => u.includes('/reports/r-fatal'), json: { processingStatus: 'FATAL' } },
  ]);
  await assert.rejects(
    reports.pollReport({ userId: USER_ID, storeId: STORE_ID, reportId: 'r-fatal', maxAttempts: 2, baseDelayMs: 1 }),
    (e) => /report_fatal/.test(e.message) && e.status === 'FATAL',
  );
});

test('reports.pollReport raises distinct error on CANCELLED', async () => {
  setMockSequence([
    { match: (u) => u.includes('/reports/r-cancel'), json: { processingStatus: 'CANCELLED' } },
  ]);
  await assert.rejects(
    reports.pollReport({ userId: USER_ID, storeId: STORE_ID, reportId: 'r-cancel', maxAttempts: 2, baseDelayMs: 1 }),
    (e) => /report_cancelled/.test(e.message) && e.status === 'CANCELLED',
  );
});

// ===========================================================================
// 5. downloadReportDocument gunzips fixture
// ===========================================================================
test('reports.downloadReportDocument gunzips a GZipped TSV', async () => {
  const tsv = 'a\tb\tc\n1\t2\t3\n4\t5\t6\n';
  const gz = gzipSync(Buffer.from(tsv, 'utf8'));
  setMockSequence([
    {
      match: (u) => u.includes('/documents/doc-gz'),
      json: { url: 'https://s3.fake/doc-gz.gz', compressionAlgorithm: 'GZIP' },
    },
    {
      match: (u) => u.startsWith('https://s3.fake/doc-gz.gz'),
      respond: () => new Response(gz, { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
    },
  ]);
  const doc = await reports.downloadReportDocument({
    userId: USER_ID, storeId: STORE_ID, reportDocumentId: 'doc-gz',
  });
  assert.match(doc.text, /^a\tb\tc/);
  assert.equal(doc.rows.length, 2);
  assert.deepEqual(doc.rows[0], { a: '1', b: '2', c: '3' });
});

// ===========================================================================
// 6. settlement-sync: 2 orders x 3 fee lines = 6 rows; rerun stays 6 (idempotent)
// ===========================================================================
test('settlement-sync writes 6 m2_order_costs rows and is idempotent on re-run', async () => {
  // Use injectRows to skip the network — sync logic + DB writes are what we want to test.
  const rows = [
    { 'amazon-order-item-code': 'O-1', 'amount-type': 'ItemPrice', 'amount-description': 'Principal', amount: '19.99', currency: 'USD' },
    { 'amazon-order-item-code': 'O-1', 'amount-type': 'ItemFees',  'amount-description': 'Commission', amount: '-3.00', currency: 'USD' },
    { 'amazon-order-item-code': 'O-1', 'amount-type': 'ItemFees',  'amount-description': 'FBAFee',     amount: '-2.50', currency: 'USD' },
    { 'amazon-order-item-code': 'O-2', 'amount-type': 'ItemPrice', 'amount-description': 'Principal', amount: '29.99', currency: 'USD' },
    { 'amazon-order-item-code': 'O-2', 'amount-type': 'ItemFees',  'amount-description': 'Commission', amount: '-4.50', currency: 'USD' },
    { 'amazon-order-item-code': 'O-2', 'amount-type': 'ItemFees',  'amount-description': 'FBAFee',     amount: '-2.75', currency: 'USD' },
  ];
  const since = '2026-05-01T00:00:00Z';
  const until = '2026-05-07T23:59:59Z';

  const r1 = await settlementSync.syncSettlement({
    userId: USER_ID, storeId: STORE_ID, since, until,
    marketplaceIds: MP, injectRows: rows,
  });
  assert.equal(r1.written, 6);

  const db = getDbInstance();
  const cnt1 = db.prepare(`SELECT COUNT(*) AS c FROM m2_order_costs WHERE user_id=? AND store_id=? AND source='spapi.settlement'`)
    .get(USER_ID, STORE_ID);
  assert.equal(cnt1.c, 6);

  // Re-run same range — should stay 6, not 12.
  const r2 = await settlementSync.syncSettlement({
    userId: USER_ID, storeId: STORE_ID, since, until,
    marketplaceIds: MP, injectRows: rows,
  });
  assert.equal(r2.written, 6);
  const cnt2 = db.prepare(`SELECT COUNT(*) AS c FROM m2_order_costs WHERE user_id=? AND store_id=? AND source='spapi.settlement'`)
    .get(USER_ID, STORE_ID);
  assert.equal(cnt2.c, 6, 'settlement-sync must be idempotent');

  // Spot-check cost_type contains amount-type:amount-description
  const sample = db.prepare(`SELECT cost_type, amount FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id='O-1' ORDER BY cost_type`)
    .all(USER_ID, STORE_ID);
  assert.equal(sample.length, 3);
  assert.ok(sample.find((r) => r.cost_type === 'ItemPrice:Principal' && r.amount === 19.99));
  assert.ok(sample.find((r) => r.cost_type === 'ItemFees:Commission' && r.amount === -3));
  assert.ok(sample.find((r) => r.cost_type === 'ItemFees:FBAFee' && r.amount === -2.5));
});

// ===========================================================================
// 7. inventory-sync: 5-line TSV → 5 snapshot rows
// ===========================================================================
test('inventory-sync writes one m2_inventory_snapshots row per TSV line', async () => {
  const rows = [
    { sku: 'SKU-1', asin: 'B001', 'afn-fulfillable-quantity': '10', 'afn-reserved-quantity': '1', 'afn-inbound-shipped-quantity': '5' },
    { sku: 'SKU-2', asin: 'B002', 'afn-fulfillable-quantity': '0',  'afn-reserved-quantity': '0', 'afn-inbound-shipped-quantity': '0' },
    { sku: 'SKU-3', asin: 'B003', 'afn-fulfillable-quantity': '42', 'afn-reserved-quantity': '3', 'afn-inbound-shipped-quantity': '0' },
    { sku: 'SKU-4', asin: 'B004', 'afn-fulfillable-quantity': '7',  'afn-reserved-quantity': '0', 'afn-inbound-shipped-quantity': '12' },
    { sku: 'SKU-5', asin: 'B005', 'afn-fulfillable-quantity': '100','afn-reserved-quantity': '5', 'afn-inbound-shipped-quantity': '20' },
  ];
  const r = await inventorySync.syncInventory({
    userId: USER_ID, storeId: STORE_ID,
    marketplaceIds: MP, injectRows: rows,
  });
  assert.equal(r.written, 5);

  const db = getDbInstance();
  const cnt = db.prepare(`SELECT COUNT(*) AS c FROM m2_inventory_snapshots WHERE user_id=? AND store_id=? AND warehouse='FBA'`)
    .get(USER_ID, STORE_ID);
  assert.equal(cnt.c, 5);
  const r3 = db.prepare(`SELECT on_hand, reserved, inbound FROM m2_inventory_snapshots WHERE user_id=? AND store_id=? AND sku='SKU-3'`)
    .get(USER_ID, STORE_ID);
  assert.equal(r3.on_hand, 42);
  assert.equal(r3.reserved, 3);
  assert.equal(r3.inbound, 0);
});

// ===========================================================================
// 8. parseTsv handles header + rows; ignores trailing blank line
// ===========================================================================
test('reports.parseTsv parses headers and rows; tolerates trailing newline', () => {
  const text = 'h1\th2\th3\nv1\tv2\tv3\nv4\tv5\tv6\n';
  const rows = reports.parseTsv(text);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { h1: 'v1', h2: 'v2', h3: 'v3' });
  assert.deepEqual(rows[1], { h1: 'v4', h2: 'v5', h3: 'v6' });
});
