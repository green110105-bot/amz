// Amazon authorization diagnostics.
// Offline checks never decrypt or return tokens. Live probes are explicit and
// only touch safe read/auth endpoints; real write paths stay blocked by M3.

import { getDbInstance } from '../data-store.mjs';
import { isCredentialEncryptionReady } from './crypto/token-cipher.mjs';
import { providerMode, getRealWriteGateState } from './provider-mode.mjs';
import { getAccessToken as getSpApiAccessToken } from './sp-api/auth.mjs';
import { spapiCall } from './sp-api/client.mjs';
import { getAdsAccessToken } from './ads-api/auth.mjs';
import { adsCall } from './ads-api/client.mjs';

const VALID_PROVIDERS = new Set(['all', 'spapi', 'ads']);

function nowIso() { return new Date().toISOString(); }

function boolEnv(name) {
  const v = process.env[name];
  return v === '1' || v === 'true' || v === 'yes';
}

function envFirst(names) {
  for (const name of names) {
    const v = process.env[name];
    if (v) return { configured: true, name };
  }
  return { configured: false, name: names[0] };
}

function envPresence(names) {
  const found = envFirst(names);
  return {
    configured: found.configured,
    source: found.configured ? found.name : null,
    acceptedNames: names,
  };
}

function tokenState(hasAccessToken, expiresAt) {
  if (!hasAccessToken) return 'missing';
  if (!expiresAt) return 'unknown_expiry';
  const expMs = Date.parse(expiresAt);
  if (!Number.isFinite(expMs)) return 'invalid_expiry';
  const remainingMs = expMs - Date.now();
  if (remainingMs > 5 * 60_000) return 'fresh';
  if (remainingMs > 0) return 'near_expiry';
  return 'expired';
}

function marketplaceCount(raw) {
  if (!raw) return 0;
  return String(raw).split(',').map((x) => x.trim()).filter(Boolean).length;
}

function readCredentialSnapshot(userId, storeId, provider) {
  const db = getDbInstance();
  const row = db.prepare(`SELECT
      provider,status,selling_partner_id,profile_id,country_code,region,marketplace_ids,
      refresh_token_enc,access_token_enc,access_token_expires_at,last_refreshed_at,
      last_error,last_error_at,created_at,updated_at
    FROM store_credentials
    WHERE user_id=? AND store_id=? AND provider=?`).get(userId, storeId, provider);
  if (!row) {
    return {
      exists: false,
      provider,
      status: 'missing',
      hasRefreshToken: false,
      hasAccessToken: false,
      accessTokenState: 'missing',
      marketplaceCount: 0,
    };
  }
  const hasAccessToken = !!row.access_token_enc;
  return {
    exists: true,
    provider,
    status: row.status || 'unknown',
    region: row.region || null,
    marketplaceCount: marketplaceCount(row.marketplace_ids),
    hasRefreshToken: !!row.refresh_token_enc,
    refreshTokenEncryptedShapeOk: !!row.refresh_token_enc && String(row.refresh_token_enc).split('.').length === 3,
    hasAccessToken,
    accessTokenState: tokenState(hasAccessToken, row.access_token_expires_at),
    accessTokenExpiresAt: row.access_token_expires_at || null,
    lastRefreshedAt: row.last_refreshed_at || null,
    lastError: row.last_error || null,
    lastErrorAt: row.last_error_at || null,
    updatedAt: row.updated_at || row.created_at || null,
    sellingPartnerIdConfigured: !!row.selling_partner_id,
    profileIdConfigured: !!row.profile_id,
    countryCodeConfigured: !!row.country_code,
  };
}

function recentRuns(userId, storeId, provider) {
  const db = getDbInstance();
  return db.prepare(`SELECT endpoint,status,started_at,ended_at,records_in,records_out,error_code,error_message
    FROM sync_runs
    WHERE user_id=? AND store_id=? AND provider=?
    ORDER BY started_at DESC
    LIMIT 5`).all(userId, storeId, provider).map((r) => ({
    endpoint: r.endpoint,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    recordsIn: r.records_in || 0,
    recordsOut: r.records_out || 0,
    errorCode: r.error_code || null,
    errorMessage: r.error_message ? String(r.error_message).slice(0, 240) : null,
  }));
}

function pushIf(arr, condition, value) {
  if (condition) arr.push(value);
}

function buildEnvironment() {
  return {
    credentialEncryption: {
      ready: isCredentialEncryptionReady(),
      requiredEnv: 'CREDENTIAL_ENC_KEY',
    },
    spapi: {
      clientId: envPresence(['SPAPI_LWA_CLIENT_ID']),
      clientSecret: envPresence(['SPAPI_LWA_CLIENT_SECRET']),
      defaultRegion: process.env.SPAPI_DEFAULT_REGION || 'NA',
      sandbox: boolEnv('SPAPI_USE_SANDBOX'),
      endpointMode: boolEnv('SPAPI_USE_SANDBOX') ? 'sandbox' : 'production',
    },
    ads: {
      clientId: envPresence(['ADS_LWA_CLIENT_ID', 'ADS_CLIENT_ID']),
      clientSecret: envPresence(['ADS_LWA_CLIENT_SECRET', 'ADS_CLIENT_SECRET']),
      defaultRegion: process.env.ADS_API_DEFAULT_REGION || 'NA',
      mock: boolEnv('ADS_API_MOCK'),
      sandbox: boolEnv('ADS_API_USE_SANDBOX'),
      endpointMode: boolEnv('ADS_API_MOCK')
        ? 'mock'
        : (boolEnv('ADS_API_USE_SANDBOX') ? 'sandbox' : 'production'),
    },
  };
}

function classifyProvider(provider, env, credential) {
  const blockers = [];
  const warnings = [];
  const nextActions = [];
  const encryptionReady = env.credentialEncryption.ready;

  pushIf(blockers, !encryptionReady, 'credential_encryption_key_missing_or_invalid');
  pushIf(blockers, !credential.exists, `${provider}_credentials_missing`);
  pushIf(blockers, credential.exists && credential.status !== 'active', `${provider}_credentials_not_active`);
  pushIf(blockers, credential.exists && !credential.hasRefreshToken, `${provider}_refresh_token_missing`);
  pushIf(warnings, credential.exists && credential.hasRefreshToken && !credential.refreshTokenEncryptedShapeOk, `${provider}_refresh_token_cipher_shape_unexpected`);
  pushIf(warnings, credential.accessTokenState === 'expired', `${provider}_access_token_expired_will_refresh_on_probe`);
  pushIf(warnings, credential.accessTokenState === 'near_expiry', `${provider}_access_token_near_expiry`);

  if (provider === 'spapi') {
    pushIf(blockers, !env.spapi.clientId.configured, 'spapi_lwa_client_id_missing');
    pushIf(blockers, !env.spapi.clientSecret.configured, 'spapi_lwa_client_secret_missing');
    pushIf(blockers, credential.exists && credential.marketplaceCount === 0, 'spapi_marketplace_ids_missing');
    pushIf(warnings, credential.exists && !credential.sellingPartnerIdConfigured, 'spapi_selling_partner_id_missing');
    pushIf(nextActions, blockers.includes('spapi_credentials_missing'), 'store_spapi_refresh_token_with_marketplace_ids');
    pushIf(nextActions, blockers.includes('spapi_lwa_client_id_missing') || blockers.includes('spapi_lwa_client_secret_missing'), 'configure_spapi_lwa_app_credentials');
    pushIf(nextActions, blockers.includes('spapi_marketplace_ids_missing'), 'store_at_least_one_marketplace_id');
  }

  if (provider === 'ads') {
    const envNeeded = !env.ads.mock;
    pushIf(blockers, envNeeded && !env.ads.clientId.configured, 'ads_lwa_client_id_missing');
    pushIf(blockers, envNeeded && !env.ads.clientSecret.configured, 'ads_lwa_client_secret_missing');
    pushIf(blockers, credential.exists && !credential.profileIdConfigured, 'ads_profile_id_missing_for_m3_sync');
    // AUTH-02(c): when ADS_API_MOCK=1 the Ads adapter answers from local fixtures,
    // not Amazon. Surface that explicitly so the UI never paints a real-green tag.
    pushIf(warnings, env.ads.mock, 'ads_running_on_mock_fixtures');
    pushIf(nextActions, blockers.includes('ads_credentials_missing'), 'store_ads_refresh_token');
    pushIf(nextActions, blockers.includes('ads_lwa_client_id_missing') || blockers.includes('ads_lwa_client_secret_missing'), 'configure_ads_lwa_app_credentials');
    pushIf(nextActions, blockers.includes('ads_profile_id_missing_for_m3_sync'), 'run_ads_profile_probe_and_save_profile_id');
  }

  // AUTH-02(a)/(c): exhaustive readiness enum, no default fall-through to 'ready'.
  // ads mock mode → 'mock_ready' (never plain 'ready') so downstream tag mapping
  // routes it to 'warning' and the page shows 0 success tags.
  let readiness;
  if (blockers.length > 0) {
    readiness = 'blocked';
  } else if (provider === 'ads' && env.ads.mock) {
    readiness = 'mock_ready';
  } else {
    readiness = 'ready';
  }

  return {
    readiness,
    blockers,
    warnings,
    nextActions,
  };
}

function safeError(err) {
  return {
    code: err?.code || err?.message?.split(':')?.[0] || 'probe_failed',
    message: String(err?.message || err).slice(0, 300),
  };
}

async function probeSpApi({ userId, storeId, apiProbe, region }) {
  const checks = [];
  try {
    await getSpApiAccessToken(userId, storeId, { force: true });
    checks.push({ name: 'lwa_token_exchange', status: 'ok' });
  } catch (err) {
    checks.push({ name: 'lwa_token_exchange', status: 'error', ...safeError(err) });
    return { requested: true, provider: 'spapi', status: 'error', checks };
  }

  if (apiProbe) {
    try {
      const { json } = await spapiCall({
        userId,
        storeId,
        region,
        audit: false,
        endpoint: 'sellers.getMarketplaceParticipations',
        path: '/sellers/v1/marketplaceParticipations',
      });
      const payload = Array.isArray(json?.payload) ? json.payload : [];
      checks.push({
        name: 'sellers_marketplace_participations',
        status: 'ok',
        recordsIn: payload.length,
      });
    } catch (err) {
      checks.push({ name: 'sellers_marketplace_participations', status: 'error', ...safeError(err) });
      return { requested: true, provider: 'spapi', status: 'error', checks };
    }
  }

  return { requested: true, provider: 'spapi', status: 'ok', checks };
}

async function probeAds({ userId, storeId, apiProbe, region, mockMode = false }) {
  // AUTH-15(a): when ADS_API_MOCK=1, the Ads adapter answers from local fixtures,
  // not Amazon. Tag every live check with source:'fixture' so downstream
  // consumers (M3 control tower / drawer sourceMeta) drive their real-vs-mock
  // rendering from the source meta rather than from readiness.
  const source = mockMode ? 'fixture' : 'live';
  const checks = [];
  try {
    await getAdsAccessToken(userId, storeId, { force: true });
    checks.push({ name: 'lwa_token_exchange', status: 'ok', source });
  } catch (err) {
    checks.push({ name: 'lwa_token_exchange', status: 'error', source, ...safeError(err) });
    return { requested: true, provider: 'ads', status: 'error', source, checks };
  }

  if (apiProbe) {
    try {
      const { json } = await adsCall({
        userId,
        storeId,
        region,
        audit: false,
        endpoint: 'ads.profiles.list',
        path: '/v2/profiles',
      });
      const profiles = Array.isArray(json) ? json : [];
      checks.push({
        name: 'ads_profiles_list',
        status: 'ok',
        source,
        recordsIn: profiles.length,
        profileIdCandidates: profiles.map((p) => String(p.profileId || p.profile_id || '')).filter(Boolean).slice(0, 10),
      });
    } catch (err) {
      checks.push({ name: 'ads_profiles_list', status: 'error', source, ...safeError(err) });
      return { requested: true, provider: 'ads', status: 'error', source, checks };
    }
  }

  return { requested: true, provider: 'ads', status: 'ok', source, checks };
}

function m3Impact(providers, env) {
  const ads = providers.find((p) => p.provider === 'ads');
  const spapi = providers.find((p) => p.provider === 'spapi');
  const adsReady = ads?.readiness === 'ready';
  // AUTH-04: honest readback of the env gate state — NOT an enablement switch.
  // The live-action-executor still independently re-checks isRealMode()+every gate.
  const gate = getRealWriteGateState();
  return {
    m3DataMode: adsReady ? 'ads_live_read_ready_after_sync' : (env.ads.mock ? 'ads_mock_fixture' : 'mock_until_ads_authorized'),
    spapiContextMode: spapi?.readiness === 'ready' ? 'spapi_context_read_ready' : 'spapi_context_not_ready',
    realWriteMode: gate.realWriteEnabled ? 'armed_real_write_env_gate_on' : 'disabled_dry_run_audit_first',
    realWriteEnabled: gate.realWriteEnabled,
    realWriteGate: gate,
    reason: gate.realWriteEnabled
      ? 'WARNING: real Amazon Ads write env gates are armed. Each write still requires real provider mode + explicit per-action confirmation through the live-action-executor; batch real writes remain blocked.'
      : 'M3 action queue, dry-run, audit log and rollback contracts are ready; Amazon Ads write operations remain blocked until an explicit future enablement gate.',
    requiredBeforeLiveM3: adsReady
      ? ['run_ads_sync_all_for_profile', 'verify_data_freshness', 'keep_real_writes_disabled']
      : ['complete_ads_authorization', 'discover_and_store_profile_id', 'run_ads_sync_all', 'verify_m3_suggestions_use_live_source_meta'],
  };
}

export function normalizeDiagnosticProvider(provider = 'all') {
  const v = String(provider || 'all').toLowerCase();
  if (!VALID_PROVIDERS.has(v)) throw new Error('invalid_provider');
  return v;
}

export async function buildAmazonAuthorizationDiagnostics({
  userId,
  storeId,
  provider = 'all',
  liveProbe = false,
  apiProbe = false,
} = {}) {
  if (!userId || !storeId) throw new Error('user_and_store_required');
  const selected = normalizeDiagnosticProvider(provider);
  const env = buildEnvironment();
  const providerNames = selected === 'all' ? ['spapi', 'ads'] : [selected];
  const providers = [];

  for (const name of providerNames) {
    const credential = readCredentialSnapshot(userId, storeId, name);
    const classified = classifyProvider(name, env, credential);
    const item = {
      provider: name,
      ...classified,
      credential,
      recentSyncs: recentRuns(userId, storeId, name),
      liveProbe: { requested: !!liveProbe, status: liveProbe ? 'pending' : 'skipped' },
    };
    if (liveProbe) {
      if (classified.blockers.some((b) => b.endsWith('_missing') || b.endsWith('_not_active') || b === 'credential_encryption_key_missing_or_invalid')) {
        item.liveProbe = {
          requested: true,
          status: 'skipped',
          reason: 'offline_readiness_blocked',
          blockers: classified.blockers,
        };
      } else if (name === 'spapi') {
        item.liveProbe = await probeSpApi({ userId, storeId, apiProbe, region: credential.region });
      } else if (name === 'ads') {
        item.liveProbe = await probeAds({ userId, storeId, apiProbe, region: credential.region, mockMode: env.ads.mock });
      }
      if (item.liveProbe.status === 'ok') {
        // AUTH-02(c): a mock-fixture probe is never a real 'live_ok'. Keep it as
        // mock_ready so the UI tag stays a warning, not success green.
        if (name === 'ads' && env.ads.mock) item.readiness = 'mock_ready';
        else item.readiness = item.blockers.length === 0 ? 'live_ok' : 'live_partial';
      }
      if (item.liveProbe.status === 'error') item.readiness = 'live_error';
    }
    providers.push(item);
  }

  return {
    ok: true,
    generatedAt: nowIso(),
    userId,
    storeId,
    mode: providerMode(),
    requested: { provider: selected, liveProbe: !!liveProbe, apiProbe: !!apiProbe },
    environment: env,
    providers,
    m3Impact: m3Impact(providers, env),
  };
}
