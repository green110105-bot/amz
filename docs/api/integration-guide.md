# API And Integration Guide

All APIs currently run against deterministic mock data. M1, M2, M3, M4, audit, and commercial endpoints are implemented as local contracts with source/confidence metadata and real-write block indicators.

## Base Contract

- Base path: `/api/v1`.
- Responses include module context where available: `M1`, `M2`, `M3`, `M4`, `AUDIT`, or commercial platform data.
- Mock-backed responses must be treated as `implemented_mock_contract` or `completed_mock` until real validation is complete.
- Real writes are blocked by default and must pass audit center.

## Key Endpoints

| Area | Endpoint Examples | Notes |
|---|---|---|
| M1 listing | `GET /api/v1/listings`, `POST /api/v1/listings/{productId}/diagnose`, `POST /api/v1/iterations/{iterationId}/apply`, `POST /api/v1/listings/{productId}/versions/{versionId}/rollback` | apply/rollback are audit-gated before SP-API writes |
| M2 profit/inventory | `GET /api/v1/profit/skus`, `GET /api/v1/profit/leaks`, `GET /api/v1/inventory/reorder`, `POST /api/v1/purchase-orders` | uses mock order, fee, cost, inventory fixtures |
| M3 Ads | `GET /api/v1/ads/campaigns`, `POST /api/v1/ads/budget-allocator/optimize`, `POST /api/v1/ads/suggestions/{suggestionId}/execute` | Ads API execution is blocked until profile/write scope approved |
| M4 monitoring | `GET /api/v1/monitor/anomalies`, `GET /api/v1/monitor/sla`, `POST /api/v1/reviews/appeals/draft`, `POST /api/v1/monitor/postmortems/generate` | notifications and buyer-facing messages stay mock/sandbox |
| audit | `GET /api/v1/audit`, `GET /api/v1/audit/circuit-breakers`, `POST /api/v1/audit/{auditId}/revert`, `POST /api/v1/audit/batch-revert` | required for all write-like actions and rollback |
| commercial | `GET /api/v1/commercial/entitlements`, `GET /api/v1/commercial/quota`, `GET /api/v1/commercial/onboarding`, `POST /api/v1/commercial/usage` | payment is mocked until provider credentials exist |

## Adapter Integration Rules

- SP-API: separate read and write clients; map marketplace, seller, role, report type, and data freshness.
- Ads API: separate profile discovery, reporting, and mutation adapters; mutation requires explicit allowlist.
- Third parties: Keepa/SellerSprite/Helium 10 remain provider interfaces until contract, key, and ToS review are complete.
- LLM APIs: prompts must receive minimized data, no unnecessary buyer PII, and confidence metadata.
- Commercial/payment: sandbox only until signed terms and payment credentials are approved.

## Error And Metadata Expectations

- Return a safe mock fallback if external reads fail and mark confidence low.
- Return a blocked status for writes when real-write block is active.
- Include audit id, rollback path, SLA owner, and provider source for executable actions.
