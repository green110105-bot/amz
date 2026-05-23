#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runM1AsinBenchmark } from './m1-asin-benchmark.mjs';
import { generateAdTimeseries, REQUIRED_SCENARIOS } from '../packages/mock-data/src/ad-timeseries.mjs';

export function runBenchmarkGate() {
  const m1 = runM1AsinBenchmark();
  assert.equal(m1.coverage.asinCount, 5, 'M1 benchmark must cover 5 ASIN snapshots');
  assert.equal(m1.coverage.completedMockApplies, 5, 'M1 benchmark must mock-apply all ASINs');
  assert.equal(m1.coverage.realWritesAttempted, 0, 'M1 benchmark must not attempt real writes');
  assert.equal(m1.results.reduce((sum, item) => sum + item.proposalCount, 0), 45, 'M1 benchmark must create 45 proposals');
  assert.deepEqual(m1.coverage.optimizedDimensions, ['keywordCoverage', 'painPointAlignment', 'sellingPointClarity']);

  const m3 = generateAdTimeseries();
  assert.equal(m3.combos.length, 5, 'M3 benchmark must cover 5 ASIN/campaign combinations');
  assert.equal(m3.daily.length, 450, 'M3 benchmark must include 90 daily rows per campaign');
  assert.equal(m3.hourly.length, 10800, 'M3 benchmark must include 90 x 24 hourly rows per campaign');
  assert.equal(m3.writePolicy.realWriteAllowed, false, 'M3 benchmark must block real writes');
  assert.equal(m3.scenarioCoverage.length, REQUIRED_SCENARIOS.length, 'M3 benchmark must cover all required scenario labels');
  assert.ok(m3.scenarioCoverage.every((item) => item.covered), 'M3 benchmark scenario coverage is incomplete');

  return {
    ok: true,
    m1: {
      asinCount: m1.coverage.asinCount,
      optimizationRounds: m1.results.reduce((sum, item) => sum + item.optimizedRoundCount, 0),
      proposals: m1.results.reduce((sum, item) => sum + item.proposalCount, 0),
      averageScoreLift: m1.coverage.averageScoreLift,
      realWritesAttempted: m1.coverage.realWritesAttempted,
    },
    m3: {
      campaignCount: m3.combos.length,
      dailyRows: m3.daily.length,
      hourlyRows: m3.hourly.length,
      scenarioCount: m3.scenarioCoverage.length,
      realWriteAllowed: m3.writePolicy.realWriteAllowed,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('benchmark-gate.mjs')) {
  const result = runBenchmarkGate();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('mock benchmark gate passed');
    console.log(`- M1: ${result.m1.asinCount} ASINs, ${result.m1.optimizationRounds} rounds, ${result.m1.proposals} proposals, realWrites=${result.m1.realWritesAttempted}`);
    console.log(`- M3: ${result.m3.campaignCount} campaigns, ${result.m3.dailyRows} daily rows, ${result.m3.hourlyRows} hourly rows, scenarios=${result.m3.scenarioCount}, realWriteAllowed=${result.m3.realWriteAllowed}`);
  }
}
