// SP-API HTTP client. Wraps fetch with:
//  - LWA access-token injection (x-amz-access-token)
//  - Per-endpoint token-bucket rate limiting
//  - 429 / 5xx retry with exponential backoff + jitter
//  - x-amzn-RateLimit-Limit header → live bucket update
//  - sync_runs audit row per call (optional via opts.audit = false)

import { getAccessToken } from './auth.mjs';
import { acquire, updateFromHeader } from './rate-limiter.mjs';
import { recordSpApiError } from './credentials.mjs';
import { getDbInstance } from '../../data-store.mjs';
import { randomBytes } from 'node:crypto';

const REGION_HOSTS = {
  NA: 'https://sellingpartnerapi-na.amazon.com',
  EU: 'https://sellingpartnerapi-eu.amazon.com',
  FE: 'https://sellingpartnerapi-fe.amazon.com',
};

const SANDBOX_HOSTS = {
  NA: 'https://sandbox.sellingpartnerapi-na.amazon.com',
  EU: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
  FE: 'https://sandbox.sellingpartnerapi-fe.amazon.com',
};

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

function isSandbox() {
  const v = process.env.SPAPI_USE_SANDBOX;
  return v === '1' || v === 'true' || v === 'yes';
}

function hostFor(region) {
  const r = (region || process.env.SPAPI_DEFAULT_REGION || 'NA').toUpperCase();
  const table = isSandbox() ? SANDBOX_HOSTS : REGION_HOSTS;
  return table[r] || table.NA;
}

function newSyncRunId() { return 'syr-' + randomBytes(4).toString('hex'); }
function nowIso() { return new Date().toISOString(); }

function recordRun({ id, userId, storeId, endpoint, status, recordsIn, recordsOut, errorCode, errorMessage, startedAt, endedAt, cursorBefore, cursorAfter, meta }) {
  try {
    getDbInstance().prepare(`INSERT INTO sync_runs
      (id,user_id,store_id,provider,endpoint,status,started_at,ended_at,records_in,records_out,error_code,error_message,cursor_before,cursor_after,meta)
      VALUES (?,?,?,'spapi',?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, endpoint, status, startedAt, endedAt || null,
        recordsIn || 0, recordsOut || 0, errorCode || null,
        errorMessage ? String(errorMessage).slice(0, 1000) : null,
        cursorBefore || null, cursorAfter || null, meta ? JSON.stringify(meta) : null,
      );
  } catch {}
}

function jitter(ms) { return ms + Math.floor(Math.random() * ms * 0.3); }

/**
 * Low-level SP-API call.
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.storeId
 * @param {string} opts.endpoint        Logical endpoint key (matches rate-limiter), e.g. "orders.getOrders"
 * @param {string} opts.path            Path including version, e.g. "/orders/v0/orders"
 * @param {string} [opts.method="GET"]
 * @param {Object} [opts.query]
 * @param {Object} [opts.body]
 * @param {string} [opts.region]        NA|EU|FE; defaults to credential region or env
 * @param {boolean} [opts.audit=true]   Write a sync_runs row
 * @param {string}  [opts.cursorBefore] For pagination audit trail
 * @returns {Promise<{status:number, headers:Headers, json:any, nextToken?:string}>}
 */
export async function spapiCall(opts) {
  const {
    userId, storeId, endpoint, path, method = 'GET',
    query, body, region, audit = true, cursorBefore,
  } = opts;
  if (!userId || !storeId) throw new Error('user_and_store_required');
  if (!endpoint || !path) throw new Error('endpoint_and_path_required');

  const userStoreId = `${userId}:${storeId}`;
  const startedAt = nowIso();
  const runId = newSyncRunId();
  let attempts = 0;

  while (true) {
    attempts += 1;
    await acquire(userStoreId, endpoint);

    let accessToken;
    try {
      accessToken = await getAccessToken(userId, storeId);
    } catch (e) {
      if (audit) recordRun({ id: runId, userId, storeId, endpoint, status: 'auth_error',
        errorCode: 'lwa_failed', errorMessage: e?.message, startedAt, endedAt: nowIso(), cursorBefore });
      throw e;
    }

    const host = hostFor(region);
    const url = new URL(host + path);
    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) url.searchParams.set(k, v.join(','));
        else url.searchParams.set(k, String(v));
      }
    }

    const headers = {
      'x-amz-access-token': accessToken,
      'accept': 'application/json',
      'user-agent': 'amz-ai-operator/0.1 (Language=Node.js)',
    };
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }

    let res;
    try {
      res = await fetch(url.toString(), { method, headers, body: payload });
    } catch (e) {
      if (attempts < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, jitter(BASE_DELAY_MS * Math.pow(2, attempts - 1))));
        continue;
      }
      if (audit) recordRun({ id: runId, userId, storeId, endpoint, status: 'network_error',
        errorCode: 'fetch_failed', errorMessage: e?.message, startedAt, endedAt: nowIso(), cursorBefore });
      recordSpApiError(userId, storeId, 'fetch_failed', e?.message || String(e));
      throw e;
    }

    updateFromHeader(userStoreId, endpoint, res.headers.get('x-amzn-ratelimit-limit'));

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempts < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, jitter(BASE_DELAY_MS * Math.pow(2, attempts - 1))));
        continue;
      }
    }

    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }

    if (!res.ok) {
      const code = `http_${res.status}`;
      const msg = json?.errors?.[0]?.message || json?.error || text.slice(0, 500);
      if (audit) recordRun({ id: runId, userId, storeId, endpoint, status: 'http_error',
        errorCode: code, errorMessage: msg, startedAt, endedAt: nowIso(), cursorBefore,
        meta: { attempts } });
      if (res.status === 401 || res.status === 403) {
        recordSpApiError(userId, storeId, code, msg);
      }
      const err = new Error(`spapi_${code}: ${msg}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }

    const nextToken = json?.payload?.NextToken || json?.NextToken || json?.pagination?.nextToken || null;
    if (audit) recordRun({ id: runId, userId, storeId, endpoint, status: 'ok',
      recordsIn: Array.isArray(json?.payload?.Orders) ? json.payload.Orders.length
                : Array.isArray(json?.payload) ? json.payload.length : 0,
      startedAt, endedAt: nowIso(), cursorBefore, cursorAfter: nextToken,
      meta: { attempts } });

    return { status: res.status, headers: res.headers, json, nextToken };
  }
}
