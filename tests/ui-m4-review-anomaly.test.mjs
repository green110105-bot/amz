// tests/ui-m4-review-anomaly.test.mjs
// Component-level contract tests for:
//   M4-P2-06  ReviewList.vue draftAppeal violationType is AI/user-driven, not hardcoded
//   M4-P3-01  MonitorAnomalies.vue anti-double-submit + merged watch + assignee debounce
//   M4-P3-01/02  useM4State.js single-flight params signature + optimistic rollback
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

// ---------------------------------------------------------------------------
// M4-P2-06 — ReviewList.vue
// ---------------------------------------------------------------------------
const RL = 'apps/web-v2/src/pages/ReviewList.vue';

test('M4-P2-06: draftAppeal does not hardcode violationType', () => {
  const src = read(RL);
  // the markAppealable call must not pass a hardcoded literal violationType
  assert.doesNotMatch(src, /markAppealable\([^)]*violationType:\s*'unrelated_to_product'/);
});

test('M4-P2-06: violationType is derived from AI/user fields', () => {
  const src = read(RL);
  assert.match(src, /resolveViolationType/);
  // reads at least the AI/user analysis fields
  assert.match(src, /r\.violationType/);
  assert.match(src, /aiViolationType|suggestedViolationType/);
  // only sends violationType when present (no single hardcoded default)
  assert.match(src, /if \(violationType\) body\.violationType = violationType/);
});

test('M4-P2-06: the resolved value (not a literal) flows to the backend call', () => {
  const src = read(RL);
  assert.match(src, /const body = \{ appealable: true \}/);
  assert.match(src, /markAppealable\(r\.id, body\)/);
});

// ---------------------------------------------------------------------------
// M4-P3-01 — MonitorAnomalies.vue
// ---------------------------------------------------------------------------
const MA = 'apps/web-v2/src/pages/MonitorAnomalies.vue';

test('M4-P3-01: row action buttons have :loading/:disabled anti-double-submit', () => {
  const src = read(MA);
  assert.match(src, /:loading="isBusy\(row\.id, 'resolved'\)"/);
  assert.match(src, /:disabled="isBusy\(row\.id, 'resolved'\)"/);
  // the in-flight guard ignores repeated clicks
  assert.match(src, /if \(rowBusy\.value\[k\]\) return;/);
});

test('M4-P3-01: onResolve unifies empty value handling', () => {
  const src = read(MA);
  // note is trimmed and defaults to empty string, not undefined
  assert.match(src, /const note = String\(value \|\| ''\)\.trim\(\);/);
});

test('M4-P3-01: the two same-source watches are merged + assignee debounced', () => {
  const src = read(MA);
  // there is no longer a bare `watch([sevFilter, statusFilter, assigneeFilter], load)`
  assert.doesNotMatch(src, /watch\(\[sevFilter, statusFilter, assigneeFilter\], load\)/);
  // assignee has its own debounced watch
  assert.match(src, /watch\(assigneeFilter/);
  assert.match(src, /setTimeout\(syncQueryAndLoad, 300\)/);
});

// ---------------------------------------------------------------------------
// M4-P3-01 / M4-P3-02 — useM4State.js
// ---------------------------------------------------------------------------
const STATE = 'apps/web-v2/src/composables/useM4State.js';

test('M4-P3-01: anomalies single-flight key carries a params signature + seq guard', () => {
  const src = read(STATE);
  assert.match(src, /_anomPromiseKey/);
  assert.match(src, /_paramsKey/);
  // dedupe only when params signature matches the in-flight one
  assert.match(src, /_anomPromise && _anomPromiseKey === key/);
  // stale-response guard so an old assignee request can't overwrite a newer one
  assert.match(src, /if \(seq !== _anomSeq\) return _anomList\.value;/);
});

test('M4-P3-02: optimistic pushM1 uses the backend object + rolls back on failure', () => {
  const src = read(STATE);
  // no longer hardcodes status: 'pushed' as the only update value
  assert.match(src, /r && typeof r === 'object' && \(r\.id \|\| r\.status\)/);
  // rollback snapshots for both cluster and image-diff push
  assert.match(src, /const snapshot =/);
  assert.match(src, /if \(snapshot\) _patch\(_clList, id, snapshot\)/);
  assert.match(src, /if \(snapshot\) _patch\(_idList, id, snapshot\)/);
});
