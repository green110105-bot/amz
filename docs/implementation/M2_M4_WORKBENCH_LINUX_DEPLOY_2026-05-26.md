# M2 / M4 Workbench Linux Deploy Report（2026-05-26）

## Deployment

- Public URL: `http://47.97.252.71/`
- Server source: `/opt/amz/src`
- Web dist: `/var/www/amz-web`
- API service: systemd `amz-api`, listening on `127.0.0.1:8090`
- Backup before deploy: `/opt/amz/backups/20260525T225707Z-m2m4-ia`

Changed source files uploaded to `/opt/amz/src`:

- `apps/web-v2/src/pages/M2ControlTower.vue`
- `apps/web-v2/src/pages/M4OpsWorkbench.vue`
- `apps/web-v2/src/router/index.js`
- `apps/web-v2/src/layouts/DefaultLayout.vue`
- `tests/qa/m2-m4-workbench-ia-contract.test.mjs`
- `docs/implementation/M2_M4_WORKBENCH_IA_OPTIMIZATION_2026-05-26.md`
- `PROJECT_STATUS.md`
- `MEMORY.md`

Web dist artifact:

- `dist/release/amz-web-v2-dist-m2-m4-20260525T225605Z.tar.gz`

Actions:

1. Backed up `/var/www/amz-web`.
2. Backed up the source files touched by this IA optimization.
3. Uploaded changed source files.
4. Replaced `/var/www/amz-web` with the new Vite dist.
5. Ran `nginx -t`.
6. Restarted `amz-api`.

## Remote Verification

Executed on server under `/opt/amz/src` with `/root/.nvm/versions/node/v24.15.0/bin/node`:

- `node --test --test-concurrency=1 tests/qa/m2-m4-workbench-ia-contract.test.mjs`: `4/4 PASS`.
- `/health`: PASS.
- `/ready`: PASS.
- Demo login: PASS.
- M2 API checks:
  - `/api/v1/store/m2/profit/overview`: PASS.
  - `/api/v1/store/m2/profit/leaks`: PASS, returned 12 items.
  - `/api/v1/store/m2/inventory/reorder`: PASS, returned 4 decisions.
- M4 API checks:
  - `/api/v1/store/m4/anomalies`: PASS, returned 14 items.
  - `/api/v1/store/m4/reviews`: PASS, returned 64 items.
  - `/api/v1/store/m4/image-diffs`: PASS, returned 21 items.
- Public web root `/`: PASS.

## Safety State

- No backend write gates were loosened.
- Real Amazon writes remain controlled by existing mock/audit gates.
- M2/M4 old routes remain available as deep links.
- The change is primarily frontend IA/navigation plus read-only aggregation.
