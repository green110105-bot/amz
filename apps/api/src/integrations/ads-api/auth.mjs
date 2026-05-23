// Amazon Ads API LWA token refresh.
// Separate developer app from SP-API (different LWA client_id/secret), but the
// LWA token endpoint and the refresh-token grant flow are identical. In mock
// mode we short-circuit and return a fixture access token; this lets the rest
// of the integration run unit tests without real Ads developer credentials.

import { getAdsCredentials, setAdsAccessToken, recordAdsError } from './credentials.mjs';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

function isMock() {
  const v = process.env.ADS_API_MOCK;
  return v === '1' || v === 'true' || v === 'yes';
}

function clientId() {
  if (isMock()) return 'mock-ads-client-id';
  const v = process.env.ADS_LWA_CLIENT_ID;
  if (!v) throw new Error('ads_lwa_client_id_missing');
  return v;
}
function clientSecret() {
  if (isMock()) return 'mock-ads-client-secret';
  const v = process.env.ADS_LWA_CLIENT_SECRET;
  if (!v) throw new Error('ads_lwa_client_secret_missing');
  return v;
}

const inFlight = new Map(); // key `${userId}:${storeId}` -> Promise<string>

export async function getAdsAccessToken(userId, storeId, { force = false } = {}) {
  const key = `${userId}:${storeId}`;
  if (!force) {
    const cached = getAdsCredentials(userId, storeId);
    if (!cached) throw new Error('no_ads_credentials');
    if (cached.status !== 'active') throw new Error('ads_credentials_revoked');
    if (cached.accessToken && cached.accessTokenExpiresAt) {
      const expMs = Date.parse(cached.accessTokenExpiresAt);
      if (Number.isFinite(expMs) && expMs - Date.now() > 60_000) {
        return cached.accessToken;
      }
    }
  }
  if (inFlight.has(key)) return inFlight.get(key);
  const p = refreshAccessToken(userId, storeId).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function refreshAccessToken(userId, storeId) {
  if (isMock()) {
    const token = 'Atza|MOCK-ads-access-' + Math.random().toString(36).slice(2, 10);
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    setAdsAccessToken(userId, storeId, token, expiresAt);
    return token;
  }

  const creds = getAdsCredentials(userId, storeId);
  if (!creds || !creds.refreshToken) throw new Error('no_refresh_token');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
  });

  let res;
  try {
    res = await fetch(LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (e) {
    recordAdsError(userId, storeId, 'lwa_network', e?.message || String(e));
    throw new Error(`lwa_network_error: ${e?.message || e}`);
  }

  const text = await res.text();
  if (!res.ok) {
    let code = 'lwa_http_' + res.status;
    let msg = text;
    try {
      const j = JSON.parse(text);
      code = j.error || code;
      msg = j.error_description || msg;
    } catch {}
    recordAdsError(userId, storeId, code, msg);
    throw new Error(`lwa_refresh_failed: ${code} ${msg}`);
  }

  let json;
  try { json = JSON.parse(text); } catch {
    recordAdsError(userId, storeId, 'lwa_parse', 'response_not_json');
    throw new Error('lwa_response_not_json');
  }
  const accessToken = json.access_token;
  const expiresIn = Number(json.expires_in || 3600);
  if (!accessToken) {
    recordAdsError(userId, storeId, 'lwa_no_token', JSON.stringify(json));
    throw new Error('lwa_no_access_token_in_response');
  }
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  setAdsAccessToken(userId, storeId, accessToken, expiresAt);
  return accessToken;
}

export function _clearInFlightForTests() { inFlight.clear(); }
