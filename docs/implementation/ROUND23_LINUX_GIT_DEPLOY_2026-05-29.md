# Round 23 Linux Deploy and Git Sync Report - 2026-05-29

## Scope

- Target: `http://47.97.252.71/`
- Server source: `/opt/amz/src`
- Server web root: `/var/www/amz-web`
- API service: systemd `amz-api`, Node `/root/.nvm/versions/node/v24.15.0/bin/node`
- Runtime mode after deploy: mock/sandbox gated; real writes remain disabled by default.

## Local Evidence Before Deploy

- `npm.cmd run check` -> PASS.
- The check covered requirements, coverage, contracts, DB schema, AI eval, `npm test` 724/724, web build, health, replay, perf smoke, mock scenario, benchmark, and release dry-run.
- Web build completed with only existing third-party Rollup PURE comment and chunk-size warnings.

## Artifacts

- Source bundle: `tmp/deploy-round23-20260529T035921Z/amz-source-worktree.tar.gz`
- Source sha256: `e3008631e6d92eb31fa9f3373a20660afc809d39dbf14fc921bcdabec1d04062`
- Web bundle: `tmp/deploy-round23-20260529T035921Z/amz-web-dist.tar.gz`
- Web sha256: `b9aa2650e08d299120c264a3b1bb335f25069793bbb8a7ba4fe1425f2ff899a3`

## Server Backup

- Backup path: `/opt/amz/backups/20260528T200037Z-round23-action-queue`
- Backed up source excluding dependency and secret files.
- Backed up previous `/var/www/amz-web`.

## Remote Validation

- `node --check` PASS:
  - `apps/api/src/store-routes-ads.mjs`
  - `apps/api/src/data-store-monitor.mjs`
  - `apps/api/src/data-store-profit.mjs`
  - `apps/api/src/integrations/sync-routes.mjs`
  - `apps/api/src/extended-routes.mjs`
- Remote Node tests PASS: `tests/api/workbench-dashboard-contract.test.mjs`, `tests/qa/m4-daily-report-contract.test.mjs`, `tests/deploy/release-safety.test.mjs` -> 14/14 PASS.
- `nginx -t` -> PASS.
- `systemctl restart amz-api` -> service active.
- Local server curl:
  - `http://127.0.0.1:8090/health` -> 200.
  - `http://127.0.0.1:8090/ready` -> 200.
  - Authenticated `/api/v1/dashboard` -> `sourceMode: db`, `sourceMeta.mock: false`.
- Public checks from Windows:
  - `http://47.97.252.71/health` -> 200.
  - `http://47.97.252.71/ready` -> 200.
  - `http://47.97.252.71/` -> 200.

## Deployment Boundary

- This deploy updates the server with the Round 23 audit-queue/code-contract work.
- It does not add real Amazon SP-API / Ads credentials.
- It does not enable batch real writes.
- Real Ads execution remains limited to explicit single-action gates after credentials, profileId, approval, and risk acceptance.

## Git Sync Status

- A local commit was created in a clean temporary clone because the sandbox user cannot write the original repository `.git/index.lock`.
- Commit prepared in temporary clone: `feat: finalize Amazon ops audit queue rollout`.
- Bundle fallback created and verified locally: `D:\amz\tmp\amz-round23-latest.bundle`; copied to server at `/opt/amz/backups/20260528T200037Z-round23-action-queue/amz-round23-latest.bundle`.
- GitHub push attempt from the temporary clone failed because the original remote alias `github.com-green110105` is not resolvable in this sandbox; direct `github.com` also failed because the available SSH key under the Administrator profile is not readable by the sandbox user.
- Server deployment is complete; GitHub remote sync still requires repository credentials or SSH host alias/key access.
