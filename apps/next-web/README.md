# Next Web Boundary

This folder is a migration boundary for a future Next.js dashboard shell. The current UI still runs through the Node mock-gated web app in `apps/web` and the Node API/service runner.

## Responsibility

- Render dashboard action cards, module KPI views, audit queue views, service readiness, and billing entitlement states.
- Consume only the API gateway and mock BFF contracts; do not embed provider credentials or call marketplace APIs from the browser.
- Show source, confidence, and freshness metadata for mock-backed data.
- Keep write-like actions as audit drafts until production approval exists.

## Contract References

- Mock BFF view contract: `contracts/web-bff.mock.json`
- API gateway OpenAPI: `../go-api-gateway/contracts/openapi.gateway.yaml`
- AI decision envelope: `../python-ai-service/contracts/decision-envelope.schema.json`

## Local Config Example

Use `config/next-web.example.env` for local experiments only. Values point at local mock-gated services.
