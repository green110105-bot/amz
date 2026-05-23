#!/usr/bin/env node
// Seed SP-API credentials into store_credentials for a single (user, store).
// Refresh token MUST be passed via SPAPI_REFRESH_TOKEN env var (NOT --refresh-token flag)
// so it doesn't show up in shell history / ps output.
//
// Usage:
//   SPAPI_REFRESH_TOKEN='Atzr|...' node scripts/seed-spapi-credentials.mjs \
//     --user u-demo \
//     --store s-my-us \
//     --selling-partner-id A3OYHV16L0M3KK \
//     --region NA \
//     --marketplace ATVPDKIKX0DER
//
// On success: prints { ok: true, userId, storeId, status: 'active' } and exits 0.

import { upsertSpApiCredentials, getSpApiCredentials } from '../apps/api/src/integrations/sp-api/credentials.mjs';
import { getDbInstance } from '../apps/api/src/data-store.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) { out[key] = true; }
    else { out[key] = val; i += 1; }
  }
  return out;
}

function die(msg, code = 1) {
  console.error('[seed-spapi] ' + msg);
  process.exit(code);
}

const args = parseArgs(process.argv);
const userId = args.user;
const storeId = args.store;
const sellingPartnerId = args['selling-partner-id'];
const region = args.region || 'NA';
const marketplaceCsv = args.marketplace;
const refreshToken = process.env.SPAPI_REFRESH_TOKEN;
const dryRun = !!args['dry-run'];

if (!userId) die('--user is required');
if (!storeId) die('--store is required');
if (!marketplaceCsv) die('--marketplace is required (CSV, e.g. ATVPDKIKX0DER)');
if (!refreshToken) die('SPAPI_REFRESH_TOKEN env var is required (do NOT pass via CLI flag)');
if (!process.env.CREDENTIAL_ENC_KEY) die('CREDENTIAL_ENC_KEY env var is required');
if (!process.env.SPAPI_LWA_CLIENT_ID || !process.env.SPAPI_LWA_CLIENT_SECRET) {
  die('SPAPI_LWA_CLIENT_ID and SPAPI_LWA_CLIENT_SECRET env vars are required');
}

const db = getDbInstance();

// Ensure user + store rows exist so the FK-like relationships work.
const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
if (!user) {
  if (dryRun) die(`user ${userId} not found (dry-run)`, 2);
  db.prepare(`INSERT INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, userId, `${userId}@local`, 'admin', 'seeded', new Date().toISOString());
  console.error(`[seed-spapi] created missing user ${userId}`);
}
const store = db.prepare('SELECT id FROM user_stores WHERE id = ? AND user_id = ?').get(storeId, userId);
if (!store) {
  if (dryRun) die(`store ${storeId} not found under ${userId} (dry-run)`, 2);
  db.prepare(`INSERT INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(storeId, userId, `${storeId} (seeded)`, region, region === 'NA' ? 'USD' : 'EUR',
         marketplaceCsv.split(',')[0], 0, 0, new Date().toISOString());
  console.error(`[seed-spapi] created missing store ${storeId}`);
}

if (dryRun) {
  console.log(JSON.stringify({
    ok: true, dryRun: true, userId, storeId, sellingPartnerId, region,
    marketplaceIds: marketplaceCsv.split(',').map((s) => s.trim()).filter(Boolean),
    refreshTokenLen: refreshToken.length,
  }, null, 2));
  process.exit(0);
}

upsertSpApiCredentials({
  userId, storeId,
  sellingPartnerId,
  region,
  marketplaceIds: marketplaceCsv.split(',').map((s) => s.trim()).filter(Boolean),
  refreshToken,
});

const verify = getSpApiCredentials(userId, storeId);
if (!verify || verify.status !== 'active') die('post-seed verification failed', 3);
if (verify.refreshToken !== refreshToken) die('refresh token round-trip mismatch', 3);

console.log(JSON.stringify({
  ok: true,
  userId,
  storeId,
  sellingPartnerId: verify.sellingPartnerId,
  region: verify.region,
  marketplaceIds: verify.marketplaceIds,
  status: verify.status,
}, null, 2));
