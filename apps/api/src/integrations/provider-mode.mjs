// Single source of truth for "mock vs real" data provider mode.
// Driven by DATA_PROVIDER_MODE env var: 'mock' | 'real' | 'hybrid'
//   - mock   : new users/stores get deterministic mock seeds; real sync still allowed if creds present
//   - real   : no mock seed; tables filled only by real sync
//   - hybrid : mock seed initially, real sync overlays/overwrites it (default for dev)
// Default = 'hybrid' so existing demo flow + tests keep working.

import { getDbInstance } from '../data-store.mjs';

const VALID = new Set(['mock', 'real', 'hybrid']);

export function providerMode() {
  const v = (process.env.DATA_PROVIDER_MODE || 'hybrid').toLowerCase();
  return VALID.has(v) ? v : 'hybrid';
}

export function isMockMode()   { return providerMode() === 'mock'; }
export function isRealMode()   { return providerMode() === 'real'; }
export function isHybridMode() { return providerMode() === 'hybrid'; }

// Should mock seed run for this (user, store) on first init?
//   - real mode → never
//   - mock/hybrid → only if no real credentials exist for the store
export function shouldSeedMock(userId, storeId) {
  if (isRealMode()) return false;
  try {
    const db = getDbInstance();
    const row = db.prepare(
      `SELECT 1 FROM store_credentials WHERE user_id=? AND store_id=? AND status='active' LIMIT 1`
    ).get(userId, storeId);
    return !row;
  } catch {
    return true;
  }
}

// Per-store credential presence (used by /status endpoint + UI badges).
export function listProviderStatus(userId, storeId) {
  const db = getDbInstance();
  const rows = db.prepare(
    `SELECT provider, status, last_refreshed_at, last_error, last_error_at, selling_partner_id, region, marketplace_ids
     FROM store_credentials WHERE user_id=? AND store_id=?`
  ).all(userId, storeId);
  const latestSync = db.prepare(
    `SELECT provider, endpoint, status, started_at, ended_at, records_in, error_code, error_message
     FROM sync_runs WHERE user_id=? AND store_id=? ORDER BY started_at DESC LIMIT 10`
  ).all(userId, storeId);
  return {
    mode: providerMode(),
    providers: rows.map((r) => ({
      provider: r.provider,
      status: r.status,
      lastRefreshedAt: r.last_refreshed_at,
      lastError: r.last_error,
      lastErrorAt: r.last_error_at,
      sellingPartnerId: r.selling_partner_id,
      region: r.region,
      marketplaceIds: (r.marketplace_ids || '').split(',').filter(Boolean),
    })),
    recentSyncs: latestSync,
  };
}
