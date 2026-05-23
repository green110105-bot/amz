import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Isolate test DB + provide an encryption key BEFORE importing modules that read env.
const tmpDir = mkdtempSync(join(tmpdir(), 'amz-spapi-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.SPAPI_LWA_CLIENT_ID = 'test-client-id';
process.env.SPAPI_LWA_CLIENT_SECRET = 'test-client-secret';

const { encryptToken, decryptToken, isCredentialEncryptionReady } = await import('../../apps/api/src/integrations/crypto/token-cipher.mjs');
const { acquire, _resetForTests, snapshot } = await import('../../apps/api/src/integrations/sp-api/rate-limiter.mjs');
const { getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const {
  upsertSpApiCredentials, getSpApiCredentials,
  setSpApiAccessToken, recordSpApiError, revokeSpApiCredentials,
} = await import('../../apps/api/src/integrations/sp-api/credentials.mjs');

test('token-cipher: round-trip encrypts/decrypts to original plaintext', () => {
  assert.equal(isCredentialEncryptionReady(), true);
  const plain = 'Atzr|FAKE-refresh-token-' + randomBytes(8).toString('hex');
  const ct = encryptToken(plain);
  assert.notEqual(ct, plain);
  assert.equal(ct.split('.').length, 3);
  assert.equal(decryptToken(ct), plain);
});

test('token-cipher: tampered ciphertext fails authentication', () => {
  const ct = encryptToken('secret');
  const [iv, tag, enc] = ct.split('.');
  const tampered = [iv, tag, enc.slice(0, -2) + 'AA'].join('.');
  assert.throws(() => decryptToken(tampered));
});

test('token-cipher: missing key throws', () => {
  const k = process.env.CREDENTIAL_ENC_KEY;
  delete process.env.CREDENTIAL_ENC_KEY;
  try {
    assert.throws(() => encryptToken('x'), /credential_enc_key_missing/);
  } finally {
    process.env.CREDENTIAL_ENC_KEY = k;
  }
});

test('schema: initSpApiSchema creates store_credentials + sync_runs', () => {
  const db = getDbInstance();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('store_credentials','sync_runs')`).all();
  assert.equal(tables.length, 2);
});

test('credentials: upsert → get round-trip with encryption at rest', () => {
  const db = getDbInstance();
  // Need a user + store row first (FK is implicit via user_stores update).
  db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,password_hash,created_at) VALUES (?,?,?,?,?,?)`)
    .run('u-test', 'Test', 'test@amz.local', 'admin', 'x', new Date().toISOString());
  db.prepare(`INSERT OR REPLACE INTO user_stores(id,user_id,name,region,currency,marketplace_id,sp_api_authorized,ads_api_authorized,added_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run('s-test', 'u-test', 'Test US', 'US', 'USD', 'ATVPDKIKX0DER', 0, 0, new Date().toISOString());

  upsertSpApiCredentials({
    userId: 'u-test', storeId: 's-test',
    sellingPartnerId: 'A1B2C3D4',
    region: 'NA',
    marketplaceIds: ['ATVPDKIKX0DER', 'A2EUQ1WTGCTBG2'],
    refreshToken: 'Atzr|TEST-refresh-token',
  });

  const row = db.prepare(`SELECT refresh_token_enc, marketplace_ids FROM store_credentials WHERE user_id=? AND store_id=? AND provider='spapi'`).get('u-test', 's-test');
  assert.ok(row);
  assert.notEqual(row.refresh_token_enc, 'Atzr|TEST-refresh-token', 'token must be encrypted at rest');
  assert.equal(row.marketplace_ids, 'ATVPDKIKX0DER,A2EUQ1WTGCTBG2');

  const got = getSpApiCredentials('u-test', 's-test');
  assert.equal(got.refreshToken, 'Atzr|TEST-refresh-token');
  assert.equal(got.region, 'NA');
  assert.deepEqual(got.marketplaceIds, ['ATVPDKIKX0DER', 'A2EUQ1WTGCTBG2']);
  assert.equal(got.status, 'active');

  // user_stores side-effect flag
  const us = db.prepare(`SELECT sp_api_authorized FROM user_stores WHERE id=?`).get('s-test');
  assert.equal(us.sp_api_authorized, 1);
});

test('credentials: setAccessToken caches encrypted access_token + expiry', () => {
  setSpApiAccessToken('u-test', 's-test', 'Atza|FAKE-access', new Date(Date.now() + 3600 * 1000).toISOString());
  const got = getSpApiCredentials('u-test', 's-test');
  assert.equal(got.accessToken, 'Atza|FAKE-access');
  assert.ok(got.accessTokenExpiresAt && Date.parse(got.accessTokenExpiresAt) > Date.now());
});

test('credentials: recordError populates last_error/last_error_at', () => {
  recordSpApiError('u-test', 's-test', 'http_401', 'bad token');
  const got = getSpApiCredentials('u-test', 's-test');
  assert.match(got.lastError || '', /http_401/);
  assert.ok(got.lastErrorAt);
});

test('credentials: revoke clears tokens + flips user_stores flag off', () => {
  revokeSpApiCredentials('u-test', 's-test');
  const got = getSpApiCredentials('u-test', 's-test');
  assert.equal(got.status, 'revoked');
  assert.equal(got.refreshToken, null);
  assert.equal(got.accessToken, null);
  const us = getDbInstance().prepare(`SELECT sp_api_authorized FROM user_stores WHERE id=?`).get('s-test');
  assert.equal(us.sp_api_authorized, 0);
});

test('rate-limiter: burst tokens drain near-instantly; bucket state visible in snapshot', async () => {
  _resetForTests();
  const key = 'u-test:s-test';
  // Use a high-rate endpoint so we don't sit through 60s of refill in the throttle assertion below.
  const ep = 'orders.getOrderItems'; // burst 30, rate 0.5/sec
  const t0 = Date.now();
  for (let i = 0; i < 30; i++) {
    await acquire(key, ep);
  }
  const drainMs = Date.now() - t0;
  assert.ok(drainMs < 500, `burst drain too slow: ${drainMs}ms`);

  const snap = snapshot();
  const k = `${key}::${ep}`;
  assert.ok(snap[k], `snapshot missing ${k}`);
  assert.ok(snap[k].tokens < 1, `bucket should be drained, tokens=${snap[k].tokens}`);
  assert.equal(snap[k].burst, 30);
});

test('rate-limiter: throttles when burst exhausted (using fast endpoint)', async () => {
  _resetForTests();
  const key = 'u-test:s-throttle';
  const ep = 'orders.getOrderItems'; // 0.5/sec → 1 token needs ~2s, well bounded
  for (let i = 0; i < 30; i++) await acquire(key, ep); // drain burst
  const t1 = Date.now();
  await acquire(key, ep);
  const waitMs = Date.now() - t1;
  assert.ok(waitMs >= 50, `should have waited for refill, got ${waitMs}ms`);
  assert.ok(waitMs < 5000, `refill wait suspiciously long: ${waitMs}ms`);
});
