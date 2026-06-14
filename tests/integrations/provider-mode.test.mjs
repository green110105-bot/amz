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
const providerModeMod = await import('../../apps/api/src/integrations/provider-mode.mjs');
const {
  providerMode, isMockMode, isRealMode, isHybridMode, shouldSeedMock, listProviderStatus,
  getRealWriteGateState,
} = providerModeMod;
const dataStoreMod = await import('../../apps/api/src/data-store.mjs');

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

test('X-P1-06: shouldSeedMock fails CLOSED (false) when the credential DB query throws', () => {
  process.env.DATA_PROVIDER_MODE = 'hybrid'; // not real, so the DB path is exercised
  const orig = dataStoreMod.getDbInstance;
  // Stub getDbInstance so the prepared statement throws — simulates a DB hiccup.
  const realPrepare = orig().prepare.bind(orig());
  const stubDb = { prepare() { throw new Error('db_unavailable'); } };
  // Monkeypatch via property on the live db instance: easier to throw from prepare.
  const liveDb = orig();
  const savedPrepare = liveDb.prepare;
  liveDb.prepare = () => { throw new Error('db_unavailable'); };
  try {
    assert.equal(shouldSeedMock('u-pm', 's-pm'), false, 'must NOT fail-open to seeding mock on DB error');
  } finally {
    liveDb.prepare = savedPrepare;
    void realPrepare; void stubDb;
  }
});

test('AUTH-04: getRealWriteGateState truth table — armed only when env+!mock+allowlist', () => {
  const save = {
    enabled: process.env.ADS_REAL_WRITES_ENABLED,
    legacy: process.env.REAL_WRITES_ENABLED,
    mock: process.env.ADS_API_MOCK,
    allow: process.env.ADS_REAL_WRITES_STORE_ALLOWLIST,
  };
  try {
    // All off → disabled.
    delete process.env.ADS_REAL_WRITES_ENABLED;
    delete process.env.REAL_WRITES_ENABLED;
    delete process.env.ADS_API_MOCK;
    delete process.env.ADS_REAL_WRITES_STORE_ALLOWLIST;
    let g = getRealWriteGateState();
    assert.equal(g.realWriteEnabled, false);
    assert.equal(g.envGate, false);
    assert.equal(g.mockExclusive, true);
    assert.equal(g.allowlistConfigured, false);

    // env on but no allowlist → still disabled.
    process.env.ADS_REAL_WRITES_ENABLED = 'true';
    g = getRealWriteGateState();
    assert.equal(g.envGate, true);
    assert.equal(g.allowlistConfigured, false);
    assert.equal(g.realWriteEnabled, false);

    // env on + allowlist but mock on → mockExclusive false → disabled.
    process.env.ADS_REAL_WRITES_STORE_ALLOWLIST = '*';
    process.env.ADS_API_MOCK = 'true';
    g = getRealWriteGateState();
    assert.equal(g.mockExclusive, false);
    assert.equal(g.realWriteEnabled, false);

    // env on + allowlist + !mock → ARMED.
    process.env.ADS_API_MOCK = 'false';
    g = getRealWriteGateState();
    assert.equal(g.envGate, true);
    assert.equal(g.mockExclusive, true);
    assert.equal(g.allowlistConfigured, true);
    assert.equal(g.realWriteEnabled, true);
  } finally {
    if (save.enabled === undefined) delete process.env.ADS_REAL_WRITES_ENABLED; else process.env.ADS_REAL_WRITES_ENABLED = save.enabled;
    if (save.legacy === undefined) delete process.env.REAL_WRITES_ENABLED; else process.env.REAL_WRITES_ENABLED = save.legacy;
    if (save.mock === undefined) delete process.env.ADS_API_MOCK; else process.env.ADS_API_MOCK = save.mock;
    if (save.allow === undefined) delete process.env.ADS_REAL_WRITES_STORE_ALLOWLIST; else process.env.ADS_REAL_WRITES_STORE_ALLOWLIST = save.allow;
  }
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
