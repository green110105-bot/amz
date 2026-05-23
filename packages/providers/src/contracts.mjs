const FIXED_FETCHED_AT = '2026-05-08T00:00:00.000Z';

export const providerModes = Object.freeze({
  mock: 'mock',
  sandbox: 'sandbox',
  real: 'real',
});

export const providerNames = Object.freeze([
  'amazon-sp-api',
  'amazon-ads-api',
  'keepa',
  'sellersprite',
  'helium10',
  'llm',
  'notification',
  'billing',
]);

export function deterministicNow() {
  return FIXED_FETCHED_AT;
}

export function createLineage(provider, dataset, operation, upstreamIds = []) {
  return {
    provider,
    dataset,
    operation,
    upstreamIds,
    fixtureVersion: 'providers.v1',
    generatedAt: FIXED_FETCHED_AT,
  };
}

export function createRateLimit({ limit, remaining, resetSeconds, retryAfterSeconds = 0, backoffMs = 250, strategy = 'exponential-jitter-disabled' }) {
  return {
    limit,
    remaining,
    resetSeconds,
    retryAfterSeconds,
    backoff: {
      strategy,
      initialMs: backoffMs,
      maxMs: backoffMs * 8,
      nextDelayMs: retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : backoffMs,
      deterministic: true,
    },
  };
}

export function providerReadResult(provider, operation, data, options = {}) {
  return {
    ok: true,
    provider,
    operation,
    mode: options.mode || providerModes.mock,
    source: options.source || `${provider}:${options.mode || providerModes.mock}:fixture`,
    confidence: options.confidence ?? 0.82,
    fetchedAt: FIXED_FETCHED_AT,
    data,
    lineage: options.lineage || createLineage(provider, options.dataset || operation, operation, options.upstreamIds || []),
    rateLimit: options.rateLimit || createRateLimit({ limit: 60, remaining: 59, resetSeconds: 60 }),
  };
}

export function missingCredentialsResult(provider, operation, requiredCredentials) {
  return {
    ok: false,
    provider,
    operation,
    mode: providerModes.real,
    reasonCode: 'REAL_CREDENTIALS_MISSING',
    message: 'Real provider access is disabled until required credentials are supplied through a sandboxed secret channel.',
    requiredCredentials: [...requiredCredentials].sort(),
    audit: {
      decision: 'blocked',
      explanation: 'No network call was attempted because real credentials are absent.',
      safeDefault: 'mock_or_sandbox_only',
      at: FIXED_FETCHED_AT,
    },
    source: `${provider}:real:blocked`,
    confidence: 1,
    lineage: createLineage(provider, 'credential-check', operation),
    rateLimit: createRateLimit({ limit: 0, remaining: 0, resetSeconds: 0, backoffMs: 1000 }),
  };
}

export function realWriteBlockedResult(provider, operation, payload = {}, options = {}) {
  return {
    ok: false,
    provider,
    operation,
    mode: options.mode || providerModes.real,
    reasonCode: 'REAL_WRITE_BLOCKED',
    message: 'External write-like operations are blocked by provider contract until explicit production authorization is granted.',
    attemptedPayload: redactPayload(payload),
    audit: {
      decision: 'blocked',
      explanation: `Blocked ${provider}.${operation} to prevent unsandboxed account, payment, notification, listing, ads, or store mutation.`,
      safeDefault: 'return_audit_explainable_result',
      at: FIXED_FETCHED_AT,
    },
    source: `${provider}:${options.mode || providerModes.real}:write-blocked`,
    confidence: 1,
    lineage: createLineage(provider, 'write-guard', operation, options.upstreamIds || []),
    rateLimit: options.rateLimit || createRateLimit({ limit: 0, remaining: 0, resetSeconds: 0, backoffMs: 1000 }),
  };
}

function redactPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [
    key,
    /token|secret|password|credential|key/i.test(key) ? '[redacted]' : value,
  ]));
}

export function hasRequiredCredentials(credentials = {}, requiredCredentials = []) {
  return requiredCredentials.every((key) => Boolean(credentials[key]));
}
