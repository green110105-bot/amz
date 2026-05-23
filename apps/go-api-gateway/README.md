# Go API Gateway Boundary

This folder is a migration boundary, not the current runtime. The product still runs through the Node mock-gated services in `apps/api`, `apps/web`, and `apps/services` until credentials, deployment decisions, and production write approvals are provided.

## Responsibility

- Expose the future public HTTP edge for dashboard action cards, audit queue operations, health, and readiness.
- Aggregate Node mock contracts first, then later route to Go handlers without changing client contracts.
- Enforce `MOCK_MODE=true` and `AUDIT_REQUIRED=true` by default for all write-like operations.
- Keep provider credentials out of code and examples; use local placeholders only.

## Contract References

- OpenAPI: `contracts/openapi.gateway.yaml`
- Mock routing contract: `contracts/mock-routing-contract.json`
- Runtime source of truth today: Node route generators and service manifest contracts.

## Local Config Example

Copy `config/gateway.example.env` only for local experiments. Do not place real Amazon, Ads, Keepa, LLM, payment, email, WeCom, or production store credentials in this folder.

## Migration Notes

1. Start with a reverse-proxy or adapter shell that forwards to Node mock-gated endpoints.
2. Port read-only health, readiness, dashboard, and audit-list endpoints first.
3. Keep all submit/approve/apply actions audit-drafted until explicit credentials and approval are available.
4. Validate every route against the OpenAPI and mock-routing contract before switching traffic.
