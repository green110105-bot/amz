import test from 'node:test';
import assert from 'node:assert/strict';
import { handleExtendedRequest } from '../../apps/api/src/extended-routes.mjs';
import { createApiServer } from '../../apps/api/src/server.mjs';

test('API exposes readiness and security headers', async () => {
  const response = await handleExtendedRequest(new Request('http://localhost/ready'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-real-write-policy'), 'blocked');
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.checks.routeTable, true);
  assert.equal(body.checks.realWritesEnabled, false);
});

test('API security can require tenant header without breaking local default mode', async () => {
  const previous = process.env.REQUIRE_TENANT_HEADER;
  process.env.REQUIRE_TENANT_HEADER = 'true';
  try {
    const denied = await handleExtendedRequest(new Request('http://localhost/api/v1/dashboard'));
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).error, 'tenant_header_required');

    const allowed = await handleExtendedRequest(new Request('http://localhost/api/v1/dashboard', {
      headers: { 'x-tenant-id': 'tenant-demo' },
    }));
    assert.equal(allowed.status, 200);
  } finally {
    restoreEnv('REQUIRE_TENANT_HEADER', previous);
  }
});

test('API security rejects cross-tenant and least-privilege violations', async () => {
  const crossTenant = await handleExtendedRequest(new Request('http://localhost/api/v1/dashboard', {
    headers: {
      'x-tenant-id': 'tenant-a',
      'x-resource-tenant-id': 'tenant-b',
    },
  }));
  assert.equal(crossTenant.status, 403);
  assert.equal((await crossTenant.json()).reason, 'tenant_boundary_violation');

  const noPermission = await handleExtendedRequest(new Request('http://localhost/api/v1/ads/suggestions/sug-1/execute', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': 'tenant-a',
      'x-role': 'operator',
      'x-permissions': 'read',
    },
    body: JSON.stringify({}),
  }));
  assert.equal(noPermission.status, 403);
  assert.equal((await noPermission.json()).reason, 'least_privilege_violation');
});

test('API security applies local rate limit and CORS preflight', async () => {
  const key = `rate-${Date.now()}-${Math.random()}`;
  const first = await handleExtendedRequest(new Request('http://localhost/api/v1/dashboard', {
    headers: { 'x-rate-limit-key': key, 'x-rate-limit-max': '1' },
  }));
  const second = await handleExtendedRequest(new Request('http://localhost/api/v1/dashboard', {
    headers: { 'x-rate-limit-key': key, 'x-rate-limit-max': '1' },
  }));
  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error, 'rate_limited');

  const options = await handleExtendedRequest(new Request('http://localhost/api/v1/dashboard', { method: 'OPTIONS' }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
});

test('createApiServer serves real HTTP health and readiness endpoints on an ephemeral port', async () => {
  const server = createApiServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const ready = await fetch(`http://127.0.0.1:${port}/ready`);
    assert.equal(health.status, 200);
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).ok, true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
