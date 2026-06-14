// tests/ui-m4-appeals-flow.test.mjs
// Component-level contract tests for the M4 appeal / hijacking surfaces.
// Style follows the source-contract assertion approach used elsewhere in tests/: the Vue
// SFCs are not mounted in this node harness, so we assert the load-bearing
// template/script contracts directly against source. Covers:
//   M4-P0-02  Hijacking.vue appeal gating + manual-evidence form + appealId from row
//   M4-P0-03  Appeals.vue manual-evidence form + body passthrough + per-field errors
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

// ---------------------------------------------------------------------------
// M4-P0-02 — Hijacking.vue
// ---------------------------------------------------------------------------
const HJ = 'apps/web-v2/src/pages/Hijacking.vue';

test('(a)/(b) M4-P0-02: appeal button gated on test_buy_received only, not appeal_drafted', () => {
  const src = read(HJ);
  // (a) the 记录人工申诉 button is gated on test_buy_received
  assert.match(src, /row\.status === 'test_buy_received'[^]*?recordAppealSubmission/);
  // (b) it is NO LONGER gated on the dead appeal_drafted status
  assert.doesNotMatch(src, /row\.status === 'appeal_drafted'/);
  assert.doesNotMatch(src, /'test_buy_received' \|\| row\.status === 'appeal_drafted'/);
});

test('(c) M4-P0-02: missing fields are reported and the API is not called', () => {
  const src = read(HJ);
  // a missing-field guard returns before calling submitAppeal
  assert.match(src, /missing\.length/);
  assert.match(src, /未记录人工申诉/);
  // the four manual-evidence fields are collected
  for (const f of ['amazonCaseId', 'submittedBy', 'manualSubmittedAt', 'evidenceAttachment']) {
    assert.match(src, new RegExp(f));
  }
});

test('(d) M4-P0-02: appealId comes from the row, never user input', () => {
  const src = read(HJ);
  // appealId is sourced from item.appealId / item.appeal_id
  assert.match(src, /appealId:\s*item\.appealId/);
  // the user-typed case id is NOT passed as appealId
  assert.doesNotMatch(src, /appealId:\s*caseId/);
  assert.doesNotMatch(src, /body\.appealId\s*=\s*caseId/);
});

test('M4-P0-02: success toast only fires on confirmed appeal_submitted/submitted', () => {
  const src = read(HJ);
  assert.match(src, /=== 'appeal_submitted' \|\| appealStatus === 'submitted'/);
});

// ---------------------------------------------------------------------------
// M4-P0-03 — Appeals.vue
// ---------------------------------------------------------------------------
const AP = 'apps/web-v2/src/pages/Appeals.vue';

test('(a) M4-P0-03: submit collects the four manual-evidence fields and passes them as body', () => {
  const src = read(AP);
  assert.match(src, /collectManualEvidence/);
  for (const f of ['amazonCaseId', 'submittedBy', 'manualSubmittedAt', 'evidenceAttachment']) {
    assert.match(src, new RegExp(f));
  }
  // ap.submit is called WITH the collected form (not bare ap.submit(a.id))
  assert.match(src, /ap\.submit\(a\.id,\s*form\)/);
  assert.doesNotMatch(src, /ap\.submit\(a\.id\)\s*;/);
});

test('(b) M4-P0-03: validation_failed renders error.missing per-field, stays in draft', () => {
  const src = read(AP);
  assert.match(src, /err\?\.error === 'validation_failed'/);
  assert.match(src, /Array\.isArray\(err\.missing\)/);
  // per-field red-text rendering keyed by row id
  assert.match(src, /submitErrors/);
  assert.match(src, /submit-error-item/);
});

test('(c) M4-P0-03: m4.js appeals.submit accepts a body second arg', () => {
  const src = read('apps/web-v2/src/api/m4.js');
  assert.match(src, /submit:\s*\(id,\s*body\s*=\s*\{\}\)\s*=>\s*http\.post\(`\$\{BASE\}\/appeals\/\$\{id\}\/submit`,\s*body\)/);
});
