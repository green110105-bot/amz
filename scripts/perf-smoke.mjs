import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { handleExtendedRequest } from '../apps/api/src/extended-routes.mjs';

const DEFAULT_THRESHOLDS = {
  p95Ms: Number(process.env.PERF_SMOKE_P95_MS || 75),
  p99Ms: Number(process.env.PERF_SMOKE_P99_MS || 150),
};

export const representativeEndpoints = [
  { name: 'health', method: 'GET', path: '/health' },
  { name: 'dashboard', method: 'GET', path: '/api/v1/dashboard' },
  { name: 'listing-score', method: 'GET', path: '/api/v1/listings/prod-case-001/score' },
  { name: 'profit-cashflow', method: 'GET', path: '/api/v1/profit/cashflow' },
  { name: 'profit-scenario', method: 'POST', path: '/api/v1/profit/scenario/single-sku', body: { productId: 'prod-case-001', adjustments: { priceChangePct: -0.02 } } },
  { name: 'ads-campaigns', method: 'GET', path: '/api/v1/ads/campaigns' },
  { name: 'm4-anomalies', method: 'GET', path: '/api/v1/monitor/anomalies' },
  { name: 'commercial-quota', method: 'GET', path: '/api/v1/commercial/quota' },
];

export async function runPerfSmoke(options = {}) {
  const endpoints = options.endpoints || representativeEndpoints;
  const iterations = Number(options.iterations || process.env.PERF_SMOKE_ITERATIONS || 30);
  const warmup = Number(options.warmup || process.env.PERF_SMOKE_WARMUP || 5);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };

  for (let index = 0; index < warmup; index += 1) {
    for (const endpoint of endpoints) await callEndpoint(endpoint);
  }

  const results = [];
  for (const endpoint of endpoints) {
    const samples = [];
    for (let index = 0; index < iterations; index += 1) {
      const startedAt = performance.now();
      const response = await callEndpoint(endpoint);
      const durationMs = performance.now() - startedAt;
      samples.push(durationMs);
      if (response.status !== 200) {
        throw new Error(`${endpoint.method} ${endpoint.path} returned ${response.status}`);
      }
    }

    const sorted = samples.toSorted((left, right) => left - right);
    const result = {
      name: endpoint.name,
      method: endpoint.method,
      path: endpoint.path,
      samples: samples.length,
      minMs: round(sorted[0]),
      medianMs: round(percentile(sorted, 50)),
      p95Ms: round(percentile(sorted, 95)),
      p99Ms: round(percentile(sorted, 99)),
      maxMs: round(sorted.at(-1)),
      thresholds,
      passed: percentile(sorted, 95) <= thresholds.p95Ms && percentile(sorted, 99) <= thresholds.p99Ms,
    };
    results.push(result);
  }

  return {
    mode: 'in_process_mock_api_no_external_network',
    iterations,
    warmup,
    thresholds,
    passed: results.every((result) => result.passed),
    results,
  };
}

export function assertPerfSmokePassed(summary) {
  const failures = summary.results.filter((result) => !result.passed);
  if (failures.length > 0) {
    const detail = failures.map((result) => `${result.name} p95=${result.p95Ms}ms p99=${result.p99Ms}ms`).join('; ');
    throw new Error(`perf smoke thresholds exceeded: ${detail}`);
  }
}

async function callEndpoint(endpoint) {
  return handleExtendedRequest(new Request(`http://localhost${endpoint.path}`, {
    method: endpoint.method,
    headers: endpoint.body ? { 'content-type': 'application/json' } : undefined,
    body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
  }));
}

function percentile(sortedSamples, percentileValue) {
  if (sortedSamples.length === 0) return 0;
  const rank = Math.ceil((percentileValue / 100) * sortedSamples.length) - 1;
  return sortedSamples[Math.min(Math.max(rank, 0), sortedSamples.length - 1)];
}

function round(value) {
  return Number(value.toFixed(3));
}

function printSummary(summary) {
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const summary = await runPerfSmoke();
  printSummary(summary);
  assertPerfSmokePassed(summary);
}


