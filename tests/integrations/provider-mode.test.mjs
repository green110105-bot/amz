import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-provider-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'tid';
process.env.SPAPI_LWA_CLIENT_SECRET = 'tsec';

const { getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const { upsertSpApiCredentials, revokeSpApiCredentials } = await import('../../apps/api/src/integrations/sp-api/credentials.mjs');
const {
  providerMode, isMockMode, isRealMode, isHybridMode, shouldSeedMock, listProviderStatus,
} = await import('../../apps/api/src/integrations/provider-mode.mjs');

// Setup baseline user/store fixture
const db = getDbInstance();
db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`)
  .run('u-pm', 'pm', 'pm@local', 'admin', 'x', new Date().toISOString());
db.prepare(`INSERT OR REPLACE INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?,?)`)
  .run('s-pm', 'u-pm', 'PM US', 'US', 'USD', 'ATVPDKIKX0DER', 0, 0, new Date().toISOString());

test('providerMode defaults to hybrid', () => {
  delete process.env.DATA_PROVIDER_MODE;
  assert.equal(providerMode(), 'hybrid');
  assert.equal(isHybridMode(), true);
  assert.equal(isMockMode(), false);
  assert.equal(isRealMode(), false);
});

test('providerMode honours DATA_PROVIDER_MODE=mock', () => {
  process.env.DATA_PROVIDER_MODE = 'mock';
  assert.equal(providerMode(), 'mock');
  assert.equal(isMockMode(), true);
});

test('providerMode honours DATA_PROVIDER_MODE=real', () => {
  process.env.DATA_PROVIDER_MODE = 'real';
  assert.equal(providerMode(), 'real');
  assert.equal(isRealMode(), true);
});

test('providerMode falls back to hybrid on invalid value', () => {
  process.env.DATA_PROVIDER_MODE = 'gibberish';
  assert.equal(providerMode(), 'hybrid');
});

test('shouldSeedMock=true when no credentials, hybrid mode', () => {
  process.env.DATA_PROVIDER_MODE = 'hybrid';
  assert.equal(shouldSeedMock('u-pm', 's-pm'), true);
});

test('shouldSeedMock=false when DATA_PROVIDER_MODE=real (always)', () => {
  process.env.DATA_PROVIDER_MODE = 'real';
  assert.equal(shouldSeedMock('u-pm', 's-pm'), false);
});

test('shouldSeedMock=false when active credentials exist (hybrid)', () => {
  process.env.DATA_PROVIDER_MODE = 'hybrid';
  upsertSpApiCredentials({
    userId: 'u-pm', storeId: 's-pm',
    refreshToken: 'Atzr|test',
    marketplaceIds: ['ATVPDKIKX0DER'],
    region: 'NA',
  });
  assert.equal(shouldSeedMock('u-pm', 's-pm'), false);
});

test('shouldSeedMock=true again after credentials revoked', () => {
  revokeSpApiCredentials('u-pm', 's-pm');
  assert.equal(shouldSeedMock('u-pm', 's-pm'), true);
});

test('listProviderStatus shape: mode + providers + recentSyncs', () => {
  process.env.DATA_PROVIDER_MODE = 'hybrid';
  // Re-add active credentials
  upsertSpApiCredentials({
    userId: 'u-pm', storeId: 's-pm',
    refreshToken: 'Atzr|test',
    marketplaceIds: ['ATVPDKIKX0DER', 'A2EUQ1WTGCTBG2'],
    region: 'NA',
    sellingPartnerId: 'A1B2C3',
  });
  // Drop a sync_runs row
  db.prepare(`INSERT INTO sync_runs (id,user_id,store_id,provider,endpoint,status,started_at,ended_at,records_in)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
      'syr-x', 'u-pm', 's-pm', 'spapi', 'orders.getOrders', 'ok',
      new Date().toISOString(), new Date().toISOString(), 5,
    );
  const status = listProviderStatus('u-pm', 's-pm');
  assert.equal(status.mode, 'hybrid');
  assert.ok(Array.isArray(status.providers));
  const sp = status.providers.find((p) => p.provider === 'spapi');
  assert.ok(sp);
  assert.equal(sp.sellingPartnerId, 'A1B2C3');
  assert.deepEqual(sp.marketplaceIds, ['ATVPDKIKX0DER', 'A2EUQ1WTGCTBG2']);
  assert.equal(sp.status, 'active');
  assert.ok(Array.isArray(status.recentSyncs));
  assert.ok(status.recentSyncs.find((r) => r.id === 'syr-x' || r.endpoint === 'orders.getOrders'));
});
