import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-probe-'));
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

// pick a campaign id from seeded data
const cmp = db.prepare('SELECT id FROM lx_campaigns WHERE user_id=? AND store_id=? LIMIT 1').get(uid, sid);
console.log('cmp', JSON.stringify(cmp));

const c = ads.createNegative(db, uid, sid, { term: 'probe-neg-' + randomBytes(4).toString('hex'), matchType: 'exact', campaignId: cmp ? cmp.id : null });
console.log('created negative id', c.id);

const log = db.prepare("SELECT id, action_type, resource_id, payload, reverted FROM audit_logs WHERE action_type='ADD_NEGATIVE_KEYWORD' ORDER BY executed_at DESC, rowid DESC LIMIT 1").get();
console.log('log id', log.id, 'resource_id', log.resource_id, 'reverted', log.reverted);
console.log('payload', log.payload);

const rv = ds.revertAuditLog(uid, sid, log.id);
console.log('REVERT dispatchedInverse=', rv.dispatchedInverse, 'needsManualReversal=', rv.needsManualReversal, 'status=', rv.status);
const rowAfter = db.prepare('SELECT id FROM lx_negatives WHERE id=?').get(c.id);
console.log('negative still exists?', !!rowAfter);
