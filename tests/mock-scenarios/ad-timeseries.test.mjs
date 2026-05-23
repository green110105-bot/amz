import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateAdTimeseries, REQUIRED_SCENARIOS } from '../../packages/mock-data/src/ad-timeseries.mjs';
import {
  buildBrandDefensePlan,
  evaluateAdvancedAutoExecutionGuardrails,
  optimizeBudgetAllocation,
  recommendCompetitorAsinAttacks,
  recommendDaypartingBids,
  recommendPlacementAdjustments,
} from '../../packages/domain/src/m3-advanced-engine.mjs';
import { classifyLifecycle, generateAdSuggestions } from '../../packages/domain/src/lifecycle-engine.mjs';

const DAY_MS = 86400000;

test('generateAdTimeseries creates deterministic 90-day daily and 24-hour continuous campaign series', () => {
  const first = generateAdTimeseries();
  const second = generateAdTimeseries();

  assert.deepEqual(first, second);
  assert.equal(first.combos.length, 5);
  assert.equal(first.daily.length, 5 * 90);
  assert.equal(first.hourly.length, 5 * 90 * 24);
  assert.equal(first.metadata.dayLevelDays, 90);
  assert.equal(first.metadata.hourlyLevelDays, 90);

  for (const combo of first.combos) {
    const dailyRows = first.daily.filter((row) => row.campaignId === combo.campaignId);
    const hourlyRows = first.hourly.filter((row) => row.campaignId === combo.campaignId);
    assert.equal(dailyRows.length, 90, combo.campaignId);
    assert.equal(hourlyRows.length, 90 * 24, combo.campaignId);
    assertContinuousDaily(dailyRows.map((row) => row.date));

    const hourlyByDate = groupBy(hourlyRows, (row) => row.date);
    assert.equal(hourlyByDate.size, 90, combo.campaignId);
    for (const rows of hourlyByDate.values()) {
      assert.deepEqual(rows.map((row) => row.hour).sort((a, b) => a - b), Array.from({ length: 24 }, (_, hour) => hour));
    }
  }
});

test('ad timeseries covers every required M3 scenario with source, confidence, and expected signals', () => {
  const fixture = generateAdTimeseries();
  const coverage = new Map(fixture.scenarioCoverage.map((item) => [item.scenario, item]));

  assert.deepEqual([...coverage.keys()].sort(), [...REQUIRED_SCENARIOS].sort());
  for (const scenario of REQUIRED_SCENARIOS) {
    const item = coverage.get(scenario);
    assert.equal(item.covered, true, scenario);
    assert.ok(item.campaignIds.length > 0, scenario);
    assert.ok(item.expectedSignals.length > 0, scenario);
  }

  for (const section of [fixture, ...fixture.combos, ...fixture.daily.slice(0, 10), ...fixture.hourly.slice(0, 10)]) {
    assert.equal(section.source.mode, 'deterministic_mock');
    assert.equal(typeof section.source.confidence, 'number');
    assert.ok(section.source.confidence > 0 && section.source.confidence <= 1);
  }
  assert.ok(fixture.expectedSignals.some((item) => item.signal === 'no_real_store_write'));
});

test('ad timeseries fixture is mock-read only and generator supports stdout without provider writes', () => {
  const fixture = generateAdTimeseries();

  assert.equal(fixture.metadata.realWritesPerformed, false);
  assert.equal(fixture.writePolicy.realWriteAllowed, false);
  assert.ok(fixture.writePolicy.blockedActions.includes('ads.updateCampaignBudget'));
  assert.ok(fixture.writePolicy.blockedActions.includes('external_network_mutation'));

  const result = spawnSync(process.execPath, ['scripts/generate-ad-timeseries.mjs', '--stdout'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.writePolicy.realWriteAllowed, false);
  assert.equal(parsed.daily.length, 450);
  assert.equal(parsed.hourly.length, 10800);
});

test('generated data is consumable by lifecycle and M3 advanced engines', () => {
  const fixture = generateAdTimeseries();
  const lifecycleInput = fixture.engineInputs.lifecycle;
  const suggestions = generateAdSuggestions(lifecycleInput);

  assert.ok(lifecycleInput.products.some((product) => classifyLifecycle(product).stage === 'launch'));
  assert.ok(suggestions.some((item) => item.actionType === 'ADD_NEGATIVE_KEYWORD'));
  assert.ok(suggestions.some((item) => item.actionType === 'REDUCE_BUDGET_STOCKOUT_RISK'));
  assert.ok(suggestions.every((item) => item.auditRequired === true && item.status === 'pending_review'));

  const budget = optimizeBudgetAllocation(fixture.engineInputs.budgetAllocation);
  assert.ok(budget.recommendations.length >= 5);
  assert.equal(budget.source.mode, 'deterministic_mock');

  const dayparting = recommendDaypartingBids(fixture.engineInputs.dayparting);
  assert.equal(dayparting.schedule.length, 168);
  assert.ok(dayparting.schedule.some((slot) => slot.hour >= 12 && slot.hour <= 14 && slot.bidAdjustmentPct > 0));

  const placement = recommendPlacementAdjustments(fixture.engineInputs.placements);
  assert.ok(placement.recommendations.some((item) => item.placement === 'product_pages' && item.actionType === 'ADJUST_PLACEMENT_BID' && item.recommendedAdjustmentPct < 0));

  const brandDefense = buildBrandDefensePlan(fixture.engineInputs.brandDefense);
  assert.equal(brandDefense.status, 'exposed');
  assert.ok(brandDefense.recommendations.some((item) => ['CREATE_BRAND_DEFENSE_CAMPAIGN', 'INCREASE_BRAND_TERM_BID', 'ADD_BRAND_TERM_TO_EXACT_CAMPAIGN'].includes(item.actionType)));

  const competitorAttack = recommendCompetitorAsinAttacks(fixture.engineInputs.competitorAttack);
  assert.ok(competitorAttack.recommendations.some((item) => item.targetAsin === 'B0COMPETE01'));

  const guardrail = evaluateAdvancedAutoExecutionGuardrails(fixture.engineInputs.guardrails);
  assert.equal(guardrail.passes, false);
  assert.equal(guardrail.decision, 'queue_for_human_review');
});

function assertContinuousDaily(dates) {
  for (let index = 1; index < dates.length; index += 1) {
    const previous = Date.parse(`${dates[index - 1]}T00:00:00.000Z`);
    const current = Date.parse(`${dates[index]}T00:00:00.000Z`);
    assert.equal(current - previous, DAY_MS, `${dates[index - 1]} -> ${dates[index]}`);
  }
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
