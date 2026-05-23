# Operations Runbook

The local system is mock completed for M1, M2, M3, M4, audit, and commercial flows. Operations must assume all external providers are sandboxed or mocked until credential and policy gates are satisfied.

## Run Modes

| Mode | External Data | Real Writes | Use Case |
|---|---|---|---|
| local-mock | deterministic fixtures | blocked | development, demos, docs tests |
| sandbox | sandbox SP-API / Ads API where available | blocked unless explicit mock-to-sandbox path exists | credential validation |
| production-read | live reads | blocked | beta validation and accuracy comparison |
| production-write | live reads | explicitly allowlisted only | post-launch controlled execution |

## Daily Checks

1. Confirm health endpoint and replay simulation pass.
2. Check audit circuit breakers, quotas, and conflict queues.
3. Review M2 profit/inventory alerts before M3 Ads changes.
4. Review M4 P0/P1 SLA board and unresolved incidents.
5. Confirm all generated actions show source/confidence metadata and real-write block status.
6. Confirm commercial quota, entitlement, and billing mocks did not block required test paths.

## Real-Write Block Procedure

Real-write block remains enabled by default. To lift it for one action:

1. Verify SP-API or Ads API credentials are scoped, stored in the approved secret manager, and mapped to the seller/profile.
2. Verify the user has admin/approver RBAC and commercial entitlement.
3. Create an audit action with target, expected payload, risk level, rollback, timeout, and blast radius.
4. Require two-person approval for listing publish, Ads budget/bid/campaign mutation, or buyer-facing messaging.
5. Execute only through the adapter allowlist; never bypass audit center.
6. Monitor for 30 minutes and keep rollback ready.

## Rollback Runbook

- M1: restore previous listing version or draft a revert action; do not write to SP-API without approval.
- M2: reverse mock purchase-order transition, reopen leak action, or re-run inventory recommendation with previous assumptions.
- M3: revert bid/budget/keyword/campaign status through Ads API only if the original action has an audit id.
- M4: reopen incident, revert assignment/notification setting, and attach postmortem notes.
- audit: use `/api/v1/audit/{auditId}/revert` or `/api/v1/audit/batch-revert` to create rollback actions.

## SLA

| Severity | Acknowledge | Mitigate | Escalation |
|---|---:|---:|---|
| P0 revenue/account risk | 5 min | 30 min | on-call plus owner |
| P1 material KPI risk | 15 min | 4 hours | module owner |
| P2 normal degradation | 1 business day | 3 business days | backlog review |

## Privacy/Retention

Keep buyer PII masked, keep audit logs immutable, and retain operational records according to compliance policy. Exports must exclude secrets, OAuth tokens, raw payment data, and unnecessary buyer identifiers.
