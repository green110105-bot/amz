import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { scenarioCatalog, scenarioCategories, summarizeScenarioCatalog, validateScenarioCatalog } from '../../packages/mock-data/src/scenario-catalog.mjs';
import { runMockScenarioSelfTest } from '../../scripts/mock-scenario-test.mjs';

test('scenario catalog covers MVP, safety, commercial, and provider-mode categories', () => {
  const validation = validateScenarioCatalog();
  const summary = summarizeScenarioCatalog();

  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.equal(summary.total, scenarioCatalog.length);
  for (const category of scenarioCategories) {
    assert.ok(summary.categories[category] > 0, `${category} should have at least one scenario`);
  }
  assert.equal(summary.realWriteAllowed, false);
});

test('every scenario has complete lineage, confidence, expected signals, and blocked write policy', () => {
  const ids = new Set();
  for (const scenario of scenarioCatalog) {
    assert.equal(ids.has(scenario.id), false, `duplicate id ${scenario.id}`);
    ids.add(scenario.id);
    assert.match(scenario.source, /^mock-scenarios:/);
    assert.ok(scenario.confidence > 0 && scenario.confidence <= 1);
    assert.ok(scenario.expectedSignals.length >= 4, `${scenario.id} needs rich expected signals`);
    assert.equal(scenario.metadata.sourceMode, 'mock');
    assert.equal(scenario.writePolicy.realWriteAllowed, false);
    assert.ok(scenario.writePolicy.blockedActions.length > 0);
  }
});

test('enumerate script supports human and JSON output', () => {
  const human = execFileSync(process.execPath, ['scripts/enumerate-mock-scenarios.mjs', '--category', 'M3'], { encoding: 'utf8' });
  assert.match(human, /Mock scenarios:/);
  assert.match(human, /m3-acos-waste-negative-keyword/);

  const json = execFileSync(process.execPath, ['scripts/enumerate-mock-scenarios.mjs', '--json', '--provider', 'billing'], { encoding: 'utf8' });
  const parsed = JSON.parse(json);
  assert.ok(parsed.summary.total >= 3);
  assert.ok(parsed.scenarios.every((scenario) => scenario.providers.includes('billing')));
});

test('mock scenario self-test runs at least five rounds and covers all categories without real writes', () => {
  const result = runMockScenarioSelfTest({ rounds: 5 });

  assert.equal(result.ok, true);
  assert.equal(result.rounds, 5);
  assert.equal(result.scenarioCount, scenarioCatalog.length);
  assert.deepEqual(result.categories, scenarioCategories);
  assert.ok(result.roundResults.every((round) => round.summary.realWriteAllowed === false));
});
