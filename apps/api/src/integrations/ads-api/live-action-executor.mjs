// Real Amazon Ads execution bridge for M3 action queue.
// It is intentionally narrow: live writes require env gates, store allowlist,
// explicit request confirmation, and per-action change limits.

import { adsCall } from './client.mjs';
import { getAdsCredentials } from './credentials.mjs';
import { getActionQueueItem, recordActionQueueExternalResult } from '../../data-store-ads.mjs';
import { isRealMode } from '../provider-mode.mjs';

function nowIso() { return new Date().toISOString(); }

// In-process per-store real-write counter (sliding window + lifetime cap).
// Defends the "no batch real writes" invariant against looping single execute calls.
const realWriteWindow = new Map(); // key: userId:storeId -> { windowId, count, total }

function assertPerStoreRealWriteLimit(userId, storeId) {
  const windowSeconds = Number(process.env.ADS_REAL_WRITE_RATE_WINDOW_SECONDS || 60);
  const perWindowMax = Number(process.env.ADS_REAL_WRITE_RATE_MAX || 5);
  const lifetimeMax = Number(process.env.ADS_REAL_WRITE_TOTAL_MAX || 0); // 0 = no lifetime cap
  const key = `${userId}:${storeId}`;
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const prev = realWriteWindow.get(key);
  let count = 1;
  let total = 1;
  if (prev) {
    total = prev.total + 1;
    count = prev.windowId === windowId ? prev.count + 1 : 1;
  }
  if (Number.isFinite(perWindowMax) && perWindowMax > 0 && count > perWindowMax) {
    throw new TypeError('real_write_rate_limit_exceeded');
  }
  if (Number.isFinite(lifetimeMax) && lifetimeMax > 0 && total > lifetimeMax) {
    throw new TypeError('real_write_total_limit_exceeded');
  }
  realWriteWindow.set(key, { windowId, count, total });
}

function envBool(name) {
  const v = process.env[name];
  return v === '1' || v === 'true' || v === 'yes';
}

function splitEnv(name, fallback = '') {
  return String(process.env[name] || fallback)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function maxPct(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function assertAllowedByList(value, list, label) {
  if (list.includes('*') || list.includes(value)) return;
  throw new TypeError(`${label}_not_allowlisted`);
}

function primitiveAllowed(primitive) {
  const allowed = splitEnv('ADS_REAL_WRITES_ALLOWED_PRIMITIVES', 'ADJUST_BID');
  return allowed.includes('*') || allowed.includes(primitive);
}

function assertRealWriteGate({ userId, storeId, profileId, primitive, body }) {
  // Hard invariant: never touch Amazon unless the provider mode is explicitly 'real'.
  // mock/hybrid sandboxes must never reach a live mutation even if every env gate is set.
  if (!isRealMode()) throw new TypeError('real_write_requires_real_provider_mode');
  if (!envBool('ADS_REAL_WRITES_ENABLED')) throw new TypeError('ads_real_writes_disabled');
  if (envBool('ADS_API_MOCK')) throw new TypeError('ads_api_mock_enabled_real_write_blocked');
  if (body.confirmRealWrite !== true) throw new TypeError('confirm_real_write_required');
  if (body.riskAccepted !== true) throw new TypeError('risk_accepted_required');
  if (!primitiveAllowed(primitive)) throw new TypeError('action_primitive_not_allowlisted');

  // Store allowlist: keys are ALWAYS userId:storeId. The bare-storeId allow form is
  // removed to avoid mis-configuration that would authorize a store across tenants.
  const storeAllow = splitEnv('ADS_REAL_WRITES_STORE_ALLOWLIST');
  if (storeAllow.length) {
    assertAllowedByList(`${userId}:${storeId}`, storeAllow, 'store');
  }

  const profileAllow = splitEnv('ADS_REAL_WRITES_PROFILE_ALLOWLIST');
  if (profileAllow.length) assertAllowedByList(String(profileId), profileAllow, 'profile');

  // Per-store frequency / lifetime cap: looping single execute calls must not
  // become a back-door batch real write.
  assertPerStoreRealWriteLimit(userId, storeId);
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function coalesceNumber(...values) {
  for (const value of values) {
    const n = toNumberOrNull(value);
    if (n !== null) return n;
  }
  return null;
}

function assertChangeLimit({ current, next, primitive }) {
  if (!(current > 0)) throw new TypeError('current_value_required_for_real_write');
  if (!(next > 0)) throw new TypeError('recommended_value_required_for_real_write');
  const pct = Math.abs(next - current) / current;
  const limit = primitive === 'ADJUST_BUDGET'
    ? maxPct('ADS_REAL_WRITE_MAX_BUDGET_CHANGE_PCT', 0.05)
    : maxPct('ADS_REAL_WRITE_MAX_BID_CHANGE_PCT', 0.1);
  if (pct > limit) throw new TypeError(`real_write_delta_too_large:${pct.toFixed(4)}>${limit}`);
  return Number(pct.toFixed(6));
}

function numOrStringId(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : s;
}

function assertAmazonMutationOk(json) {
  const rows = Array.isArray(json) ? json : (Array.isArray(json?.results) ? json.results : []);
  if (!rows.length) return;
  const failures = rows.filter((row) => {
    const code = String(row?.code || row?.status || row?.statusCode || '').toLowerCase();
    if (!code) return false;
    return !['success', 'ok', '200', '201', '202', '207'].includes(code);
  });
  if (failures.length) {
    const msg = failures.map((row) => row?.description || row?.message || row?.code || row?.status).filter(Boolean).join('; ');
    throw new Error('ads_mutation_partial_failure:' + String(msg || failures.length).slice(0, 300));
  }
}

function lookupKeywordTargeting(db, userId, storeId, item, body) {
  const typed = item.typedAction || {};
  const entity = item.entity || {};
  const path = typed.entityPath || {};
  const id = body.keywordId || body.targetingId || path.keywordId || path.targetingId || entity.keywordId || entity.targetingId || entity.id;
  if (id) {
    return db.prepare(`SELECT * FROM lx_targetings WHERE id=? AND user_id=? AND store_id=?`).get(String(id), userId, storeId) || null;
  }
  const term = body.keyword || path.keyword || entity.keyword || entity.term;
  const campaignId = body.campaignId || path.campaignId || entity.campaignId;
  const adGroupId = body.adGroupId || path.adGroupId || entity.adGroupId;
  if (!term) return null;
  let sql = `SELECT * FROM lx_targetings WHERE user_id=? AND store_id=? AND type='keyword' AND term=?`;
  const params = [userId, storeId, String(term)];
  if (campaignId) { sql += ' AND campaign_id=?'; params.push(String(campaignId)); }
  if (adGroupId) { sql += ' AND ad_group_id=?'; params.push(String(adGroupId)); }
  sql += ' ORDER BY updated_at DESC LIMIT 1';
  return db.prepare(sql).get(...params) || null;
}

function lookupAdGroup(db, userId, storeId, item, body) {
  const typed = item.typedAction || {};
  const entity = item.entity || {};
  const path = typed.entityPath || {};
  const id = body.adGroupId || path.adGroupId || entity.adGroupId;
  if (!id) return null;
  return db.prepare(`SELECT * FROM lx_ad_groups WHERE id=? AND user_id=? AND store_id=?`).get(String(id), userId, storeId) || null;
}

function lookupCampaign(db, userId, storeId, item, body) {
  const typed = item.typedAction || {};
  const entity = item.entity || {};
  const path = typed.entityPath || {};
  const id = body.campaignId || path.campaignId || entity.campaignId || entity.id;
  if (!id) return null;
  return db.prepare(`SELECT * FROM lx_campaigns WHERE id=? AND user_id=? AND store_id=?`).get(String(id), userId, storeId) || null;
}

function resolveProfile(userId, storeId, body) {
  const creds = getAdsCredentials(userId, storeId);
  const profileId = body.profileId || creds?.profileId;
  if (!profileId) throw new TypeError('ads_profile_id_required');
  if (!creds?.refreshToken) throw new TypeError('ads_refresh_token_required');
  if (creds.status && creds.status !== 'active') throw new TypeError('ads_credentials_not_active');
  return { profileId: String(profileId), region: body.region || creds.region || process.env.ADS_API_DEFAULT_REGION || 'NA' };
}

function validateExecutableItem(item, body) {
  if (!item || item.removedAt) throw new TypeError('action_queue_item_not_found');
  if (item.state === 'executed') throw new TypeError('action_queue_item_already_executed');
  if (item.guardrail?.status === 'blocked' && !body.force) throw new TypeError('guardrail_blocked');
  if (item.guardrail?.status === 'needs_review' && item.state !== 'approved' && !body.force) throw new TypeError('approval_required');
  if (!['queued', 'approved', 'reverted'].includes(item.state)) throw new TypeError('action_queue_state_not_executable');
}

function buildBaseRequest({ item, body, profileId, region, primitive }) {
  return {
    queueItemId: item.id,
    suggestionId: item.suggestionId,
    profileId,
    region,
    primitive,
    typedAction: item.typedAction,
    guardrail: item.guardrail,
    dryRun: false,
    requestedAt: nowIso(),
    confirmation: {
      confirmRealWrite: body.confirmRealWrite === true,
      riskAccepted: body.riskAccepted === true,
      reason: body.reason || null,
    },
  };
}

async function executeKeywordBid({ db, userId, storeId, item, body, profileId, region }) {
  const row = lookupKeywordTargeting(db, userId, storeId, item, body);
  const typed = item.typedAction || {};
  const keywordId = body.keywordId || body.targetingId || row?.id;
  if (!keywordId) throw new TypeError('keyword_targeting_not_found_for_real_write');
  const currentBid = coalesceNumber(body.currentBid, body.currentValue, row?.bid, typed.currentValue?.bid);
  const nextBid = coalesceNumber(body.newBid, body.recommendedBid, body.recommendedValue, typed.recommendedValue?.bid);
  const deltaPct = assertChangeLimit({ current: currentBid, next: nextBid, primitive: 'ADJUST_BID' });
  const update = { keywordId: numOrStringId(keywordId), bid: nextBid };

  const { status, json } = await adsCall({
    userId, storeId, region, profileId,
    endpoint: 'ads.sp.keywords.update',
    path: '/sp/keywords',
    method: 'PUT',
    body: [update],
  });
  assertAmazonMutationOk(json);

  db.prepare(`UPDATE lx_targetings SET bid=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?`)
    .run(nextBid, nowIso(), String(keywordId), userId, storeId);

  return {
    entityKind: 'keyword',
    resourceId: String(keywordId),
    endpoint: 'ads.sp.keywords.update',
    httpStatus: status,
    amazonResponse: json,
    previousValue: { bid: currentBid },
    newValue: { bid: nextBid },
    deltaPct,
  };
}

async function executeAdGroupBid({ db, userId, storeId, item, body, profileId, region }) {
  const row = lookupAdGroup(db, userId, storeId, item, body);
  const typed = item.typedAction || {};
  const adGroupId = body.adGroupId || row?.id;
  if (!adGroupId) throw new TypeError('ad_group_not_found_for_real_write');
  const currentBid = coalesceNumber(body.currentBid, body.currentValue, row?.default_bid, typed.currentValue?.bid);
  const nextBid = coalesceNumber(body.newBid, body.recommendedBid, body.recommendedValue, typed.recommendedValue?.bid);
  const deltaPct = assertChangeLimit({ current: currentBid, next: nextBid, primitive: 'ADJUST_BID' });
  const update = { adGroupId: numOrStringId(adGroupId), defaultBid: nextBid };

  const { status, json } = await adsCall({
    userId, storeId, region, profileId,
    endpoint: 'ads.sp.adGroups.update',
    path: '/sp/adGroups',
    method: 'PUT',
    body: [update],
  });
  assertAmazonMutationOk(json);

  db.prepare(`UPDATE lx_ad_groups SET default_bid=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?`)
    .run(nextBid, nowIso(), String(adGroupId), userId, storeId);

  return {
    entityKind: 'adGroup',
    resourceId: String(adGroupId),
    endpoint: 'ads.sp.adGroups.update',
    httpStatus: status,
    amazonResponse: json,
    previousValue: { defaultBid: currentBid },
    newValue: { defaultBid: nextBid },
    deltaPct,
  };
}

async function executeCampaignBudget({ db, userId, storeId, item, body, profileId, region }) {
  const row = lookupCampaign(db, userId, storeId, item, body);
  const typed = item.typedAction || {};
  const campaignId = body.campaignId || row?.id;
  if (!campaignId) throw new TypeError('campaign_not_found_for_real_write');
  const currentBudget = coalesceNumber(body.currentBudget, body.currentValue, row?.daily_budget, typed.currentValue?.budget);
  const nextBudget = coalesceNumber(body.newBudget, body.recommendedBudget, body.recommendedValue, typed.recommendedValue?.budget);
  const deltaPct = assertChangeLimit({ current: currentBudget, next: nextBudget, primitive: 'ADJUST_BUDGET' });
  const update = { campaignId: numOrStringId(campaignId), dailyBudget: nextBudget };

  const { status, json } = await adsCall({
    userId, storeId, region, profileId,
    endpoint: 'ads.sp.campaigns.update',
    path: '/sp/campaigns',
    method: 'PUT',
    body: [update],
  });
  assertAmazonMutationOk(json);

  db.prepare(`UPDATE lx_campaigns SET daily_budget=?, updated_at=? WHERE id=? AND user_id=? AND store_id=?`)
    .run(nextBudget, nowIso(), String(campaignId), userId, storeId);

  return {
    entityKind: 'campaign',
    resourceId: String(campaignId),
    endpoint: 'ads.sp.campaigns.update',
    httpStatus: status,
    amazonResponse: json,
    previousValue: { dailyBudget: currentBudget },
    newValue: { dailyBudget: nextBudget },
    deltaPct,
  };
}

// @internal — only reachable from executeRealAdsActionQueueItem after the gate.
// Exported for regression tests (M3-P2-18) that assert unsupported primitives
// never silently succeed as real writes.
export async function executeLivePrimitive(args) {
  const primitive = args.item.typedAction?.actionPrimitive || args.body.actionPrimitive;
  if (primitive === 'ADJUST_BUDGET') return executeCampaignBudget(args);
  if (primitive !== 'ADJUST_BID') throw new TypeError('unsupported_real_write_primitive');

  const entityKind = String(args.body.entityKind || args.body.targetKind || '').toLowerCase();
  if (entityKind === 'adgroup' || entityKind === 'ad_group') return executeAdGroupBid(args);
  if (args.body.adGroupId && !args.body.keywordId && !args.body.targetingId) return executeAdGroupBid(args);
  return executeKeywordBid(args);
}

export async function executeRealAdsActionQueueItem(db, userId, storeId, id, body = {}) {
  const item = getActionQueueItem(db, userId, storeId, id);
  validateExecutableItem(item, body);
  const primitive = item.typedAction?.actionPrimitive || body.actionPrimitive;
  const { profileId, region } = resolveProfile(userId, storeId, body);
  assertRealWriteGate({ userId, storeId, profileId, primitive, body });

  const batchId = body.batchId || ('batch-live-' + Date.now().toString(36));
  const requestPayload = buildBaseRequest({ item, body, profileId, region, primitive });

  try {
    const mutation = await executeLivePrimitive({ db, userId, storeId, item, body, profileId, region });
    const responsePayload = {
      realWrite: true,
      provider: 'ads',
      profileId,
      region,
      mutation,
      rollbackPlan: item.rollback || item.rollbackPlan || null,
    };
    return recordActionQueueExternalResult(db, userId, storeId, id, {
      batchId,
      status: 'real_write_success',
      dryRun: false,
      requestPayload: { ...requestPayload, mutationRequest: { endpoint: mutation.endpoint, resourceId: mutation.resourceId } },
      responsePayload,
      auditActionType: 'ACTION_QUEUE_REAL_WRITE',
      chosenAlternativeIndex: body.chosenAlternativeIndex ?? 0,
    });
  } catch (err) {
    recordActionQueueExternalResult(db, userId, storeId, id, {
      batchId,
      status: 'real_write_failed',
      dryRun: false,
      markExecuted: false,
      requestPayload,
      errorMessage: String(err?.message || err).slice(0, 500),
      auditActionType: 'ACTION_QUEUE_REAL_WRITE',
    });
    throw err;
  }
}

export function previewRealAdsWriteGate({ userId, storeId, profileId, primitive, body = {} }) {
  assertRealWriteGate({ userId, storeId, profileId, primitive, body });
  return { ok: true, primitive, profileId, storeId };
}
