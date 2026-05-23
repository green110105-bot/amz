#!/usr/bin/env node
// End-to-end sandbox smoke:
//   1. Read stored refresh_token (decrypts via CREDENTIAL_ENC_KEY)
//   2. Exchange refresh_token → access_token at LWA (real network)
//   3. Call sandbox SP-API /sellers/v1/marketplaceParticipations (real network)
//   4. Verify sync_runs audit row appended
//
// Required env: CREDENTIAL_ENC_KEY, SPAPI_LWA_CLIENT_ID, SPAPI_LWA_CLIENT_SECRET, SPAPI_USE_SANDBOX=true
// Required CLI: --user, --store

import { spapiCall } from '../apps/api/src/integrations/sp-api/client.mjs';
import { getAccessToken } from '../apps/api/src/integrations/sp-api/auth.mjs';
import { getDbInstance } from '../apps/api/src/data-store.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    out[a.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}
const args = parseArgs(process.argv);
const userId = args.user || 'u-demo';
const storeId = args.store || 's-my-us';

console.log(`[smoke] user=${userId} store=${storeId} sandbox=${process.env.SPAPI_USE_SANDBOX}`);

try {
  console.log('[smoke] step 1/3 — exchanging refresh_token for access_token at LWA…');
  const t0 = Date.now();
  const token = await getAccessToken(userId, storeId);
  const tokenMs = Date.now() - t0;
  console.log(`[smoke] OK in ${tokenMs}ms — access_token = ${token.slice(0, 12)}… (length ${token.length})`);

  console.log('[smoke] step 2/3 — calling sandbox /sellers/v1/marketplaceParticipations…');
  const t1 = Date.now();
  const { status, json } = await spapiCall({
    userId, storeId,
    endpoint: 'orders.getOrders', // reuse bucket; this is just a probe
    path: '/sellers/v1/marketplaceParticipations',
  });
  const callMs = Date.now() - t1;
  console.log(`[smoke] OK in ${callMs}ms — http ${status}`);
  console.log('[smoke] response payload:');
  console.log(JSON.stringify(json, null, 2));

  console.log('[smoke] step 3/3 — verifying sync_runs audit row…');
  const db = getDbInstance();
  const row = db.prepare(`SELECT id, endpoint, status, records_in, error_code FROM sync_runs
    WHERE user_id=? AND store_id=? ORDER BY started_at DESC LIMIT 1`).get(userId, storeId);
  console.log('[smoke] latest sync_runs row:');
  console.log(JSON.stringify(row, null, 2));

  if (!row || row.status !== 'ok') {
    console.error('[smoke] FAIL — sync_runs status not ok');
    process.exit(2);
  }
  console.log('\n[smoke] ALL GREEN — sandbox SP-API end-to-end works.');
} catch (err) {
  console.error('[smoke] FAIL:', err?.message || err);
  if (err?.body) console.error('[smoke] response body:', JSON.stringify(err.body, null, 2));
  process.exit(1);
}
