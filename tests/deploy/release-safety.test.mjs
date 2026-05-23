import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const envPath = new URL('../../.env.example', import.meta.url);
const manifestPath = new URL('../../infra/deploy/deploy-manifest.json', import.meta.url);
const composePath = new URL('../../infra/deploy/docker-compose.yml', import.meta.url);
const ciPath = new URL('../../.github/workflows/ci.yml', import.meta.url);
const readmePath = new URL('../../README.md', import.meta.url);

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readText(url) {
  return stripBom(await readFile(url, 'utf8'));
}

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

async function loadManifest() {
  return JSON.parse(await readText(manifestPath));
}

test('env template defaults to deterministic mocks and disables real writes', async () => {
  const env = parseEnv(await readText(envPath));

  assert.equal(env.MOCK_MODE, 'true');
  assert.equal(env.DATA_PROVIDER_MODE, 'mock');
  assert.equal(env.REAL_WRITES_ENABLED, 'false');
  assert.equal(env.AUDIT_REQUIRED, 'true');
  assert.equal(env.SANDBOX_ONLY, 'true');
  assert.equal(env.ALLOW_PRODUCTION_DEPLOY, 'false');
  assert.equal(env.REQUIRE_BACKUP_BEFORE_DEPLOY, 'true');
});

test('env template keeps real providers blocked, mocked, or blank by default', async () => {
  const env = parseEnv(await readText(envPath));
  const blockedProviders = ['SPAPI_PROVIDER', 'ADS_PROVIDER', 'KEEPA_PROVIDER', 'SELLERSPRITE_PROVIDER', 'HELIUM10_PROVIDER'];
  const mockedProviders = ['LLM_PROVIDER', 'EMAIL_PROVIDER', 'PAYMENT_PROVIDER'];
  const secretKeys = [
    'SPAPI_CLIENT_SECRET',
    'SPAPI_REFRESH_TOKEN',
    'ADS_CLIENT_SECRET',
    'ADS_REFRESH_TOKEN',
    'KEEPA_API_KEY',
    'SELLERSPRITE_API_KEY',
    'HELIUM10_API_KEY',
    'LLM_API_KEY',
    'EMAIL_PROVIDER_KEY',
    'PAYMENT_API_KEY'
  ];

  for (const key of blockedProviders) assert.equal(env[key], 'blocked', `${key} must be blocked`);
  for (const key of mockedProviders) assert.equal(env[key], 'mock', `${key} must be mocked`);
  for (const key of secretKeys) assert.equal(env[key], '', `${key} must not contain committed credentials`);
});

test('deploy manifest covers api, web, services, db, clickhouse, and provider blockers', async () => {
  const manifest = await loadManifest();
  const componentNames = manifest.components.map((component) => component.name).sort();

  assert.deepEqual(componentNames, ['api', 'clickhouse', 'db', 'providers', 'services', 'web']);
  assert.equal(manifest.releasePolicy.mockModeDefault, true);
  assert.equal(manifest.releasePolicy.realWritesDefault, false);
  assert.equal(manifest.releasePolicy.auditRequiredDefault, true);
  assert.equal(manifest.releasePolicy.productionDeployBlockedByDefault, true);
  assert.equal(manifest.environments.production.realWritesEnabled, false);

  for (const name of ['api', 'web', 'services', 'db', 'clickhouse']) {
    const component = manifest.components.find((entry) => entry.name === name);
    assert.ok(component.health || component.kind === 'postgres' || component.kind === 'analytics-store', `${name} needs health/readiness coverage or datastore role`);
    assert.ok(component.env.length > 0, `${name} must declare environment inputs`);
    assert.ok(component.blockers.length > 0, `${name} must declare release blockers`);
  }

  const providers = manifest.components.find((entry) => entry.name === 'providers');
  const providerBlockers = providers.blockers.join(' ');
  assert.match(providerBlockers, /Amazon SP-API/);
  assert.match(providerBlockers, /Amazon Ads API/);
  assert.match(providerBlockers, /LLM API key/);
  assert.match(providerBlockers, /email\/WeCom approval/);
  assert.match(providerBlockers, /payment sandbox/);
  assert.match(providerBlockers, /real store write approval/);

  for (const name of ['api', 'web', 'services']) {
    const component = manifest.components.find((entry) => entry.name === name);
    assert.notEqual(component.image?.startsWith('amz/'), true, `${name} must not require unpublished amz images`);
    assert.ok(component.command, `${name} must declare a local command`);
  }
});

test('compose skeleton preserves mock and write-safety defaults', async () => {
  const compose = await readText(composePath);

  assert.match(compose, /api:/);
  assert.match(compose, /web:/);
  assert.match(compose, /services:/);
  assert.match(compose, /db:/);
  assert.match(compose, /clickhouse:/);
  assert.match(compose, /MOCK_MODE:\s*\$\{MOCK_MODE:-true\}/);
  assert.match(compose, /REAL_WRITES_ENABLED:\s*\$\{REAL_WRITES_ENABLED:-false\}/);
  assert.match(compose, /AUDIT_REQUIRED:\s*\$\{AUDIT_REQUIRED:-true\}/);
});

test('compose repository services use local commands instead of unpublished amz images', async () => {
  const compose = await readText(composePath);

  for (const service of ['api', 'web', 'services']) {
    const block = serviceBlock(compose, service);
    assert.doesNotMatch(block, /image:\s*amz\//, `${service} must not reference an unpublished local image`);
    assert.match(block, /\n\s+(build|command):/, `${service} needs a build context or explicit local command`);
  }

  assert.match(serviceBlock(compose, 'api'), /command:\s*\["node",\s*"apps\/api\/src\/server\.mjs"\]/);
  assert.match(serviceBlock(compose, 'web'), /apps\/web\/server\.mjs/);
  assert.match(serviceBlock(compose, 'services'), /apps\/services\/src\/runner\.mjs/);
});

test('compose ports stay aligned with env template and deploy manifest', async () => {
  const env = parseEnv(await readText(envPath));
  const manifest = await loadManifest();
  const compose = await readText(composePath);

  const expected = {
    api: { env: 'API_PORT', value: env.API_PORT, internal: '8080' },
    web: { env: 'WEB_PORT', value: env.WEB_PORT, internal: '3000' },
    services: { env: 'SERVICES_PORT', value: env.SERVICES_PORT, internal: '8090' },
    db: { env: 'POSTGRES_PORT', value: env.POSTGRES_PORT, internal: '5432' },
    clickhouse: { env: 'CLICKHOUSE_PORT', value: env.CLICKHOUSE_PORT, internal: '8123' },
  };

  for (const [name, port] of Object.entries(expected)) {
    const mapping = `\${${port.env}:-${port.value}}:${port.internal}`;
    assert.match(serviceBlock(compose, name), new RegExp(escapeRegex(mapping)), `${name} compose port mismatch`);
    const component = manifest.components.find((entry) => entry.name === name);
    assert.ok(component.ports.includes(mapping), `${name} manifest port mismatch`);
  }
});

test('github actions ci runs check and performance smoke gates', async () => {
  const ci = await readText(ciPath);

  assert.match(ci, /uses:\s*actions\/checkout@v4/);
  assert.match(ci, /uses:\s*actions\/setup-node@v4/);
  assert.match(ci, /node-version:\s*['"]?24['"]?/);
  assert.match(ci, /run:\s*npm run check/);
  assert.match(ci, /run:\s*npm run perf-smoke/);
});

test('readme documents run, test, and deploy entry points', async () => {
  const readme = await readText(readmePath);

  assert.match(readme, /## Quick Start/);
  assert.match(readme, /npm run dev:api/);
  assert.match(readme, /## Test/);
  assert.match(readme, /npm run check/);
  assert.match(readme, /npm run perf-smoke/);
  assert.match(readme, /## Deploy/);
  assert.match(readme, /docker compose -f infra\/deploy\/docker-compose\.yml/);
  assert.match(readme, /mock\/sandbox only/);
});

test('release, rollback, backup/restore, and safety docs exist', async () => {
  const docs = [
    'infra/deploy/release-checklist.md',
    'infra/deploy/rollback-plan.md',
    'infra/deploy/backup-restore.md',
    'infra/deploy/safety-defaults.md'
  ];

  for (const doc of docs) {
    const url = new URL(doc, root);
    await access(url);
    const text = await readText(url);
    assert.match(text, /mock|backup|rollback|write|release|safety/i, `${doc} should describe release safety`);
  }
});

function serviceBlock(compose, service) {
  const pattern = new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:\\n|^volumes:|(?![\\s\\S]))`, 'm');
  const match = compose.match(pattern);
  assert.ok(match, `${service} service must exist in compose`);
  return match[0];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
