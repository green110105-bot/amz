#!/usr/bin/env node
import assert from 'node:assert/strict';
import { enumerateScenarios, scenarioCatalog, scenarioCategories, summarizeScenarioCatalog, validateScenarioCatalog } from '../packages/mock-data/src/scenario-catalog.mjs';

export function runMockScenarioSelfTest({ rounds = 5 } = {}) {
  const fullCatalogValidation = validateScenarioCatalog();
  assert.equal(fullCatalogValidation.ok, true, `catalog validation failed: ${fullCatalogValidation.errors.join('; ')}`);

  const roundResults = [];
  const allCoveredCategories = new Set();
  const allCoveredScenarioIds = new Set();

  for (let round = 1; round <= rounds; round += 1) {
    const scenarios = scenariosForRound(round);

    for (const scenario of scenarios) {
      allCoveredCategories.add(scenario.category);
      allCoveredScenarioIds.add(scenario.id);
      assertScenarioSafeAndComplete(scenario, round);
    }

    roundResults.push({ round, scenarioCount: scenarios.length, summary: summarizeScenarioCatalog(scenarios) });
  }

  for (const category of scenarioCategories) {
    assert.equal(allCoveredCategories.has(category), true, `category not covered across rounds: ${category}`);
  }
  assert.equal(allCoveredScenarioIds.size, scenarioCatalog.length, 'not every scenario was exercised across the five rounds');

  return {
    ok: true,
    rounds,
    scenarioCount: scenarioCatalog.length,
    categories: scenarioCategories,
    roundResults,
  };
}

function scenariosForRound(round) {
  if (round === 1) return enumerateScenarios();
  if (round === 2) return scenarioCategories.flatMap((category) => enumerateScenarios({ category }).slice(0, 1));
  if (round === 3) return enumerateScenarios().filter((scenario) => scenario.providers.includes('amazon-ads-api') || scenario.providers.includes('billing'));
  if (round === 4) return enumerateScenarios().filter((scenario) => scenario.category === 'audit-security' || scenario.category === 'provider-mode');
  return enumerateScenarios().filter((scenario, index) => index % 2 === round % 2 || scenario.category === 'commercialization');
}

function assertScenarioSafeAndComplete(scenario, round) {
  assert.equal(typeof scenario.source, 'string', `round ${round} ${scenario.id}: source missing`);
  assert.ok(scenario.source.length > 0, `round ${round} ${scenario.id}: source empty`);
  assert.equal(typeof scenario.confidence, 'number', `round ${round} ${scenario.id}: confidence missing`);
  assert.ok(scenario.confidence > 0 && scenario.confidence <= 1, `round ${round} ${scenario.id}: confidence out of range`);
  assert.ok(Array.isArray(scenario.expectedSignals) && scenario.expectedSignals.length > 0, `round ${round} ${scenario.id}: expectedSignals missing`);
  assert.equal(scenario.writePolicy.realWriteAllowed, false, `round ${round} ${scenario.id}: real writes must not be allowed`);
  assert.ok(scenario.writePolicy.blockedActions.length > 0, `round ${round} ${scenario.id}: blockedActions missing`);
  assert.equal(scenario.metadata.sourceMode, 'mock', `round ${round} ${scenario.id}: metadata sourceMode must be mock`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('mock-scenario-test.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const result = runMockScenarioSelfTest({ rounds: args.rounds });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Mock scenario self-test passed: ${result.rounds} rounds, ${result.scenarioCount} scenarios.`);
    for (const round of result.roundResults) {
      console.log(`- round ${round.round}: ${round.scenarioCount} scenarios, realWrites=${round.summary.realWriteAllowed ? 'YES' : 'NO'}`);
    }
  }
}

function parseArgs(argv) {
  const parsed = { rounds: 5, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--rounds') parsed.rounds = Number(argv[++index]);
    else if (arg.startsWith('--rounds=')) parsed.rounds = Number(arg.slice('--rounds='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/mock-scenario-test.mjs [--rounds 5] [--json]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(parsed.rounds) || parsed.rounds < 5) throw new Error('--rounds must be an integer >= 5');
  return parsed;
}
