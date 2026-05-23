# Service Split Migration Boundary

Date: 2026-05-08

## Current Runtime Truth

The application still runs as the Node mock-gated MVP. The active paths remain `apps/api`, `apps/web`, and `apps/services`, with deterministic fixtures and audit-gated write-like actions. The Go, Python, and Next.js folders are migration boundaries only; they define contracts, config examples, and ownership seams before any runtime switch.

## Split Targets

| Boundary | Folder | Role | Current Status |
| --- | --- | --- | --- |
| API gateway | `apps/go-api-gateway` | HTTP edge, OpenAPI aggregation, audit enforcement | Skeleton and contracts only |
| AI service | `apps/python-ai-service` | Decision envelopes, explanations, provider adapters, workers, ETL consumers | Skeleton and contracts only |
| Next web | `apps/next-web` | Dashboard/action-card UI migration boundary | Skeleton and contracts only |
| Node services | `apps/services` | Current service manifest and mock health/readiness runner | Active runtime |

## Contract Rules

- Every boundary must point to an OpenAPI or mock contract.
- Every mock-backed feature must carry `source`, `confidence`, and `freshness` metadata.
- Write-like actions are `audit-draft-only` until credentials and explicit approval are available.
- Real Amazon SP-API, Amazon Ads API, Keepa, SellerSprite, Helium 10, LLM, email, WeCom, payment, and store write credentials are forbidden in skeleton files.
- Config examples use placeholders such as `mock-placeholder-only`, never real tokens.

## Worker, Provider, and ETL Coverage

- Workers are represented by `apps/python-ai-service/worker/decision_worker.py` and the provider contract notes.
- Providers are represented by `apps/python-ai-service/providers/README.md` and remain mock-first adapters.
- ETL is represented by `apps/python-ai-service/etl/README.md`; source snapshots remain deterministic until external credentials are approved.
- Web views consume gateway and BFF mock contracts instead of provider APIs.

## Migration Acceptance Criteria

1. Go gateway skeleton contains a README, config example, OpenAPI contract, and mock routing contract.
2. Python AI service skeleton contains a README, config example, decision schema, provider/worker/ETL notes, and no real credentials.
3. Next web skeleton contains a README, config example, mock BFF contract, and no browser provider secrets.
4. Contract tests verify boundary files exist, reference OpenAPI/mock contracts, preserve Node mock-gated runtime truth, and block real-looking credentials.

## Not In Scope

- Editing `package.json` scripts.
- Editing `apps/services/service-manifest.json`.
- Replacing the current Node runtime.
- Calling external provider APIs or applying real store writes.
