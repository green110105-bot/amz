import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Isolate test DB + provide encryption key + mock mode BEFORE imports.
const tmpDir = mkdtempSync(join(tmpdir(), 'amz-adsapi-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.ADS_API_MOCK = 'true';
process.env.ADS_LWA_CLIENT_ID = 'test-ads-client-id';
process.env.ADS_LWA_CLIENT_SECRET = 'test-ads-client-secret';

const { getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const {
  upsertAdsCredentials, getAdsCredentials,
  setAdsAccessToken, recordAdsError, revokeAdsCredentials,
} = await import('../../apps/api/src/integrations/ads-api/credentials.mjs');
const { getAdsAccessToken, _clearInFlightForTests } = await import('../../apps/api/src/integrations/ads-api/auth.mjs');
const { adsCall } = await import('../../apps/api/src/integrations/ads-api/client.mjs');
const { listProfiles }    = await import('../../apps/api/src/integrations/ads-api/endpoints/profiles.mjs');
const { listCampaigns }   = await import('../../apps/api/src/integrations/ads-api/endpoints/campaigns.mjs');
const { listAdGroups }    = await import('../../apps/api/src/integrations/ads-api/endpoints/adGroups.mjs');
const { listKeywords }    = await import('../../apps/api/src/integrations/ads-api/endpoints/keywords.mjs');
const { listProductAds }  = await import('../../apps/api/src/integrations/ads-api/endpoints/productAds.mjs');
const { syncAdsHierarchy } = await import('../../apps/api/src/integrations/ads-api/sync/campaigns-sync.mjs');
const { acquire, _resetForTests } = await import('../../apps/api/src/integrations/ads-api/rate-limiter.mjs');

const U = 'u-ads-test';
const S = 's-ads-test';
const PROFILE = 9876543210123;

function seedUserStore() {
  const db = getDbInstance();
  db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`)
    .run(U, 'AdsTest', 'ads@amz.local', 'admin', 'x', new Date().toISOString());
  db.prepare(`INSERT OR REPLACE INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(S, U, 'Ads Test US', 'US', 'USD', 'ATVPDKIKX0DER', 0, 0, new Date().toISOString());
  // Wipe any seeded lx_* rows for this (U,S) so counts are deterministic.
  for (const t of ['lx_campaigns','lx_ad_groups','lx_ads','lx_targetings']) {
    db.prepare(`DELETE FROM ${t} WHERE user_id=? AND store_id=?`).run(U, S);
  }
}

test('ads-api schema: store_credentials has profile_id + country_code columns', () => {
  const db = getDbInstance();
  const cols = db.prepare(`PRAGMA table_info(store_credentials)`).all().map((c) => c.name);
  assert.ok(cols.includes('profile_id'), 'profile_id column missing: ' + cols.join(','));
  assert.ok(cols.includes('country_code'), 'country_code column missing');
});

test('ads-api credentials: upsert → get round-trip with encrypted refresh token', () => {
  seedUserStore();
  upsertAdsCredentials({
    userId: U, storeId: S,
    profileId: String(PROFILE),
    countryCode: 'US', region: 'NA',
    marketplaceIds: ['ATVPDKIKX0DER'],
    refreshToken: 'Atzr|ADS-FAKE-refresh-' + randomBytes(4).toString('hex'),
  });
  const db = getDbInstance();
  const row = db.prepare(`SELECT refresh_token_enc, profile_id, country_code, provider FROM store_credentials WHERE user_id=? AND store_id=? AND provider='ads'`).get(U, S);
  assert.ok(row, 'row missing');
  assert.doesNotMatch(row.refresh_token_enc, /^Atzr\|/, 'refresh token must be encrypted at rest');
  assert.equal(row.profile_id, String(PROFILE));
  assert.equal(row.country_code, 'US');

  const got = getAdsCredentials(U, S);
  assert.equal(got.status, 'active');
  assert.match(got.refreshToken, /^Atzr\|ADS-FAKE-refresh-/);
  assert.equal(got.profileId, String(PROFILE));
  const us = db.prepare(`SELECT ads_api_authorized FROM user_stores WHERE id=?`).get(S);
  assert.equal(us.ads_api_authorized, 1);
});

test('ads-api credentials: setAdsAccessToken caches encrypted token + expiry', () => {
  setAdsAccessToken(U, S, 'Atza|MANUAL-ads', new Date(Date.now() + 3600_000).toISOString());
  const got = getAdsCredentials(U, S);
  assert.equal(got.accessToken, 'Atza|MANUAL-ads');
  assert.ok(Date.parse(got.accessTokenExpiresAt) > Date.now());
});

test('ads-api credentials: recordAdsError populates last_error fields', () => {
  recordAdsError(U, S, 'http_401', 'bad scope');
  const got = getAdsCredentials(U, S);
  assert.match(got.lastError || '', /http_401/);
  assert.ok(got.lastErrorAt);
});

test('ads-api auth: mock mode mints + caches access token without fetch', async () => {
  _clearInFlightForTests();
  // Reset cached token so refresh path runs once.
  getDbInstance().prepare(`UPDATE store_credentials SET access_token_enc=NULL, access_token_expires_at=NULL WHERE user_id=? AND store_id=? AND provider='ads'`).run(U, S);
  // Sentinel: ensure no real network is hit. Replace fetch and assert it isn't called.
  const origFetch = globalThis.fetch;
  let fetchCalled = 0;
  globalThis.fetch = (...args) => { fetchCalled++; throw new Error('fetch_should_not_be_called'); };
  try {
    const t1 = await getAdsAccessToken(U, S);
    assert.match(t1, /^Atza\|MOCK-ads-access-/);
    // Second call: should hit cached path (still no fetch).
    const t2 = await getAdsAccessToken(U, S);
    assert.equal(t1, t2);
    assert.equal(fetchCalled, 0, 'mock auth must not call fetch');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ads-api client: mock mode returns fixture for listProfiles without fetch', async () => {
  const origFetch = globalThis.fetch;
  let fetchCalled = 0;
  globalThis.fetch = (...args) => { fetchCalled++; throw new Error('fetch_should_not_be_called'); };
  try {
    const rows = await listProfiles({ userId: U, storeId: S });
    assert.ok(Array.isArray(rows), 'profiles must be array');
    assert.ok(rows.length >= 1, 'profiles non-empty');
    assert.equal(rows[0].profileId, 9876543210123);
    assert.equal(fetchCalled, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ads-api client: listCampaigns returns 5 fixture campaigns and writes sync_runs row', async () => {
  const db = getDbInstance();
  const beforeCount = db.prepare(`SELECT COUNT(*) AS n FROM sync_runs WHERE provider='ads' AND endpoint='ads.sp.campaigns.list'`).get().n;
  const rows = await listCampaigns({ userId: U, storeId: S, profileId: PROFILE });
  assert.equal(rows.length, 5);
  const afterCount = db.prepare(`SELECT COUNT(*) AS n FROM sync_runs WHERE provider='ads' AND endpoint='ads.sp.campaigns.list'`).get().n;
  assert.equal(afterCount, beforeCount + 1);
});

test('ads-api client: stateFilter filters mock rows', async () => {
  const rows = await listCampaigns({ userId: U, storeId: S, profileId: PROFILE, stateFilter: 'paused' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'paused');
});

test('ads-api client: campaignIdFilter narrows ad-groups + keywords + ads', async () => {
  const cmpId = '700000000000001';
  const ags = await listAdGroups({ userId: U, storeId: S, profileId: PROFILE, campaignIdFilter: cmpId });
  assert.equal(ags.length, 3);
  for (const ag of ags) assert.equal(String(ag.campaignId), cmpId);

  const kws = await listKeywords({ userId: U, storeId: S, profileId: PROFILE, campaignIdFilter: cmpId });
  assert.equal(kws.length, 30); // 3 ad groups × 10 keywords
  const ads = await listProductAds({ userId: U, storeId: S, profileId: PROFILE, campaignIdFilter: cmpId });
  assert.equal(ads.length, 3);
});

test('ads-api endpoints: profile_id_required when missing', async () => {
  await assert.rejects(() => listCampaigns({ userId: U, storeId: S }), /profile_id_required/);
  await assert.rejects(() => listAdGroups({ userId: U, storeId: S }), /profile_id_required/);
  await assert.rejects(() => listKeywords({ userId: U, storeId: S }), /profile_id_required/);
  await assert.rejects(() => listProductAds({ userId: U, storeId: S }), /profile_id_required/);
});

test('syncAdsHierarchy: populates lx_* tables with expected row counts', async () => {
  seedUserStore(); // wipe lx_* for this user
  const res = await syncAdsHierarchy({ userId: U, storeId: S, profileId: PROFILE });
  assert.equal(res.counts.campaigns, 5);
  assert.equal(res.counts.adGroups, 15);
  assert.equal(res.counts.ads, 15);
  assert.equal(res.counts.keywords, 150);

  const db = getDbInstance();
  const cmpN = db.prepare(`SELECT COUNT(*) AS n FROM lx_campaigns WHERE user_id=? AND store_id=?`).get(U, S).n;
  const agN  = db.prepare(`SELECT COUNT(*) AS n FROM lx_ad_groups WHERE user_id=? AND store_id=?`).get(U, S).n;
  const adN  = db.prepare(`SELECT COUNT(*) AS n FROM lx_ads WHERE user_id=? AND store_id=?`).get(U, S).n;
  const kwN  = db.prepare(`SELECT COUNT(*) AS n FROM lx_targetings WHERE user_id=? AND store_id=? AND type='keyword'`).get(U, S).n;
  assert.equal(cmpN, 5);
  assert.equal(agN, 15);
  assert.equal(adN, 15);
  assert.equal(kwN, 150);

  const audit = db.prepare(`SELECT * FROM audit_logs WHERE source_module='ADS' AND action_type='ads_sync_batch' ORDER BY executed_at DESC LIMIT 1`).get();
  assert.ok(audit, 'audit row missing');
  assert.equal(audit.user_id, U);
});

test('syncAdsHierarchy: idempotent re-sync (counts stable, no duplicates)', async () => {
  await syncAdsHierarchy({ userId: U, storeId: S, profileId: PROFILE });
  await syncAdsHierarchy({ userId: U, storeId: S, profileId: PROFILE });
  const db = getDbInstance();
  const cmpN = db.prepare(`SELECT COUNT(*) AS n FROM lx_campaigns WHERE user_id=? AND store_id=?`).get(U, S).n;
  const agN  = db.prepare(`SELECT COUNT(*) AS n FROM lx_ad_groups WHERE user_id=? AND store_id=?`).get(U, S).n;
  const kwN  = db.prepare(`SELECT COUNT(*) AS n FROM lx_targetings WHERE user_id=? AND store_id=? AND type='keyword'`).get(U, S).n;
  assert.equal(cmpN, 5);
  assert.equal(agN, 15);
  assert.equal(kwN, 150);
});

test('ads-api rate-limiter: 5 sequential mock calls drain bucket but do not throw', async () => {
  _resetForTests();
  const key = `${U}:${S}`;
  // 5 sequential adsCall mock invocations
  for (let i = 0; i < 5; i++) {
    const rows = await listProfiles({ userId: U, storeId: S });
    assert.ok(Array.isArray(rows));
  }
  // After 5 calls, the bucket should still be reachable in next call.
  await acquire(key, 'ads.profiles.list');
});

test('ads-api credentials: revoke clears tokens + flips ads_api_authorized off', () => {
  revokeAdsCredentials(U, S);
  const got = getAdsCredentials(U, S);
  assert.equal(got.status, 'revoked');
  assert.equal(got.refreshToken, null);
  assert.equal(got.accessToken, null);
  const us = getDbInstance().prepare(`SELECT ads_api_authorized FROM user_stores WHERE id=?`).get(S);
  assert.equal(us.ads_api_authorized, 0);
});
