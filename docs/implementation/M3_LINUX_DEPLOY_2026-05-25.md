# M3 Linux Deploy Report - 2026-05-25

## Summary

M3 Strategy OS and Amazon authorization diagnostics were deployed to `http://47.97.252.71/` on 2026-05-25. The deployment remains mock-gated for external providers and keeps real Amazon Ads writes disabled unless the explicit real-write gate and credentials are configured later.

## Target Runtime

- Source directory: `/opt/amz/src`
- Static SPA directory: `/var/www/amz-web`
- API service: systemd `amz-api.service`, Node `v24.15.0`, `127.0.0.1:8090`
- Public entry: nginx `:80`, `http://47.97.252.71/`
- SQLite data: `/opt/amz/data/store.db`
- Backup created before deploy: `/opt/amz/backups/20260525T145908Z`

## Artifacts

- Source bundle: `dist/release/amz-ai-operator-0.1.0.tar.gz`
- Source sha256: `449c3f7b689a907067abbd70c1b22dbd90994a06f53d682d33a22a02c81e9547`
- Web dist bundle: `dist/release/amz-web-v2-dist-20260525-225120.tar.gz`
- The server deployment preserved `.env`, `node_modules`, and `/opt/amz/data/*`.

## Deployed Capabilities

- M3 action queue and run ledger: `ad_action_queue`, `ad_action_runs`.
- M3 goal profile and guardrails: `ad_goal_profiles`, `/api/v1/store/ads/goal-profile`.
- Strategy OS suggestion contract: typed action, evidence refs, guardrails, rollback, impact estimate, source metadata, confidence breakdown.
- Amazon authorization diagnostics: `/api/v1/integrations/diagnostics`.
- Live Ads real-write executor behind explicit single-action gate; batch real writes remain blocked.
- Live diagnostics and smoke-write scripts: `npm run amazon:diagnostics:live`, `npm run ads:smoke-write`.

## Validation Evidence

- Local API tests before deploy:
  - `node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs` -> 169/169 PASS.
  - `node --test --test-concurrency=1 tests/integrations/ads-live-action-gate.test.mjs tests/integrations/authorization-diagnostics.test.mjs` -> 7/7 PASS.
- Local web build:
  - `npm run build` in `apps/web-v2` -> PASS, with only existing Rollup chunk/PURE warnings.
- Remote deploy checks:
  - `nginx -t` -> PASS.
  - `systemctl restart amz-api` -> PASS, service active.
  - `curl http://127.0.0.1:8090/health` -> `ok: true`, `mode: mock`.
  - `curl http://127.0.0.1:8090/ready` -> `ok: true`, real writes disabled.
- Remote code checks:
  - `node --check apps/api/src/integrations/authorization-diagnostics.mjs` -> PASS.
  - `node --check apps/api/src/integrations/ads-api/live-action-executor.mjs` -> PASS.
  - Remote integration tests for authorization diagnostics + Ads live action gate -> 7/7 PASS.
- Public smoke checks:
  - `GET http://47.97.252.71/` -> 200.
  - `GET http://47.97.252.71/health` -> 200.
  - Login with demo account -> OK; `GET /api/v1/store/ads/suggestions` -> 8 suggestions.
  - Authenticated `GET /api/v1/integrations/diagnostics` -> OK and redacted.
- M3 production Playwright evidence:
  - First run observed 31/36 tests PASS before the local harness hit the 10-minute command timeout.
  - Tail run with `--grep "report deep|backend write"` completed remaining 5/5 PASS.
  - Combined observed coverage: 36/36 M3 prod tests PASS; no product failure observed.
- Test cleanup:
  - Restored `cmp-001` daily budget to `50`.
  - Restored `st-lc-001` strategy enabled state to `true`.

## Current Authorization State On Server

The deployed server is ready to diagnose real authorization but is not yet configured with real Amazon credentials:

- `CREDENTIAL_ENC_KEY`: missing on server.
- SP-API LWA client ID/secret: missing on server.
- Ads LWA client ID/secret: missing on server.
- SP-API and Ads store credentials: missing for the current demo store.
- M3 remains `mock_until_ads_authorized` and `disabled_dry_run_audit_first` for real writes.

## Next Operational Step

To move from deployed mock-gated M3 to real Ads reads, configure encrypted credential storage and Ads LWA credentials on the server, store the Ads refresh token/profileId, then run `npm run amazon:diagnostics:live -- --user-id u-demo --store-id s-mock-us --provider ads` from `/opt/amz/src`.
