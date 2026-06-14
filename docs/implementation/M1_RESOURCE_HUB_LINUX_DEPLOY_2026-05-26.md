# M1 Resource Hub Linux Deploy（2026-05-26）

## Deployment

- Public URL: `http://47.97.252.71/`
- Server source: `/opt/amz/src`
- Web dist: `/var/www/amz-web`
- API service: systemd `amz-api`, listening on `127.0.0.1:8090`
- Backup before deploy: `/opt/amz/backups/20260525T231736Z-m1-resource-hub`

Changed source files uploaded to `/opt/amz/src`:

- `apps/web-v2/src/pages/M1ResourceHub.vue`
- `apps/web-v2/src/router/index.js`
- `apps/web-v2/src/layouts/DefaultLayout.vue`
- `tests/qa/m1-resource-hub-contract.test.mjs`
- `docs/implementation/M1_RESOURCE_HUB_CLEANUP_2026-05-26.md`
- `PROJECT_STATUS.md`
- `MEMORY.md`

Web dist artifact:

- `dist/release/amz-web-v2-dist-m1-resource-hub-20260525T231632Z.tar.gz`

Actions:

1. Backed up `/var/www/amz-web`.
2. Backed up the source files touched by the M1 resource hub cleanup.
3. Uploaded changed source files to `/opt/amz/src`.
4. Replaced `/var/www/amz-web` with the new Vite dist.
5. Ran `nginx -t`.
6. Restarted `amz-api`.

## Remote Verification

Executed on server under `/opt/amz/src` with `/root/.nvm/versions/node/v24.15.0/bin/node`:

- `node --test --test-concurrency=1 tests/qa/m1-resource-hub-contract.test.mjs`: `4/4 PASS`.
- `node --test --test-concurrency=1 tests/qa/m1-frontend-workbench-contract.test.mjs`: `4/4 PASS`.
- `node --test --test-concurrency=1 tests/qa/m2-m4-workbench-ia-contract.test.mjs`: `4/4 PASS`.
- `/health`: PASS, service reports `mode: mock`.
- `/ready`: PASS, `realWritesEnabled=false`, `auditRequired=true`.
- Demo login: PASS.
- Public web root `/`: PASS.
- Deployed web asset check: `M1ResourceHub-CkIo9p3-.js` returns `HTTP/1.1 200 OK`.

## Safety State

- No Amazon real-write gate was loosened.
- M1 resource cleanup is frontend IA/navigation plus source/docs/test parity.
- `关键词热力图` and `多语言母版` remain available only as old URL redirects with retirement messaging.
- Useful M1 resource tools remain deep links from `/listings/resources`.
