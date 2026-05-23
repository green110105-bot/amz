// SP-API Catalog Items 2022-04-01
//   GET /catalog/2022-04-01/items/{asin}?marketplaceIds=X&includedData=...
//   GET /catalog/2022-04-01/items?identifiers=ASIN1,ASIN2&identifiersType=ASIN&marketplaceIds=X

import { spapiCall } from '../client.mjs';

const CATALOG_BASE = '/catalog/2022-04-01';
const DEFAULT_INCLUDED = ['attributes', 'images', 'summaries', 'salesRanks'];

function ensureMarketplaces(marketplaceIds) {
  if (!Array.isArray(marketplaceIds) || marketplaceIds.length === 0) {
    throw new Error('marketplace_ids_required');
  }
  return marketplaceIds.join(',');
}

export async function getCatalogItem({
  userId, storeId, asin, marketplaceIds,
  includedData = DEFAULT_INCLUDED,
}) {
  if (!asin) throw new Error('asin_required');
  const mp = ensureMarketplaces(marketplaceIds);
  const { json } = await spapiCall({
    userId, storeId,
    endpoint: 'catalog.getCatalogItem',
    path: `${CATALOG_BASE}/items/${encodeURIComponent(asin)}`,
    query: {
      marketplaceIds: mp,
      includedData: Array.isArray(includedData) ? includedData.join(',') : String(includedData),
    },
  });
  return mapCatalogItem(json);
}

export async function searchCatalogItems({
  userId, storeId, asins, marketplaceIds,
  includedData = DEFAULT_INCLUDED,
}) {
  if (!Array.isArray(asins) || asins.length === 0) {
    throw new Error('asins_required');
  }
  const mp = ensureMarketplaces(marketplaceIds);
  const { json } = await spapiCall({
    userId, storeId,
    endpoint: 'catalog.searchCatalogItems',
    path: `${CATALOG_BASE}/items`,
    query: {
      identifiers: asins.join(','),
      identifiersType: 'ASIN',
      marketplaceIds: mp,
      includedData: Array.isArray(includedData) ? includedData.join(',') : String(includedData),
      pageSize: Math.min(20, asins.length),
    },
  });
  const items = json?.items || json?.payload?.items || [];
  return items.map(mapCatalogItem);
}

// ---------------------------------------------------------------------------
// Mapping helpers — Amazon attribute values are usually nested arrays of
// { value, marketplace_id, language_tag } objects. Extract the first value.
// ---------------------------------------------------------------------------
function firstAttr(attrs, key) {
  if (!attrs || typeof attrs !== 'object') return null;
  const v = attrs[key];
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const first = v[0];
    if (first && typeof first === 'object' && 'value' in first) return first.value;
    return first;
  }
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}

function firstImageUrl(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  // Each entry: { marketplaceId, images: [{ variant, link, width, height }] }
  for (const set of images) {
    const arr = set?.images || [];
    if (!arr.length) continue;
    const main = arr.find((im) => im?.variant === 'MAIN') || arr[0];
    if (main?.link) return main.link;
  }
  return null;
}

function firstSummary(summaries) {
  if (!Array.isArray(summaries) || summaries.length === 0) return {};
  return summaries[0] || {};
}

export function mapCatalogItem(raw) {
  if (!raw) return null;
  // Accept either a single-item response (getCatalogItem returns the item object)
  // or an item entry from searchCatalogItems items[].
  const item = raw.payload || raw;
  const asin = item.asin || item.ASIN || null;
  const attrs = item.attributes || {};
  const summary = firstSummary(item.summaries);
  const images = item.images || [];

  const title =
    summary.itemName ||
    firstAttr(attrs, 'item_name') ||
    firstAttr(attrs, 'title') ||
    null;
  const brand =
    summary.brandName ||
    summary.brand ||
    firstAttr(attrs, 'brand') ||
    null;
  const imageUrl = summary.mainImage?.link || firstImageUrl(images);

  // Dimensions: prefer summary.itemDimensions (object) then attribute.
  const dimensions =
    summary.itemDimensions ||
    firstAttr(attrs, 'item_dimensions') ||
    null;

  return {
    asin,
    title,
    brand,
    imageUrl,
    dimensions,
    summaries: item.summaries || [],
    attributes: attrs,
    images,
    salesRanks: item.salesRanks || [],
    raw: item,
  };
}
