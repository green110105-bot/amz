const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /refresh/i,
  /access_key/i,
  /client_secret/i,
  /api_key/i,
  /api.*key/i,
  /email/i,
  /phone/i,
  /address/i,
  /buyer/i,
  /shipment/i,
  /account.*id/i,
  /tax.*id/i,
  /payout/i,
];

const DEFAULT_RETENTION_DAYS = {
  orders: 2555,
  financial_events: 2555,
  ads_metrics: 1095,
  listing_versions: 2555,
  audit_logs: 2555,
  notifications: 365,
  ai_decisions: 730,
  raw_provider_payloads: 30,
};

export function redactSensitiveFields(value, options = {}) {
  const mask = options.mask || '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactSensitiveFields(item, options));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) return [key, mask];
    return [key, redactSensitiveFields(child, options)];
  }));
}

export function evaluateTenantAccess({ actor = {}, resource = {}, action = 'read' } = {}) {
  const sameTenant = Boolean(actor.tenantId && resource.tenantId && actor.tenantId === resource.tenantId);
  const leastPrivilege = actor.permissions?.includes(action) || actor.role === 'admin';
  const adminBypass = actor.role === 'super_admin' && action === 'support_read' && actor.breakGlassApproved === true;
  const allowed = (sameTenant && leastPrivilege) || adminBypass;

  return {
    allowed,
    action,
    reason: allowed ? 'tenant_boundary_satisfied' : sameTenant ? 'least_privilege_violation' : 'tenant_boundary_violation',
    auditRequired: action !== 'read' || adminBypass,
    controls: {
      tenantScoped: sameTenant,
      breakGlass: adminBypass,
      leastPrivilege: leastPrivilege || adminBypass,
    },
  };
}

export function buildRetentionPlan(entityTypes = Object.keys(DEFAULT_RETENTION_DAYS), options = {}) {
  const now = new Date(options.now || '2026-05-08T00:00:00.000Z');
  return entityTypes.map((entityType) => {
    const retentionDays = options.overrides?.[entityType] || DEFAULT_RETENTION_DAYS[entityType] || 365;
    const purgeAfter = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
    return {
      entityType,
      retentionDays,
      purgeAfter,
      storage: entityType.startsWith('raw_') ? 'encrypted_object_store' : 'tenant_scoped_database',
      legalHoldSupported: ['orders', 'financial_events', 'audit_logs'].includes(entityType),
    };
  });
}

export function evaluateSecurityReadiness(input = {}) {
  const controls = [
    control('tenant_isolation', input.tenantIsolation !== false, 'All tables and API contracts carry tenant/store scope.'),
    control('secret_redaction', input.secretRedaction !== false, 'Provider tokens and API keys must be redacted from logs.'),
    control('real_write_block', input.realWriteBlock !== false, 'Real Amazon writes stay blocked until credentials and explicit approval exist.'),
    control('audit_log', input.auditLog !== false, 'Write-like operations create audit records with rollback metadata.'),
    control('rbac', input.rbac !== false, 'Role permissions gate commercial and operational actions.'),
    control('retention_policy', input.retentionPolicy !== false, 'Retention windows exist for raw payloads, decisions, audit logs, and financial records.'),
    control('source_lineage', input.sourceLineage !== false, 'Mock/provider results include source and confidence metadata.'),
    control('rate_limit_ready', input.rateLimitReady !== false, 'Provider adapters carry backoff and quota metadata.'),
  ];

  return {
    readyForSandbox: controls.every((item) => item.passes),
    readyForProduction: controls.every((item) => item.passes) && input.realCredentialsProvided === true && input.productionApproval === true,
    controls,
    blockers: controls.filter((item) => !item.passes).map((item) => item.id),
  };
}

export function evaluateProviderRateLimit({ provider, requests = 0, windowSeconds = 60, limit = 60 } = {}) {
  const utilization = limit <= 0 ? 1 : requests / limit;
  return {
    provider,
    requests,
    windowSeconds,
    limit,
    utilization: Number(utilization.toFixed(4)),
    allowed: requests <= limit,
    backoffMs: requests <= limit ? 0 : Math.ceil((requests - limit) * (windowSeconds * 1000 / Math.max(1, limit))),
    strategy: requests <= limit ? 'allow' : 'exponential_backoff_and_queue',
  };
}

function control(id, passes, evidence) {
  return { id, passes, evidence };
}
