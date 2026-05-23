// Per-endpoint token-bucket rate limiter, in-memory.
// SP-API publishes rate + burst per operation:
//   https://developer-docs.amazon.com/sp-api/docs/usage-plans-and-rate-limits
// We pre-load conservative defaults; live x-amzn-RateLimit-Limit headers update at runtime.

const DEFAULTS = {
  // Orders v0
  'orders.getOrders':            { rate: 0.0167, burst: 20 },
  'orders.getOrder':             { rate: 0.5,    burst: 30 },
  'orders.getOrderItems':        { rate: 0.5,    burst: 30 },
  // Reports 2021-06-30
  'reports.createReport':        { rate: 0.0167, burst: 15 },
  'reports.getReport':           { rate: 2.0,    burst: 15 },
  'reports.getReports':          { rate: 0.0222, burst: 10 },
  'reports.getReportDocument':   { rate: 0.0167, burst: 15 },
  // Catalog 2022-04-01
  'catalog.searchCatalogItems':  { rate: 2.0,    burst: 2  },
  'catalog.getCatalogItem':      { rate: 2.0,    burst: 2  },
  // Listings Items 2021-08-01
  'listings.getListingsItem':    { rate: 5.0,    burst: 10 },
  // FBA Inventory v1
  'fbaInventory.getInventorySummaries': { rate: 2.0, burst: 2 },
  // Finances v0
  'finances.listFinancialEvents': { rate: 0.5, burst: 30 },
};

const buckets = new Map(); // key (`${userStore}:${endpoint}`) -> { tokens, last, rate, burst }

function bucketKey(userStoreId, endpoint) { return `${userStoreId}::${endpoint}`; }

function getOrCreate(userStoreId, endpoint) {
  const k = bucketKey(userStoreId, endpoint);
  let b = buckets.get(k);
  if (!b) {
    const cfg = DEFAULTS[endpoint] || { rate: 0.5, burst: 5 };
    b = { tokens: cfg.burst, last: Date.now(), rate: cfg.rate, burst: cfg.burst };
    buckets.set(k, b);
  }
  return b;
}

function refill(b) {
  const now = Date.now();
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(b.burst, b.tokens + elapsed * b.rate);
  b.last = now;
}

export async function acquire(userStoreId, endpoint) {
  const b = getOrCreate(userStoreId, endpoint);
  while (true) {
    refill(b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return;
    }
    const need = 1 - b.tokens;
    const waitMs = Math.max(50, Math.ceil((need / b.rate) * 1000));
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

// Update bucket capacity from x-amzn-RateLimit-Limit header (Amazon sends current rate; burst inferred).
export function updateFromHeader(userStoreId, endpoint, headerValue) {
  if (!headerValue) return;
  const rate = Number(headerValue);
  if (!Number.isFinite(rate) || rate <= 0) return;
  const b = getOrCreate(userStoreId, endpoint);
  b.rate = rate;
}

export function snapshot() {
  const out = {};
  for (const [k, b] of buckets.entries()) {
    out[k] = { tokens: Math.round(b.tokens * 100) / 100, rate: b.rate, burst: b.burst };
  }
  return out;
}

export function _resetForTests() { buckets.clear(); }

// Allow sibling integrations (e.g. ads-api) to merge their own endpoint
// defaults into the same shared bucket map without touching this file.
export function _registerDefaults(map) {
  if (!map || typeof map !== 'object') return;
  for (const [k, v] of Object.entries(map)) {
    if (!v || typeof v !== 'object') continue;
    if (DEFAULTS[k]) continue; // first registration wins
    DEFAULTS[k] = { rate: Number(v.rate) || 0.5, burst: Number(v.burst) || 5 };
  }
}
