import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildProbePayload, startService } from '../../apps/services/src/runtime.mjs';

const manifestPath = new URL('../../apps/services/service-manifest.json', import.meta.url);
const blockersPath = new URL('../../docs/implementation/BLOCKERS_AND_MOCKS.md', import.meta.url);

const expectedServices = [
  'api-gateway',
  'ai-service',
  'etl-spapi',
  'etl-ads',
  'scheduler',
  'worker',
  'notification',
  'billing',
  'web-bff'
];

const expectedModules = [
  'Dashboard',
  'M1',
  'M2',
  'M3',
  'M4',
  'Data Foundation',
  'AI Decision Engine',
  'Audit Center',
  'Billing'
];

const requiredServiceFields = [
  'name',
  'owner',
  'ports',
  'jobs',
  'contracts',
  'env',
  'externalBlockers',
  'health',
  'readiness'
];

async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

async function loadDocumentedBlockers() {
  const markdown = await readFile(blockersPath, 'utf8');
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.includes('---') && !line.includes('Area |'))
    .map((line) => line.split('|')[1].trim())
    .filter(Boolean);
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getJson(server, path) {
  const address = server.address();
  assert.equal(typeof address, 'object');

  const response = await fetch(`http://${address.address}:${address.port}${path}`);
  const payload = await response.json();
  return { response, payload };
}

test('service manifest declares the full service matrix', async () => {
  const manifest = await loadManifest();
  const serviceNames = manifest.services.map((service) => service.name).sort();

  assert.deepEqual(serviceNames, [...expectedServices].sort());
  assert.equal(manifest.dependencyMode, 'no-runtime-dependencies');
  assert.equal(manifest.defaults.writePolicy, 'sandbox-or-audit-only-until-credentials-and-approval');
});

test('each service declares owner, ports/jobs, contracts, env, blockers, and probes', async () => {
  const { services } = await loadManifest();

  for (const service of services) {
    for (const field of requiredServiceFields) {
      assert.ok(field in service, `${service.name} is missing ${field}`);
    }

    assert.match(service.owner, /^(PM-Architect|Data\/API|Domain|Frontend\/API|QA|DevOps)$/);
    assert.ok(Array.isArray(service.ports), `${service.name} ports must be an array`);
    assert.ok(Array.isArray(service.jobs), `${service.name} jobs must be an array`);
    assert.ok(service.ports.length > 0 || service.jobs.length > 0, `${service.name} must expose a port or job`);
    assert.ok(service.contracts.length > 0, `${service.name} must declare contracts`);
    assert.ok(service.env.includes('MOCK_MODE'), `${service.name} must be mock-mode switchable`);
    assert.ok(service.externalBlockers.length > 0, `${service.name} must declare external blockers`);
    assert.ok(service.health.path, `${service.name} must declare health path`);
    assert.ok(service.health.checks.length > 0, `${service.name} must declare health checks`);
    assert.ok(service.readiness.path, `${service.name} must declare readiness path`);
    assert.ok(service.readiness.checks.length > 0, `${service.name} must declare readiness checks`);
  }
});

test('service matrix covers PRD modules and cross-module foundations', async () => {
  const { services, prdModules } = await loadManifest();
  const coveredModules = new Set(services.flatMap((service) => service.prdModules));

  assert.deepEqual([...prdModules].sort(), [...expectedModules].sort());
  for (const module of expectedModules) {
    assert.ok(coveredModules.has(module), `missing PRD module coverage for ${module}`);
  }
});

test('external blockers match documented mock strategy and are referenced by services', async () => {
  const [manifest, documentedBlockers] = await Promise.all([loadManifest(), loadDocumentedBlockers()]);
  const serviceBlockers = new Set(manifest.services.flatMap((service) => service.externalBlockers));

  assert.deepEqual([...manifest.externalBlockers].sort(), documentedBlockers.sort());
  for (const blocker of manifest.externalBlockers) {
    assert.ok(serviceBlockers.has(blocker), `external blocker is not owned by any service: ${blocker}`);
  }
});

test('write-like integrations are audit gated or blocked by service contracts', async () => {
  const { services } = await loadManifest();
  const writeLikeServices = services.filter((service) => service.externalBlockers.includes('Real store write operations'));

  assert.ok(writeLikeServices.length >= 3, 'expected multiple write-like service boundaries');
  for (const service of writeLikeServices) {
    const contractText = service.contracts.join(' ');
    const readinessText = service.readiness.checks.join(' ');
    assert.match(`${contractText} ${readinessText}`, /Audit|audit/, `${service.name} write-like path must be audit gated`);
  }
});

test('runtime probe payloads mirror manifest owner, blockers, contracts, and checks', async () => {
  const { services } = await loadManifest();

  for (const service of services) {
    const health = await buildProbePayload(service.name, 'health');
    const ready = await buildProbePayload(service.name, 'ready');

    assert.equal(health.service, service.name);
    assert.equal(health.owner, service.owner);
    assert.equal(health.probePath, service.health.path);
    assert.deepEqual(health.contracts, service.contracts);
    assert.deepEqual(health.externalBlockers, service.externalBlockers);
    assert.deepEqual(health.checks.map((check) => check.name), service.health.checks);

    assert.equal(ready.service, service.name);
    assert.equal(ready.owner, service.owner);
    assert.equal(ready.probePath, service.readiness.path);
    assert.deepEqual(ready.contracts, service.contracts);
    assert.deepEqual(ready.externalBlockers, service.externalBlockers);
    assert.deepEqual(ready.checks.map((check) => check.name), service.readiness.checks);
  }
});

test('generic service runner serves health and readiness for every manifest service', async () => {
  for (const serviceName of expectedServices) {
    const server = await startService(serviceName, { port: 0, host: '127.0.0.1' });

    try {
      const health = await getJson(server, '/health');
      assert.equal(health.response.status, 200, `${serviceName} /health status`);
      assert.equal(health.payload.status, 'ok');
      assert.equal(health.payload.service, serviceName);
      assert.equal(health.payload.probe, 'health');
      assert.ok(health.payload.contracts.length > 0);
      assert.ok(health.payload.externalBlockers.length > 0);

      const ready = await getJson(server, '/ready');
      assert.equal(ready.response.status, 200, `${serviceName} /ready status`);
      assert.equal(ready.payload.status, 'ok');
      assert.equal(ready.payload.service, serviceName);
      assert.equal(ready.payload.probe, 'readiness');
      assert.ok(ready.payload.contracts.length > 0);
      assert.ok(ready.payload.externalBlockers.length > 0);
    } finally {
      await closeServer(server);
    }
  }
});
