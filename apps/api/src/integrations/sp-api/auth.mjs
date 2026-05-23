// LWA (Login with Amazon) refresh-token → access-token exchange.
// SP-API now uses LWA only (no AWS SigV4 needed for sellers as of 2023-08).
// Access tokens TTL ~3600s. We refresh proactively at expires_at - 60s.
// On refresh failure we mark the credential with last_error and rethrow.

import { getSpApiCredentials, setSpApiAccessToken, recordSpApiError } from './credentials.mjs';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

function clientId() {
  const v = process.env.SPAPI_LWA_CLIENT_ID;
  if (!v) throw new Error('spapi_lwa_client_id_missing');
  return v;
}
function clientSecret() {
  const v = process.env.SPAPI_LWA_CLIENT_SECRET;
  if (!v) throw new Error('spapi_lwa_client_secret_missing');
  return v;
}

const inFlight = new Map(); // key `${userId}:${storeId}` -> Promise<string>

export async function getAccessToken(userId, storeId, { force = false } = {}) {
  const key = `${userId}:${storeId}`;
  if (!force) {
    const cached = getSpApiCredentials(userId, storeId);
    if (!cached) throw new Error('no_spapi_credentials');
    if (cached.status !== 'active') throw new Error('spapi_credentials_revoked');
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
  const creds = getSpApiCredentials(userId, storeId);
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
    recordSpApiError(userId, storeId, 'lwa_network', e?.message || String(e));
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
    recordSpApiError(userId, storeId, code, msg);
    throw new Error(`lwa_refresh_failed: ${code} ${msg}`);
  }

  let json;
  try { json = JSON.parse(text); } catch {
    recordSpApiError(userId, storeId, 'lwa_parse', 'response_not_json');
    throw new Error('lwa_response_not_json');
  }
  const accessToken = json.access_token;
  const expiresIn = Number(json.expires_in || 3600);
  if (!accessToken) {
    recordSpApiError(userId, storeId, 'lwa_no_token', JSON.stringify(json));
    throw new Error('lwa_no_access_token_in_response');
  }
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  setSpApiAccessToken(userId, storeId, accessToken, expiresAt);
  return accessToken;
}

export function _clearInFlightForTests() { inFlight.clear(); }
