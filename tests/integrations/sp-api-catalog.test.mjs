import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Isolated DB + creds BEFORE imports.
const tmpDir = mkdtempSync(join(tmpdir(), 'amz-spapi-cat-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'test-client-id';
process.env.SPAPI_LWA_CLIENT_SECRET = 'test-client-secret';

const { getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const { upsertSpApiCredentials, setSpApiAccessToken } = await import('../../apps/api/src/integrations/sp-api/credentials.mjs');
const { _resetForTests: resetRateLimiter } = await import('../../apps/api/src/integrations/sp-api/rate-limiter.mjs');
const catalog = await import('../../apps/api/src/integrations/sp-api/endpoints/catalog.mjs');
const catalogSync = await import('../../apps/api/src/integrations/sp-api/sync/catalog-sync.mjs');

const USER_ID = 'u-test';
const STORE_ID = 's-test';
const MP = ['ATVPDKIKX0DER'];

function seedCreds() {
  const db = getDbInstance();
  db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`)
    .run(USER_ID, 'Test', 'test-cat@amz.local', 'admin', 'x', new Date().toISOString());
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

// fetch mocking ---------------------------------------------------------------
const origFetch = globalThis.fetch;
let nextResponses = [];

function makeResponse({ status = 200, json, body, headers = {} }) {
  const text = json !== undefined ? JSON.stringify(json) : (body ?? '');
  const hdrs = new Headers({ 'content-type': 'application/json', ...headers });
  return new Response(text, { status, headers: hdrs });
}

function setMockSequence(specs) { nextResponses = specs.slice(); }

globalThis.fetch = async (url, opts) => {
  const u = typeof url === 'string' ? url : url?.toString();
  if (!nextResponses.length) throw new Error('mock_fetch_unexpected_call: ' + u);
  const next = nextResponses.shift();
  if (next.match && !next.match(u, opts)) {
    throw new Error('mock_fetch_match_failed for url=' + u);
  }
  if (typeof next.respond === 'function') return next.respond(u, opts);
  return makeResponse(next);
};

test.after(() => { globalThis.fetch = origFetch; });

// Helpers --------------------------------------------------------------------
function fakeItem(asin, title, brand, imageLink) {
  return {
    asin,
    attributes: {
      item_name: [{ value: title, language_tag: 'en_US', marketplace_id: 'ATVPDKIKX0DER' }],
      brand: [{ value: brand, language_tag: 'en_US' }],
      item_dimensions: [{
        length: { value: 10, unit: 'inches' },
        width: { value: 5, unit: 'inches' },
        height: { value: 3, unit: 'inches' },
      }],
    },
    summaries: [{ marketplaceId: 'ATVPDKIKX0DER', itemName: title, brandName: brand }],
    images: [{
      marketplaceId: 'ATVPDKIKX0DER',
      images: [{ variant: 'MAIN', link: imageLink, height: 500, width: 500 }],
    }],
    salesRanks: [],
  };
}

// ===========================================================================
// 1. getCatalogItem maps attributes correctly
// ===========================================================================
test('catalog.getCatalogItem maps title/brand/image/dimensions from attributes+summaries+images', async () => {
  setMockSequence([
    {
      match: (u) => u.includes('/catalog/2022-04-01/items/B0TEST111'),
      json: fakeItem('B0TEST111', 'Acme Widget Pro', 'Acme', 'https://m.media-amz/MAIN.jpg'),
    },
  ]);
  const item = await catalog.getCatalogItem({
    userId: USER_ID, storeId: STORE_ID, asin: 'B0TEST111', marketplaceIds: MP,
  });
  assert.equal(item.asin, 'B0TEST111');
  assert.equal(item.title, 'Acme Widget Pro');
  assert.equal(item.brand, 'Acme');
  assert.equal(item.imageUrl, 'https://m.media-amz/MAIN.jpg');
  assert.ok(item.dimensions);
});

// ===========================================================================
// 2. searchCatalogItems → array; catalog-sync persists 2 products + 2 listings
// ===========================================================================
test('catalog-sync: 2 ASINs persisted to products + listings with title/brand/image', async () => {
  setMockSequence([
    {
      match: (u) => u.includes('/catalog/2022-04-01/items') && u.includes('identifiers=B0AAA111%2CB0BBB222'),
      json: {
        items: [
          fakeItem('B0AAA111', 'Alpha Mug', 'AlphaCo', 'https://img/a.jpg'),
          fakeItem('B0BBB222', 'Beta Bottle', 'BetaCo', 'https://img/b.jpg'),
        ],
      },
    },
  ]);
  const res = await catalogSync.syncCatalogItems({
    userId: USER_ID, storeId: STORE_ID,
    asins: ['B0AAA111', 'B0BBB222'], marketplaceIds: MP,
  });
  assert.equal(res.written, 2);

  const db = getDbInstance();
  const prods = db.prepare(`SELECT id, asin, title, data FROM products WHERE user_id=? AND store_id=? AND asin IN ('B0AAA111','B0BBB222') ORDER BY asin`)
    .all(USER_ID, STORE_ID);
  assert.equal(prods.length, 2);
  assert.equal(prods[0].asin, 'B0AAA111');
  assert.equal(prods[0].title, 'Alpha Mug');
  const d0 = JSON.parse(prods[0].data);
  assert.equal(d0.brand, 'AlphaCo');
  assert.equal(d0.imageUrl, 'https://img/a.jpg');

  const lst = db.prepare(`SELECT product_id, data FROM listings WHERE user_id=? AND store_id=? AND product_id IN ('spapi-B0AAA111','spapi-B0BBB222')`)
    .all(USER_ID, STORE_ID);
  assert.equal(lst.length, 2);
});

// ===========================================================================
// 3. catalog-sync upserts (re-running updates rather than duplicates)
// ===========================================================================
test('catalog-sync upserts on re-run (no duplicate product rows)', async () => {
  const updated = fakeItem('B0AAA111', 'Alpha Mug v2', 'AlphaCo', 'https://img/a2.jpg');
  const res = await catalogSync.syncCatalogItems({
    userId: USER_ID, storeId: STORE_ID,
    asins: ['B0AAA111'], marketplaceIds: MP,
    injectItems: [catalog.mapCatalogItem(updated)],
  });
  assert.equal(res.written, 1);
  const db = getDbInstance();
  const rows = db.prepare(`SELECT title FROM products WHERE user_id=? AND store_id=? AND asin='B0AAA111'`)
    .all(USER_ID, STORE_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Alpha Mug v2');
});

// ===========================================================================
// 4. mapCatalogItem tolerates a missing-summary fallback (uses attributes only)
// ===========================================================================
test('catalog.mapCatalogItem falls back to attributes when summaries are absent', () => {
  const raw = {
    asin: 'B0EMPTY',
    attributes: {
      item_name: [{ value: 'Fallback Item' }],
      brand: [{ value: 'NoSummaryBrand' }],
    },
    images: [],
  };
  const mapped = catalog.mapCatalogItem(raw);
  assert.equal(mapped.title, 'Fallback Item');
  assert.equal(mapped.brand, 'NoSummaryBrand');
  assert.equal(mapped.imageUrl, null);
});

// ===========================================================================
// 5. searchCatalogItems returns array
// ===========================================================================
test('catalog.searchCatalogItems returns mapped array for batch query', async () => {
  setMockSequence([
    {
      match: (u) => u.includes('/catalog/2022-04-01/items') && u.includes('identifiers=B0X%2CB0Y'),
      json: {
        items: [
          fakeItem('B0X', 'X', 'XBrand', 'https://img/x'),
          fakeItem('B0Y', 'Y', 'YBrand', 'https://img/y'),
        ],
      },
    },
  ]);
  const arr = await catalog.searchCatalogItems({
    userId: USER_ID, storeId: STORE_ID,
    asins: ['B0X', 'B0Y'], marketplaceIds: MP,
  });
  assert.equal(arr.length, 2);
  assert.equal(arr[0].asin, 'B0X');
  assert.equal(arr[1].asin, 'B0Y');
});
