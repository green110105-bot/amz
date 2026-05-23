import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionContext, createCodexLocalDecision, validateDecision } from '../../packages/domain/src/ai-decision-engine.mjs';
import { listPrompts } from '../../packages/prompts/src/prompt-registry.mjs';

 test('prompt registry exposes module-owned prompts', () => {
  const prompts = listPrompts();
  assert.ok(prompts.length >= 8);
  assert.ok(prompts.some((prompt) => prompt.id === 'P-M1-DIAGNOSE'));
});

 test('codex local decision is structured and explainable', () => {
  const decision = createCodexLocalDecision({
    module: 'M4',
    promptId: 'P-M4-ANOMALY-RECOMMEND',
    subject: { id: 'a1', type: 'BUY_BOX_LOST', severity: 'P0', recommendedAction: 'Investigate Buy Box loss now.' },
    evidence: ['Buy Box lost for 35 minutes'],
  });
  assert.equal(decision.provider, 'codex_local');
  assert.equal(decision.actionType, 'BUY_BOX_LOST');
  assert.ok(decision.reasoning.evidence.length > 0);
  assert.equal(validateDecision(decision), decision);
});

 test('buildDecisionContext rejects prompt/module mismatch', () => {
  assert.throws(() => buildDecisionContext({ module: 'M2', promptId: 'P-M1-DIAGNOSE' }));
});
