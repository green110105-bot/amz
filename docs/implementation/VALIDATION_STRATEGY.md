# Full Validation Strategy

## Quality Gates
- `npm run requirements`: regenerate full traceability from source docs and status mappings.
- `npm run coverage`: ensure no source document is omitted and all non-section items have implementation/test ownership.
- `npm run contracts`: regenerate documented routes and OpenAPI.
- `npm run db:validate`: validate core schema presence plus full-module migration tests through `npm test`.
- `npm run ai-eval`: run Codex-local golden prompt/decision cases.
- `npm test`: run domain, API, DB, replay, AI, contract, provider, service, docs, security, deploy, e2e, perf, and web tests.
- `npm run health-check`: exercise base and advanced local API handlers.
- `npm run replay`: replay deterministic API/AI paths without external dependencies.
- `npm run perf-smoke`: run in-process local API p95/p99 smoke without external network or server startup.
- `npm run mock-scenario:test`: enumerate and replay the complete mock scenario catalog for 5 deterministic rounds.
- `npm run m1:asin-benchmark`: run 5 ASIN-shaped public listing snapshots through diagnosis, 3 optimization rounds per ASIN, and mock apply.
- `npm run m3:ad-timeseries`: generate continuous 90-day daily and 90 x 24 hourly ad data for 5 ASIN/campaign combinations.
- `npm run benchmark:mock`: enforce M1/M3 benchmark counts in the main quality gate.
- `npm run package-release:dry-run`: verify release bundle include/exclude rules without writing an archive.
- `docker compose -f infra/deploy/docker-compose.yml --env-file .env.example config --quiet`: validate local compose syntax and wiring.

## Validation Layers
1. Static traceability: every source requirement maps to an item in `FULL_REQUIREMENTS_MATRIX.json`.
2. Runtime route coverage: every documented API row resolves to an implemented mock contract.
3. Domain tests: deterministic logic for M1/M2/M3/M4/audit/provider/commercial/governance layers, including 5-ASIN M1 benchmark loops and M3 continuous ad time-series fixtures consumed by lifecycle and advanced ads engines.
4. Provider tests: SP-API, Ads API, Keepa, SellerSprite, Helium10, LLM, notification, and billing contracts expose source/confidence/lineage, backoff metadata, missing-credential errors, and real-write blocking.
5. API handler/security tests: local endpoints return mock-backed contracts, critical flows execute end to end, `/ready` exists, tenant/rbac/rate-limit/CORS gates work.
6. Schema tests: Postgres and ClickHouse migrations expose required tables and fields.
7. Service manifest/runtime tests: service ownership, jobs/ports, contracts, env, blockers, health/readiness, and audit gating.
8. Deploy/CI tests: `.env.example`, compose, deploy manifest, release docs, README, and GitHub Actions coverage.
9. Docs/security tests: user, ops, API, onboarding, incident, compliance, retention, permissions, threat model, and real-write blocking docs cover required terms.
10. Web static/server tests: no-build UI skeleton and web server expose modules, source/confidence, RBAC, real-write blocking, `/health`, and `/ready`.
11. Mock scenario tests: 14 cataloged scenarios across M1/M2/M3/M4, audit/security, commercialization, and provider modes are replayed for 5+ rounds with real writes denied.
12. Release packaging tests: dry-run and fixture packaging verify source-only bundle contents, checksums, security notes, and secret/log/dependency exclusions.
13. Replay tests: 24-month profit, 30-day ads, review/competitor changes, and audit/provider blocking.
14. E2E tests: onboarding -> listing iteration -> profit/cashflow -> ad guardrail/audit -> M4 SLA -> commercial quota.
15. Performance smoke: representative endpoints stay within broad local p95/p99 thresholds.
16. Health checks: representative base and advanced endpoints return 200 locally.
17. Sandbox validation: pending external accounts.
18. Real store validation: pending user-provided credentials and explicit approval.
19. Beta validation: pending real seller cohort.

## Current Evidence
- Traceability: 1313 items; 196 user stories; 74 checklist items; 0 pending items.
- API contracts: 203 documented API rows; 212 OpenAPI operations.
- Runtime route coverage: every documented route resolves without `contract_stub_until_implemented`.
- Automated tests: 148/148 passing in `npm test`.
- Health checks: 20 endpoints covering `/ready`, dashboard, M1, M2, M3, M4, audit, commercial, and AI.
- Replay: 20 API/AI paths plus dedicated replay fixture tests.
- Mock scenarios: 14 scenarios replayed for 5 rounds; all rounds report `realWrites=NO`.
- M1 ASIN benchmark: 5 public-ASIN-shaped listing snapshots, 15 optimization rounds, 45 proposals, mock apply only, `realWrites=NO`.
- M3 continuous ads benchmark: 5 ASIN/campaign combinations, 450 daily rows, 10,800 hourly rows, 17 ad-state scenarios, `realWrites=NO`.
- Performance smoke: `npm run perf-smoke` passes under local mock thresholds.
- Packaging dry-run: `npm run package-release:dry-run` reports the source-only tar.gz plan and writes no archive.
- Packaging artifact: `npm run package-release` generates `dist/release/amz-ai-operator-0.1.0.tar.gz` and prints the archive sha256.
- Docker compose config validates with `.env.example`.
- Full gate: `npm run check` passes end to end with 148 tests plus mock-scenario, M1/M3 benchmark, and package dry-run gates.
- Real external writes are blocked by design through provider and audit gates.

## External Validation Still Blocked
- SP-API OAuth and report latency.
- Ads API write actions.
- Keepa/SellerSprite/Helium 10 contract limits and paid quotas.
- External LLM output quality, latency, and token cost.
- Email/WeCom/WeChat delivery.
- Payment provider billing flows.
- Real seller business impact and beta KPI measurement.
