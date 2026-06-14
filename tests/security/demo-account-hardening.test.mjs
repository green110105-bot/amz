// Production hardening for the public demo account (deep-rebuild 2026-06).
// Covers: DISABLE_DEMO_USER skips the seed entirely; DEMO_PASSWORD overrides the
// weak default. Each scenario uses an isolated DB + a fresh module import so the
// env is read at getDb() time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

function freshEnv(extra) {
  const dir = mkdtempSync(join(tmpdir(), 'amz-demo-'));
  process.env.DATA_DB_PATH = join(dir, 'store.db');
  process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
  delete process.env.DISABLE_DEMO_USER;
  delete process.env.DEMO_PASSWORD;
  Object.assign(process.env, extra);
}

test('DISABLE_DEMO_USER=true: no demo account is seeded (login impossible)', async () => {
  freshEnv({ DISABLE_DEMO_USER: 'true' });
  const ds = await import('../../apps/api/src/data-store.mjs?case=disabled');
  const db = ds.getDbInstance();
  const row = db.prepare('SELECT id FROM users WHERE email=?').get('demo@amz.local');
  assert.equal(row, undefined, 'demo user must not exist when disabled');
  assert.equal(ds.authenticate('demo@amz.local', 'demo'), null, 'demo/demo login must fail');
});

test('DEMO_PASSWORD overrides the weak default; plain demo/demo no longer works', async () => {
  const strong = 'S7r0ng-' + randomBytes(6).toString('hex');
  freshEnv({ DEMO_PASSWORD: strong });
  const ds = await import('../../apps/api/src/data-store.mjs?case=override');
  // weak default rejected
  assert.equal(ds.authenticate('demo@amz.local', 'demo'), null, 'default demo password must be rejected');
  // configured password accepted
  const ok = ds.authenticate('demo@amz.local', strong);
  assert.ok(ok && ok.token, 'configured DEMO_PASSWORD must authenticate');
});

test('default (no env): demo/demo still works for local dev convenience', async () => {
  freshEnv({});
  const ds = await import('../../apps/api/src/data-store.mjs?case=default');
  const ok = ds.authenticate('demo@amz.local', 'demo');
  assert.ok(ok && ok.token, 'demo/demo works by default for local dev');
});
