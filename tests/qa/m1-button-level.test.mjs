// QA Agent M1 — Deep button-level QA covering every M1 endpoint + catalog sync touchpoint.
// All paths under /api/v1/store/m1/* exercised through handleListingsRequest with realistic bodies.
// Block real network before importing anything.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-qa-m1-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');

// Block real network globally — catalog-sync uses injectItems so no fetch should fire,
// but guard regressions just in case.
const _origFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('network_blocked_in_qa_m1'); };

const { handleListingsRequest } = await import('../../apps/api/src/store-routes-listings.mjs');
const {
  registerUser, issueToken, getDbInstance, defaultStoreIdFor,
} = await import('../../apps/api/src/data-store.mjs');
const { syncCatalogItems } = await import('../../apps/api/src/integrations/sp-api/sync/catalog-sync.mjs');

// ---------------------------------------------------------------------------
// Bootstrap user + store
// ---------------------------------------------------------------------------
const reg = registerUser({ email: 'qa-m1@amz.local', password: 'qa-pass', name: 'QA M1' });
assert.ok(reg.user && reg.user.id, 'registerUser should succeed');
const userId = reg.user.id;
const { token } = issueToken(reg.user);
const storeId = defaultStoreIdFor(userId);
assert.ok(storeId, 'default storeId should exist');

function req(method, path, body) {
  const init = {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'x-store-id': storeId,
      'content-type': 'application/json',
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`http://localhost${path}`, init);
}

async function call(method, path, body) {
  const resp = await handleListingsRequest(req(method, path, body));
  assert.ok(resp, `endpoint ${method} ${path} returned null (route missing)`);
  let json;
  try { json = await resp.json(); } catch { json = null; }
  return { status: resp.status, body: json, resp };
}

function noAuthReq(method, path) {
  return new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json' } });
}

// Capture seeded target ids for read tests
const db = getDbInstance();
const seededTargets = db.prepare('SELECT id, mode, asin_kind FROM m1_optimization_targets WHERE user_id = ? AND store_id = ?').all(userId, storeId);
const seedExistingT1 = seededTargets.find((t) => t.mode === 'existing' && t.asin_kind === 'own');
const seedExternalT3 = seededTargets.find((t) => t.mode === 'asin_input' && t.asin_kind === 'external');
const seedNewT4 = seededTargets.find((t) => t.mode === 'new_listing');
assert.ok(seedExistingT1 && seedExternalT3 && seedNewT4, 'seed should produce all 3 target modes');

// ---------------------------------------------------------------------------
// 1. Auth / cross-cutting
// ---------------------------------------------------------------------------
test('auth: missing bearer returns 401', async () => {
  const resp = await handleListingsRequest(noAuthReq('GET', '/api/v1/store/m1/targets'));
  assert.equal(resp.status, 401);
  const body = await resp.json();
  assert.equal(body.error, 'unauthorized');
});

test('auth: bad bearer returns 401', async () => {
  const r = new Request('http://localhost/api/v1/store/m1/targets', {
    method: 'GET', headers: { authorization: 'Bearer not-a-real-token' },
  });
  const resp = await handleListingsRequest(r);
  assert.equal(resp.status, 401);
});

test('routing: unknown m1 path returns null (falls through)', async () => {
  const resp = await handleListingsRequest(req('GET', '/api/v1/store/m1/does-not-exist'));
  assert.equal(resp, null);
});

// ---------------------------------------------------------------------------
// 2. Targets — GET/POST/PATCH/DELETE
// ---------------------------------------------------------------------------
test('GET /targets: returns seeded list', async () => {
  const r = await call('GET', '/api/v1/store/m1/targets');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(r.body.items.length >= 4, 'seed creates 4 targets');
});

test('GET /targets?mode=new_listing filters', async () => {
  const r = await call('GET', '/api/v1/store/m1/targets?mode=new_listing');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((t) => t.mode === 'new_listing'));
});

test('GET /targets?status=draft filters', async () => {
  const r = await call('GET', '/api/v1/store/m1/targets?status=draft');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((t) => t.status === 'draft'));
});

test('POST /targets: missing mode -> 400 validation_failed', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', {});
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'validation_failed');
});

test('POST /targets: invalid mode -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', { mode: 'garbage' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'validation_failed');
});

test('POST /targets: existing mode requires productId or asin', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', { mode: 'existing' });
  assert.equal(r.status, 400);
});

test('POST /targets: asin_input requires asin', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', { mode: 'asin_input' });
  assert.equal(r.status, 400);
});

test('POST /targets: new_listing requires new_category', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'new_listing', new_selling_points: ['a', 'b', 'c'],
  });
  assert.equal(r.status, 400);
});

test('POST /targets: new_listing rejects sp <3', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'new_listing', new_category: 'Test', new_selling_points: ['only one'],
  });
  assert.equal(r.status, 400);
});

test('POST /targets: new_listing rejects sp >5', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'new_listing', new_category: 'Test',
    new_selling_points: ['a', 'b', 'c', 'd', 'e', 'f'],
  });
  assert.equal(r.status, 400);
});

test('POST /targets: asin_input external auto-flags is_competitor_only', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'asin_input', asin: 'B0XXEXT001',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.asin_kind, 'external');
  assert.equal(r.body.is_competitor_only, true);
});

let createdNewListingId; // shared across subsequent tests
test('POST /targets: new_listing happy path -> 201', async () => {
  const r = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'new_listing',
    new_category: '智能音箱',
    new_selling_points: ['超长续航', '极致音质', '智能联动'],
    new_target_audience: '科技爱好者',
    new_price_band: '$50-$80',
    new_target_keywords: ['smart speaker', 'bluetooth'],
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.mode, 'new_listing');
  assert.equal(r.body.status, 'draft');
  createdNewListingId = r.body.id;
});

test('GET /targets/:id happy', async () => {
  const r = await call('GET', `/api/v1/store/m1/targets/${createdNewListingId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, createdNewListingId);
});

test('GET /targets/:id unknown -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m1/targets/m1t-does-not-exist');
  assert.equal(r.status, 404);
});

test('PATCH /targets/:id updates fields', async () => {
  const r = await call('PATCH', `/api/v1/store/m1/targets/${createdNewListingId}`, {
    status: 'in_progress', new_target_audience: '专业用户',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'in_progress');
  assert.equal(r.body.new_target_audience, '专业用户');
});

test('PATCH /targets/:id unknown -> 404', async () => {
  const r = await call('PATCH', '/api/v1/store/m1/targets/m1t-nope', { status: 'archived' });
  assert.equal(r.status, 404);
});

test('DELETE /targets/:id unknown -> 404', async () => {
  const r = await call('DELETE', '/api/v1/store/m1/targets/m1t-also-nope');
  assert.equal(r.status, 404);
});

// ---------------------------------------------------------------------------
// 3. Research
// ---------------------------------------------------------------------------
test('POST /research/trigger: missing targetId -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/research/trigger', {});
  assert.equal(r.status, 400);
});

test('POST /research/trigger: unknown target -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/research/trigger', { targetId: 'm1t-ghost' });
  assert.equal(r.status, 404);
});

test('POST /research/trigger: happy path -> 201 with 5 dims', async () => {
  const r = await call('POST', '/api/v1/store/m1/research/trigger', {
    targetId: createdNewListingId, competitorAsins: ['B0COMPX1', 'B0COMPX2'],
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.title_pattern && r.body.title_pattern.theme);
  assert.ok(r.body.bullet_structure);
  assert.ok(r.body.main_image_visual);
  assert.ok(r.body.a_plus_structure);
  assert.ok(r.body.review_keywords);
  assert.ok(r.body.cached_until);
});

test('POST /research/trigger: cache hit returns same id (idempotent within TTL)', async () => {
  const first = await call('POST', '/api/v1/store/m1/research/trigger', { targetId: createdNewListingId });
  const second = await call('POST', '/api/v1/store/m1/research/trigger', { targetId: createdNewListingId });
  assert.equal(first.body.id, second.body.id);
});

test('GET /research/:targetId returns latest', async () => {
  const r = await call('GET', `/api/v1/store/m1/research/${createdNewListingId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.target_id, createdNewListingId);
});

test('GET /research/:targetId no data -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m1/research/m1t-no-research-here');
  assert.equal(r.status, 404);
});

test('DELETE /research/:targetId/cache clears, then next trigger creates new', async () => {
  const before = await call('GET', `/api/v1/store/m1/research/${createdNewListingId}`);
  const del = await call('DELETE', `/api/v1/store/m1/research/${createdNewListingId}/cache`);
  assert.equal(del.status, 200);
  assert.equal(del.body.ok, true);
  const after = await call('POST', '/api/v1/store/m1/research/trigger', { targetId: createdNewListingId });
  assert.notEqual(after.body.id, before.body.id);
});

// ---------------------------------------------------------------------------
// 4. Scores
// ---------------------------------------------------------------------------
test('POST /scores/trigger: missing targetId -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/scores/trigger', {});
  assert.equal(r.status, 400);
});

test('POST /scores/trigger: unknown target -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/scores/trigger', { targetId: 'm1t-ghost' });
  assert.equal(r.status, 404);
});

test('POST /scores/trigger: new_listing mode -> 400 scoring_not_applicable', async () => {
  const r = await call('POST', '/api/v1/store/m1/scores/trigger', { targetId: createdNewListingId });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'scoring_not_applicable');
});

test('POST /scores/trigger: existing target happy -> 201 with 5 dims', async () => {
  const r = await call('POST', '/api/v1/store/m1/scores/trigger', { targetId: seedExistingT1.id });
  assert.equal(r.status, 201);
  assert.ok(typeof r.body.total_score === 'number');
  for (const k of ['title_score', 'bullets_score', 'main_image_score', 'a_plus_score', 'reviews_score']) {
    assert.ok(typeof r.body[k] === 'number', `missing score dim ${k}`);
  }
  assert.ok(Array.isArray(r.body.improvement_ranking) && r.body.improvement_ranking.length >= 3);
});

test('GET /scores/:targetId returns latest', async () => {
  const r = await call('GET', `/api/v1/store/m1/scores/${seedExistingT1.id}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.total_score >= 0);
});

test('GET /scores/:targetId unknown -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m1/scores/m1t-no-score');
  assert.equal(r.status, 404);
});

// ---------------------------------------------------------------------------
// 5. Runs (multi-round generation; markedFields preservation)
// ---------------------------------------------------------------------------
// Build a fresh target for run / version flow so we control round counts.
let runTargetId;
test('setup: create fresh existing target for runs/versions tests', async () => {
  // Use seeded CASE-001 product? It's already in T1 with 3 seeded rounds.
  // Make a brand-new target via asin_input + own asin so it's clean.
  const ownAsin = db.prepare('SELECT asin FROM products WHERE user_id = ? AND store_id = ? LIMIT 1').get(userId, storeId)?.asin;
  assert.ok(ownAsin, 'sample store should have at least one product');
  const r = await call('POST', '/api/v1/store/m1/targets', { mode: 'asin_input', asin: ownAsin });
  assert.equal(r.status, 201);
  assert.equal(r.body.asin_kind, 'own');
  assert.equal(r.body.is_competitor_only, false);
  runTargetId = r.body.id;
});

test('GET /runs?targetId returns empty for fresh target', async () => {
  const r = await call('GET', `/api/v1/store/m1/runs?targetId=${runTargetId}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items, []);
});

test('POST /runs: missing targetId -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/runs', {});
  assert.equal(r.status, 400);
});

test('POST /runs: external asin cannot optimize -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/runs', { targetId: seedExternalT3.id });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'external_asin_cannot_optimize');
});

test('POST /runs: round 1 produces baseline version', async () => {
  const r = await call('POST', '/api/v1/store/m1/runs', { targetId: runTargetId });
  assert.equal(r.status, 201);
  assert.equal(r.body.round_no, 1);
  assert.equal(r.body.status, 'completed');
  assert.ok(r.body.version_id);
});

test('POST /runs: round 2 with markedFields rewrites only marked', async () => {
  // Grab round 1 version
  const ver1Row = db.prepare('SELECT * FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const r = await call('POST', '/api/v1/store/m1/runs', {
    targetId: runTargetId, markedFields: ['title'], feedback_text: 'title needs more keywords',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.round_no, 2);
  // Verify unmarked bullets stayed identical to round 1
  const ver2Row = db.prepare('SELECT * FROM m1_listing_versions WHERE id = ?').get(r.body.version_id);
  assert.equal(ver2Row.bullet_1, ver1Row.bullet_1, 'unmarked bullet_1 must be byte-identical');
  assert.equal(ver2Row.bullet_2, ver1Row.bullet_2);
  assert.notEqual(ver2Row.title, ver1Row.title, 'marked title must mutate');
});

test('POST /runs/:id/rewrite-field invalid field -> 400', async () => {
  const lastRun = db.prepare('SELECT id FROM m1_optimization_runs WHERE target_id = ? ORDER BY round_no DESC LIMIT 1').get(runTargetId);
  const r = await call('POST', `/api/v1/store/m1/runs/${lastRun.id}/rewrite-field`, { field: 'nope' });
  assert.equal(r.status, 400);
});

test('POST /runs/:id/rewrite-field happy', async () => {
  const lastRun = db.prepare('SELECT id, version_id FROM m1_optimization_runs WHERE target_id = ? ORDER BY round_no DESC LIMIT 1').get(runTargetId);
  const before = db.prepare('SELECT bullet_3 FROM m1_listing_versions WHERE id = ?').get(lastRun.version_id);
  const r = await call('POST', `/api/v1/store/m1/runs/${lastRun.id}/rewrite-field`, { field: 'bullet_3' });
  assert.equal(r.status, 200);
  const after = db.prepare('SELECT bullet_3 FROM m1_listing_versions WHERE id = ?').get(lastRun.version_id);
  assert.notEqual(before.bullet_3, after.bullet_3);
});

test('POST /runs/:id/rewrite-field unknown run -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/runs/m1run-ghost/rewrite-field', { field: 'title' });
  assert.equal(r.status, 404);
});

test('GET /runs/:id happy', async () => {
  const lastRun = db.prepare('SELECT id FROM m1_optimization_runs WHERE target_id = ? ORDER BY round_no DESC LIMIT 1').get(runTargetId);
  const r = await call('GET', `/api/v1/store/m1/runs/${lastRun.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, lastRun.id);
});

test('GET /runs/:id unknown -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m1/runs/m1run-not-real');
  assert.equal(r.status, 404);
});

// ---------------------------------------------------------------------------
// 6. Versions — list, get, pin, delete, diff, combined-pick + 6th-round archive
// ---------------------------------------------------------------------------
test('GET /versions?targetId returns versions', async () => {
  const r = await call('GET', `/api/v1/store/m1/versions?targetId=${runTargetId}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length >= 2);
});

test('GET /versions/:id happy', async () => {
  const v = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const r = await call('GET', `/api/v1/store/m1/versions/${v.id}`);
  assert.equal(r.status, 200);
});

test('GET /versions/:id unknown -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m1/versions/m1v-no-such');
  assert.equal(r.status, 404);
});

test('POST /versions/:id/pin toggles pinned flag', async () => {
  const v = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const r = await call('POST', `/api/v1/store/m1/versions/${v.id}/pin`, { pinned: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.is_pinned, true);
  const r2 = await call('POST', `/api/v1/store/m1/versions/${v.id}/pin`, { pinned: false });
  assert.equal(r2.body.is_pinned, false);
});

test('POST /versions/:id/pin unknown -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/versions/m1v-nope/pin', { pinned: true });
  assert.equal(r.status, 404);
});

test('DELETE /versions/:id round 1 -> 400 cannot_delete_baseline', async () => {
  const v = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const r = await call('DELETE', `/api/v1/store/m1/versions/${v.id}`);
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'cannot_delete_baseline');
});

test('6th-round archive: pushing 6 active versions auto-archives oldest non-pinned', async () => {
  // Currently we have round 1 + round 2 for runTargetId; need to push to 6 active non-pinned versions.
  // Easiest: add a fresh target so we control everything.
  const ownAsin = db.prepare('SELECT asin FROM products WHERE user_id = ? AND store_id = ? LIMIT 1 OFFSET 1').get(userId, storeId)?.asin;
  assert.ok(ownAsin);
  const t = await call('POST', '/api/v1/store/m1/targets', { mode: 'asin_input', asin: ownAsin });
  assert.equal(t.status, 201);
  const tid = t.body.id;
  for (let i = 0; i < 6; i++) {
    const r = await call('POST', '/api/v1/store/m1/runs', { targetId: tid, markedFields: ['title'] });
    assert.equal(r.status, 201);
  }
  const archived = db.prepare('SELECT COUNT(*) AS n FROM m1_listing_versions WHERE target_id = ? AND is_archived = 1').get(tid);
  assert.ok(archived.n >= 1, 'at least one version should be archived after 6 rounds');
  const active = db.prepare('SELECT COUNT(*) AS n FROM m1_listing_versions WHERE target_id = ? AND is_archived = 0').get(tid);
  assert.ok(active.n <= 5, 'active non-archived versions should be <= 5');
});

test('pin protection: pinned version is never archived by 6th-round fold', async () => {
  const ownAsin = db.prepare('SELECT asin FROM products WHERE user_id = ? AND store_id = ? LIMIT 1').get(userId, storeId)?.asin;
  const t = await call('POST', '/api/v1/store/m1/targets', { mode: 'asin_input', asin: ownAsin });
  const tid = t.body.id;
  // Round 1
  const run1 = await call('POST', '/api/v1/store/m1/runs', { targetId: tid });
  const baselineVid = run1.body.version_id;
  // Pin the baseline (round 1 is also baseline)
  await call('POST', `/api/v1/store/m1/versions/${baselineVid}/pin`, { pinned: true });
  for (let i = 0; i < 6; i++) {
    await call('POST', '/api/v1/store/m1/runs', { targetId: tid, markedFields: ['title'] });
  }
  const v = db.prepare('SELECT is_archived FROM m1_listing_versions WHERE id = ?').get(baselineVid);
  assert.equal(v.is_archived, 0, 'pinned version must not be archived');
});

test('GET /versions?includeArchived=true returns archived too', async () => {
  // Use the previous target with archived rows.
  const someTargetWithArchived = db.prepare(`SELECT target_id FROM m1_listing_versions
    WHERE user_id = ? AND store_id = ? AND is_archived = 1 LIMIT 1`).get(userId, storeId);
  assert.ok(someTargetWithArchived, 'we should have at least one archived version by now');
  const withArchive = await call('GET',
    `/api/v1/store/m1/versions?targetId=${someTargetWithArchived.target_id}&includeArchived=true`);
  const noArchive = await call('GET', `/api/v1/store/m1/versions?targetId=${someTargetWithArchived.target_id}`);
  assert.ok(withArchive.body.items.length > noArchive.body.items.length);
});

test('POST /versions/diff: missing ids -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/versions/diff', { versionAId: 'a' });
  assert.equal(r.status, 400);
});

test('POST /versions/diff: returns per-field changed flags', async () => {
  const v1 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const v2 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const r = await call('POST', '/api/v1/store/m1/versions/diff', { versionAId: v1.id, versionBId: v2.id });
  assert.equal(r.status, 200);
  const titleField = r.body.fields.find((f) => f.key === 'title');
  assert.equal(titleField.changed, true);
  const b1Field = r.body.fields.find((f) => f.key === 'bullet_1');
  assert.equal(b1Field.changed, false);
});

test('POST /versions/diff: unknown ids -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/versions/diff', { versionAId: 'm1v-x', versionBId: 'm1v-y' });
  assert.equal(r.status, 404);
});

test('POST /versions/combined-pick: missing args -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/versions/combined-pick', {});
  assert.equal(r.status, 400);
});

test('POST /versions/combined-pick: happy path -> 201 with combined fields', async () => {
  const v1 = db.prepare('SELECT id, title FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const v2 = db.prepare('SELECT id, title FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const r = await call('POST', '/api/v1/store/m1/versions/combined-pick', {
    targetId: runTargetId,
    fieldPicks: { title: v2.id, bullet_1: v1.id, bullet_2: v1.id },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.title, v2.title);
});

test('POST /versions/combined-pick: idempotent (same picks -> same version id)', async () => {
  const v1 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const v2 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const picks = { title: v2.id, bullet_1: v1.id };
  const first = await call('POST', '/api/v1/store/m1/versions/combined-pick', { targetId: runTargetId, fieldPicks: picks });
  const second = await call('POST', '/api/v1/store/m1/versions/combined-pick', { targetId: runTargetId, fieldPicks: picks });
  assert.equal(first.body.id, second.body.id, 'identical fieldPicks must return same version (idempotent)');
});

test('DELETE /versions/:id non-baseline succeeds', async () => {
  // Use combined-pick output (which is roundNo > 1) for safe delete.
  const v1 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const v2 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const cp = await call('POST', '/api/v1/store/m1/versions/combined-pick', {
    targetId: runTargetId, fieldPicks: { title: v2.id, bullet_1: v1.id, bullet_2: v2.id },
  });
  const target = cp.body.id;
  const r = await call('DELETE', `/api/v1/store/m1/versions/${target}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('DELETE /versions/:id unknown -> 404', async () => {
  const r = await call('DELETE', '/api/v1/store/m1/versions/m1v-no-real');
  assert.equal(r.status, 404);
});

// ---------------------------------------------------------------------------
// 7. Images — generate, list, regenerate (5-slot mock)
// ---------------------------------------------------------------------------
let firstImgId;
test('POST /images/generate: missing fields -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/images/generate', { targetId: runTargetId });
  assert.equal(r.status, 400);
});

test('POST /images/generate: happy main slot -> 201 picsum url', async () => {
  const ver = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? ORDER BY round_no DESC LIMIT 1').get(runTargetId);
  const r = await call('POST', '/api/v1/store/m1/images/generate', {
    targetId: runTargetId, versionId: ver.id, slot: 'main',
    prompt: 'white background, hero shot, soft shadow',
  });
  assert.equal(r.status, 201);
  assert.match(r.body.generated_url, /picsum\.photos/);
  assert.equal(r.body.slot, 'main');
  firstImgId = r.body.id;
});

test('POST /images/generate: 5-slot fill (main + 4 side)', async () => {
  const ver = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? ORDER BY round_no DESC LIMIT 1').get(runTargetId);
  for (const slot of ['side_1', 'side_2', 'side_3', 'side_4']) {
    const r = await call('POST', '/api/v1/store/m1/images/generate', {
      targetId: runTargetId, versionId: ver.id, slot, prompt: `${slot} lifestyle scene`,
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.slot, slot);
  }
  const list = await call('GET', `/api/v1/store/m1/images?versionId=${ver.id}`);
  assert.equal(list.status, 200);
  assert.ok(list.body.items.length >= 5);
});

test('GET /images?targetId returns images', async () => {
  const r = await call('GET', `/api/v1/store/m1/images?targetId=${runTargetId}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length >= 5);
});

test('POST /images/:id/regenerate updates url', async () => {
  const before = await call('GET', `/api/v1/store/m1/images?targetId=${runTargetId}`);
  const target = before.body.items[0];
  const r = await call('POST', `/api/v1/store/m1/images/${target.id}/regenerate`, {
    prompt: 'updated prompt with more contrast',
  });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.generated_url, target.generated_url);
});

test('POST /images/:id/regenerate unknown -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/images/m1img-ghost/regenerate', { prompt: 'x' });
  assert.equal(r.status, 404);
});

// ---------------------------------------------------------------------------
// 8. A/B testing — list, create, start, metrics, adopt, abort + manual_required 422
// ---------------------------------------------------------------------------
test('GET /ab returns seeded ab tests', async () => {
  const r = await call('GET', '/api/v1/store/m1/ab');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test('POST /ab: missing fields -> 400', async () => {
  const r = await call('POST', '/api/v1/store/m1/ab', { targetId: runTargetId });
  assert.equal(r.status, 400);
});

test('POST /ab: unknown target -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/ab', {
    targetId: 'm1t-ghost', testType: 'title',
    controlVersionId: 'x', treatmentVersionId: 'y',
  });
  assert.equal(r.status, 404);
});

let abAutoId; let abManualId;
test('POST /ab: title type auto path -> 201 draft', async () => {
  const v1 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const v2 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const r = await call('POST', '/api/v1/store/m1/ab', {
    targetId: runTargetId, testType: 'title',
    controlVersionId: v1.id, treatmentVersionId: v2.id,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'draft');
  abAutoId = r.body.id;
});

test('POST /ab: bullets type manual_required -> 422 with guidance', async () => {
  const v1 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const v2 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const r = await call('POST', '/api/v1/store/m1/ab', {
    targetId: runTargetId, testType: 'bullets',
    controlVersionId: v1.id, treatmentVersionId: v2.id,
  });
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'manual_required');
  assert.ok(r.body.manualGuidance && r.body.manualGuidance.length > 10);
  abManualId = r.body.id;
});

test('POST /ab: price type also manual_required -> 422', async () => {
  const v1 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const v2 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const r = await call('POST', '/api/v1/store/m1/ab', {
    targetId: runTargetId, testType: 'price',
    controlVersionId: v1.id, treatmentVersionId: v2.id,
  });
  assert.equal(r.status, 422);
});

test('GET /ab/:id happy', async () => {
  const r = await call('GET', `/api/v1/store/m1/ab/${abAutoId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, abAutoId);
});

test('GET /ab/:id unknown -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m1/ab/m1ab-ghost');
  assert.equal(r.status, 404);
});

test('POST /ab/:id/start transitions draft -> running with 14d metrics', async () => {
  const r = await call('POST', `/api/v1/store/m1/ab/${abAutoId}/start`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'running');
  assert.ok(r.body.started_at && r.body.ends_at);
  const cnt = db.prepare('SELECT COUNT(*) AS n FROM m1_ab_metrics WHERE ab_test_id = ?').get(abAutoId);
  assert.equal(cnt.n, 28); // 14 days * 2 arms
});

test('POST /ab/:id/start unknown -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/ab/m1ab-nope/start');
  assert.equal(r.status, 404);
});

test('POST /ab/:id/start manual_required stays manual_required (state guard)', async () => {
  const r = await call('POST', `/api/v1/store/m1/ab/${abManualId}/start`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'manual_required');
});

test('GET /ab/:id/metrics returns z-stats once running with 14d', async () => {
  const r = await call('GET', `/api/v1/store/m1/ab/${abAutoId}/metrics`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.metrics));
  assert.ok(r.body.stats && typeof r.body.stats.z === 'number');
  assert.ok(['treatment', 'control', 'no_difference'].includes(r.body.stats.winner));
});

test('GET /ab/:id/metrics unknown -> 404', async () => {
  const r = await call('GET', '/api/v1/store/m1/ab/m1ab-ghost/metrics');
  assert.equal(r.status, 404);
});

test('POST /ab/:id/adopt-winner marks treatment version uploaded', async () => {
  const r = await call('POST', `/api/v1/store/m1/ab/${abAutoId}/adopt-winner`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'completed');
  // Winner version should be flagged uploaded_to_amazon
  const winnerVid = r.body.winner === 'treatment' ? r.body.treatment_version_id
    : r.body.winner === 'control' ? r.body.control_version_id : null;
  if (winnerVid) {
    const v = db.prepare('SELECT uploaded_to_amazon FROM m1_listing_versions WHERE id = ?').get(winnerVid);
    assert.equal(v.uploaded_to_amazon, 1);
  }
});

test('POST /ab/:id/adopt-winner unknown -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/ab/m1ab-nope/adopt-winner');
  assert.equal(r.status, 404);
});

test('POST /ab/:id/abort transitions status to aborted', async () => {
  // Create a fresh test then abort.
  const v1 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 1').get(runTargetId);
  const v2 = db.prepare('SELECT id FROM m1_listing_versions WHERE target_id = ? AND round_no = 2').get(runTargetId);
  const created = await call('POST', '/api/v1/store/m1/ab', {
    targetId: runTargetId, testType: 'main_image',
    controlVersionId: v1.id, treatmentVersionId: v2.id,
  });
  const id = created.body.id;
  const r = await call('POST', `/api/v1/store/m1/ab/${id}/abort`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'aborted');
});

test('POST /ab/:id/abort unknown -> 404', async () => {
  const r = await call('POST', '/api/v1/store/m1/ab/m1ab-nope/abort');
  assert.equal(r.status, 404);
});

test('GET /ab?status=completed filters', async () => {
  const r = await call('GET', '/api/v1/store/m1/ab?status=completed');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((t) => t.status === 'completed'));
});

// ---------------------------------------------------------------------------
// 9. Catalog Items sync → products/listings table → M1 endpoints
// ---------------------------------------------------------------------------
test('catalog-sync: rejects empty asins', async () => {
  await assert.rejects(
    () => syncCatalogItems({ userId, storeId, asins: [] }),
    /asins_required/,
  );
});

test('catalog-sync: rejects missing user/store', async () => {
  await assert.rejects(
    () => syncCatalogItems({ userId: null, storeId, asins: ['B0X1'] }),
    /user_and_store_required/,
  );
});

test('catalog-sync: injectItems populates products + listings + audit', async () => {
  const asins = ['B0QA00CAT1', 'B0QA00CAT2'];
  const injectItems = [
    {
      asin: 'B0QA00CAT1', title: 'QA Catalog Bottle', brand: 'AcmeQA',
      imageUrl: 'https://img.example/cat1.jpg',
      dimensions: { length: { value: 4, unit: 'inches' } },
      summaries: [{ itemName: 'QA Catalog Bottle' }],
      salesRanks: [{ rank: 100 }],
      attributes: { item_name: [{ value: 'QA Catalog Bottle' }] },
    },
    {
      asin: 'B0QA00CAT2', title: 'QA Catalog Mug', brand: 'AcmeQA',
      imageUrl: 'https://img.example/cat2.jpg',
      dimensions: null,
      summaries: [{ itemName: 'QA Catalog Mug' }],
      salesRanks: [],
      attributes: {},
    },
  ];
  const res = await syncCatalogItems({ userId, storeId, asins, injectItems });
  assert.equal(res.written, 2);
  const p1 = db.prepare('SELECT * FROM products WHERE user_id = ? AND store_id = ? AND id = ?').get(userId, storeId, 'spapi-B0QA00CAT1');
  assert.ok(p1, 'spapi-B0QA00CAT1 should be inserted');
  assert.equal(p1.asin, 'B0QA00CAT1');
  const data = JSON.parse(p1.data);
  assert.equal(data.brand, 'AcmeQA');
  assert.equal(data.source, 'spapi.catalog');
  const l1 = db.prepare('SELECT data FROM listings WHERE user_id = ? AND store_id = ? AND product_id = ?').get(userId, storeId, 'spapi-B0QA00CAT1');
  assert.ok(l1, 'listing row should exist');
  const ldata = JSON.parse(l1.data);
  assert.equal(ldata.asin, 'B0QA00CAT1');
  assert.ok(Array.isArray(ldata.salesRanks));
  // Audit log written under sourceModule spapi.catalog
  const audit = db.prepare(`SELECT id FROM audit_logs WHERE user_id = ? AND store_id = ?
    AND source_module = 'spapi.catalog' AND action_type = 'sync' ORDER BY executed_at DESC LIMIT 1`).get(userId, storeId);
  assert.ok(audit, 'sync audit log row written');
});

test('catalog-sync: idempotent re-sync updates same product/listing (no duplicates)', async () => {
  const asins = ['B0QA00CAT1'];
  const injectItems = [{
    asin: 'B0QA00CAT1', title: 'QA Catalog Bottle V2', brand: 'AcmeQA',
    imageUrl: 'https://img.example/cat1-v2.jpg',
    dimensions: null,
    summaries: [{ itemName: 'QA Catalog Bottle V2' }],
    salesRanks: [{ rank: 50 }],
    attributes: {},
  }];
  await syncCatalogItems({ userId, storeId, asins, injectItems });
  const rows = db.prepare('SELECT COUNT(*) AS n FROM products WHERE user_id = ? AND store_id = ? AND id = ?').get(userId, storeId, 'spapi-B0QA00CAT1');
  assert.equal(rows.n, 1, 'should NOT duplicate on re-sync');
  const r = db.prepare('SELECT title FROM products WHERE id = ? AND user_id = ? AND store_id = ?').get('spapi-B0QA00CAT1', userId, storeId);
  assert.equal(r.title, 'QA Catalog Bottle V2', 'title should be updated on upsert');
});

test('catalog-sync flow: M1 asin_input on catalog-sourced ASIN classifies as own', async () => {
  // After sync the ASIN exists in products → M1 should detect as own when creating asin_input target.
  const r = await call('POST', '/api/v1/store/m1/targets', { mode: 'asin_input', asin: 'B0QA00CAT1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.asin_kind, 'own');
  assert.equal(r.body.is_competitor_only, false);
  assert.equal(r.body.product_id, 'spapi-B0QA00CAT1');
});

test('catalog-sync flow: M1 run + version generation works on catalog-sourced target', async () => {
  // Create target → trigger run → expect baseline + iteration version.
  const target = await call('POST', '/api/v1/store/m1/targets', { mode: 'asin_input', asin: 'B0QA00CAT2' });
  const tid = target.body.id;
  const r1 = await call('POST', '/api/v1/store/m1/runs', { targetId: tid });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.round_no, 1);
  const r2 = await call('POST', '/api/v1/store/m1/runs', { targetId: tid, markedFields: ['title'] });
  assert.equal(r2.status, 201);
  assert.equal(r2.body.round_no, 2);
  // Version reflects target/product info
  const v = db.prepare('SELECT title FROM m1_listing_versions WHERE id = ?').get(r1.body.version_id);
  assert.ok(v.title.includes('spapi-B0QA00CAT2') || v.title.includes('B0QA00CAT2'),
    'baseline title should reference catalog-sourced product id or asin');
});

test('catalog-sync flow: scoring works on catalog-sourced target', async () => {
  const t = db.prepare(`SELECT id FROM m1_optimization_targets WHERE user_id = ? AND store_id = ? AND asin = ?
    ORDER BY created_at DESC LIMIT 1`).get(userId, storeId, 'B0QA00CAT2');
  const r = await call('POST', '/api/v1/store/m1/scores/trigger', { targetId: t.id });
  assert.equal(r.status, 201);
  assert.ok(r.body.total_score >= 0);
});

test('catalog-sync flow: research triggers on catalog-sourced target', async () => {
  const t = db.prepare(`SELECT id FROM m1_optimization_targets WHERE user_id = ? AND store_id = ? AND asin = ?
    ORDER BY created_at DESC LIMIT 1`).get(userId, storeId, 'B0QA00CAT1');
  const r = await call('POST', '/api/v1/store/m1/research/trigger', { targetId: t.id });
  assert.equal(r.status, 201);
  assert.ok(r.body.title_pattern);
});

// ---------------------------------------------------------------------------
// 10. Targets delete teardown
// ---------------------------------------------------------------------------
test('DELETE /targets/:id happy (cleanup)', async () => {
  // Use seedNewT4 which is new_listing draft (no upstream dependencies).
  // Make a brand new target for safe delete.
  const t = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'new_listing', new_category: 'Cleanup',
    new_selling_points: ['s1', 's2', 's3'],
  });
  const r = await call('DELETE', `/api/v1/store/m1/targets/${t.body.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

// ---------------------------------------------------------------------------
// 11. Tail cleanup
// ---------------------------------------------------------------------------
test.after(() => { globalThis.fetch = _origFetch; });
