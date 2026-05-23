# Services Manifest

This directory contains the no-dependency service architecture skeleton for the PRD MVP/full-scope roadmap.

- `service-manifest.json` is the source of truth for service ownership, ports/jobs, contracts, env, external blockers, and health/readiness checks.
- `src/runner.mjs` is a generic no-dependency local service entrypoint. Start any manifest service with `node apps/services/src/runner.mjs --service api-gateway`.
- Every service exposes `GET /health` and `GET /ready`, including job-only services whose manifest probe paths are recorded as `job:health` and `job:ready` in the response payload.
- All services are mock-first and audit-gated until real credentials, store authorization, payment setup, and production write approval are provided.
