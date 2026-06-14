// AUTH-15: cross-module real-vs-mock determination must be driven by source
// meta, not readiness. When ADS_API_MOCK=1 the Ads adapter answers from local
// fixtures, so the diagnostics live checks must be tagged source:'fixture' and
// m3Impact.m3DataMode must be 'ads_mock_fixture'. Frontend consumers key off
// that source meta (not readiness) to render the Mock Fixture warning + label
// and to grey out real-sync buttons (asserted in the web skeleton test).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-auth-fixture-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
// Ads in mock fixture mode — no real LWA env needed.
process.env.ADS_API_MOCK = '1';
process.env.ADS_API_DEFAULT_REGION = 'NA';

// Network must never be hit in mock fixture mode.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error('network_blocked_in_mock_' + String(url)); };

const { getDbInstance, authenticate, registerUser } = await import('../../apps/api/src/data-store.mjs');
const { upsertAdsCredentials } = await import('../../apps/api/src/integrations/ads-api/credentials.mjs');
const { buildAmazonAuthorizationDiagnostics } = await import('../../apps/api/src/integrations/authorization-diagnostics.mjs');

const reg = registerUser({ email: 'authfixture@local.test', password: 'pw123456', name: 'Auth Fixture' });
const userId = reg.user.id;
authenticate('authfixture@local.test', 'pw123456');
const db = getDbInstance();
const storeId = db.prepare(`SELECT id FROM user_stores WHERE user_id=? LIMIT 1`).get(userId).id;
// Store an ads credential + profileId so the live probe is not skipped.
upsertAdsCredentials({ userId, storeId, refreshToken: 'Atzr|fixture-refresh-token-secret', profileId: '12345', region: 'NA' });

test('AUTH-15(a): Ads mock live checks are tagged source:fixture and m3DataMode=ads_mock_fixture', async () => {
  const diag = await buildAmazonAuthorizationDiagnostics({
    userId, storeId, provider: 'ads', liveProbe: true, apiProbe: true,
  });
  const ads = diag.providers.find((p) => p.provider === 'ads');
  assert.ok(ads, 'ads provider present');
  assert.equal(ads.liveProbe.status, 'ok');
  assert.equal(ads.liveProbe.source, 'fixture');
  // every live check is tagged as fixture-sourced, never live
  assert.ok(ads.liveProbe.checks.length >= 1);
  for (const c of ads.liveProbe.checks) {
    assert.equal(c.source, 'fixture', `check ${c.name} must be source:fixture in mock mode`);
  }
  // m3DataMode drives downstream real-vs-mock rendering
  assert.equal(diag.m3Impact.m3DataMode, 'ads_mock_fixture');
  assert.equal(diag.m3Impact.realWriteEnabled, false);
  // no real green-light: env reports mock endpoint mode
  assert.equal(diag.environment.ads.mock, true);
  assert.equal(diag.environment.ads.endpointMode, 'mock');
});

process.on('exit', () => { globalThis.fetch = realFetch; });
