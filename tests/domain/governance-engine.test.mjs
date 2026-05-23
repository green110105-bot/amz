import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRetentionPlan,
  evaluateProviderRateLimit,
  evaluateSecurityReadiness,
  evaluateTenantAccess,
  redactSensitiveFields,
} from '../../packages/domain/src/governance-engine.mjs';

test('redactSensitiveFields removes provider secrets recursively', () => {
  const redacted = redactSensitiveFields({
    accessToken: 'spapi-token',
    nested: {
      client_secret: 'ads-secret',
      keepaApiKey: 'keepa-key',
      safe: 'visible',
    },
  });

  assert.equal(redacted.accessToken, '[REDACTED]');
  assert.equal(redacted.nested.client_secret, '[REDACTED]');
  assert.equal(redacted.nested.keepaApiKey, '[REDACTED]');
  assert.equal(redacted.nested.safe, 'visible');
});

test('evaluateTenantAccess enforces tenant isolation and break-glass audit', () => {
  const allowed = evaluateTenantAccess({
    actor: { tenantId: 'tenant-a', role: 'ops', permissions: ['read'] },
    resource: { tenantId: 'tenant-a', id: 'order-1' },
  });
  const denied = evaluateTenantAccess({
    actor: { tenantId: 'tenant-a', role: 'ops', permissions: ['read'] },
    resource: { tenantId: 'tenant-b', id: 'order-2' },
  });
  const noPermission = evaluateTenantAccess({
    actor: { tenantId: 'tenant-a', role: 'ops', permissions: ['read'] },
    resource: { tenantId: 'tenant-a', id: 'order-3' },
    action: 'execute',
  });
  const breakGlass = evaluateTenantAccess({
    actor: { tenantId: 'support', role: 'super_admin', breakGlassApproved: true },
    resource: { tenantId: 'tenant-b', id: 'order-2' },
    action: 'support_read',
  });

  assert.equal(allowed.allowed, true);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'tenant_boundary_violation');
  assert.equal(noPermission.allowed, false);
  assert.equal(noPermission.reason, 'least_privilege_violation');
  assert.equal(breakGlass.allowed, true);
  assert.equal(breakGlass.auditRequired, true);
});

test('buildRetentionPlan documents raw payload and audit retention windows', () => {
  const plan = buildRetentionPlan(['raw_provider_payloads', 'audit_logs'], { now: '2026-05-08T00:00:00.000Z' });
  const raw = plan.find((item) => item.entityType === 'raw_provider_payloads');
  const audit = plan.find((item) => item.entityType === 'audit_logs');

  assert.equal(raw.retentionDays, 30);
  assert.equal(raw.storage, 'encrypted_object_store');
  assert.equal(audit.retentionDays, 2555);
  assert.equal(audit.legalHoldSupported, true);
});

test('evaluateSecurityReadiness separates sandbox readiness from production credentials', () => {
  const sandbox = evaluateSecurityReadiness();
  const production = evaluateSecurityReadiness({ realCredentialsProvided: true, productionApproval: true });
  const missing = evaluateSecurityReadiness({ auditLog: false });

  assert.equal(sandbox.readyForSandbox, true);
  assert.equal(sandbox.readyForProduction, false);
  assert.equal(production.readyForProduction, true);
  assert.equal(missing.readyForSandbox, false);
  assert.ok(missing.blockers.includes('audit_log'));
});

test('evaluateProviderRateLimit returns deterministic backoff metadata', () => {
  const allowed = evaluateProviderRateLimit({ provider: 'sp-api', requests: 50, limit: 60 });
  const throttled = evaluateProviderRateLimit({ provider: 'ads-api', requests: 90, limit: 60, windowSeconds: 60 });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.backoffMs, 0);
  assert.equal(throttled.allowed, false);
  assert.equal(throttled.strategy, 'exponential_backoff_and_queue');
  assert.ok(throttled.backoffMs > 0);
});
