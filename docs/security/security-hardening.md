# Security and Compliance Hardening

Status: final-hardening baseline for the mock-gated MVP. This document is normative for local, sandbox, and future production deployments. Real Amazon account writes remain blocked until credentials, approvals, and audit evidence are present.

## 1. Threat Model

### Assets
- Tenant data: tenant IDs, store IDs, user roles, permissions, configuration, audit records.
- Amazon data: orders, inventory, listings, ads metrics, settlement and financial events, provider freshness metadata.
- Secrets: SP-API refresh tokens, Login with Amazon credentials, Amazon Ads OAuth tokens, Keepa/SellerSprite/Helium 10 keys, LLM API keys, email and WeCom credentials.
- Decision outputs: profit and inventory recommendations, ad lifecycle suggestions, listing optimization drafts, alert routing, rollback metadata.
- Operational evidence: append-only audit logs, rate-limit events, mock/real source tags, approvals, incident records.

### Trust Boundaries
- Browser/API client to backend: authenticated user identity, tenant scope, CSRF-safe write paths, request rate limits.
- Backend to domain engines: explicit tenant context, RBAC claims, source/confidence metadata, audit event context.
- Backend to provider adapters: sandbox/mocked by default, encrypted credentials, quota metadata, retry and backoff controls.
- Domain engines to audit center: every write-like or externally visible recommendation creates immutable audit evidence.
- Storage boundary: encrypted tenant-scoped database rows and encrypted object storage for raw provider payloads.

### Abuse Cases and Required Mitigations
| Threat | Example | Required mitigation | Audit evidence |
| --- | --- | --- | --- |
| Cross-tenant access | User from tenant A reads tenant B orders | Tenant isolation on every resource and query; deny by default | tenant_boundary_violation event |
| Secret leakage | Provider token appears in logs or test snapshots | Recursive redaction for token/secret/password/api key fields | redaction policy version |
| Real-write bypass | Ad budget or listing changed without approval | Real-write block before adapter execution; mock/sandbox default | write_blocked or approval_id |
| PII exposure | Buyer details exported to AI prompt or analytics | Data minimization, masking, no raw PII in prompts | pii_redacted flag |
| Financial tampering | Fee or settlement field overwritten | Immutable source snapshots, provenance, reconciliation checks | before/after hash and actor |
| Provider throttling | SP-API or Ads API quota exceeded | Rate-limit metadata, queueing, exponential backoff | provider_rate_limited event |
| Over-retention | Raw payloads kept indefinitely | Retention windows and purge jobs with legal hold | retention_policy_id |
| Privilege escalation | Support user performs operator action | RBAC, break-glass only for audited support_read | break_glass_approval |

## 2. Compliance Control Matrix

| Control ID | Control | Implementation requirement | Verification |
| --- | --- | --- | --- |
| SEC-TENANT-001 | Tenant isolation | All APIs, domain helpers, tables, fixtures, decisions, and audit events carry tenantId/storeId | Unit tests cover allow, deny, and break-glass paths |
| SEC-RBAC-002 | Least privilege RBAC | Roles grant only required read, approve, execute, admin, or support_read actions | Permission tests and audit event assertions |
| SEC-AUDIT-003 | Immutable audit trail | Write-like operations, approvals, denials, retries, rollback data, and external payload lineage are recorded | Audit center tests and append-only storage review |
| SEC-REDACT-004 | Secret and PII redaction | Tokens, secrets, passwords, API keys, buyer identifiers, and financial account identifiers are masked before logs/prompts | Redaction tests and snapshot review |
| SEC-RETENTION-005 | Retention and legal hold | Entity-specific retention windows; raw provider payloads default to 30 days; audit/financial records default to 2555 days | Retention plan tests and purge dry-run logs |
| SEC-RATE-006 | Provider rate limits | Every adapter publishes quota window, utilization, backoff, and queue strategy | Rate-limit helper tests and provider contract metadata |
| SEC-REALWRITE-007 | Real-write block | Production writes require real credentials, explicit production approval, tenant authorization, idempotency key, and audit approval_id | Governance readiness tests and adapter guard tests |
| SEC-AMZ-008 | Amazon API compliance | SP-API and Ads API data used only for authorized stores/scopes; no credential sharing; respect quotas and revocation | Onboarding checklist and adapter contract checks |
| SEC-KEY-009 | Key rotation | Secrets are versioned, encrypted, rotated, revoked, and never committed | Rotation runbook evidence and secret scan |
| SEC-AI-010 | AI data minimization | LLM prompts use redacted, minimum necessary data with source/confidence labels; no raw PII or credentials | Prompt fixture tests and audit metadata |

## 3. Data Classification

| Class | Data examples | Storage and processing rules | Logging and AI rules | Retention |
| --- | --- | --- | --- | --- |
| Public | Public listing title, public ASIN metadata | Cache allowed with source metadata | May be logged if no tenant secrets | Business-defined |
| Internal | Dashboard layout, non-sensitive task state | Tenant-scoped storage | Log at info level without secrets | 365-730 days |
| Confidential | Inventory, ads metrics, listing drafts, operational alerts | Tenant-scoped encrypted database | Redact identifiers not needed for debugging | 1095-2555 days |
| Restricted PII | Buyer names, addresses, emails, phone numbers, shipment identifiers | Avoid collection unless required; encrypt; restrict to least privilege | Never send raw values to logs or LLMs; mask/tokenize | Minimum necessary, default 365 days unless legal obligation |
| Restricted Financial | Settlement, fees, payouts, COGS, profit, tax/account identifiers | Encrypt, reconcile with source snapshots, protect exports | Aggregate or mask; no raw account identifiers in prompts | 2555 days or legal hold |
| Secret | OAuth refresh/access tokens, API keys, client secrets, passwords | Dedicated secret store only; envelope encryption; versioned rotation | Never log; always redacted as `[REDACTED]` | Until rotated/revoked; no backups beyond secret-store policy |
| Audit Evidence | Approvals, denials, actor IDs, idempotency keys, before/after hashes | Append-only tenant-scoped storage with legal hold | Log references only; keep immutable records | 2555 days |

## 4. Audit and Permission Model

### Roles
- `viewer`: read dashboards and audit records for assigned tenant/store only.
- `operator`: create recommendations, run mock simulations, acknowledge alerts, and request approvals.
- `approver`: approve or reject write-like actions after reviewing diff, impact, rollback, and source confidence.
- `admin`: manage tenant users, adapter configuration, non-secret policy settings, and retention holds.
- `super_admin`: platform support only; no tenant data access unless break-glass support_read is approved and audited.

### Permission Rules
- Deny by default when tenantId or storeId is missing.
- Same-tenant access is necessary but not sufficient; the actor must also have the action permission or role grant.
- Break-glass access is limited to `support_read`, requires explicit approval, has short time-to-live, and always creates an audit event.
- Approval and execution must be separated for real writes; the requester cannot be the sole approver for high-impact actions.
- Every write-like action requires actor, tenantId, storeId, action, source, confidence, impact summary, rollback plan, idempotency key, and approval_id where applicable.

### Audit Event Minimum Fields
- `eventId`, `tenantId`, `storeId`, `actorId`, `actorRole`, `action`, `decisionId`, `approvalId`, `idempotencyKey`.
- `sourceType`: `mock`, `sandbox`, or `production`.
- `confidence`, `provider`, `rateLimitState`, `realWriteBlocked`, `redactionApplied`.
- `beforeHash`, `afterHash`, `rollbackPlan`, `retentionClass`, `createdAt`.

## 5. Secret Management and Key Rotation

- Keep all credentials outside source control in a managed secret store or local sandbox equivalent; `.env` files are local-only and never authoritative.
- Store secret metadata as references only: provider, tenant/store scope, secret version, createdAt, rotatedAt, expiresAt, and revocation status.
- Rotate Amazon SP-API, Ads API, Keepa, SellerSprite, Helium 10, LLM, email, and WeCom credentials on a fixed schedule or immediately after suspected exposure.
- Rotation flow: create new version, validate sandbox read, switch active version, revoke previous version, record audit evidence, run smoke checks, and confirm redaction.
- Emergency rotation flow: block provider writes, revoke exposed secret, purge queued jobs using the version, rotate dependent tokens, notify tenant admin, and open incident record.
- Logs, errors, audit summaries, prompts, and test fixtures must contain secret references only, never raw secret values.

## 6. PII and Financial Data Handling

- Collect the minimum Amazon PII needed for authorized operational workflows; prefer aggregates, hashed identifiers, or synthetic mock fixtures.
- Mask buyer and shipment identifiers in logs, prompts, dashboards, exports, and notifications unless the user has explicit need-to-know permission.
- Financial data must retain provider provenance, calculation version, source timestamp, and reconciliation status.
- Profit, fee, settlement, and COGS calculations must be reproducible from immutable source snapshots without exposing raw restricted financial identifiers to AI prompts.
- Exports containing PII or financial data require tenant authorization, purpose, expiration, and audit event references.
- Data deletion honors retention policy, legal hold, and Amazon/accounting obligations; deletion jobs must be dry-run auditable before destructive execution.

## 7. Amazon API Compliance Boundary

- Amazon SP-API and Amazon Ads API are adapter interfaces first; deterministic mock data is the default until authorized credentials are provided.
- Access is limited to authorized tenants, stores, marketplaces, and scopes granted by the seller or advertiser.
- The platform must respect Amazon API quotas, usage plans, retry guidance, token revocation, and marketplace-specific data boundaries.
- Do not pool credentials across tenants or use one store authorization to infer another store's data.
- Do not use Amazon-restricted data for unrelated model training, cross-tenant benchmarking, or unapproved external sharing.
- Every provider response must carry source, freshness, confidence, marketplace, tenant/store scope, and mock/sandbox/production marker.
- Provider adapters must fail closed when scope, tenant, credentials, quota, or approval metadata is missing.

## 8. Real-Write Blocking Strategy

Real writes include listing changes, price changes, ad campaign/budget/bid changes, inventory-affecting operations, notifications that trigger external commitments, and any provider call that mutates Amazon or third-party state.

Required gates before execution:
1. `realCredentialsProvided === true` for the specific tenant, store, marketplace, provider, and scope.
2. `productionApproval === true` from an authorized approver who can approve that action.
3. Tenant isolation passes and the actor has least-privilege permission for the requested action.
4. Adapter mode is explicitly `production`; default `mock` and `sandbox` modes cannot mutate external systems.
5. Idempotency key, rollback plan, before/after diff, confidence metadata, and rate-limit state are present.
6. Audit center records the approval before execution and the final outcome after execution.
7. Rate-limit helper returns allowed state; otherwise the request is queued with backoff and no write is attempted.

If any gate fails, the adapter returns `real_write_blocked`, no provider mutation is attempted, and an audit event records the failed gate.

## 9. Verification Checklist

- Governance helpers cover tenant isolation, redaction, retention, rate-limit metadata, and real-write readiness/blocking.
- `tests/security` verifies this document contains the required compliance keywords and control IDs.
- Mock-backed features clearly display source and confidence metadata.
- Production readiness remains false unless real credentials and explicit production approval are both present.
