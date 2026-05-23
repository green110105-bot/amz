// syncAdsHierarchy — fetches campaigns + adGroups + ads + keywords for a
// given profile and upserts them into the lx_* tables (M3 ad domain).
//
// Idempotent on entity IDs:
//   campaignId  -> lx_campaigns.id     (as text)
//   adGroupId   -> lx_ad_groups.id     (as text)
//   adId        -> lx_ads.id           (as text)
//   keywordId   -> lx_targetings.id    (as text, type='keyword')
//
// Writes one audit_logs row at the end (sourceModule='ADS',
// actionType='ads_sync_batch') summarising the per-entity counts.

import { listCampaigns } from '../endpoints/campaigns.mjs';
import { listAdGroups }  from '../endpoints/adGroups.mjs';
import { listKeywords }  from '../endpoints/keywords.mjs';
import { listProductAds } from '../endpoints/productAds.mjs';
import { getDbInstance, appendAuditLog } from '../../../data-store.mjs';

function nowIso() { return new Date().toISOString(); }

function upsertCampaigns(db, userId, storeId, rows) {
  const stmt = db.prepare(`INSERT INTO lx_campaigns(
    id, user_id, store_id, portfolio_id, name, type, targeting_type, state,
    service_state, service_state_color, enabled, daily_budget, bid_strategy,
    lifecycle_stage, tags, metrics, extra, started_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      portfolio_id=excluded.portfolio_id,
      name=excluded.name,
      type=excluded.type,
      targeting_type=excluded.targeting_type,
      state=excluded.state,
      service_state=excluded.service_state,
      enabled=excluded.enabled,
      daily_budget=excluded.daily_budget,
      bid_strategy=excluded.bid_strategy,
      extra=excluded.extra,
      started_at=excluded.started_at,
      updated_at=excluded.updated_at`);
  const now = nowIso();
  let inserted = 0;
  for (const c of rows) {
    const id = String(c.campaignId);
    const state = c.state || 'enabled';
    const enabled = state === 'enabled' ? 1 : 0;
    stmt.run(
      id, userId, storeId, c.portfolioId ? String(c.portfolioId) : null,
      c.name || ('Campaign ' + id),
      c.campaignType || 'sponsoredProducts',
      c.targetingType || null,
      state, state === 'enabled' ? 'delivering' : 'paused', '#10b981', enabled,
      c.dailyBudget ?? null, c.bidding?.strategy || null,
      null, '[]',
      JSON.stringify({}), JSON.stringify({ source: 'ads_api', raw: c }),
      c.startDate || null, now, now,
    );
    inserted++;
  }
  return inserted;
}

function upsertAdGroups(db, userId, storeId, rows) {
  const stmt = db.prepare(`INSERT INTO lx_ad_groups(
    id, user_id, store_id, campaign_id, name, enabled, state, default_bid, bid_adj, metrics, extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      campaign_id=excluded.campaign_id,
      name=excluded.name,
      enabled=excluded.enabled,
      state=excluded.state,
      default_bid=excluded.default_bid,
      extra=excluded.extra,
      updated_at=excluded.updated_at`);
  const now = nowIso();
  let n = 0;
  for (const ag of rows) {
    const id = String(ag.adGroupId);
    const state = ag.state || 'enabled';
    const enabled = state === 'enabled' ? 1 : 0;
    stmt.run(
      id, userId, storeId,
      ag.campaignId ? String(ag.campaignId) : null,
      ag.name || ('AdGroup ' + id),
      enabled, state, ag.defaultBid ?? null, 0,
      JSON.stringify({}), JSON.stringify({ source: 'ads_api', raw: ag }),
      now, now,
    );
    n++;
  }
  return n;
}

function upsertProductAds(db, userId, storeId, rows) {
  const stmt = db.prepare(`INSERT INTO lx_ads(
    id, user_id, store_id, ad_group_id, asin, sku, enabled, state, headline, image_url, metrics, extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      ad_group_id=excluded.ad_group_id,
      asin=excluded.asin,
      sku=excluded.sku,
      enabled=excluded.enabled,
      state=excluded.state,
      extra=excluded.extra,
      updated_at=excluded.updated_at`);
  const now = nowIso();
  let n = 0;
  for (const a of rows) {
    const id = String(a.adId);
    const state = a.state || 'enabled';
    const enabled = state === 'enabled' ? 1 : 0;
    stmt.run(
      id, userId, storeId,
      a.adGroupId ? String(a.adGroupId) : null,
      a.asin || null, a.sku || null,
      enabled, state, null, null,
      JSON.stringify({}), JSON.stringify({ source: 'ads_api', raw: a }),
      now, now,
    );
    n++;
  }
  return n;
}

function upsertKeywords(db, userId, storeId, rows) {
  const stmt = db.prepare(`INSERT INTO lx_targetings(
    id, user_id, store_id, campaign_id, ad_group_id, type, term, asin, category,
    match_type, bid, suggested_bid_low, suggested_bid_high, enabled, state,
    position, metrics, extra, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      campaign_id=excluded.campaign_id,
      ad_group_id=excluded.ad_group_id,
      term=excluded.term,
      match_type=excluded.match_type,
      bid=excluded.bid,
      enabled=excluded.enabled,
      state=excluded.state,
      extra=excluded.extra,
      updated_at=excluded.updated_at`);
  const now = nowIso();
  let n = 0;
  for (const k of rows) {
    const id = String(k.keywordId);
    const state = k.state || 'enabled';
    const enabled = state === 'enabled' ? 1 : 0;
    stmt.run(
      id, userId, storeId,
      k.campaignId ? String(k.campaignId) : null,
      k.adGroupId ? String(k.adGroupId) : null,
      'keyword', k.keywordText || null, null, null,
      k.matchType || null,
      k.bid ?? null, null, null,
      enabled, state, null,
      JSON.stringify({}), JSON.stringify({ source: 'ads_api', raw: k }),
      now, now,
    );
    n++;
  }
  return n;
}

/**
 * Pull the full SP hierarchy for one Ads profile and upsert into lx_*.
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.storeId
 * @param {string|number} args.profileId
 * @param {string} [args.region]
 */
export async function syncAdsHierarchy({ userId, storeId, profileId, region }) {
  if (!userId || !storeId) throw new Error('user_and_store_required');
  if (!profileId) throw new Error('profile_id_required');

  const startedAt = nowIso();
  const campaigns = await listCampaigns({ userId, storeId, profileId, region });
  const adGroups  = await listAdGroups({ userId, storeId, profileId, region });
  const productAds = await listProductAds({ userId, storeId, profileId, region });
  const keywords  = await listKeywords({ userId, storeId, profileId, region });

  const db = getDbInstance();
  const tx = db.transaction(() => {
    return {
      campaigns:  upsertCampaigns(db, userId, storeId, campaigns),
      adGroups:   upsertAdGroups(db, userId, storeId, adGroups),
      ads:        upsertProductAds(db, userId, storeId, productAds),
      keywords:   upsertKeywords(db, userId, storeId, keywords),
    };
  });
  const counts = tx();

  appendAuditLog(userId, storeId, {
    sourceModule: 'ADS',
    actionType: 'ads_sync_batch',
    resourceType: 'ads_hierarchy',
    resourceId: String(profileId),
    status: 'success',
    executedAt: nowIso(),
    startedAt,
    profileId: String(profileId),
    counts,
  });

  return { profileId: String(profileId), startedAt, endedAt: nowIso(), counts };
}
