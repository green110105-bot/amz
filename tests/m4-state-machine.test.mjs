// tests/m4-state-machine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
// Import from the dependency-free transitions module (useM4State.js re-exports these,
// but importing it directly under bare node ESM would pull in the extensionless
// '../api/m4' + element-plus/axios chain that Vite resolves and node does not).
import {
  canAppealTransition,
  canRecoveryTransition,
  canAnomalyTransition,
  canHijackingTransition,
  canInfringementTransition,
  allowedAppealActions,
  allowedRecoveryActions,
  allowedAnomalyActions,
} from '../apps/web-v2/src/composables/m4-transitions.js';

test('appeal transitions', () => {
  assert.equal(canAppealTransition('draft', 'submitted'), true);
  assert.equal(canAppealTransition('draft', 'accepted'), false);
  assert.equal(canAppealTransition('submitted', 'accepted'), true);
  assert.equal(canAppealTransition('accepted', 'submitted'), false);
});

test('recovery transitions', () => {
  assert.equal(canRecoveryTransition('draft', 'marked_sent'), true);
  assert.equal(canRecoveryTransition('marked_sent', 'replied'), true);
  assert.equal(canRecoveryTransition('closed', 'draft'), false);
});

test('anomaly transitions', () => {
  assert.equal(canAnomalyTransition('open', 'assigned'), true);
  assert.equal(canAnomalyTransition('resolved', 'open'), false);
});

// M4-P0-02: the backend never writes `appeal_drafted` — submitHijackingAppeal moves the
// case straight from `test_buy_received` to `appeal_submitted`. The dead state was
// removed from the front-end transition map, so these assertions lock the corrected
// contract (a previously-passing test that asserted the appeal_drafted path is now
// intentionally inverted).
test('hijacking transitions (M4-P0-02: no dead appeal_drafted)', () => {
  assert.equal(canHijackingTransition('pending_test_buy', 'test_buy_in_transit'), true);
  assert.equal(canHijackingTransition('test_buy_in_transit', 'test_buy_received'), true);
  // received now goes directly to appeal_submitted, not through appeal_drafted
  assert.equal(canHijackingTransition('test_buy_received', 'appeal_submitted'), true);
  assert.equal(canHijackingTransition('test_buy_received', 'genuine'), true);
  // appeal_drafted is dead: no transition into or out of it
  assert.equal(canHijackingTransition('test_buy_received', 'appeal_drafted'), false);
  assert.equal(canHijackingTransition('appeal_drafted', 'appeal_submitted'), false);
  assert.equal(canHijackingTransition('appeal_submitted', 'appeal_accepted'), true);
});

test('infringement transitions', () => {
  assert.equal(canInfringementTransition('investigating', 'draft'), true);
  assert.equal(canInfringementTransition('draft', 'submitted'), true);
  assert.equal(canInfringementTransition('resolved', 'draft'), false);
});

test('allowed actions helpers', () => {
  assert.ok(Array.isArray(allowedAppealActions('draft')));
  assert.ok(Array.isArray(allowedRecoveryActions('draft')));
  assert.ok(Array.isArray(allowedAnomalyActions('open')));
});
