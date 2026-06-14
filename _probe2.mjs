import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-probe2-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
process.env.ADS_API_MOCK = 'true';
process.env.ADS_LWA_CLIENT_ID = 'qa';
process.env.ADS_LWA_CLIENT_SECRET = 'qa';
globalThis.fetch = async () => { throw new Error('blocked'); };

const ds = await import('./apps/api/src/data-store.mjs');
const ads = await import('./apps/api/src/data-store-ads.mjs');
ds.getDbInstance();
const auth = ds.authenticate('demo@amz.local', 'demo');
const uid = auth.user.id;
const sid = ds.defaultStoreIdFor(uid);
const db = ds.getDbInstance();
const cmp = db.prepare('SELECT id FROM lx_campaigns WHERE user_id=? AND store_id=? LIMIT 1').get(uid, sid);

// Mimic X-P0-05-01/-02 appending ACTION_QUEUE_REAL_WRITE rows FIRST (same executed_at second)
ds.appendAuditLog(uid, sid, { sourceModule: 'M3', actionType: 'ACTION_QUEUE_REAL_WRITE', resourceType: 'REAL_STORE_WRITE', resourceId: 'tgt-real-1', previousValues: { bid: 1 }, newValues: { bid: 2 } });
ds.appendAuditLog(uid, sid, { sourceModule: 'M3', actionType: 'ACTION_QUEUE_REAL_WRITE', resourceType: 'lx_targeting', resourceId: 'tgt-real-2', previousValues: { bid: 1 }, newValues: { bid: 2 } });

const c = ads.createNegative(db, uid, sid, { term: 'probe-neg-' + randomBytes(4).toString('hex'), matchType: 'exact', campaignId: cmp ? cmp.id : null });
console.log('created neg', c.id);

const log = db.prepare("SELECT id, resource_id, reverted FROM audit_logs WHERE user_id=? AND store_id=? AND action_type='ADD_NEGATIVE_KEYWORD' ORDER BY executed_at DESC, rowid DESC LIMIT 1").get(uid, sid);
console.log('lastLog resourceId', log.resource_id, 'matches c.id?', log.resource_id === c.id);
const exists = db.prepare('SELECT id FROM lx_negatives WHERE id=?').get(c.id);
console.log('neg exists before revert?', !!exists);
const rv = ds.revertAuditLog(uid, sid, log.id);
console.log('REVERT dispatchedInverse=', rv.dispatchedInverse);
