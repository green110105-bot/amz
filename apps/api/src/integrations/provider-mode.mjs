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

// X-P2-01: single source of truth for the "real writes enabled" boolean.
// Canonical env is ADS_REAL_WRITES_ENABLED (the one the gate reads).
// REAL_WRITES_ENABLED is accepted as a legacy alias so existing deploys keep working.
export function realWritesEnabled() {
  const truthy = (v) => v === '1' || v === 'true' || v === 'yes';
  return truthy(process.env.ADS_REAL_WRITES_ENABLED) || truthy(process.env.REAL_WRITES_ENABLED);
}

// AUTH-04: single source of truth for the "real writes enabled" boolean that the
// authorization UI / diagnostics回显. This is purely a HONEST READBACK of the env
// gate state — it does NOT itself open any write path. The only place that actually
// performs a real write is the live-action-executor, which independently re-checks
// isRealMode() + every env gate before touching Amazon. This function exists so the
// UI never claims "不会修改账户" when the operator has in fact armed the env gates.
//
// realWriteEnabled === (ADS_REAL_WRITES_ENABLED truthy && ADS_API_MOCK NOT truthy && allowlist non-empty)
export function getRealWriteGateState() {
  const truthy = (v) => v === '1' || v === 'true' || v === 'yes';
  const envGate = truthy(process.env.ADS_REAL_WRITES_ENABLED) || truthy(process.env.REAL_WRITES_ENABLED);
  const mockExclusive = !truthy(process.env.ADS_API_MOCK);
  const allowlistConfigured = String(process.env.ADS_REAL_WRITES_STORE_ALLOWLIST || '')
    .split(',').map((x) => x.trim()).filter(Boolean).length > 0;
  return {
    realWriteEnabled: envGate && mockExclusive && allowlistConfigured,
    envGate,
    mockExclusive,
    allowlistConfigured,
  };
}

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
  } catch (err) {
    // X-P1-06: fail-closed. A DB hiccup must NOT default to seeding mock data —
    // that would inject deterministic mock seeds into a store that may have real
    // credentials (fail-open pollution). Refuse to seed and surface the error.
    console.error('[provider-mode] shouldSeedMock credential check failed, refusing to seed mock:', err?.message || err);
    return false;
  }
}

// Per-store credential presence (used by /status endpoint + UI badges).
export function listProviderStatus(userId, storeId) {
  const db = getDbInstance();
  const rows = db.prepare(
    `SELECT provider, status, last_refreshed_at, last_error, last_error_at, selling_partner_id, profile_id, region, marketplace_ids
     FROM store_credentials WHERE user_id=? AND store_id=?`
  ).all(userId, storeId);
  const latestSync = db.prepare(
    `SELECT provider, endpoint, status, started_at, ended_at, records_in, error_code, error_message
     FROM sync_runs WHERE user_id=? AND store_id=? ORDER BY started_at DESC LIMIT 10`
  ).all(userId, storeId);
  return {
    mode: providerMode(),
    // X-P1-03: surface the real-write gate state alongside the provider mode so the
    // front-end top-bar trust anchors read the actual backend gate (not a Pinia死值).
    // This is an HONEST READBACK only — it does not itself open any write path.
    realWriteGate: getRealWriteGateState(),
    providers: rows.map((r) => ({
      provider: r.provider,
      status: r.status,
      lastRefreshedAt: r.last_refreshed_at,
      lastError: r.last_error,
      lastErrorAt: r.last_error_at,
      sellingPartnerId: r.selling_partner_id,
      profileId: r.profile_id,
      region: r.region,
      marketplaceIds: (r.marketplace_ids || '').split(',').filter(Boolean),
    })),
    recentSyncs: latestSync,
  };
}
