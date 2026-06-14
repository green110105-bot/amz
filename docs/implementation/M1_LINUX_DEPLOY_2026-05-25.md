# M1 Linux Deploy Report（2026-05-25）

## Deployment

- Public URL: `http://47.97.252.71/`
- Server source: `/opt/amz/src`
- Web dist: `/var/www/amz-web`
- API service: systemd `amz-api`, listening on `127.0.0.1:8090`
- SQLite DB: `/opt/amz/data/store.db`
- Backup before deploy: `/opt/amz/backups/20260525T163449Z`

Artifacts used:

- Source archive: `dist/release/amz-ai-operator-0.1.0.tar.gz`
- Web dist archive: `dist/release/amz-web-v2-dist-20260525T163400Z.tar.gz`

Deploy actions:

1. Backed up `/opt/amz/src` excluding node_modules and web dist.
2. Backed up `/var/www/amz-web`.
3. Checkpointed and backed up `/opt/amz/data/store.db*`.
4. Extracted source archive over `/opt/amz/src` while preserving existing `node_modules`.
5. Replaced `/var/www/amz-web` with the new Vite dist.
6. Ran `nginx -t` successfully.
7. Restarted `amz-api` successfully.
8. Verified local server health and readiness.

## Remote Health Evidence

- `curl http://127.0.0.1:8090/health`: PASS, returns `{ ok: true, service: "amz-api", mode: "mock" }`.
- `curl http://127.0.0.1:8090/ready`: PASS, real writes remain disabled and audit required.
- `GET http://47.97.252.71/`: PASS, SPA HTML returned.
- `GET http://47.97.252.71/health`: PASS.
- `POST /api/v1/auth/login` with demo account: PASS, token returned.

## Remote M1 API Evidence

Using authenticated demo token and store `s-mock-us`:

- `GET /api/v1/store/m1/targets`: PASS, returned seeded target list.
- `GET /api/v1/store/m1/workbench/:targetId`: PASS, returned `target/version/readiness/assets/keywords/compliance/variation`, `assets.gallerySlots.length = 9`, `mock = true`.
- `GET /api/v1/store/m1/assets/matrix`: PASS, returned MAIN + PT01-PT08.
- `GET /api/v1/store/m1/keywords/coverage`: PASS, returned primary/gap/stuffing/negative structures.
- `GET /api/v1/store/m1/compliance/:targetId`: PASS, returned field-level risk summary.
- `POST /api/v1/store/m1/readiness/check`: PASS, returned blocked/pass state and wrote audit id.

## Remote Test Evidence

Executed on server under `/opt/amz/src` with Node `v24.15.0`:

- `node --check apps/api/src/data-store-listings.mjs`: PASS.
- `node --check apps/api/src/store-routes-listings.mjs`: PASS.
- `node --test --test-concurrency=1 tests/qa/m1-production-readiness.test.mjs`: 7/7 PASS.
- `node --test --test-concurrency=1 tests/qa/m1-frontend-workbench-contract.test.mjs`: 4/4 PASS.

## Local 3+ Iteration Evidence

- Iteration 0 baseline: web build initially failed on malformed `apps/web-v2/src/api/m1.js` regex and mojibake-heavy M1 UI. Fixed by rewriting M1 API normalizer/state/UI files.
- Iteration 1: web build PASS; M1 readiness 7/7 PASS; M1 button-level 94/94 PASS; domain/benchmark 15/15 PASS; frontend contract 4/4 PASS.
- Iteration 2: deployed to Linux; remote health/login/M1 workbench/readiness PASS; remote M1 tests 11/11 PASS.
- Iteration 3: local repeat PASS; M1 readiness + frontend contract + M3 regression 180/180 PASS; final web build PASS.

## Safety State

- M1 remains mock-gated for real Amazon writes.
- External ASIN remains read-only.
- Publish readiness check is auditable but does not publish to Amazon.
- `/ready` confirms real writes remain disabled until credentials and approval are present.

## Final Parity Check

- Synced final local documentation/status files to `/opt/amz/src`: `PROJECT_STATUS.md`, `MEMORY.md`, `docs/implementation/M1_PRODUCTION_LISTING_WAR_ROOM_2026-05-25.md`, and this deploy report.
- Verified remote sha256 parity for all four files after upload.
- Verified nginx config, `/health`, `/ready`, demo login, M1 workbench, asset matrix, keyword coverage, compliance, and readiness audit again.
- Remote service runtime is `/root/.nvm/versions/node/v24.15.0/bin/node`; system `/usr/bin/node` is v18 and should not be used for server-side tests because `better-sqlite3` is compiled for Node v24.
- Final remote test command with Node v24: M1 production-readiness + frontend workbench contract `11/11 PASS`.
