# Implementation Decision Log

## 2026-05-08: Scope Is Full PRD, Not MVP-Only
The user clarified that MVP/P0 must not be treated as the final target. P0 is now only a sequencing tool. The implementation target is every requirement traceable from:
- `PRD.md`
- `docs/cross-module/*.md`
- `docs/modules/*.md`

Generated files under `docs/implementation/` are not source-of-truth requirements; they are traceability artifacts.

## 2026-05-08: No Known Omission Gate
Added `scripts/generate-requirements.mjs` and `scripts/coverage-gate.mjs`.

Current traceability scope:
- 1313 full traceability items
- 196 user stories
- 787 sections
- 74 checklist items

The coverage gate enforces source-document presence, minimum story/section/checklist counts, and implementation/test ownership for non-section items.

## 2026-05-08: External Dependency Policy
All external dependencies stay behind providers until credentials and explicit approval exist:
- Amazon SP-API
- Amazon Ads API
- Keepa/SellerSprite/Helium 10
- LLM providers
- Email/WeCom/WeChat
- Payment providers
- Real store writes

## 2026-05-08: Codex-Local LLM Policy
The user instructed: "llm，先就用现在的codex". Runtime code now exposes a `codex_local` decision provider and a deterministic prompt/eval harness. This records structured, explainable decision contracts without calling an external LLM API. External LLM providers remain replaceable behind the provider abstraction.

## 2026-05-08: Architecture Adaptation
The PRD prefers Go/Python/Next.js services. The current machine lacks Go, so the first complete behavior skeleton is implemented in dependency-light Node modules. This is a tactical decision to keep full-scope progress unblocked. The generated traceability, contracts, schema, and tests are independent from the future service split.

## 2026-05-08: Full-Scope Mock-Gated Completion Semantics
The implementation status model now distinguishes local completion from external validation:
- `implemented_mock_validated`: deterministic local implementation and automated tests exist.
- `implemented_mock_external_blocked`: deterministic local implementation exists, but real credentials, real accounts, paid providers, or explicit write approval are required to validate against production/sandbox systems.
- `documented`: heading/section trace item only.

This avoids pretending that unavailable Amazon accounts or paid APIs have been validated while still preventing requirement omissions.

## 2026-05-08: Documented API Routes Are Not Left As Stubs
`apps/api/src/full-scope-routes.mjs` provides module-aware mock contracts for documented routes and concrete handlers for critical M1/M2/M3/M4/audit/commercial flows. Existing base handlers still serve established endpoints first. If a documented route is not special-cased yet, it returns `implemented_mock_contract` with external-write blocking metadata instead of an untracked `contract_stub`.

## 2026-05-08: Static Web Skeleton Is No-Build
The frontend skeleton intentionally uses static HTML/CSS/ESM under `apps/web` so it can be validated without installing a framework. It covers dashboard, M1, M2, M3, M4, audit, and commercial surfaces with source/confidence visibility, RBAC indicators, and real-store write blocking.

## 2026-05-08: Provider Contracts Are Mock/Sandbox/Real-Blocked
Provider contracts were added for Amazon SP-API, Amazon Ads API, Keepa, SellerSprite, Helium10, LLM, notification, and billing. `mock` and `sandbox` modes return deterministic fixtures and source/confidence/lineage metadata. `real` mode requires credentials; missing credentials return an audit-friendly error, and write-like operations return `REAL_WRITE_BLOCKED` unless future explicit approval changes the gate.

## 2026-05-08: Service Manifest Before Polyglot Split
`apps/services/service-manifest.json` documents the PRD service topology while the runtime stays dependency-light Node. It keeps service ownership, env, ports/jobs, health/readiness, contracts, and external blockers explicit so a future Go/Python/Next split can be performed without losing the current tested behavior.

## 2026-05-08: E2E And Performance Smoke Are Local-Only
End-to-end tests run in process without network and verify the operator loop across commercial onboarding, M1 iteration, M2 cashflow/scenario, M3 guardrails/audit, M4 SLA, and commercial quota. Performance smoke is intentionally broad and local; it catches major regressions in deterministic handlers but is not a substitute for k6 or production load testing after real infrastructure exists.

## 2026-05-08: Final Gap Audit Closure
A read-only final gap audit found deployment, readiness, CI, service runtime, API security, and README gaps. The project now standardizes local API port `8080`, exposes `/ready`, includes `/ready` in OpenAPI/health/replay, uses local compose commands instead of unpublished `amz/*` images, includes GitHub Actions CI, restores README quick-start/test/deploy instructions, provides a generic service runner for all manifest services, and adds API tenant/RBAC/rate-limit/CORS/security-header tests.

## 2026-05-08: Mock Scenario Catalog Is The Real-Account Substitute
Because the user confirmed that real SP-API/Ads/shop validation is unavailable for now, the local validation strategy now includes a dedicated mock scenario catalog. The catalog enumerates M1 Listing, M2 profit/inventory, M3 ads, M4 monitoring, audit/security, commercialization, and provider-mode cases. `npm run mock-scenario:test` must run at least 5 deterministic rounds and assert source/confidence/expected signals plus `realWriteAllowed=false` for every exercised scenario.

## 2026-05-08: Polyglot Split Is Contract-First
The Go API gateway, Python AI service, and Next.js web boundaries now exist as migration skeletons under `apps/go-api-gateway`, `apps/python-ai-service`, and `apps/next-web`. They are not the active runtime yet. The active runtime remains the tested Node mock-gated implementation, while the skeletons preserve contract boundaries, mock configs, no-real-credential defaults, and audit-draft-only write policies for a future migration.

## 2026-05-08: Frontend UI Was Rebuilt As A Mock Command Center
The static no-build web surface was refreshed from a minimal skeleton into a role/scenario driven command center. It keeps the PRD warning visible, exposes source/confidence/validation on every card, provides scenario switching for varied mock states, marks RBAC restrictions, and keeps all write-like actions routed to audit instead of real store execution.

## 2026-05-08: Release Packaging Is Source-Only And Secret-Excluding
Release delivery uses `scripts/package-release.mjs`, a pure Node tar.gz packager. The bundle includes README, docs, apps, packages, infra, scripts, tests, `.env.example`, and `package.json`, then injects `RELEASE-MANIFEST.json` and `SECURITY-NOTES.md`. It excludes `.git`, `node_modules`, `dist`, logs, secrets, and non-example `.env*` files. Dry-run is part of `npm run check`; actual artifact creation is explicit through `npm run package-release`.
