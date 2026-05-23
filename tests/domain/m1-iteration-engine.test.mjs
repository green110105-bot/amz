import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceAbExperiment,
  applyCategoryTemplate,
  applyIteration,
  checkImageCompliance,
  compareListingVersions,
  createAbExperiment,
  createIterationSession,
  createListingVersion,
  createM1Diagnosis,
  decideIterationRound,
  evaluateAbResult,
  finishIteration,
  generateImageCandidates,
  generateThreeProposals,
  getCategoryTemplate,
  rollbackListingVersion,
  startIterationRound,
  transitionIterationState,
  validateCategoryTemplateRules,
  M1_EXPERIMENT_STATES,
  M1_ITERATION_EVENTS,
  M1_ITERATION_STATES,
} from '../../packages/domain/src/m1-iteration-engine.mjs';

const product = {
  id: 'prod-case-001',
  asin: 'B0CASE001',
  sku: 'CASE-001',
  brand: 'Acme',
  title: 'Acme Phone Case',
  category: 'electronics_accessories',
};

const listing = {
  productId: 'prod-case-001',
  asin: 'B0CASE001',
  brand: 'Acme',
  category: 'electronics_accessories',
  title: 'Acme Phone Case compatible with iPhone 15',
  bullets: [
    'Slim TPU phone case for iPhone 15.',
    'Wireless charging compatible with clear cutouts.',
    'Raised camera lip helps reduce scratches.',
    'CE tested material with 2 mm protective edge.',
    '1-year warranty and easy returns.',
  ],
  description: 'Includes a comparison table for fit and drop specs.',
  images: ['main.jpg', 'angle.jpg', 'size.jpg'],
  aPlusModules: [{ type: 'comparison_table', text: 'Compare fit, material, and drop specs.' }],
};

const searchTerms = [
  { term: 'phone case', impressions: 2000, conversions: 60 },
  { term: 'shockproof case', impressions: 1000, conversions: 40 },
  { term: 'iphone 15 case', impressions: 800, conversions: 30 },
];

const reviews = [
  { rating: 2, title: 'Loose corner', body: 'The corner got loose after a drop.' },
  { rating: 5, title: 'Good fit', body: 'Fits iPhone 15 and protects the camera.' },
];

const uspImprovement = {
  id: 'imp-usp',
  rank: 1,
  dimension: 'sellingPointClarity',
  sub_dimension: 'D2.1',
  location: 'bullet_1',
  issue: 'First bullet is too generic.',
  direction: 'Highlight 12 ft drop protection and tested device fit',
  expected_score_lift: 8,
};

test('transitionIterationState enforces the documented M1 state machine', () => {
  assert.equal(
    transitionIterationState(M1_ITERATION_STATES.IDLE, M1_ITERATION_EVENTS.START_DIAGNOSIS).to,
    M1_ITERATION_STATES.DIAGNOSING,
  );
  assert.equal(
    transitionIterationState(M1_ITERATION_STATES.REVIEWING, M1_ITERATION_EVENTS.REWRITE_REQUEST).to,
    M1_ITERATION_STATES.PROPOSING,
  );
  assert.throws(
    () => transitionIterationState(M1_ITERATION_STATES.APPLIED, M1_ITERATION_EVENTS.RETURN_TO_EDIT),
    /Invalid M1 iteration transition/,
  );
});

test('category templates expose weights and validate must-have rules', () => {
  const template = getCategoryTemplate('electronics_accessories');
  assert.equal(template.scoringWeights.D2, 0.25);
  assert.ok(template.mustHaveElements.some((item) => item.id === 'compatibility_list'));

  const failed = validateCategoryTemplateRules({
    category: 'baby_products',
    listing: { title: 'Soft Toy', bullets: ['Cute toy for babies.'], description: 'Simple toy.' },
  });
  assert.equal(failed.passes, false);
  assert.ok(failed.missing.some((item) => item.id === 'age_range'));

  const applied = applyCategoryTemplate(listing, { category: 'electronics_accessories' });
  assert.equal(applied.bulletPrompts.length, 5);
  assert.equal(applied.audit.passes, true);
});

test('generateThreeProposals creates deterministic A/B/C text proposals', () => {
  const first = generateThreeProposals({
    product,
    listing,
    improvement: uspImprovement,
    category: 'electronics_accessories',
    searchTerms,
    preferences: { bannedWords: ['free'] },
  });
  const second = generateThreeProposals({
    product,
    listing,
    improvement: uspImprovement,
    category: 'electronics_accessories',
    searchTerms,
    preferences: { bannedWords: ['free'] },
  });

  assert.equal(first.proposalType, 'text');
  assert.deepEqual(first.proposals.map((item) => item.id), ['A', 'B', 'C']);
  assert.deepEqual(first, second);
  assert.ok(first.proposals.every((item) => item.compliance_check.passes));
  assert.notEqual(first.proposals[0].angle, first.proposals[1].angle);
});

test('image candidates and compliance checks cover main and A+ rules', () => {
  const imageImprovement = {
    id: 'imp-main-image',
    rank: 2,
    type: 'image',
    sub_dimension: 'D4.1',
    location: 'main_image',
    issue: 'Main image lacks proof badge.',
    direction: 'Add warranty and tested compatibility badges',
    expected_score_lift: 5,
  };
  const generation = generateImageCandidates({
    product,
    listing,
    improvement: imageImprovement,
    category: 'electronics_accessories',
    sellingPoints: ['1-Year Warranty', 'CE Tested'],
  });
  assert.equal(generation.candidates.length, 3);
  assert.equal(generation.complianceSummary.allPassed, true);
  assert.ok(generation.candidates.every((item) => item.compliance_check.passes));

  const invalidMain = checkImageCompliance({
    imageType: 'main',
    format: 'webp',
    width: 1200,
    height: 1200,
    whiteBackground: false,
    productRatio: 0.72,
    hasWatermark: true,
    photographic: false,
  }, { category: 'electronics_accessories' });
  assert.equal(invalidMain.passes, false);
  assert.ok(invalidMain.violations.some((item) => item.rule === 'white_bg'));
  assert.ok(invalidMain.violations.some((item) => item.rule === 'product_ratio'));

  const invalidAplus = checkImageCompliance({
    imageType: 'a_plus',
    format: 'jpg',
    width: 1464,
    height: 600,
    medicalClaims: ['cures back pain'],
    thirdPartyBrands: ['CompetitorCo'],
  }, { category: 'home_kitchen', imageType: 'a_plus' });
  assert.equal(invalidAplus.passes, false);
  assert.ok(invalidAplus.violations.some((item) => item.rule === 'medical_claims'));
});

test('user decisions update draft listing, score, and draft version deterministically', () => {
  const diagnosis = createM1Diagnosis({ product, listing, searchTerms, reviews, category: 'electronics_accessories' });
  const session = createIterationSession({ product, listing, diagnosis, category: 'electronics_accessories', createdBy: 'operator-1' });
  const reviewing = startIterationRound(session, {
    improvement: uspImprovement,
    product,
    searchTerms,
  });

  assert.equal(reviewing.state, M1_ITERATION_STATES.REVIEWING);
  assert.equal(reviewing.rounds[0].proposals.length, 3);

  const decided = decideIterationRound(reviewing, { action: 'accept', selectedProposalId: 'A' });
  assert.equal(decided.state, M1_ITERATION_STATES.ITERATION_IN_PROGRESS);
  assert.equal(decided.rounds[0].scoreLift, 8);
  assert.equal(decided.versions.length, 2);
  assert.equal(decided.versions[1].status, 'draft');
  assert.notEqual(decided.draftListing.bullets[0], listing.bullets[0]);

  const pending = finishIteration(decided);
  assert.equal(pending.state, M1_ITERATION_STATES.PENDING_APPLY);
  assert.ok(pending.applyPreview.changedFields === undefined);
  assert.ok(pending.applyPreview.changes.some((change) => change.field === 'bullets'));

  const applied = applyIteration(pending, { confirm: true, appliedBy: 'operator-1' });
  assert.equal(applied.state, M1_ITERATION_STATES.APPLIED);
  assert.equal(applied.applyResult.mode, 'mock');
  assert.equal(applied.versions.find((version) => version.id === decided.draftVersionId).isCurrent, true);
});

test('rewrite decision regenerates proposals without completing the round', () => {
  const session = createIterationSession({
    product,
    listing,
    diagnosis: createM1Diagnosis({ product, listing, searchTerms, reviews }),
  });
  const reviewing = startIterationRound(session, { improvement: uspImprovement, product, searchTerms });
  const rewritten = decideIterationRound(reviewing, {
    action: 'rewrite',
    feedback: 'make it calmer and less salesy',
    searchTerms,
  });

  assert.equal(rewritten.state, M1_ITERATION_STATES.REVIEWING);
  assert.equal(rewritten.rounds[0].status, M1_ITERATION_STATES.REVIEWING);
  assert.equal(rewritten.rounds[0].proposalBatches.length, 2);
  assert.ok(rewritten.rounds[0].proposals.every((item) => item.addresses_feedback?.includes('calmer')));
});

test('version comparison and rollback create auditable draft versions', () => {
  const initial = createListingVersion({
    productId: product.id,
    asin: product.asin,
    listing,
    source: 'initial_import',
    status: 'live',
    isCurrent: true,
    versionNumber: 1,
    scoreSnapshot: { total: 61 },
  });
  const changedListing = { ...listing, title: 'Acme Shockproof Phone Case for iPhone 15' };
  const draft = createListingVersion({
    productId: product.id,
    asin: product.asin,
    listing: changedListing,
    previousVersions: [initial],
    source: 'ai_iteration',
    scoreSnapshot: { total: 70 },
  });
  const diff = compareListingVersions(initial, draft);
  assert.deepEqual(diff.changedFields, ['title']);
  assert.equal(diff.scoreDelta, 9);

  const rollback = rollbackListingVersion([initial, { ...draft, status: 'live', isCurrent: true }], initial.id, { requestedBy: 'manager-1' });
  assert.equal(rollback.version.versionNumber, 3);
  assert.equal(rollback.version.source, 'rollback');
  assert.equal(rollback.auditLog.status, 'pending_approval');
});

test('A/B experiment simulator advances state and evaluates significance', () => {
  const control = createListingVersion({
    productId: product.id,
    asin: product.asin,
    listing,
    source: 'initial_import',
    status: 'live',
    isCurrent: true,
    versionNumber: 1,
    scoreSnapshot: { total: 60 },
  });
  const treatment = createListingVersion({
    productId: product.id,
    asin: product.asin,
    listing: { ...listing, mainImageUrl: 'new-main.jpg' },
    previousVersions: [control],
    source: 'ai_iteration',
    status: 'draft',
    scoreSnapshot: { total: 72 },
  });
  const experiment = createAbExperiment({
    product,
    experimentType: 'main_image',
    controlVersion: control,
    treatmentVersion: treatment,
    durationDays: 14,
  });

  assert.equal(experiment.status, M1_EXPERIMENT_STATES.PENDING);
  const running = advanceAbExperiment(experiment, {
    daysElapsed: 7,
    dailyMetrics: {
      control: { sessions: 1000, conversions: 50 },
      treatment: { sessions: 1000, conversions: 85 },
    },
  });
  assert.equal(running.status, M1_EXPERIMENT_STATES.RUNNING);
  assert.equal(running.winner, null);

  const completed = advanceAbExperiment(running, {
    daysElapsed: 14,
    dailyMetrics: {
      control: { sessions: 1000, conversions: 50 },
      treatment: { sessions: 1000, conversions: 85 },
    },
  });
  assert.equal(completed.status, M1_EXPERIMENT_STATES.COMPLETED);
  assert.equal(completed.winner, 'treatment');
  assert.equal(completed.significance, 'significant');
  assert.equal(evaluateAbResult({ sessions: 1000, conversions: 50 }, { sessions: 1000, conversions: 85 }).winner, 'treatment');
});
