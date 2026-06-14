// OAuth entrypoints for the human one-click Amazon authorization flow.
// Start endpoints are authenticated; callbacks rely on short-lived random
// state stored in SQLite so Amazon can redirect back without a bearer token.

import { randomBytes } from 'node:crypto';
import { getDbInstance, appendAuditLog } from '../data-store.mjs';
import { isCredentialEncryptionReady } from './crypto/token-cipher.mjs';
import {
  upsertSpApiCredentials,
  setSpApiAccessToken,
  updateSpApiCredentialMetadata,
  getSpApiCredentials,
} from './sp-api/credentials.mjs';
import { spapiCall } from './sp-api/client.mjs';
import { upsertAdsCredentials, setAdsAccessToken, setAdsProfileId, getAdsCredentials } from './ads-api/credentials.mjs';
import { adsCall } from './ads-api/client.mjs';
import { getRealWriteGateState } from './provider-mode.mjs';

const VALID_PROVIDERS = new Set(['spapi', 'ads']);
const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const SPAPI_STATE_COOKIE = 'aos_spapi_oauth_state';
const ADS_STATE_COOKIE = 'aos_ads_oauth_state';

function nowIso() { return new Date().toISOString(); }
function stateId() { return 'aos-' + randomBytes(24).toString('hex'); }
function expiresIso(minutes = 15) { return new Date(Date.now() + minutes * 60_000).toISOString(); }

function boolEnv(name) {
  const v = process.env[name];
  return v === '1' || v === 'true' || v === 'yes';
}

function envFirst(names) {
  for (const name of names) {
    const v = process.env[name];
    if (v) return { value: v, source: name };
  }
  return { value: '', source: names[0] };
}

function ensureSchema() {
  const db = getDbInstance();
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      region TEXT,
      redirect_uri TEXT NOT NULL,
      return_to TEXT,
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_states_us ON integration_oauth_states(user_id, store_id, started_at DESC);
  `);
  return db;
}

function inferPublicOrigin(request) {
  const url = new URL(request.url, 'http://localhost');
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '') || 'http';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  return `${proto}://${host}`;
}

function webBase(request) {
  return (process.env.AMZ_WEB_BASE_URL || process.env.WEB_BASE_URL || inferPublicOrigin(request)).replace(/\/+$/, '');
}

function callbackUri(provider, request) {
  const specific = provider === 'spapi' ? process.env.SPAPI_OAUTH_REDIRECT_URI : process.env.ADS_OAUTH_REDIRECT_URI;
  if (specific) return specific;
  return `${inferPublicOrigin(request)}/api/v1/integrations/oauth/${provider}/callback`;
}

function safeReturnTo(value) {
  const v = String(value || '/settings/amazon-auth');
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('://')) return '/settings/amazon-auth';
  return v;
}

function redirectToUi(request, params = {}, returnTo = '/settings/amazon-auth') {
  const route = safeReturnTo(returnTo);
  const sep = route.includes('?') ? '&' : '?';
  const qs = new URLSearchParams(params);
  return `${webBase(request)}/#${route}${sep}${qs.toString()}`;
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { location } });
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function loginUri(provider, request) {
  if (provider !== 'spapi') return null;
  if (process.env.SPAPI_OAUTH_LOGIN_URI) return process.env.SPAPI_OAUTH_LOGIN_URI;
  return `${inferPublicOrigin(request)}/api/v1/integrations/oauth/spapi/login`;
}

function providerConfig(provider, request, region = 'NA') {
  if (provider === 'spapi') {
    const app = envFirst(['SPAPI_OAUTH_APPLICATION_ID', 'SPAPI_APP_ID', 'SPAPI_APPLICATION_ID']);
    const clientId = envFirst(['SPAPI_LWA_CLIENT_ID']);
    const clientSecret = envFirst(['SPAPI_LWA_CLIENT_SECRET']);
    return {
      provider,
      region,
      appIdConfigured: !!app.value,
      appIdSource: app.value ? app.source : null,
      clientIdConfigured: !!clientId.value,
      clientIdSource: clientId.value ? clientId.source : null,
      clientSecretConfigured: !!clientSecret.value,
      clientSecretSource: clientSecret.value ? clientSecret.source : null,
      redirectUri: callbackUri(provider, request),
      loginUri: loginUri(provider, request),
      sandbox: boolEnv('SPAPI_USE_SANDBOX'),
      ready: isCredentialEncryptionReady() && !!app.value && !!clientId.value && !!clientSecret.value,
      missing: [
        !isCredentialEncryptionReady() && 'CREDENTIAL_ENC_KEY',
        !app.value && 'SPAPI_OAUTH_APPLICATION_ID',
        !clientId.value && 'SPAPI_LWA_CLIENT_ID',
        !clientSecret.value && 'SPAPI_LWA_CLIENT_SECRET',
      ].filter(Boolean),
    };
  }

  const clientId = envFirst(['ADS_LWA_CLIENT_ID', 'ADS_CLIENT_ID']);
  const clientSecret = envFirst(['ADS_LWA_CLIENT_SECRET', 'ADS_CLIENT_SECRET']);
  return {
    provider,
    region,
    clientIdConfigured: !!clientId.value,
    clientIdSource: clientId.value ? clientId.source : null,
    clientSecretConfigured: !!clientSecret.value,
    clientSecretSource: clientSecret.value ? clientSecret.source : null,
    redirectUri: callbackUri(provider, request),
    scope: process.env.ADS_OAUTH_SCOPE || 'advertising::campaign_management',
    sandbox: boolEnv('ADS_API_USE_SANDBOX'),
    mock: boolEnv('ADS_API_MOCK'),
    ready: isCredentialEncryptionReady() && !!clientId.value && !!clientSecret.value,
    missing: [
      !isCredentialEncryptionReady() && 'CREDENTIAL_ENC_KEY',
      !clientId.value && 'ADS_LWA_CLIENT_ID',
      !clientSecret.value && 'ADS_LWA_CLIENT_SECRET',
    ].filter(Boolean),
  };
}

function sellerCentralAuthorizeUrl(region) {
  if (process.env.SPAPI_OAUTH_AUTHORIZE_URL) return process.env.SPAPI_OAUTH_AUTHORIZE_URL;
  const base = process.env.SPAPI_OAUTH_SELLER_CENTRAL_URL;
  if (base) return `${base.replace(/\/+$/, '')}/apps/authorize/consent`;
  const r = String(region || 'NA').toUpperCase();
  if (r === 'EU') return 'https://sellercentral-europe.amazon.com/apps/authorize/consent';
  if (r === 'FE') return 'https://sellercentral.amazon.co.jp/apps/authorize/consent';
  return 'https://sellercentral.amazon.com/apps/authorize/consent';
}

function buildAuthorizationUrl(provider, cfg, state, region) {
  if (provider === 'spapi') {
    const app = envFirst(['SPAPI_OAUTH_APPLICATION_ID', 'SPAPI_APP_ID', 'SPAPI_APPLICATION_ID']).value;
    const url = new URL(sellerCentralAuthorizeUrl(region));
    url.searchParams.set('application_id', app);
    url.searchParams.set('state', state);
    if (process.env.SPAPI_OAUTH_VERSION) url.searchParams.set('version', process.env.SPAPI_OAUTH_VERSION);
    return url.toString();
  }

  const clientId = envFirst(['ADS_LWA_CLIENT_ID', 'ADS_CLIENT_ID']).value;
  const url = new URL(process.env.ADS_OAUTH_AUTHORIZE_URL || 'https://www.amazon.com/ap/oa');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', cfg.scope || 'advertising::campaign_management');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

export function buildOAuthConfig(request) {
  return {
    ok: true,
    generatedAt: nowIso(),
    credentialEncryptionReady: isCredentialEncryptionReady(),
    providers: {
      spapi: providerConfig('spapi', request, process.env.SPAPI_DEFAULT_REGION || 'NA'),
      ads: providerConfig('ads', request, process.env.ADS_API_DEFAULT_REGION || 'NA'),
    },
    userExperience: {
      primary: 'one_click_oauth',
      manualFallback: true,
      // AUTH-04(b): honest readback from the single source of truth, not a hardcoded false.
      realWritesEnabled: getRealWriteGateState().realWriteEnabled,
      realWriteGate: getRealWriteGateState(),
    },
  };
}

function cookieHeader(name, value, { maxAge = 900, path = '/', request } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (inferPublicOrigin(request).startsWith('https://')) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieHeader(name, path = '/') {
  return `${name}=; Max-Age=0; Path=${path}; HttpOnly; SameSite=Lax`;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      try { return decodeURIComponent(rest.join('=')); } catch { return rest.join('='); }
    }
  }
  return '';
}

export function startOAuth({ request, userId, storeId, provider, body = {} }) {
  if (!VALID_PROVIDERS.has(provider)) {
    return json({ error: 'invalid_provider', message: 'provider_must_be_spapi_or_ads' }, 400);
  }
  const region = String(body.region || (provider === 'spapi' ? process.env.SPAPI_DEFAULT_REGION : process.env.ADS_API_DEFAULT_REGION) || 'NA').toUpperCase();
  const cfg = providerConfig(provider, request, region);
  if (!cfg.ready) {
    return json({
      error: 'oauth_not_configured',
      provider,
      missing: cfg.missing,
      config: cfg,
      message: 'server_oauth_app_configuration_required',
    }, 409);
  }
  const db = ensureSchema();
  const state = stateId();
  const expiresAt = expiresIso(15);
  const returnTo = safeReturnTo(body.returnTo);
  db.prepare(`INSERT INTO integration_oauth_states
    (state, provider, user_id, store_id, region, redirect_uri, return_to, started_at, expires_at, meta)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    state, provider, userId, storeId, region, cfg.redirectUri, returnTo, nowIso(), expiresAt,
    JSON.stringify({ userAgent: request.headers.get('user-agent') || null }),
  );
  // B-4 CSRF (公网多租户 P0): both providers now set an HttpOnly state cookie at
  // /start so the callback can enforce cookie===state as a second factor. The ads
  // OAuth no longer relies on a system login handoff, so the cookie is scoped to the
  // ads callback path and verified directly in handleOAuthCallback.
  const headers = provider === 'spapi'
    ? { 'set-cookie': cookieHeader(SPAPI_STATE_COOKIE, state, { path: '/api/v1/integrations/oauth/spapi', request }) }
    : { 'set-cookie': cookieHeader(ADS_STATE_COOKIE, state, { path: '/api/v1/integrations/oauth/ads', request }) };
  return json({
    ok: true,
    provider,
    authorizationUrl: buildAuthorizationUrl(provider, cfg, state, region),
    state,
    expiresAt,
    loginUri: cfg.loginUri || undefined,
    redirectUri: cfg.redirectUri,
  }, 200, headers);
}

function readState(state) {
  const db = ensureSchema();
  return db.prepare(`SELECT * FROM integration_oauth_states WHERE state=?`).get(state);
}

function consumeState(state) {
  ensureSchema().prepare(`UPDATE integration_oauth_states SET consumed_at=? WHERE state=? AND consumed_at IS NULL`).run(nowIso(), state);
}

function updateStateMeta(state, patch) {
  const db = ensureSchema();
  const row = db.prepare(`SELECT meta FROM integration_oauth_states WHERE state=?`).get(state);
  let meta = {};
  try { meta = row?.meta ? JSON.parse(row.meta) : {}; } catch { meta = {}; }
  db.prepare(`UPDATE integration_oauth_states SET meta=? WHERE state=?`)
    .run(JSON.stringify({ ...meta, ...patch }), state);
}

function redirectWithOAuthCookieClear(request, location) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'set-cookie': clearCookieHeader(SPAPI_STATE_COOKIE, '/api/v1/integrations/oauth/spapi'),
      'referrer-policy': 'no-referrer',
    },
  });
}

// B-4 CSRF: callback terminal redirects must clear the per-provider state cookie so a
// replayed cookie can never be paired with a fresh forged state on a later request.
function redirectClearingStateCookie(provider, location) {
  const cookie = provider === 'spapi'
    ? clearCookieHeader(SPAPI_STATE_COOKIE, '/api/v1/integrations/oauth/spapi')
    : clearCookieHeader(ADS_STATE_COOKIE, '/api/v1/integrations/oauth/ads');
  return new Response(null, {
    status: 302,
    headers: { location, 'set-cookie': cookie, 'referrer-policy': 'no-referrer' },
  });
}

export function handleSpApiLoginHandoff({ request }) {
  const url = new URL(request.url, 'http://localhost');
  const params = url.searchParams;
  const queryState = params.get('state');
  const cookieState = readCookie(request, SPAPI_STATE_COOKIE);
  // AUTH-05(b): when both the query state and the cookie are present they MUST match.
  // Mismatch is a state-injection attempt during the login handoff — abort.
  if (queryState && cookieState && queryState !== cookieState) {
    return redirectWithOAuthCookieClear(request, redirectToUi(request, {
      oauth: 'spapi',
      status: 'error',
      error: 'spapi_login_state_mismatch',
    }, '/settings/amazon-auth'));
  }
  const state = queryState || cookieState;
  const row = state ? readState(state) : null;
  const returnTo = row?.return_to || '/settings/amazon-auth';

  if (!row || row.provider !== 'spapi') {
    return redirectWithOAuthCookieClear(request, redirectToUi(request, {
      oauth: 'spapi',
      status: 'error',
      error: 'spapi_login_state_missing',
    }, returnTo));
  }
  if (row.consumed_at || Date.parse(row.expires_at) < Date.now()) {
    consumeState(state);
    return redirectWithOAuthCookieClear(request, redirectToUi(request, {
      oauth: 'spapi',
      status: 'error',
      error: row.consumed_at ? 'oauth_state_already_used' : 'oauth_state_expired',
    }, returnTo));
  }

  const amazonCallbackUri = params.get('amazon_callback_uri') || params.get('amazonCallbackUri');
  const amazonState = params.get('amazon_state') || params.get('amazonState');
  if (!amazonCallbackUri || !amazonState) {
    return redirectWithOAuthCookieClear(request, redirectToUi(request, {
      oauth: 'spapi',
      status: 'error',
      error: 'spapi_login_params_missing',
    }, returnTo));
  }

  let callback;
  try {
    callback = new URL(amazonCallbackUri);
  } catch {
    return redirectWithOAuthCookieClear(request, redirectToUi(request, {
      oauth: 'spapi',
      status: 'error',
      error: 'spapi_login_callback_invalid',
    }, returnTo));
  }

  const sellingPartnerId = params.get('selling_partner_id') || params.get('sellingPartnerId') || null;
  updateStateMeta(state, {
    spapiLoginAt: nowIso(),
    amazonCallbackHost: callback.host,
    sellingPartnerIdFromLogin: sellingPartnerId,
  });

  callback.searchParams.set('amazon_state', amazonState);
  callback.searchParams.set('state', state);
  callback.searchParams.set('redirect_uri', row.redirect_uri);
  if (sellingPartnerId) callback.searchParams.set('selling_partner_id', sellingPartnerId);
  if (process.env.SPAPI_OAUTH_VERSION) callback.searchParams.set('version', process.env.SPAPI_OAUTH_VERSION);
  return redirectWithOAuthCookieClear(request, callback.toString());
}

async function exchangeAuthorizationCode(provider, code, redirectUri) {
  const clientId = provider === 'spapi'
    ? envFirst(['SPAPI_LWA_CLIENT_ID']).value
    : envFirst(['ADS_LWA_CLIENT_ID', 'ADS_CLIENT_ID']).value;
  const clientSecret = provider === 'spapi'
    ? envFirst(['SPAPI_LWA_CLIENT_SECRET']).value
    : envFirst(['ADS_LWA_CLIENT_SECRET', 'ADS_CLIENT_SECRET']).value;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  let res;
  try {
    res = await fetch(LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    throw new Error(`lwa_network_error: ${err?.message || err}`);
  }
  const text = await res.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!res.ok) {
    const codeText = payload.error || `http_${res.status}`;
    const msg = payload.error_description || payload.message || text;
    throw new Error(`lwa_authorization_code_exchange_failed: ${codeText} ${String(msg).slice(0, 300)}`);
  }
  if (!payload.refresh_token) throw new Error('lwa_response_missing_refresh_token');
  return payload;
}

function tokenExpiry(expiresIn) {
  return new Date(Date.now() + Number(expiresIn || 3600) * 1000).toISOString();
}

function storeMarketplaceHint(storeId) {
  const row = getDbInstance().prepare(`SELECT marketplace_id FROM user_stores WHERE id=?`).get(storeId);
  return row?.marketplace_id ? [row.marketplace_id] : [];
}

function extractMarketplaceIds(payload) {
  const rows = Array.isArray(payload?.payload) ? payload.payload : [];
  return [...new Set(rows
    .map((item) => item?.marketplace?.id || item?.Marketplace?.Id || item?.marketplaceId)
    .filter(Boolean)
    .map(String))];
}

async function finalizeSpApiOAuth(row, params, tokenPayload) {
  const userId = row.user_id;
  const storeId = row.store_id;
  const region = row.region || process.env.SPAPI_DEFAULT_REGION || 'NA';
  const sellingPartnerId = params.get('selling_partner_id') || params.get('sellingPartnerId') || null;
  const marketplaceHint = storeMarketplaceHint(storeId);
  const warnings = [];
  let marketplaceIds = marketplaceHint;

  // AUTH-12: capture the previously-bound identity BEFORE overwriting, so a
  // re-authorization / account swap is auditable (覆盖前审计 previousId 不变量).
  let previousSellingPartnerId = null;
  try {
    const existing = getSpApiCredentials(userId, storeId);
    if (existing?.status === 'active') previousSellingPartnerId = existing.sellingPartnerId || null;
  } catch {}

  upsertSpApiCredentials({
    userId,
    storeId,
    refreshToken: tokenPayload.refresh_token,
    sellingPartnerId,
    region,
    marketplaceIds,
    scope: tokenPayload.scope || null,
  });
  if (tokenPayload.access_token) {
    setSpApiAccessToken(userId, storeId, tokenPayload.access_token, tokenExpiry(tokenPayload.expires_in));
  }

  try {
    const { json } = await spapiCall({
      userId,
      storeId,
      region,
      audit: false,
      endpoint: 'sellers.getMarketplaceParticipations',
      path: '/sellers/v1/marketplaceParticipations',
    });
    const discovered = extractMarketplaceIds(json);
    if (discovered.length) marketplaceIds = discovered;
  } catch (err) {
    warnings.push(`marketplace_discovery_failed:${err?.message || err}`);
  }

  // AUTH-09: if marketplace discovery failed AND we have no marketplace ids at all,
  // the credential is only half-ready. Land status='needs_attention' (not 'active')
  // so diagnostics readiness stays非-ready and the UI never paints success green.
  const discoveryFailed = warnings.some((w) => w.startsWith('marketplace_discovery_failed'));
  const credentialStatus = (discoveryFailed && marketplaceIds.length === 0) ? 'needs_attention' : 'active';

  updateSpApiCredentialMetadata(userId, storeId, {
    sellingPartnerId,
    region,
    marketplaceIds,
    scope: tokenPayload.scope || null,
    status: credentialStatus,
  });
  if (tokenPayload.access_token) {
    setSpApiAccessToken(userId, storeId, tokenPayload.access_token, tokenExpiry(tokenPayload.expires_in));
  }

  appendAuditLog(userId, storeId, {
    sourceModule: 'AMAZON_AUTH',
    actionType: 'spapi_oauth_authorized',
    resourceType: 'store_credentials',
    resourceId: 'spapi',
    status: warnings.length ? 'partial' : 'success',
    executedAt: nowIso(),
    payload: {
      marketplaceCount: marketplaceIds.length,
      sellingPartnerIdConfigured: !!sellingPartnerId,
      credentialStatus,
      previousSellingPartnerId,
      overwroteActiveCredential: !!previousSellingPartnerId,
      warnings,
    },
  });

  return { provider: 'spapi', marketplaceIds, warnings, credentialStatus };
}

function extractAdsProfiles(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((p) => ({
    profileId: String(p.profileId || p.profile_id || ''),
    countryCode: p.countryCode || p.country_code || null,
    marketplaceStringId: p.accountInfo?.marketplaceStringId || p.marketplaceStringId || null,
  })).filter((p) => p.profileId);
}

async function finalizeAdsOAuth(row, tokenPayload) {
  const userId = row.user_id;
  const storeId = row.store_id;
  const region = row.region || process.env.ADS_API_DEFAULT_REGION || 'NA';
  const warnings = [];
  let profiles = [];

  // AUTH-12: capture previously-bound Ads profileId before overwrite for audit.
  let previousProfileId = null;
  try {
    const existing = getAdsCredentials(userId, storeId);
    if (existing?.status === 'active') previousProfileId = existing.profileId ? String(existing.profileId) : null;
  } catch {}

  upsertAdsCredentials({
    userId,
    storeId,
    refreshToken: tokenPayload.refresh_token,
    region,
    scope: tokenPayload.scope || null,
  });
  if (tokenPayload.access_token) {
    setAdsAccessToken(userId, storeId, tokenPayload.access_token, tokenExpiry(tokenPayload.expires_in));
  }

  try {
    const { json: profileJson } = await adsCall({
      userId,
      storeId,
      region,
      audit: false,
      endpoint: 'ads.profiles.list',
      path: '/v2/profiles',
    });
    profiles = extractAdsProfiles(profileJson);
    if (profiles.length === 1) setAdsProfileId(userId, storeId, profiles[0].profileId);
  } catch (err) {
    warnings.push(`profile_discovery_failed:${err?.message || err}`);
  }

  appendAuditLog(userId, storeId, {
    sourceModule: 'AMAZON_AUTH',
    actionType: 'ads_oauth_authorized',
    resourceType: 'store_credentials',
    resourceId: 'ads',
    status: warnings.length ? 'partial' : 'success',
    executedAt: nowIso(),
    payload: {
      profileCount: profiles.length,
      autoSelectedProfileId: profiles.length === 1 ? profiles[0].profileId : null,
      previousProfileId,
      overwroteActiveCredential: !!previousProfileId,
      warnings,
    },
  });

  return { provider: 'ads', profiles, warnings };
}

export async function handleOAuthCallback({ request, provider }) {
  if (!VALID_PROVIDERS.has(provider)) return json({ error: 'invalid_provider' }, 400);
  const url = new URL(request.url, 'http://localhost');
  const params = url.searchParams;
  const state = params.get('state') || '';
  // AUTH-05(a) / B-4 CSRF (公网多租户 P0): second-factor for BOTH providers — the
  // state from the query MUST equal the HttpOnly cookie the authenticated /start
  // endpoint set. A missing or mismatched cookie indicates a CSRF / state-injection
  // attempt: reject BEFORE any token exchange so fetchCalls never increments.
  // The ads cookie blocker (恒'跳过=通过' false-negative) is eliminated: ads now sets
  // and enforces its own HttpOnly cookie at the ads callback path.
  if (provider === 'spapi') {
    const cookieState = readCookie(request, SPAPI_STATE_COOKIE);
    if (!cookieState || cookieState !== state) {
      return json({ error: 'invalid_oauth_state', message: 'spapi_callback_state_cookie_mismatch_or_missing' }, 400);
    }
  }
  if (provider === 'ads') {
    const cookieState = readCookie(request, ADS_STATE_COOKIE);
    if (!cookieState || cookieState !== state) {
      return json({ error: 'invalid_oauth_state', message: 'ads_callback_state_cookie_mismatch_or_missing' }, 400);
    }
  }
  const row = state ? readState(state) : null;
  if (!row || row.provider !== provider) return json({ error: 'invalid_oauth_state', message: 'oauth_state_not_found_or_provider_mismatch' }, 400);
  const returnTo = row.return_to || '/settings/amazon-auth';

  if (row.consumed_at) {
    return redirectClearingStateCookie(provider, redirectToUi(request, { oauth: provider, status: 'error', error: 'state_used' }, returnTo));
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    consumeState(state);
    return redirectClearingStateCookie(provider, redirectToUi(request, { oauth: provider, status: 'error', error: 'state_expired' }, returnTo));
  }
  if (params.get('error')) {
    // AUTH-13: never echo the raw LWA error description into the redirect URL —
    // it both leaks detail and is unreadable. Audit the raw message, surface the enum.
    consumeState(state);
    try {
      appendAuditLog(row.user_id, row.store_id, {
        sourceModule: 'AMAZON_AUTH',
        actionType: `${provider}_oauth_failed`,
        resourceType: 'store_credentials',
        resourceId: provider,
        status: 'failed',
        executedAt: nowIso(),
        payload: {
          errorCode: 'lwa_rejected',
          rawLwaError: String(params.get('error') || '').slice(0, 300),
          rawLwaErrorDescription: String(params.get('error_description') || '').slice(0, 300),
        },
      });
    } catch {}
    return redirectClearingStateCookie(provider, redirectToUi(request, {
      oauth: provider,
      status: 'error',
      error: 'lwa_rejected',
    }, returnTo));
  }

  const code = provider === 'spapi'
    ? (params.get('spapi_oauth_code') || params.get('code'))
    : (params.get('code') || params.get('spapi_oauth_code'));
  if (!code) {
    consumeState(state);
    return redirectClearingStateCookie(provider, redirectToUi(request, { oauth: provider, status: 'error', error: 'code_missing' }, returnTo));
  }

  try {
    const tokenPayload = await exchangeAuthorizationCode(provider, code, row.redirect_uri);
    const result = provider === 'spapi'
      ? await finalizeSpApiOAuth(row, params, tokenPayload)
      : await finalizeAdsOAuth(row, tokenPayload);
    consumeState(state);
    const query = {
      oauth: provider,
      status: 'success',
      // AUTH-10: carry the store the credential was actually bound to so the
      // frontend can detect a store mismatch on return and switch back.
      storeId: row.store_id,
    };
    if (provider === 'spapi') query.marketplaces = String(result.marketplaceIds?.length || 0);
    if (provider === 'ads') {
      query.profiles = String(result.profiles?.length || 0);
      query.profileSelection = result.profiles?.length === 1 ? 'auto' : (result.profiles?.length > 1 ? 'required' : 'none');
      // AUTH-11: pass the candidate profileIds on the redirect so the frontend can
      // render an explicit profile-selection card WITHOUT firing a second live probe.
      if (result.profiles?.length > 1) {
        query.profileCandidates = result.profiles.map((p) => p.profileId).filter(Boolean).slice(0, 20).join(',');
      }
    }
    if (result.warnings?.length) query.warning = result.warnings[0].split(':')[0];
    return redirectClearingStateCookie(provider, redirectToUi(request, query, returnTo));
  } catch (err) {
    consumeState(state);
    try {
      appendAuditLog(row.user_id, row.store_id, {
        sourceModule: 'AMAZON_AUTH',
        actionType: `${provider}_oauth_failed`,
        resourceType: 'store_credentials',
        resourceId: provider,
        status: 'failed',
        executedAt: nowIso(),
        payload: { error: String(err?.message || err).slice(0, 500) },
      });
    } catch {}
    // AUTH-13: the raw LWA / exchange message is audited above but NOT echoed into
    // the redirect URL. Map to the limited error enum; the frontend resolves the
    // Chinese guidance text from the enum (unknown codes fall back to generic copy).
    return redirectClearingStateCookie(provider, redirectToUi(request, {
      oauth: provider,
      status: 'error',
      error: 'lwa_rejected',
    }, returnTo));
  }
}
