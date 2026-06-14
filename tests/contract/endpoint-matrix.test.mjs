// W15 — Endpoint contract matrix: which legacy /api/v1/* read endpoints have a
// DB (scoped) branch vs are mock-only. This locks the "paid inversion"
// (付费倒挂) scope so regressions are caught.
//
// Resolved (scoped -> sourceMode:'db'):  ads/suggestions, dashboard
// Known blockers (mock-only even when scoped): inventory/decisions, monitor/overview,
//   profit/overview  -- registered here so any future DB branch is detected.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-endpoint-matrix-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.DATA_PROVIDER_MODE = 'hybrid';

const ds = await import('../../apps/api/src/data-store.mjs');
const { handleExtendedRequest } = await import('../../apps/api/src/extended-routes.mjs');

const reg = ds.registerUser({ email: 'matrix@local.test', password: 'pw123456', name: 'Matrix' });
const userId = reg.user.id;
const token = ds.authenticate('matrix@local.test', 'pw123456').token;
const db = ds.getDbInstance();
const storeId = db.prepare('SELECT id FROM user_stores WHERE user_id=? LIMIT 1').get(userId).id;

function scopedReq(path) {
  return new Request('http://localhost' + path, {
    headers: { authorization: 'Bearer ' + token, 'x-store-id': storeId },
  });
}

// The contract matrix. dbBranch=true => scoped request must return sourceMode:'db'.
// dbBranch=false => registered known blocker (still mock when scoped).
const MATRIX = [
  { path: '/api/v1/ads/suggestions', dbBranch: true },
  { path: '/api/v1/dashboard', dbBranch: true },
  { path: '/api/v1/inventory/decisions', dbBranch: false },
  { path: '/api/v1/monitor/overview', dbBranch: false },
  { path: '/api/v1/profit/overview', dbBranch: false },
];

for (const entry of MATRIX) {
  test(`contract matrix: ${entry.path} dbBranch=${entry.dbBranch}`, async () => {
    const res = await handleExtendedRequest(scopedReq(entry.path));
    assert.equal(res.status, 200, `${entry.path} should respond 200`);
    const body = await res.json();
    if (entry.dbBranch) {
      assert.equal(body.sourceMode, 'db', `${entry.path} scoped request should return sourceMode:'db'`);
    } else {
      // Known blocker: still mock-only when scoped. If this ever becomes 'db',
      // update the matrix (the inversion was fixed) — failing on purpose alerts us.
      assert.notEqual(body.sourceMode, 'db', `${entry.path} is a registered mock-only blocker; promote it in MATRIX if a DB branch was added`);
    }
  });
}
