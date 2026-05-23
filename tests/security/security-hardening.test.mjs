import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildRetentionPlan,
  evaluateProviderRateLimit,
  evaluateSecurityReadiness,
  evaluateTenantAccess,
  redactSensitiveFields,
} from '../../packages/domain/src/governance-engine.mjs';

const hardeningDoc = readFileSync(new URL('../../docs/security/security-hardening.md', import.meta.url), 'utf8');

test('security hardening document covers required final-hardening topics and controls', () => {
  const requiredTerms = [
    'Threat Model',
    'Compliance Control Matrix',
    'Data Classification',
    'Audit and Permission Model',
    'Secret Management and Key Rotation',
    'PII and Financial Data Handling',
    'Amazon API Compliance Boundary',
    'Real-Write Blocking Strategy',
    'SEC-TENANT-001',
    'SEC-REALWRITE-007',
    'SEC-AMZ-008',
    'real_write_blocked',
    'mock',
    'sandbox',
    'production',
    'source',
    'confidence',
  ];

  for (const term of requiredTerms) {
    assert.match(hardeningDoc, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('tenant isolation helper denies cross-tenant and same-tenant over-privileged access', () => {
  const allowed = evaluateTenantAccess({
    actor: { tenantId: 'tenant-a', role: 'operator', permissions: ['read'] },
    resource: { tenantId: 'tenant-a', storeId: 'store-1' },
    action: 'read',
  });
  const crossTenant = evaluateTenantAccess({
    actor: { tenantId: 'tenant-a', role: 'operator', permissions: ['read', 'execute'] },
    resource: { tenantId: 'tenant-b', storeId: 'store-2' },
    action: 'read',
  });
  const missingPermission = evaluateTenantAccess({
    actor: { tenantId: 'tenant-a', role: 'operator', permissions: ['read'] },
    resource: { tenantId: 'tenant-a', storeId: 'store-1' },
    action: 'execute',
  });
  const breakGlass = evaluateTenantAccess({
    actor: { tenantId: 'platform', role: 'super_admin', breakGlassApproved: true },
    resource: { tenantId: 'tenant-b', storeId: 'store-2' },
    action: 'support_read',
  });

  assert.equal(allowed.allowed, true);
  assert.equal(crossTenant.allowed, false);
  assert.equal(crossTenant.reason, 'tenant_boundary_violation');
  assert.equal(missingPermission.allowed, false);
  assert.equal(missingPermission.reason, 'least_privilege_violation');
  assert.equal(breakGlass.allowed, true);
  assert.equal(breakGlass.auditRequired, true);
});

test('redaction helper masks secrets, PII, and financial identifiers recursively', () => {
  const redacted = redactSensitiveFields({
    refreshToken: 'amazon-refresh-token',
    buyerEmail: 'buyer@example.com',
    shipmentAddress: '1 Main Street',
    financial: {
      payoutAccountId: 'acct-123',
      taxId: 'tax-456',
      netProfit: 42,
    },
  });

  assert.equal(redacted.refreshToken, '[REDACTED]');
  assert.equal(redacted.buyerEmail, '[REDACTED]');
  assert.equal(redacted.shipmentAddress, '[REDACTED]');
  assert.equal(redacted.financial.payoutAccountId, '[REDACTED]');
  assert.equal(redacted.financial.taxId, '[REDACTED]');
  assert.equal(redacted.financial.netProfit, 42);
});

test('retention helper assigns short raw-payload retention and long audit/financial retention', () => {
  const plan = buildRetentionPlan(['raw_provider_payloads', 'audit_logs', 'financial_events'], {
    now: '2026-05-08T00:00:00.000Z',
  });
  const byType = Object.fromEntries(plan.map((item) => [item.entityType, item]));

  assert.equal(byType.raw_provider_payloads.retentionDays, 30);
  assert.equal(byType.raw_provider_payloads.storage, 'encrypted_object_store');
  assert.equal(byType.audit_logs.retentionDays, 2555);
  assert.equal(byType.audit_logs.legalHoldSupported, true);
  assert.equal(byType.financial_events.retentionDays, 2555);
  assert.equal(byType.financial_events.legalHoldSupported, true);
});

test('rate-limit helper blocks over-quota provider calls with deterministic backoff metadata', () => {
  const rateLimit = evaluateProviderRateLimit({ provider: 'amazon-ads-api', requests: 121, limit: 60, windowSeconds: 60 });

  assert.equal(rateLimit.allowed, false);
  assert.equal(rateLimit.strategy, 'exponential_backoff_and_queue');
  assert.equal(rateLimit.utilization, 2.0167);
  assert.ok(rateLimit.backoffMs > 0);
});

test('real-write readiness blocks production until credentials and approval are both present', () => {
  const mockDefault = evaluateSecurityReadiness();
  const missingCredential = evaluateSecurityReadiness({ productionApproval: true });
  const missingApproval = evaluateSecurityReadiness({ realCredentialsProvided: true });
  const production = evaluateSecurityReadiness({ realCredentialsProvided: true, productionApproval: true });
  const disabledBlock = evaluateSecurityReadiness({ realWriteBlock: false, realCredentialsProvided: true, productionApproval: true });

  assert.equal(mockDefault.readyForSandbox, true);
  assert.equal(mockDefault.readyForProduction, false);
  assert.equal(missingCredential.readyForProduction, false);
  assert.equal(missingApproval.readyForProduction, false);
  assert.equal(production.readyForProduction, true);
  assert.equal(disabledBlock.readyForProduction, false);
  assert.ok(disabledBlock.blockers.includes('real_write_block'));
});
