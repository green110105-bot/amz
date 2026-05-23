// Sync scheduler — periodic incremental sync per (user, store).
//
// Design:
//   - Iterates store_credentials WHERE status='active' for each provider.
//   - For each credential, runs the configured set of sync jobs in serial.
//   - "since" cursor is derived from sync_runs: MAX(started_at) WHERE status='ok' AND endpoint=...
//     If no prior run, falls back to (now - lookbackHours).
//   - Job failure isolated to that (credential, job) — never aborts the whole iteration.
//   - All audit goes through the underlying client (sync_runs) + per-job error capture here.
//
// Activation:
//   - Disabled by default. Set SYNC_SCHEDULER_ENABLED=true to auto-start in server.mjs.
//   - Default interval 30 minutes (override via SYNC_SCHEDULER_INTERVAL_MS).

import { getDbInstance } from '../data-store.mjs';
import { syncOrders } from './sp-api/sync/orders-sync.mjs';
import { syncInventory } from './sp-api/sync/inventory-sync.mjs';
import { syncAdsHierarchy } from './ads-api/sync/campaigns-sync.mjs';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_LOOKBACK_HOURS = 24;

const JOB_ENDPOINTS = {
  'orders':    'orders.getOrders',
  'inventory': 'reports.getReport',
  'ads':       'ads.listCampaigns',
};

function nowIso() { return new Date().toISOString(); }

function lastOkAt(db, userId, storeId, endpoint) {
  const row = db.prepare(
    `SELECT MAX(started_at) AS ts FROM sync_runs
     WHERE user_id=? AND store_id=? AND endpoint=? AND status='ok'`
  ).get(userId, storeId, endpoint);
  return row?.ts || null;
}

function defaultSince(lookbackHours) {
  return new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
}

function listActiveCredentials(db, provider) {
  return db.prepare(
    `SELECT user_id, store_id, marketplace_ids, selling_partner_id, region
     FROM store_credentials
     WHERE provider=? AND status='active'`
  ).all(provider);
}

async function runJob(label, fn) {
  const startedAt = nowIso();
  try {
    const result = await fn();
    return { label, status: 'ok', startedAt, endedAt: nowIso(), result };
  } catch (err) {
    return {
      label, status: 'error', startedAt, endedAt: nowIso(),
      errorCode: err?.code || 'job_failed',
      errorMessage: String(err?.message || err).slice(0, 500),
    };
  }
}

/**
 * Run one scheduler iteration over all active credentials.
 *
 * @param {Object} opts
 * @param {string[]} [opts.jobs=['orders','inventory','ads']] which jobs to run
 * @param {number}   [opts.lookbackHours=24]  cold-start window when no prior run exists
 * @param {Object}   [opts.overrides]         per-job arg overrides (testing)
 * @returns {Promise<{ at: string, total: number, perCredential: Array }>}
 */
export async function runOnce({
  jobs = ['orders', 'inventory', 'ads'],
  lookbackHours = DEFAULT_LOOKBACK_HOURS,
  overrides = {},
} = {}) {
  const db = getDbInstance();
  const at = nowIso();
  const perCredential = [];

  const spapiCreds = jobs.some((j) => j === 'orders' || j === 'inventory')
    ? listActiveCredentials(db, 'spapi') : [];
  const adsCreds = jobs.includes('ads') ? listActiveCredentials(db, 'ads') : [];

  for (const c of spapiCreds) {
    const userId = c.user_id, storeId = c.store_id;
    const marketplaceIds = (c.marketplace_ids || '').split(',').filter(Boolean);
    const steps = [];

    if (jobs.includes('orders')) {
      const sinceCursor = lastOkAt(db, userId, storeId, JOB_ENDPOINTS.orders) || defaultSince(lookbackHours);
      steps.push(await runJob('orders', () => syncOrders({
        userId, storeId, since: overrides.orders?.since || sinceCursor,
      })));
    }
    if (jobs.includes('inventory')) {
      steps.push(await runJob('inventory', () => syncInventory({
        userId, storeId, marketplaceIds,
      })));
    }

    perCredential.push({ provider: 'spapi', userId, storeId, steps });
  }

  for (const c of adsCreds) {
    const userId = c.user_id, storeId = c.store_id;
    const steps = [];
    if (jobs.includes('ads')) {
      steps.push(await runJob('ads', () => syncAdsHierarchy({
        userId, storeId, region: c.region,
      })));
    }
    perCredential.push({ provider: 'ads', userId, storeId, steps });
  }

  return { at, total: perCredential.length, perCredential };
}

let _handle = null;
let _running = false;

/**
 * Start periodic scheduler. Idempotent — repeat calls are no-ops.
 *
 * @returns {{ stop: () => void, runOnce: typeof runOnce }}
 */
export function startScheduler({
  intervalMs = Number(process.env.SYNC_SCHEDULER_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  jobs,
  immediate = false,
  onTick,
} = {}) {
  if (_handle) {
    return { stop: stopScheduler, runOnce };
  }

  const tick = async () => {
    if (_running) return; // overlap guard
    _running = true;
    try {
      const result = await runOnce({ jobs });
      if (typeof onTick === 'function') {
        try { onTick(result); } catch { /* swallow callback errors */ }
      }
    } catch (err) {
      try { console.error('[scheduler] iteration crashed:', err?.message); } catch {}
    } finally {
      _running = false;
    }
  };

  if (immediate) Promise.resolve().then(tick);
  _handle = setInterval(tick, Math.max(1000, intervalMs));
  if (typeof _handle.unref === 'function') _handle.unref(); // don't block node exit

  return { stop: stopScheduler, runOnce };
}

export function stopScheduler() {
  if (_handle) {
    clearInterval(_handle);
    _handle = null;
  }
}

export function isRunning() { return _running; }
export function _resetForTests() { stopScheduler(); _running = false; }
