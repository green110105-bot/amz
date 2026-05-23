// Catalog Items sync.
// Fetches via searchCatalogItems (batch ASINs) and upserts into:
//   - products (data-store.mjs): id, sku?, asin, title, data
//   - listings (data-store.mjs): product_id, data — richer raw catalog payload
// Note: the project's listings table (PK user_id, store_id, product_id) acts as
// the catalog detail store. M1-specific tables (m1_*) are AI-generated content,
// not the raw Amazon catalog, so they are intentionally not touched here.

import { searchCatalogItems } from '../endpoints/catalog.mjs';
import { getDbInstance, appendAuditLog } from '../../../data-store.mjs';

const CHUNK = 20;

function chunked(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function syncCatalogItems(args) {
  const { userId, storeId, asins, marketplaceIds, injectItems } = args;
  if (!userId || !storeId) throw new Error('user_and_store_required');
  if (!Array.isArray(asins) || asins.length === 0) throw new Error('asins_required');

  let items;
  if (Array.isArray(injectItems)) {
    items = injectItems;
  } else {
    items = [];
    for (const batch of chunked(asins, CHUNK)) {
      const got = await searchCatalogItems({ userId, storeId, asins: batch, marketplaceIds });
      items.push(...got);
    }
  }

  const db = getDbInstance();
  const upProduct = db.prepare(`INSERT INTO products(id,user_id,store_id,sku,asin,title,data)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id, store_id, id) DO UPDATE SET
      asin=excluded.asin, title=excluded.title, data=excluded.data`);
  const upListing = db.prepare(`INSERT INTO listings(product_id,user_id,store_id,data)
    VALUES (?,?,?,?)
    ON CONFLICT(user_id, store_id, product_id) DO UPDATE SET data=excluded.data`);

  let written = 0;
  const tx = db.transaction(() => {
    for (const it of items) {
      if (!it || !it.asin) continue;
      const productId = `spapi-${it.asin}`;
      const data = {
        asin: it.asin,
        title: it.title,
        brand: it.brand,
        imageUrl: it.imageUrl,
        dimensions: it.dimensions,
        source: 'spapi.catalog',
      };
      upProduct.run(
        productId, userId, storeId, null, it.asin, it.title || null,
        JSON.stringify(data),
      );
      const listingData = {
        asin: it.asin,
        title: it.title,
        brand: it.brand,
        imageUrl: it.imageUrl,
        dimensions: it.dimensions,
        summaries: it.summaries,
        salesRanks: it.salesRanks,
        attributesKeys: it.attributes ? Object.keys(it.attributes) : [],
        source: 'spapi.catalog',
      };
      upListing.run(productId, userId, storeId, JSON.stringify(listingData));
      written += 1;
    }
  });
  tx();

  try {
    appendAuditLog(userId, storeId, {
      sourceModule: 'spapi.catalog',
      actionType: 'sync',
      resourceType: 'products',
      status: 'success',
      written, asinCount: asins.length,
    });
  } catch {}

  return { written, items };
}
