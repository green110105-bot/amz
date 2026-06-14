// Ads API per-(user, store) credential storage. Mirrors sp-api/credentials.mjs
// with provider='ads'. Stores Amazon Advertising profile_id alongside the
// SP-API row (same table, different provider key), so a single store can hold
// both SP-API + Ads credentials without colliding.

import { encryptToken, decryptToken } from '../crypto/token-cipher.mjs';
import { getDbInstance } from '../../data-store.mjs';

const PROVIDER = 'ads';

function nowIso() { return new Date().toISOString(); }

export function upsertAdsCredentials({
  userId, storeId, profileId, countryCode, region, marketplaceIds,
  refreshToken, scope,
}) {
  if (!userId || !storeId) throw new Error('user_and_store_required');
  if (!refreshToken) throw new Error('refresh_token_required');
  const db = getDbInstance();
  const enc = encryptToken(refreshToken);
  const mids = Array.isArray(marketplaceIds) ? marketplaceIds.join(',') : (marketplaceIds || '');
  const existing = db.prepare(`SELECT user_id FROM store_credentials WHERE user_id=? AND store_id=? AND provider=?`).get(userId, storeId, PROVIDER);
  if (existing) {
    db.prepare(`UPDATE store_credentials SET
      profile_id=?, country_code=?, region=?, marketplace_ids=?,
      refresh_token_enc=?, access_token_enc=NULL, access_token_expires_at=NULL,
      scope=?, status='active', last_error=NULL, last_error_at=NULL, updated_at=?
      WHERE user_id=? AND store_id=? AND provider=?`).run(
        profileId || null, countryCode || null, region || null, mids,
        enc, scope || null, nowIso(),
        userId, storeId, PROVIDER,
      );
  } else {
    db.prepare(`INSERT INTO store_credentials
      (user_id,store_id,provider,profile_id,country_code,region,marketplace_ids,
       refresh_token_enc,scope,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'active',?,?)`).run(
        userId, storeId, PROVIDER, profileId || null, countryCode || null,
        region || null, mids, enc, scope || null, nowIso(), nowIso(),
      );
  }
  // user_stores has an ads_api_authorized flag mirroring sp_api_authorized.
  try {
    db.prepare(`UPDATE user_stores SET ads_api_authorized=1, updated_at=? WHERE user_id=? AND id=?`)
      .run(nowIso(), userId, storeId);
  } catch {}
}

export function getAdsCredentials(userId, storeId) {
  const db = getDbInstance();
  const row = db.prepare(`SELECT * FROM store_credentials WHERE user_id=? AND store_id=? AND provider=?`)
    .get(userId, storeId, PROVIDER);
  if (!row) return null;
  return {
    userId: row.user_id,
    storeId: row.store_id,
    profileId: row.profile_id,
    countryCode: row.country_code,
    region: row.region,
    marketplaceIds: (row.marketplace_ids || '').split(',').filter(Boolean),
    scope: row.scope,
    status: row.status,
    refreshToken: row.refresh_token_enc ? decryptToken(row.refresh_token_enc) : null,
    accessToken: row.access_token_enc ? decryptToken(row.access_token_enc) : null,
    accessTokenExpiresAt: row.access_token_expires_at,
    lastRefreshedAt: row.last_refreshed_at,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
  };
}

export function setAdsAccessToken(userId, storeId, accessToken, expiresAtIso) {
  const db = getDbInstance();
  const enc = encryptToken(accessToken);
  db.prepare(`UPDATE store_credentials SET
    access_token_enc=?, access_token_expires_at=?, last_refreshed_at=?, updated_at=?,
    last_error=NULL, last_error_at=NULL
    WHERE user_id=? AND store_id=? AND provider=?`).run(
      enc, expiresAtIso, nowIso(), nowIso(),
      userId, storeId, PROVIDER,
    );
}

export function setAdsProfileId(userId, storeId, profileId) {
  const db = getDbInstance();
  const result = db.prepare(`UPDATE store_credentials SET profile_id=?, updated_at=?
    WHERE user_id=? AND store_id=? AND provider=?`).run(
      profileId || null, nowIso(), userId, storeId, PROVIDER,
    );
  return result.changes > 0;
}

export function recordAdsError(userId, storeId, code, message) {
  const db = getDbInstance();
  db.prepare(`UPDATE store_credentials SET last_error=?, last_error_at=?, updated_at=?
    WHERE user_id=? AND store_id=? AND provider=?`).run(
      `${code}: ${String(message).slice(0, 500)}`, nowIso(), nowIso(),
      userId, storeId, PROVIDER,
    );
}

export function revokeAdsCredentials(userId, storeId) {
  const db = getDbInstance();
  db.prepare(`UPDATE store_credentials SET status='revoked',
    refresh_token_enc=NULL, access_token_enc=NULL, access_token_expires_at=NULL, updated_at=?
    WHERE user_id=? AND store_id=? AND provider=?`).run(nowIso(), userId, storeId, PROVIDER);
  try {
    db.prepare(`UPDATE user_stores SET ads_api_authorized=0, updated_at=? WHERE user_id=? AND id=?`)
      .run(nowIso(), userId, storeId);
  } catch {}
}
