// Amazon Ads API HTTP client. Parallels sp-api/client.mjs:
//  - LWA access-token injection (Authorization: Bearer <token>)
//  - Required headers: Amazon-Advertising-API-ClientId + -Scope (profileId)
//  - Per-endpoint token-bucket rate limiting (Ads endpoint names: 'ads.*')
//  - 429 / 5xx retry with exponential backoff + jitter
//  - sync_runs audit row per call (provider='ads')
//
// Mock mode (ADS_API_MOCK=1): returns fixture JSON synchronously without
// touching fetch — lets tests + dev exercise the entire pipeline before real
// Ads developer credentials are issued.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { randomBytes } from 'node:crypto';

import { getAdsAccessToken } from './auth.mjs';
import { acquire, updateFromHeader } from './rate-limiter.mjs';
import { recordAdsError } from './credentials.mjs';
import { getDbInstance } from '../../data-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = pathResolve(__dirname, '_fixtures');

const REGION_HOSTS = {
  NA: 'https://advertising-api.amazon.com',
  EU: 'https://advertising-api-eu.amazon.com',
  FE: 'https://advertising-api-fe.amazon.com',
};
const SANDBOX_HOSTS = {
  NA: 'https://advertising-api-test.amazon.com',
  EU: 'https://advertising-api-test.amazon.com',
  FE: 'https://advertising-api-test.amazon.com',
};

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

function isSandbox() {
  const v = process.env.ADS_API_USE_SANDBOX;
  return v === '1' || v === 'true' || v === 'yes';
}
function isMock() {
  const v = process.env.ADS_API_MOCK;
  return v === '1' || v === 'true' || v === 'yes';
}
function clientIdHeader() {
  if (isMock()) return 'mock-ads-client-id';
  const v = process.env.ADS_LWA_CLIENT_ID;
  if (!v) throw new Error('ads_lwa_client_id_missing');
  return v;
}

function hostFor(region) {
  const r = (region || process.env.ADS_API_DEFAULT_REGION || 'NA').toUpperCase();
  const table = isSandbox() ? SANDBOX_HOSTS : REGION_HOSTS;
  return table[r] || table.NA;
}

function newSyncRunId() { return 'syr-' + randomBytes(4).toString('hex'); }
function nowIso() { return new Date().toISOString(); }
function jitter(ms) { return ms + Math.floor(Math.random() * ms * 0.3); }

function recordRun({ id, userId, storeId, endpoint, status, recordsIn, recordsOut, errorCode, errorMessage, startedAt, endedAt, cursorBefore, cursorAfter, meta }) {
  try {
    getDbInstance().prepare(`INSERT INTO sync_runs
      (id,user_id,store_id,provider,endpoint,status,started_at,ended_at,records_in,records_out,error_code,error_message,cursor_before,cursor_after,meta)
      VALUES (?,?,?,'ads',?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, endpoint, status, startedAt, endedAt || null,
        recordsIn || 0, recordsOut || 0, errorCode || null,
        errorMessage ? String(errorMessage).slice(0, 1000) : null,
        cursorBefore || null, cursorAfter || null, meta ? JSON.stringify(meta) : null,
      );
  } catch {}
}

// Map (endpoint, query) → mock JSON payload. Fixtures are filtered minimally
// so tests can assert on stateFilter / campaignIdFilter wiring.
const FIXTURE_FILES = {
  'ads.profiles.list':       'profiles.json',
  'ads.sp.campaigns.list':   'campaigns.json',
  'ads.sp.adGroups.list':    'ad-groups.json',
  'ads.sp.keywords.list':    'keywords.json',
  'ads.sp.productAds.list':  'product-ads.json',
};

const _fixtureCache = new Map();
function loadFixture(name) {
  if (_fixtureCache.has(name)) return _fixtureCache.get(name);
  const file = FIXTURE_FILES[name];
  if (!file) return null;
  const txt = readFileSync(pathResolve(FIXTURE_DIR, file), 'utf8');
  const data = JSON.parse(txt);
  _fixtureCache.set(name, data);
  return data;
}

function applyMockFilters(endpoint, data, query) {
  if (!Array.isArray(data)) return data;
  let out = data.slice();
  if (!query) return out;
  // stateFilter: csv of states, applied to .state
  if (query.stateFilter) {
    const allow = new Set(String(query.stateFilter).split(',').map((s) => s.trim()).filter(Boolean));
    if (allow.size) out = out.filter((r) => !r.state || allow.has(r.state));
  }
  // campaignIdFilter: csv of campaign ids
  if (query.campaignIdFilter) {
    const allow = new Set(String(query.campaignIdFilter).split(',').map((s) => String(s).trim()).filter(Boolean));
    if (allow.size) out = out.filter((r) => allow.has(String(r.campaignId)));
  }
  // adGroupIdFilter
  if (query.adGroupIdFilter) {
    const allow = new Set(String(query.adGroupIdFilter).split(',').map((s) => String(s).trim()).filter(Boolean));
    if (allow.size) out = out.filter((r) => allow.has(String(r.adGroupId)));
  }
  return out;
}

/**
 * Low-level Ads API call.
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.storeId
 * @param {string} opts.endpoint        Logical endpoint key (matches rate-limiter), e.g. 'ads.sp.campaigns.list'
 * @param {string} opts.path            Path including version, e.g. '/v2/sp/campaigns'
 * @param {string} [opts.method='GET']
 * @param {Object} [opts.query]
 * @param {Object} [opts.body]
 * @param {string|number} [opts.profileId] Required by real Ads API (Amazon-Advertising-API-Scope)
 * @param {string} [opts.region]        NA|EU|FE; defaults to credential region or env
 * @param {boolean} [opts.audit=true]
 * @returns {Promise<{status:number, headers:any, json:any}>}
 */
export async function adsCall(opts) {
  const {
    userId, storeId, endpoint, path, method = 'GET',
    query, body, region, audit = true, profileId, cursorBefore,
  } = opts;
  if (!userId || !storeId) throw new Error('user_and_store_required');
  if (!endpoint || !path) throw new Error('endpoint_and_path_required');

  const userStoreId = `${userId}:${storeId}`;
  const startedAt = nowIso();
  const runId = newSyncRunId();

  // Mock short-circuit BEFORE any network/auth path.
  if (isMock()) {
    await acquire(userStoreId, endpoint);
    // touch the auth path so access-token caching is exercised in mock mode
    try { await getAdsAccessToken(userId, storeId); } catch {}
    const raw = loadFixture(endpoint);
    const filtered = applyMockFilters(endpoint, raw, query);
    const json = filtered === null ? { mock: true, endpoint } : filtered;
    if (audit) recordRun({
      id: runId, userId, storeId, endpoint, status: 'ok',
      recordsIn: Array.isArray(json) ? json.length : 0,
      startedAt, endedAt: nowIso(), cursorBefore,
      meta: { mock: true },
    });
    return { status: 200, headers: new Map(), json };
  }

  let attempts = 0;
  while (true) {
    attempts += 1;
    await acquire(userStoreId, endpoint);

    let accessToken;
    try {
      accessToken = await getAdsAccessToken(userId, storeId);
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
      'Authorization': `Bearer ${accessToken}`,
      'Amazon-Advertising-API-ClientId': clientIdHeader(),
      'Accept': 'application/json',
      'User-Agent': 'amz-ai-operator/0.1 (Language=Node.js)',
    };
    if (profileId !== undefined && profileId !== null) {
      headers['Amazon-Advertising-API-Scope'] = String(profileId);
    }
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
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
      recordAdsError(userId, storeId, 'fetch_failed', e?.message || String(e));
      throw e;
    }

    const hdrGet = (k) => (typeof res.headers?.get === 'function' ? res.headers.get(k) : null);
    updateFromHeader(userStoreId, endpoint, hdrGet('x-amzn-ratelimit-limit'));

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
      const msg = json?.message || json?.error || json?.details || text.slice(0, 500);
      if (audit) recordRun({ id: runId, userId, storeId, endpoint, status: 'http_error',
        errorCode: code, errorMessage: msg, startedAt, endedAt: nowIso(), cursorBefore,
        meta: { attempts } });
      if (res.status === 401 || res.status === 403) {
        recordAdsError(userId, storeId, code, msg);
      }
      const err = new Error(`ads_${code}: ${msg}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }

    if (audit) recordRun({ id: runId, userId, storeId, endpoint, status: 'ok',
      recordsIn: Array.isArray(json) ? json.length : 0,
      startedAt, endedAt: nowIso(), cursorBefore,
      meta: { attempts } });

    return { status: res.status, headers: res.headers, json };
  }
}
