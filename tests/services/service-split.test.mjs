import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const allowedRoots = [
  'apps/go-api-gateway',
  'apps/python-ai-service',
  'apps/next-web'
];

function fileUrl(path) {
  return new URL(path, repoRoot);
}

async function readText(path) {
  const text = await readFile(fileUrl(path), 'utf8');
  return text.replace(/^\uFEFF/, '');
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function assertFile(path) {
  const info = await stat(fileUrl(path));
  assert.ok(info.isFile(), `${path} must be a file`);
}

async function listFiles(root) {
  const dir = fileUrl(`${root}/`);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const child = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await listFiles(child));
    } else {
      files.push(child);
    }
  }

  return files;
}

const requiredFiles = [
  'apps/go-api-gateway/README.md',
  'apps/go-api-gateway/config/gateway.example.env',
  'apps/go-api-gateway/contracts/openapi.gateway.yaml',
  'apps/go-api-gateway/contracts/mock-routing-contract.json',
  'apps/go-api-gateway/cmd/api-gateway/main.go',
  'apps/python-ai-service/README.md',
  'apps/python-ai-service/config/ai-service.example.env',
  'apps/python-ai-service/contracts/decision-envelope.schema.json',
  'apps/python-ai-service/contracts/provider-contracts.md',
  'apps/python-ai-service/app/main.py',
  'apps/python-ai-service/worker/decision_worker.py',
  'apps/python-ai-service/providers/README.md',
  'apps/python-ai-service/etl/README.md',
  'apps/next-web/README.md',
  'apps/next-web/config/next-web.example.env',
  'apps/next-web/contracts/web-bff.mock.json',
  'apps/next-web/app/page.tsx',
  'apps/next-web/app/api/actions/route.ts',
  'docs/implementation/SERVICE_SPLIT.md'
];

test('service split skeleton exposes Go, Python, and Next.js migration boundaries', async () => {
  for (const path of requiredFiles) {
    await assertFile(path);
  }

  const docs = await Promise.all([
    readText('apps/go-api-gateway/README.md'),
    readText('apps/python-ai-service/README.md'),
    readText('apps/next-web/README.md'),
    readText('docs/implementation/SERVICE_SPLIT.md')
  ]);

  for (const doc of docs) {
    assert.match(doc, /Node mock-gated|node-mock-gated/i, 'boundary docs must keep Node mock-gated as runtime truth');
    assert.match(doc, /migration boundary/i, 'boundary docs must not imply active replacement runtime');
  }
});

test('gateway boundary references OpenAPI and mock routing contracts', async () => {
  const openApi = await readText('apps/go-api-gateway/contracts/openapi.gateway.yaml');
  const routing = await readJson('apps/go-api-gateway/contracts/mock-routing-contract.json');

  assert.match(openApi, /^openapi: 3\.1\.0/m);
  assert.match(openApi, /\/api\/actions/);
  assert.match(openApi, /\/api\/audit/);
  assert.match(openApi, /x-write-policy: audit-draft-only/);
  assert.match(openApi, /source, confidence, and freshness/);
  assert.equal(routing.runtimeTruth, 'node-mock-gated');
  assert.equal(routing.openApi, 'contracts/openapi.gateway.yaml');
  assert.ok(routing.routes.every((route) => route.mockRequired), 'gateway routes must remain mock-backed');
  assert.ok(routing.routes.some((route) => route.writePolicy === 'audit-draft-only'));
});

test('python AI boundary covers decisions, providers, workers, and ETL with audit drafts', async () => {
  const schema = await readJson('apps/python-ai-service/contracts/decision-envelope.schema.json');
  const providerContracts = await readText('apps/python-ai-service/contracts/provider-contracts.md');
  const providers = await readText('apps/python-ai-service/providers/README.md');
  const etl = await readText('apps/python-ai-service/etl/README.md');
  const worker = await readText('apps/python-ai-service/worker/decision_worker.py');

  assert.equal(schema.title, 'DecisionEnvelope');
  assert.ok(schema.required.includes('sourceMetadata'));
  assert.equal(schema.properties.auditDraft.properties.required.const, true);
  assert.equal(schema.properties.auditDraft.properties.writePolicy.const, 'audit-draft-only');
  assert.match(providerContracts, /Gateway OpenAPI/);
  assert.match(providerContracts, /Next web mock view contract/);
  assert.match(providers, /Mock-first adapter boundary/);
  assert.match(etl, /orders, inventory, listings, reports, campaign performance, search terms/);
  assert.match(worker, /contract validation/);
});

test('next web boundary consumes gateway and mock BFF contracts without provider calls', async () => {
  const webContract = await readJson('apps/next-web/contracts/web-bff.mock.json');
  const readme = await readText('apps/next-web/README.md');
  const route = await readText('apps/next-web/app/api/actions/route.ts');

  assert.equal(webContract.runtimeTruth, 'node-mock-gated');
  assert.equal(webContract.openApi, '../go-api-gateway/contracts/openapi.gateway.yaml');
  assert.ok(webContract.views.some((view) => view.name === 'DashboardActionCards'));
  assert.ok(webContract.views.some((view) => view.writePolicy === 'audit-draft-only'));
  assert.match(readme, /do not embed provider credentials/i);
  assert.match(route, /audit-draft-only/);
  assert.match(route, /deterministic-mock/);
});

test('skeleton config examples require mock mode and contain no real-looking credentials', async () => {
  const configFiles = [
    'apps/go-api-gateway/config/gateway.example.env',
    'apps/python-ai-service/config/ai-service.example.env',
    'apps/next-web/config/next-web.example.env'
  ];

  for (const path of configFiles) {
    const text = await readText(path);
    assert.match(text, /^MOCK_MODE=true$/m, `${path} must force mock mode in examples`);
    assert.doesNotMatch(text, /^MOCK_MODE=false$/m, `${path} must not disable mock mode`);

    for (const line of text.split('\n').filter(Boolean)) {
      const [key, rawValue = ''] = line.split('=');
      const value = rawValue.trim();
      if (/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)) {
        assert.match(value, /^(mock-placeholder-only|fixture-mock|deterministic-mock|sandbox-placeholder|)$/i, `${path} has non-placeholder secret value for ${key}`);
      }
    }
  }
});

test('boundary files do not contain common production credential patterns', async () => {
  const files = (await Promise.all(allowedRoots.map(listFiles))).flat();
  const forbiddenPatterns = [
    /AKIA[0-9A-Z]{16}/,
    /ASIA[0-9A-Z]{16}/,
    /sk-[A-Za-z0-9_-]{20,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/,
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/
  ];

  for (const path of files) {
    const text = await readText(path);
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(text, pattern, `${path} contains a real-looking credential`);
    }
  }
});
