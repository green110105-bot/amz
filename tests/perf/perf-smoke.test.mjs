import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPerfSmokePassed, runPerfSmoke } from '../../scripts/perf-smoke.mjs';

test('local mock API performance smoke stays within broad p95/p99 thresholds', async () => {
  const summary = await runPerfSmoke({ iterations: 12, warmup: 3, thresholds: { p95Ms: 100, p99Ms: 200 } });
  assert.equal(summary.mode, 'in_process_mock_api_no_external_network');
  assert.equal(summary.passed, true, JSON.stringify(summary.results, null, 2));
  assertPerfSmokePassed(summary);

  for (const result of summary.results) {
    assert.equal(result.samples, 12);
    assert.ok(result.p95Ms >= result.medianMs);
    assert.ok(result.p99Ms >= result.p95Ms);
  }
});
