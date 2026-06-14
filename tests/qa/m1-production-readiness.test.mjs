import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-qa-m1-ready-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');

const { handleListingsRequest } = await import('../../apps/api/src/store-routes-listings.mjs');
const {
  registerUser, issueToken, getDbInstance, defaultStoreIdFor,
} = await import('../../apps/api/src/data-store.mjs');

const reg = registerUser({ email: 'qa-m1-ready@amz.local', password: 'qa-pass', name: 'QA M1 Ready' });
assert.ok(reg.user?.id);
const userId = reg.user.id;
const { token } = issueToken(reg.user);
const storeId = defaultStoreIdFor(userId);
const db = getDbInstance();

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
  assert.ok(resp, `${method} ${path} should be routed`);
  return { status: resp.status, body: await resp.json() };
}

async function createReadyTarget() {
  const target = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'new_listing',
    new_category: 'Premium travel organizer',
    new_brand_positioning: 'Acme Travel Gear',
    new_selling_points: [
      'premium travel organizer with structured storage',
      'water resistant fabric and reinforced stitching',
      'compact daily carry for chargers and accessories',
      'quick access mesh pocket for small essentials',
      'responsive support for setup and care questions',
    ],
    new_target_keywords: ['travel organizer', 'cable organizer', 'tech pouch'],
    new_physical_specs: { material: 'polyester', color_name: 'black', size_name: 'medium' },
  });
  assert.equal(target.status, 201);

  const run = await call('POST', '/api/v1/store/m1/runs', { targetId: target.body.id });
  assert.equal(run.status, 201);
  const versionId = run.body.version_id;
  db.prepare(`UPDATE m1_listing_versions SET
    title = ?,
    bullet_1 = ?,
    bullet_2 = ?,
    bullet_3 = ?,
    bullet_4 = ?,
    bullet_5 = ?,
    description = ?,
    a_plus_modules = ?
    WHERE id = ? AND user_id = ? AND store_id = ?`).run(
    'Acme Travel Organizer Cable Organizer Tech Pouch for Chargers Accessories and Daily Carry Storage',
    'Travel organizer layout keeps chargers adapters cables and small work essentials separated for fast daily packing.',
    'Cable organizer loops reduce tangles while a structured tech pouch body protects accessories in backpacks.',
    'Water resistant polyester shell and reinforced stitching support commuting business trips and weekend travel.',
    'Compact medium profile fits most bags while mesh pockets make small items easy to see and retrieve.',
    'Clear care instructions and responsive support help teams keep the organizer ready for repeated use.',
    'Designed as a premium travel organizer, cable organizer, and tech pouch for customers who carry chargers, adapters, earbuds, memory cards, and office accessories every day. The structured layout helps reduce clutter, speeds up packing, and presents a clean storage story for Amazon shoppers.',
    JSON.stringify([{ type: 'brand_story', headline: 'Built for organized travel' }, { type: 'comparison', headline: 'Choose the right pouch' }]),
    versionId, userId, storeId,
  );

  for (const slot of ['main', 'pt01', 'pt02', 'pt03', 'pt04', 'pt05', 'pt06', 'pt07', 'pt08', 'a_plus_hero']) {
    const img = await call('POST', '/api/v1/store/m1/images/generate', {
      targetId: target.body.id,
      versionId,
      slot,
      prompt: `${slot} asset for premium travel organizer`,
    });
    assert.equal(img.status, 201);
  }
  return { targetId: target.body.id, versionId };
}

test('readiness check passes for complete mock listing and writes M1 audit', async () => {
  const { targetId, versionId } = await createReadyTarget();
  const r = await call('POST', '/api/v1/store/m1/readiness/check', { targetId, versionId });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'pass');
  assert.equal(r.body.publishAllowed, true);
  assert.equal(r.body.mock, true);
  assert.equal(r.body.source, 'mock.m1_listing_ops.v1');
  assert.ok(r.body.confidence > 0);
  assert.ok(r.body.auditId);

  const audit = db.prepare(`SELECT * FROM audit_logs
    WHERE id = ? AND user_id = ? AND store_id = ? AND source_module = 'M1' AND action_type = 'M1_READINESS_CHECK'`).get(
    r.body.auditId, userId, storeId,
  );
  assert.ok(audit, 'readiness check should be audited as M1');
});

test('readiness check blocks incomplete listing', async () => {
  const target = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'new_listing',
    new_category: 'Desk accessory',
    new_brand_positioning: 'Acme Office',
    new_selling_points: ['small organizer', 'stable base', 'easy cleaning'],
    new_target_keywords: ['desk organizer', 'office organizer', 'pen holder'],
  });
  const run = await call('POST', '/api/v1/store/m1/runs', { targetId: target.body.id });
  const r = await call('POST', '/api/v1/store/m1/readiness/check', {
    targetId: target.body.id,
    versionId: run.body.version_id,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'blocked');
  assert.equal(r.body.publishAllowed, false);
  assert.ok(r.body.blockers.some((b) => b.code === 'IMAGE_MATRIX_INCOMPLETE'));
  assert.ok(r.body.blockers.some((b) => b.code === 'A_PLUS_MISSING'));
});

test('asset matrix returns nine gallery slots plus A+ and video placeholders', async () => {
  const { targetId, versionId } = await createReadyTarget();
  const r = await call('GET', `/api/v1/store/m1/assets/matrix?targetId=${targetId}&versionId=${versionId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.gallerySlots.length, 9);
  assert.deepEqual(r.body.gallerySlots.map((s) => s.slot), ['main', 'pt01', 'pt02', 'pt03', 'pt04', 'pt05', 'pt06', 'pt07', 'pt08']);
  assert.equal(r.body.summary.completedGallerySlots, 9);
  assert.equal(r.body.aPlus.status, 'ready');
  assert.equal(r.body.video.status, 'placeholder');
  assert.equal(r.body.threeSixty.status, 'placeholder');
  assert.equal(r.body.mock, true);
});

test('keyword coverage reports primary terms, competitor gap, stuffing and negative conflicts', async () => {
  const { targetId, versionId } = await createReadyTarget();
  db.prepare(`UPDATE m1_listing_versions SET description = description || ?
    WHERE id = ? AND user_id = ? AND store_id = ?`).run(
    ' travel organizer travel organizer travel organizer travel organizer no warranty',
    versionId, userId, storeId,
  );
  const r = await call('GET', `/api/v1/store/m1/keywords/coverage?targetId=${targetId}&versionId=${versionId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.primary.length, 3);
  assert.equal(r.body.summary.covered, 3);
  assert.ok(r.body.competitorGap.length > 0);
  assert.ok(r.body.repeatedStuffing.some((item) => item.term === 'travel organizer'));
  assert.ok(r.body.negativeConflicts.some((item) => item.term === 'no warranty'));
});

test('compliance report returns field-level risk codes', async () => {
  const target = await call('POST', '/api/v1/store/m1/targets', {
    mode: 'new_listing',
    new_category: 'Wellness pouch',
    new_brand_positioning: 'Acme Wellness',
    new_selling_points: ['daily kit', 'portable bag', 'clean storage'],
    new_target_keywords: ['wellness pouch', 'daily kit', 'storage bag'],
  });
  const run = await call('POST', '/api/v1/store/m1/runs', { targetId: target.body.id });
  db.prepare(`UPDATE m1_listing_versions SET title = ?, bullet_1 = ?, bullet_2 = ?
    WHERE id = ? AND user_id = ? AND store_id = ?`).run(
    'Best FDA Certified Medical Grade Wellness Pouch for Pain Relief and Daily Kit',
    'Apple style storage pouch with guaranteed perfect organization for daily items.',
    'Lifetime warranty and refund support language requires marketplace policy review.',
    run.body.version_id, userId, storeId,
  );

  const r = await call('GET', `/api/v1/store/m1/compliance/${target.body.id}?versionId=${run.body.version_id}`);
  assert.equal(r.status, 200);
  const codes = new Set(r.body.risks.map((risk) => risk.code));
  assert.ok(codes.has('MEDICAL_CLAIM'));
  assert.ok(codes.has('ABSOLUTE_CLAIM'));
  assert.ok(codes.has('CERTIFICATION_CLAIM'));
  assert.ok(codes.has('COMPETITOR_TRADEMARK'));
  assert.ok(codes.has('WARRANTY_PROMISE'));
  assert.equal(r.body.summary.status, 'blocked');
});

test('external ASIN remains read-only and cannot be publish-ready', async () => {
  const target = await call('POST', '/api/v1/store/m1/targets', { mode: 'asin_input', asin: 'B0EXTREADY1' });
  assert.equal(target.status, 201);
  assert.equal(target.body.asin_kind, 'external');
  const r = await call('POST', '/api/v1/store/m1/readiness/check', { targetId: target.body.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'blocked');
  assert.equal(r.body.publishAllowed, false);
  assert.ok(r.body.blockers.some((b) => b.code === 'EXTERNAL_ASIN_READ_ONLY'));
});

test('workbench bundles readiness assets keywords compliance and variation', async () => {
  const { targetId, versionId } = await createReadyTarget();
  const r = await call('GET', `/api/v1/store/m1/workbench/${targetId}?versionId=${versionId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.target.id, targetId);
  assert.equal(r.body.version.id, versionId);
  assert.equal(r.body.readiness.status, 'pass');
  assert.equal(r.body.assets.gallerySlots.length, 9);
  assert.ok(Array.isArray(r.body.variation.children));
  assert.equal(r.body.mock, true);
});
