// Regression test for M4-R1: revertM4Action was reading audit payload off the
// outer log object, but M4 audit helpers nest domain data under .payload, so
// inverse actions never executed (audit row flipped but no real revert).
// Fix: revertM4Action now extracts parsed.payload || parsed.
//
// These tests target the EFFECTS of revert dispatch, not just the audit flag.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-m4-revert-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.ADS_API_MOCK = 'true';

globalThis.fetch = async () => { throw new Error('blocked'); };

const { authenticate, registerUser, getDbInstance, revertAuditLog } = await import('../../apps/api/src/data-store.mjs');

const reg = registerUser({ email: 'm4r@local', password: 'pw1234', name: 'M4Revert' });
const userId = reg.user.id;
authenticate('m4r@local', 'pw1234');
const db = getDbInstance();
const storeId = db.prepare(`SELECT id FROM user_stores WHERE user_id=? LIMIT 1`).get(userId).id;

const ANOM_INSERT_SQL = `
  INSERT INTO m4_anomalies
    (id,user_id,store_id,anomaly_code,category,severity,status,title,assignee_user_id,detected_at,sla_minutes,sla_deadline,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`;

function seedAnomaly({ id, status, assignee }) {
  const now = new Date().toISOString();
  const sla = new Date(Date.now() + 3600_000).toISOString();
  db.prepare(ANOM_INSERT_SQL).run(
    id, userId, storeId, 'rating_drop', 'reviews', 'high', status, 'Anomaly ' + id,
    assignee, now, 60, sla, now, now,
  );
}

function seedAuditRow({ id, actionType, resourceId, payload }) {
  const log = { sourceModule: 'M4', actionType, resourceId, payload };
  db.prepare(`INSERT INTO audit_logs
    (id,user_id,store_id,source_module,action_type,resource_type,resource_id,status,executed_at,payload)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, 'M4', actionType, 'm4_anomalies', resourceId, 'success',
      new Date().toISOString(), JSON.stringify(log),
    );
}

test('M4-R1 fix: nested-payload revert restores anomaly previousValues', () => {
  seedAnomaly({ id: 'anom-1', status: 'assigned', assignee: 'u-other' });
  seedAuditRow({
    id: 'a-test-m4r1',
    actionType: 'ANOMALY_ASSIGN',
    resourceId: 'anom-1',
    payload: { previousValues: { status: 'open', assigneeUserId: null } },
  });
  const result = revertAuditLog(userId, storeId, 'a-test-m4r1', 'test');
  assert.ok(result);
  assert.equal(result.reverted, true);
  const anom = db.prepare(`SELECT status, assignee_user_id FROM m4_anomalies WHERE id=?`).get('anom-1');
  assert.equal(anom.status, 'open', 'status reverts to open');
  assert.equal(anom.assignee_user_id, null, 'assignee reverts to null');
});

test('M4-R1 fix: M3_PAUSE_ADS_FROM_M4 revert really re-enables campaigns', () => {
  const now = new Date().toISOString();
  for (const cid of ['cmp-rev-1', 'cmp-rev-2']) {
    db.prepare(`INSERT INTO lx_campaigns (id,user_id,store_id,name,type,enabled,state,service_state,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        cid, userId, storeId, cid, 'SP', 0, '已暂停', '广告活动已暂停', now, now,
      );
  }
  seedAuditRow({
    id: 'a-pause-rev',
    actionType: 'M3_PAUSE_ADS_FROM_M4',
    resourceId: 'h-test',
    payload: { pausedCampaignIds: ['cmp-rev-1', 'cmp-rev-2'], hijackId: 'h-test' },
  });
  const result = revertAuditLog(userId, storeId, 'a-pause-rev', 'test');
  assert.ok(result);
  assert.equal(result.reverted, true);
  // BUG WAS HERE: revert previously read payload.pausedCampaignIds instead of payload.payload.pausedCampaignIds
  // so campaigns stayed paused even though the audit row showed reverted=1.
  const cmps = db.prepare(`SELECT id, enabled, state FROM lx_campaigns WHERE id IN ('cmp-rev-1', 'cmp-rev-2') ORDER BY id`).all();
  assert.equal(cmps.length, 2);
  for (const c of cmps) {
    assert.equal(c.enabled, 1, `${c.id} should be re-enabled after revert`);
    assert.equal(c.state, '启用', `${c.id} state should flip back to 启用`);
  }
});

test('M4-R1 fix: legacy flat audit log (no .payload nesting) still works via fallback', () => {
  seedAnomaly({ id: 'anom-flat-1', status: 'assigned', assignee: 'u-old' });
  // Legacy/flat shape: data fields directly on the log root
  const flat = {
    sourceModule: 'M4', actionType: 'ANOMALY_ASSIGN', resourceId: 'anom-flat-1',
    previousValues: { status: 'open', assigneeUserId: null },
  };
  db.prepare(`INSERT INTO audit_logs
    (id,user_id,store_id,source_module,action_type,resource_type,resource_id,status,executed_at,payload)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      'a-legacy-flat', userId, storeId, 'M4', 'ANOMALY_ASSIGN', 'm4_anomalies', 'anom-flat-1', 'success',
      new Date().toISOString(), JSON.stringify(flat),
    );
  const result = revertAuditLog(userId, storeId, 'a-legacy-flat', 'test');
  assert.ok(result);
  const anom = db.prepare(`SELECT status, assignee_user_id FROM m4_anomalies WHERE id=?`).get('anom-flat-1');
  assert.equal(anom.status, 'open');
  assert.equal(anom.assignee_user_id, null);
});
