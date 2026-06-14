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
import { buildDailyReport } from '../store-routes-monitor.mjs';
import { createNotification } from '../data-store-monitor.mjs';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_LOOKBACK_HOURS = 24;
// B-6: time-of-day (HH:MM, store timezone-agnostic / server local) at which the
// dailyReport job fires. Default 09:30. Code is ready even though the scheduler
// itself stays disabled unless SYNC_SCHEDULER_ENABLED=true.
const DEFAULT_DAILY_REPORT_AT = '09:30';

const JOB_ENDPOINTS = {
  'orders':    'orders.getOrders',
  'inventory': 'reports.getReport',
  'ads':       'ads.listCampaigns',
};

function nowIso() { return new Date().toISOString(); }

/**
 * AUTH-13: housekeeping — delete expired/consumed integration_oauth_states rows so
 * the table does not grow unbounded. Removes rows whose expires_at is in the past
 * (regardless of consumption) plus any already-consumed rows. Idempotent & safe to
 * call even before the table exists.
 *
 * @returns {{ removed: number }}
 */
export function cleanupExpiredOAuthStates(db = getDbInstance()) {
  try {
    const result = db.prepare(
      `DELETE FROM integration_oauth_states
       WHERE (expires_at IS NOT NULL AND expires_at < ?)
          OR consumed_at IS NOT NULL`
    ).run(nowIso());
    return { removed: result.changes || 0 };
  } catch (err) {
    try { console.error('[scheduler] oauth state cleanup failed:', err?.message || err); } catch {}
    return { removed: 0 };
  }
}

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
 * B-6: resolve the configured daily-report time-of-day ('HH:MM').
 * @returns {string}
 */
export function dailyReportTime() {
  const raw = String(process.env.SYNC_DAILY_REPORT_AT || DEFAULT_DAILY_REPORT_AT).trim();
  return /^\d{1,2}:\d{2}$/.test(raw) ? raw : DEFAULT_DAILY_REPORT_AT;
}

/**
 * B-6: decide whether the dailyReport job should fire for `now`.
 *
 * Pure & deterministic — the caller injects `now` (a Date) and the last fired
 * day-key, so tests assert the trigger logic WITHOUT real waiting. The job fires
 * once per local day at the first tick whose HH:MM is >= the configured time and
 * which has not already fired today.
 *
 * @param {Object} opts
 * @param {Date}   opts.now            injected current time
 * @param {string} [opts.at]           'HH:MM' configured time (defaults to env/default)
 * @param {string|null} [opts.lastFiredDayKey] 'YYYY-MM-DD' of the last fire, or null
 * @returns {{ fire: boolean, dayKey: string, reason: string }}
 */
export function shouldRunDailyReport({ now = new Date(), at = dailyReportTime(), lastFiredDayKey = null } = {}) {
  const dayKey = now.toISOString().slice(0, 10);
  const [h, m] = at.split(':').map((x) => parseInt(x, 10));
  const targetMinutes = (h * 60) + m;
  const nowMinutes = (now.getHours() * 60) + now.getMinutes();
  if (lastFiredDayKey === dayKey) return { fire: false, dayKey, reason: 'already_fired_today' };
  if (nowMinutes < targetMinutes) return { fire: false, dayKey, reason: 'before_configured_time' };
  return { fire: true, dayKey, reason: 'due' };
}

/**
 * B-6: generate a daily-report snapshot per active store and emit one M4
 * notification per store. No external Amazon write — only local snapshot + notif.
 * Failures are isolated per store. Returns a per-store envelope.
 *
 * @param {Object} opts
 * @param {Object} [opts.db]
 * @param {string} [opts.date]   report date override (testing)
 * @returns {{ at: string, total: number, perStore: Array }}
 */
export async function runDailyReportJob({ db = getDbInstance(), date } = {}) {
  const at = nowIso();
  const perStore = [];
  // distinct (user, store) over all active credentials of either provider.
  const stores = db.prepare(
    `SELECT DISTINCT user_id, store_id FROM store_credentials WHERE status='active'`
  ).all();
  for (const c of stores) {
    const userId = c.user_id, storeId = c.store_id;
    try {
      const report = buildDailyReport(db, userId, storeId, {
        storeIds: storeId, date, triggerType: 'scheduled',
      });
      const r = report.summary?.recovered || {};
      const notif = createNotification(db, userId, storeId, {
        title: `每日日报 ${report.reportDate} 已生成`,
        severity: 'info',
        sourceModule: 'M4',
        // B-5: notification body carries the watermarked estimated/realized split,
        // never a single ambiguous "已挽回¥X".
        body: `定时日报: 告警 ${report.summary?.alerts || 0}, 已挽回(${r.watermark || '模拟/预估'}) realized≈${r.realized || 0} / estimated≈${r.estimated || 0} ${r.currency || 'USD'}`,
      });
      perStore.push({ userId, storeId, status: 'ok', reportDate: report.reportDate, notificationId: notif?.id || null });
    } catch (err) {
      perStore.push({
        userId, storeId, status: 'error',
        errorMessage: String(err?.message || err).slice(0, 500),
      });
    }
  }
  return { at, total: perStore.length, perStore };
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
  now = new Date(),
} = {}) {
  const db = getDbInstance();
  const at = nowIso();
  const perCredential = [];
  let dailyReport = null;

  // AUTH-13: opportunistic cleanup of expired/consumed OAuth state rows.
  const oauthStateCleanup = cleanupExpiredOAuthStates(db);

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

  // B-6: dailyReport job — fires at most once per local day at/after the configured
  // time-of-day. Uses module-level _lastDailyReportDayKey so repeated ticks within the
  // same day do not re-fire. Injected `now` makes the trigger deterministically testable.
  if (jobs.includes('dailyReport')) {
    const decision = shouldRunDailyReport({ now, lastFiredDayKey: _lastDailyReportDayKey });
    if (decision.fire) {
      _lastDailyReportDayKey = decision.dayKey;
      const result = await runDailyReportJob({ db });
      dailyReport = { ...result, fired: true, dayKey: decision.dayKey, at: dailyReportTime() };
    } else {
      dailyReport = { fired: false, reason: decision.reason, dayKey: decision.dayKey, at: dailyReportTime() };
    }
  }

  return { at, total: perCredential.length, perCredential, oauthStateCleanup, dailyReport };
}

let _handle = null;
let _running = false;
// B-6: tracks the day-key of the last dailyReport fire so it triggers once/day.
let _lastDailyReportDayKey = null;

/**
 * Start periodic scheduler. Idempotent — repeat calls are no-ops.
 *
 * @returns {{ stop: () => void, runOnce: typeof runOnce }}
 */
export function startScheduler({
  intervalMs = Number(process.env.SYNC_SCHEDULER_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  // B-6: dailyReport is part of the default job set so an enabled scheduler emits the
  // 09:30 (env-configurable) snapshot+notification. The scheduler itself stays disabled
  // unless SYNC_SCHEDULER_ENABLED=true, so this is code-ready, not auto-on.
  jobs = ['orders', 'inventory', 'ads', 'dailyReport'],
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
export function _resetForTests() { stopScheduler(); _running = false; _lastDailyReportDayKey = null; }
