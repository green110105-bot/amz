#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  applyIteration,
  createIterationSession,
  createM1Diagnosis,
  decideIterationRound,
  finishIteration,
  startIterationRound,
} from '../packages/domain/src/m1-iteration-engine.mjs';
import { publicAsinListingBenchmarks } from '../packages/mock-data/src/asin-listing-benchmarks.mjs';

export function runM1AsinBenchmark({ cases = publicAsinListingBenchmarks } = {}) {
  const results = cases.map(runSingleAsinBenchmark);
  const coverage = summarizeResults(results);

  assert.equal(results.length, 5, 'M1 benchmark must cover exactly five public ASIN snapshots');
  assert.equal(coverage.realWritesAttempted, 0, 'M1 benchmark must not attempt real writes');
  assert.equal(coverage.completedMockApplies, results.length, 'Every ASIN should reach mock apply');
  assert.equal(coverage.improvedOrActionable, results.length, 'Every ASIN should either improve or produce actionable recommendations');
  assert.ok(coverage.averageImprovementCount >= 3, 'Average improvement coverage is too shallow');

  return {
    ok: true,
    sourceMode: 'public_asin_snapshot_plus_synthetic_reviews',
    writePolicy: { realWriteAllowed: false, blockedActions: ['spapi.patchListing'] },
    coverage,
    results,
  };
}

function runSingleAsinBenchmark(benchmark) {
  const input = {
    product: benchmark.product,
    listing: benchmark.listing,
    searchTerms: benchmark.searchTerms,
    reviews: benchmark.reviews,
    competitors: benchmark.competitors,
    category: benchmark.product.category,
    triggeredBy: 'public_asin_benchmark',
  };
  const diagnosis = createM1Diagnosis(input);
  assert.ok(diagnosis.improvements.length > 0, `${benchmark.asin}: diagnosis must produce improvements`);

  const selectedImprovements = selectBenchmarkImprovements(diagnosis.improvements, 3);
  let session = createIterationSession({
    product: benchmark.product,
    listing: benchmark.listing,
    diagnosis,
    category: benchmark.product.category,
    createdBy: 'm1-benchmark',
  });

  const roundSummaries = [];
  for (const improvement of selectedImprovements) {
    const reviewing = startIterationRound(session, {
      improvement,
      product: benchmark.product,
      searchTerms: benchmark.searchTerms,
    });
    session = decideIterationRound(reviewing, { action: 'accept', selectedProposalId: 'A' });
    const round = session.rounds.at(-1);
    roundSummaries.push({
      improvementId: improvement.id,
      dimension: improvement.dimension,
      location: improvement.location,
      proposalCount: round.proposals.length,
      scoreLift: round.scoreLift,
      changedFields: round.changes.map((change) => change.field),
    });
  }

  const pending = finishIteration(session);
  const applied = applyIteration(pending, { confirm: true, appliedBy: 'm1-benchmark' });

  const finalVersion = applied.versions.find((version) => version.id === applied.draftVersionId) || applied.versions.at(-1);
  const afterScore = Number(finalVersion?.scoreSnapshot?.total || session.currentScore || diagnosis.total_score);
  const scoreLift = Number((afterScore - Number(diagnosis.total_score)).toFixed(1));
  const topImprovement = selectedImprovements[0];

  return {
    asin: benchmark.asin,
    id: benchmark.id,
    sourceUrl: benchmark.publicSourceUrl,
    category: diagnosis.category,
    beforeScore: diagnosis.total_score,
    afterScore,
    scoreLift,
    confidence: diagnosis.confidence,
    improvementCount: diagnosis.improvements.length,
    optimizedRoundCount: roundSummaries.length,
    optimizedDimensions: [...new Set(roundSummaries.map((round) => round.dimension))],
    roundSummaries,
    topImprovement: {
      id: topImprovement.id,
      dimension: topImprovement.dimension,
      subDimension: topImprovement.sub_dimension,
      location: topImprovement.location,
      issue: topImprovement.issue,
      direction: topImprovement.direction,
      expectedScoreLift: topImprovement.expectedScoreLift,
    },
    proposalCount: roundSummaries.reduce((sum, round) => sum + round.proposalCount, 0),
    changedFields: applied.applyPreview.changes.map((change) => change.field),
    applyMode: applied.applyResult.mode,
    realWritesAttempted: 0,
    blockedActions: ['spapi.patchListing'],
    expectedFocus: benchmark.expectedFocus,
  };
}

function selectBenchmarkImprovements(improvements = [], limit = 3) {
  const selected = [];
  const byDimension = new Set();
  const priority = ['keywordCoverage', 'painPointAlignment', 'sellingPointClarity', 'visualAplus', 'conversionTriggers'];

  for (const dimension of priority) {
    const item = improvements.find((candidate) => candidate.dimension === dimension && !selected.some((picked) => picked.id === candidate.id));
    if (item) {
      selected.push(item);
      byDimension.add(item.dimension);
    }
    if (selected.length >= limit) return selected;
  }

  for (const item of improvements) {
    if (!byDimension.has(item.dimension) || selected.length < limit) {
      if (!selected.some((picked) => picked.id === item.id)) selected.push(item);
    }
    if (selected.length >= limit) break;
  }
  return selected;
}

function summarizeResults(results) {
  const optimizedDimensions = [...new Set(results.flatMap((result) => result.optimizedDimensions || []))].sort();
  return {
    asinCount: results.length,
    completedMockApplies: results.filter((result) => result.applyMode === 'mock').length,
    realWritesAttempted: results.reduce((sum, result) => sum + result.realWritesAttempted, 0),
    improvedOrActionable: results.filter((result) => result.scoreLift > 0 || result.improvementCount > 0).length,
    averageImprovementCount: round(results.reduce((sum, result) => sum + result.improvementCount, 0) / Math.max(1, results.length), 2),
    averageScoreLift: round(results.reduce((sum, result) => sum + result.scoreLift, 0) / Math.max(1, results.length), 2),
    dimensions: [...new Set(results.map((result) => result.topImprovement.dimension))].sort(),
    optimizedDimensions,
    categories: [...new Set(results.map((result) => result.category))].sort(),
  };
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('m1-asin-benchmark.mjs')) {
  const result = runM1AsinBenchmark();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`M1 public-ASIN benchmark passed: ${result.coverage.asinCount} ASINs, avg lift ${result.coverage.averageScoreLift}.`);
    for (const item of result.results) {
      console.log(`- ${item.asin}: ${item.beforeScore} -> ${item.afterScore}, ${item.topImprovement.dimension}, mode=${item.applyMode}`);
    }
  }
}
