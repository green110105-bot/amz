# User Manual

This product is an Amazon AI operator for marketplace teams. The current MVP is mock completed: M1 listing optimization, M2 real-time profit and inventory, M3 lifecycle Ads suggestions, M4 daily monitoring, audit center, and commercial plan/quota flows all run on deterministic fixtures and adapter contracts.

## Status And Safety

- Mock completed: dashboards, API contracts, decision engines, audit records, commercial entitlement checks, and replay data are available locally.
- Real validation blockers: Amazon SP-API OAuth app approval, seller authorization, restricted data role approval, Amazon Ads API approval, Ads profiles, third-party keys, LLM/payment credentials, and beta seller consent are not yet provided.
- Real-write block: real store writes are disabled by default. No listing publish, Ads campaign mutation, order/refund action, buyer message, test buy, payment charge, or production notification is allowed until credentials plus explicit per-action approval are present.
- Every mock-backed result must show source and confidence metadata. Treat suggestions as decision support, not production execution.

## MVP Workflow

1. Start from action cards and check source metadata before acting.
2. Use M2 first for profit leaks, reorder, slow-moving stock, cashflow, and commercial viability.
3. Use M3 for Ads API-backed lifecycle suggestions, budget allocation, dayparting, placement, and brand defense; execution remains audit-gated.
4. Use M4 for anomaly queues, review clusters, competitor events, SLA dispatch, and incident follow-up.
5. Use M1 for listing diagnosis, proposal generation, image compliance, version compare, A/B plan, and rollback planning.
6. Use audit center for any write-like action, including mock execution and rollback.

## Module Guide

| Module | What Users Can Do Now | Real Validation Blocker |
|---|---|---|
| M1 | Diagnose listings, draft iterations, generate compliant image guidance, compare versions, plan rollback | SP-API listing write scope, Brand Registry/A/B permissions, content policy review |
| M2 | Review order profit, leak causes, inventory decisions, purchase-order drafts, FX/tax prompts | SP-API orders/reports/fees data, finance exports, tax advisor sign-off |
| M3 | Review Ads suggestions, budget optimizer, dayparting, placement, competitor attack, brand defense | Ads API access token, profile mapping, campaign write allowlist |
| M4 | Triage anomalies, review appeals drafts, recovery email drafts, competitor events, SLA board | Notification channels, Buyer-Seller Messaging permissions, real monitor schedule |
| audit | Approve, reject, mock execute, rollback plan, quotas, conflicts, circuit breakers | Real credential vault, production allowlist, approver RBAC |
| commercial | Entitlements, quota, onboarding readiness, mock metering | Payment provider and signed commercial terms |

## Acting On Recommendations

- Low-risk reads can be reviewed directly if source confidence is acceptable.
- Write-like actions must be converted into audit actions, reviewed by an approver, checked against quotas and conflicts, and kept in mock mode unless real-write block is intentionally lifted.
- Rollback is planned before approval. If rollback cannot be described, do not execute.
- SLA target: P0 acknowledge within 5 minutes, P1 within 15 minutes, P2 within 1 business day.

## Privacy And Retention

Use least privilege. Store only required seller, SKU, order, Ads, and audit metadata. Mask buyer PII in UI and exports. Retain operational records for the configured retention period; delete mock fixtures only through approved test reset procedures.
