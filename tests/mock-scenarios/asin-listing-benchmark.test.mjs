import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createM1Diagnosis } from '../../packages/domain/src/m1-iteration-engine.mjs';
import { publicAsinBenchmarkSummary, publicAsinListingBenchmarks } from '../../packages/mock-data/src/asin-listing-benchmarks.mjs';
import { runM1AsinBenchmark } from '../../scripts/m1-asin-benchmark.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('../../scripts/m1-asin-benchmark.mjs', import.meta.url));

test('M1 public ASIN benchmark contains five real ASIN-shaped listing snapshots', () => {
  assert.equal(publicAsinListingBenchmarks.length, 5);
  assert.equal(publicAsinBenchmarkSummary.count, 5);
  assert.equal(publicAsinBenchmarkSummary.writePolicy.realWriteAllowed, false);

  for (const benchmark of publicAsinListingBenchmarks) {
    assert.match(benchmark.asin, /^B0[A-Z0-9]{8}$/);
    assert.match(benchmark.publicSourceUrl, new RegExp(`/dp/${benchmark.asin}`));
    assert.equal(benchmark.sourceMode, 'public_asin_snapshot_plus_synthetic_reviews');
    assert.ok(benchmark.searchTerms.length >= 4, `${benchmark.asin} needs search terms`);
    assert.ok(benchmark.reviews.length >= 2, `${benchmark.asin} needs review pain points`);
    assert.ok(benchmark.competitors.length >= 2, `${benchmark.asin} needs competitor references`);
    assert.ok(benchmark.expectedFocus.length >= 4, `${benchmark.asin} needs expected focus coverage`);
  }
});

test('M1 engine diagnoses every public ASIN snapshot with actionable improvements', () => {
  const dimensions = new Set();

  for (const benchmark of publicAsinListingBenchmarks) {
    const diagnosis = createM1Diagnosis({
      product: benchmark.product,
      listing: benchmark.listing,
      searchTerms: benchmark.searchTerms,
      reviews: benchmark.reviews,
      competitors: benchmark.competitors,
      category: benchmark.product.category,
      triggeredBy: 'test_public_asin',
    });

    assert.equal(diagnosis.asin, benchmark.asin);
    assert.ok(diagnosis.total_score > 0 && diagnosis.total_score <= 100);
    assert.ok(diagnosis.confidence >= 0.55);
    assert.ok(diagnosis.improvements.length >= 3, `${benchmark.asin} should have multiple improvements`);
    assert.equal(diagnosis.contextMetadata.source_mode, 'mock_deterministic');
    diagnosis.improvements.forEach((item) => dimensions.add(item.dimension));
  }

  assert.ok(dimensions.has('keywordCoverage'));
  assert.ok(dimensions.has('sellingPointClarity') || dimensions.has('visualAplus'));
  assert.ok(dimensions.has('painPointAlignment') || dimensions.has('conversionTriggers'));
});

test('M1 benchmark runs optimize/apply loop for all five ASINs without real writes', () => {
  const result = runM1AsinBenchmark();

  assert.equal(result.ok, true);
  assert.equal(result.coverage.asinCount, 5);
  assert.equal(result.coverage.completedMockApplies, 5);
  assert.equal(result.coverage.realWritesAttempted, 0);
  assert.equal(result.coverage.improvedOrActionable, 5);
  assert.ok(result.coverage.averageImprovementCount >= 3);
  assert.ok(result.coverage.optimizedDimensions.includes('keywordCoverage'));
  assert.ok(result.coverage.optimizedDimensions.includes('painPointAlignment'));
  assert.ok(result.coverage.optimizedDimensions.includes('sellingPointClarity'));

  for (const item of result.results) {
    assert.equal(item.applyMode, 'mock');
    assert.equal(item.realWritesAttempted, 0);
    assert.equal(item.optimizedRoundCount, 3);
    assert.equal(item.proposalCount, 9);
    assert.ok(item.optimizedDimensions.length >= 3);
    assert.ok(item.changedFields.length >= 1);
    assert.ok(item.blockedActions.includes('spapi.patchListing'));
  }
});

test('M1 benchmark CLI emits JSON coverage for the five ASINs', async () => {
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, '--json'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    maxBuffer: 1024 * 1024,
  });
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 5);
  assert.equal(result.coverage.realWritesAttempted, 0);
  assert.ok(result.results.some((item) => item.asin === 'B0BM4274QM'));
  assert.ok(result.results.some((item) => item.asin === 'B0BMRZZRTW'));
});
