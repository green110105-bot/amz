#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function arg(name, fallback = null) {
  const idx = process.argv.indexOf('--' + name);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

function die(message) {
  console.error('[ads-smoke-write] ' + message);
  process.exit(1);
}

function num(name, fallback = null) {
  const value = arg(name, fallback);
  if (value === null || value === undefined || value === true) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) die(`--${name} must be a number`);
  return n;
}

function nowIso() { return new Date().toISOString(); }

function insertSmokeQueueItem(db, { userId, storeId, queueId, keywordId, campaignId, adGroupId, currentBid, newBid }) {
  const now = nowIso();
  db.prepare(`INSERT OR REPLACE INTO ad_action_queue(
    id,user_id,store_id,suggestion_id,source_strategy_id,source_strategy_name,state,priority_score,severity,entity,
    typed_action,evidence_refs,guardrail,rollback_plan,impact_estimate,source_meta,confidence_breakdown,dry_run,audit_required,note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      queueId, userId, storeId, null, null, 'live smoke write', 'approved', 100,
      JSON.stringify({ level: 'P0', source: 'live_smoke' }),
      JSON.stringify({ targetingId: String(keywordId), campaignId: campaignId || null, adGroupId: adGroupId || null }),
      JSON.stringify({
        actionPrimitive: 'ADJUST_BID',
        entityPath: { targetingId: String(keywordId), keywordId: String(keywordId), campaignId: campaignId || null, adGroupId: adGroupId || null },
        currentValue: { bid: currentBid },
        recommendedValue: { bid: newBid },
        dryRun: true,
        auditRequired: true,
      }),
      JSON.stringify([{ source: 'operator_cli', tabKey: 'smoke_write', metricKeys: ['bid'] }]),
      JSON.stringify({ status: 'needs_review', dryRunOnly: false, reasons: [], gates: { cliConfirm: true } }),
      JSON.stringify({ method: 'restore_previous_bid', previousValue: { bid: currentBid } }),
      JSON.stringify({ expected: 'single keyword bid smoke write' }),
      JSON.stringify({ source: 'operator_cli', realWriteEnabled: true }),
      JSON.stringify({ operator: 1 }),
      1, 1, 'created by scripts/live-ads-smoke-write.mjs', now, now,
    );
}

loadDotEnv(arg('env', '.env'));

const userId = arg('user-id', process.env.AMZ_DIAG_USER_ID || 'u-demo');
const storeId = arg('store-id', process.env.AMZ_DIAG_STORE_ID || 's-my-us');
const profileId = arg('profile-id', process.env.ADS_PROFILE_ID);
const queueId = arg('queue-id', 'aq-live-smoke-' + randomBytes(3).toString('hex'));
const keywordId = arg('keyword-id');
const campaignId = arg('campaign-id');
const adGroupId = arg('ad-group-id');
const currentBid = num('current-bid');
const newBid = num('new-bid');
const confirm = process.argv.includes('--confirm');

if (!confirm) die('refusing real write without --confirm');
if (!profileId) die('--profile-id or ADS_PROFILE_ID is required');
if (!keywordId) die('--keyword-id is required for the smoke write');
if (!(currentBid > 0) || !(newBid > 0)) die('--current-bid and --new-bid must be positive');
if (process.env.ADS_REAL_WRITES_ENABLED !== 'true') die('ADS_REAL_WRITES_ENABLED=true is required');
if (process.env.ADS_API_MOCK === 'true') die('ADS_API_MOCK must be false for a real smoke write');

const { getDbInstance } = await import('../apps/api/src/data-store.mjs');
const { upsertAdsCredentials } = await import('../apps/api/src/integrations/ads-api/credentials.mjs');
const { executeRealAdsActionQueueItem } = await import('../apps/api/src/integrations/ads-api/live-action-executor.mjs');

const db = getDbInstance();
if (process.env.ADS_REFRESH_TOKEN) {
  upsertAdsCredentials({
    userId,
    storeId,
    refreshToken: process.env.ADS_REFRESH_TOKEN,
    profileId,
    region: process.env.ADS_API_DEFAULT_REGION || 'NA',
  });
}

insertSmokeQueueItem(db, { userId, storeId, queueId, keywordId, campaignId, adGroupId, currentBid, newBid });

const result = await executeRealAdsActionQueueItem(db, userId, storeId, queueId, {
  realWriteEnabled: true,
  confirmRealWrite: true,
  riskAccepted: true,
  profileId,
  keywordId,
  campaignId,
  adGroupId,
  currentBid,
  newBid,
  reason: arg('reason', 'live ads smoke write'),
});

console.log(JSON.stringify({
  ok: true,
  queueId,
  state: result.state,
  latestRun: {
    id: result.latestRun?.id,
    status: result.latestRun?.status,
    dryRun: result.latestRun?.dryRun,
    responsePayload: result.latestRun?.responsePayload,
  },
}, null, 2));
