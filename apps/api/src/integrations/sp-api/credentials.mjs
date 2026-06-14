// CRUD for store_credentials. Encrypts refresh_token / access_token on write,
// decrypts on read. Provider value is 'spapi' here; 'ads' will reuse the same table.

import { encryptToken, decryptToken } from '../crypto/token-cipher.mjs';
import { getDbInstance } from '../../data-store.mjs';

const PROVIDER = 'spapi';

function nowIso() { return new Date().toISOString(); }

export function upsertSpApiCredentials({
  userId, storeId, sellingPartnerId, region, marketplaceIds,
  refreshToken, scope,
}) {
  if (!userId || !storeId) throw new Error('user_and_store_required');
  if (!refreshToken) throw new Error('refresh_token_required');
  const db = getDbInstance();
  const enc = encryptToken(refreshToken);
  const existing = db.prepare(`SELECT user_id FROM store_credentials WHERE user_id=? AND store_id=? AND provider=?`).get(userId, storeId, PROVIDER);
  const mids = Array.isArray(marketplaceIds) ? marketplaceIds.join(',') : (marketplaceIds || '');
  if (existing) {
    db.prepare(`UPDATE store_credentials SET
      selling_partner_id=?, region=?, marketplace_ids=?,
      refresh_token_enc=?, access_token_enc=NULL, access_token_expires_at=NULL,
      scope=?, status='active', last_error=NULL, last_error_at=NULL, updated_at=?
      WHERE user_id=? AND store_id=? AND provider=?`).run(
        sellingPartnerId || null, region || null, mids,
        enc, scope || null, nowIso(),
        userId, storeId, PROVIDER,
      );
  } else {
    db.prepare(`INSERT INTO store_credentials
      (user_id,store_id,provider,selling_partner_id,region,marketplace_ids,
       refresh_token_enc,scope,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,'active',?,?)`).run(
        userId, storeId, PROVIDER, sellingPartnerId || null, region || null, mids,
        enc, scope || null, nowIso(), nowIso(),
      );
  }
  db.prepare(`UPDATE user_stores SET sp_api_authorized=1, updated_at=? WHERE user_id=? AND id=?`)
    .run(nowIso(), userId, storeId);
}

export function getSpApiCredentials(userId, storeId) {
  const db = getDbInstance();
  const row = db.prepare(`SELECT * FROM store_credentials WHERE user_id=? AND store_id=? AND provider=?`)
    .get(userId, storeId, PROVIDER);
  if (!row) return null;
  return {
    userId: row.user_id,
    storeId: row.store_id,
    sellingPartnerId: row.selling_partner_id,
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

export function setSpApiAccessToken(userId, storeId, accessToken, expiresAtIso) {
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

export function updateSpApiCredentialMetadata(userId, storeId, {
  sellingPartnerId, region, marketplaceIds, scope, status,
} = {}) {
  const db = getDbInstance();
  const fields = [];
  const params = [];
  if (status !== undefined) {
    // AUTH-09: allow the OAuth finalize path to demote a half-ready credential
    // (e.g. marketplace discovery failed) from 'active' to 'needs_attention' so
    // the 'active' semantic stays aligned with diagnostics readiness.
    fields.push('status=?');
    params.push(status);
  }
  if (sellingPartnerId !== undefined) {
    fields.push('selling_partner_id=?');
    params.push(sellingPartnerId || null);
  }
  if (region !== undefined) {
    fields.push('region=?');
    params.push(region || null);
  }
  if (marketplaceIds !== undefined) {
    const mids = Array.isArray(marketplaceIds) ? marketplaceIds.join(',') : (marketplaceIds || '');
    fields.push('marketplace_ids=?');
    params.push(mids);
  }
  if (scope !== undefined) {
    fields.push('scope=?');
    params.push(scope || null);
  }
  if (!fields.length) return false;
  fields.push('updated_at=?');
  params.push(nowIso(), userId, storeId, PROVIDER);
  const result = db.prepare(`UPDATE store_credentials SET ${fields.join(', ')}
    WHERE user_id=? AND store_id=? AND provider=?`).run(...params);
  return result.changes > 0;
}

export function recordSpApiError(userId, storeId, code, message) {
  const db = getDbInstance();
  db.prepare(`UPDATE store_credentials SET last_error=?, last_error_at=?, updated_at=?
    WHERE user_id=? AND store_id=? AND provider=?`).run(
      `${code}: ${String(message).slice(0, 500)}`, nowIso(), nowIso(),
      userId, storeId, PROVIDER,
    );
}

export function revokeSpApiCredentials(userId, storeId) {
  const db = getDbInstance();
  db.prepare(`UPDATE store_credentials SET status='revoked',
    refresh_token_enc=NULL, access_token_enc=NULL, access_token_expires_at=NULL, updated_at=?
    WHERE user_id=? AND store_id=? AND provider=?`).run(nowIso(), userId, storeId, PROVIDER);
  db.prepare(`UPDATE user_stores SET sp_api_authorized=0, updated_at=? WHERE user_id=? AND id=?`)
    .run(nowIso(), userId, storeId);
}
