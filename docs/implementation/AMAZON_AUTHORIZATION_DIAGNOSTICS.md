# Amazon Authorization Diagnostics and M3 Readiness

Date: 2026-05-25

## Objective

Make Amazon authorization measurable instead of relying on memory or manual inspection. The system now exposes a repeatable diagnostics contract that can tell whether SP-API and Amazon Ads are ready for M3 live-read integration, while keeping all real write paths disabled.

## Scope

- SP-API seller authorization readiness.
- Amazon Ads authorization readiness.
- LWA token refresh validation when explicitly requested.
- Safe read probes only:
  - SP-API: `sellers.getMarketplaceParticipations`.
  - Ads API: `ads.profiles.list`.
- M3 impact summary: whether M3 can read real Ads data, and whether real writes are still blocked.

## API Contract

### GET `/api/v1/integrations/diagnostics`

Offline readiness check. It does not call Amazon, does not decrypt tokens, and does not return secret values.

Query:

- `provider=all|spapi|ads`, default `all`.

Returns:

- `environment`: presence-only env status, e.g. LWA client ID/secret configured or missing.
- `providers[]`: per-provider credential status, blockers, warnings, recent sync runs.
- `m3Impact`: M3 live-read / dry-run write posture.

### POST `/api/v1/integrations/diagnostics`

Explicit probe endpoint.

Body:

```json
{
  "provider": "all",
  "liveProbe": true,
  "apiProbe": true
}
```

Behavior:

- `liveProbe=false`: same as offline diagnostics.
- `liveProbe=true`: exchanges refresh token for LWA access token.
- `apiProbe=true`: after LWA success, calls one safe read endpoint per provider.
- If offline blockers exist, probe is skipped and the response explains why.

## Redaction Rules

Diagnostics never returns:

- LWA client ID / secret values.
- Refresh tokens.
- Access tokens.
- Raw encrypted token blobs.

It only returns booleans such as `hasRefreshToken`, `hasAccessToken`, `refreshTokenEncryptedShapeOk`, and `accessTokenState`.

## Readiness Semantics

- `blocked`: required env or store credential is missing/inactive.
- `ready`: offline checks are complete; a live probe can be run.
- `live_ok`: live LWA and requested safe read probes passed.
- `live_partial`: live probe passed, but non-auth M3 blockers remain, such as missing Ads `profileId`.
- `live_error`: live LWA or safe read probe failed.

## M3 Impact Rules

M3 remains audit-first:

- Real Amazon Ads writes are disabled.
- All M3 action execution continues through action queue + approval + dry-run + audit + rollback contract.
- Ads live reads are considered ready only after:
  1. Ads LWA app credentials are configured.
  2. Ads refresh token is stored encrypted.
  3. Ads `profileId` is discovered and stored.
  4. `syncAdsHierarchy` succeeds and source/freshness metadata is verified.

## Current Local Observation

Local scan before this change showed:

- SP-API app credentials are present in `.env` and one active SP-API credential exists in `store_credentials`.
- Historical SP-API sandbox `orders.getOrders` sync runs exist and were `ok`.
- Amazon Ads credentials/profile were not present locally, so M3 still depends on mock/fixture Ads data until Ads authorization is completed.
- Real write mode remains disabled by design.

Because this Codex session has restricted network and no approval path, no real Amazon network call was made here. The live probe behavior is covered by deterministic tests with mocked Amazon responses.

## Implementation Files

- `apps/api/src/integrations/authorization-diagnostics.mjs`
- `apps/api/src/integrations/sync-routes.mjs`
- `apps/api/src/integrations/ads-api/auth.mjs`
- `apps/api/src/integrations/ads-api/client.mjs`
- `tests/integrations/authorization-diagnostics.test.mjs`
- `.env.example`

## Tests

Validated commands:

```powershell
node --check apps/api/src/integrations/authorization-diagnostics.mjs
node --check apps/api/src/integrations/sync-routes.mjs
node --check apps/api/src/integrations/ads-api/auth.mjs
node --check apps/api/src/integrations/ads-api/client.mjs
node --check tests/integrations/authorization-diagnostics.test.mjs
node --test --test-concurrency=1 tests/integrations/authorization-diagnostics.test.mjs
node --test --test-concurrency=1 tests/integrations/sync-routes.test.mjs
node --test --test-concurrency=1 tests/integrations/ads-api.test.mjs
node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs
npm.cmd run build # run from apps/web-v2
```

Results:

- Authorization diagnostics: 4/4 PASS.
- Sync routes: 16/16 PASS.
- Ads API integration: 14/14 PASS.
- M3 button-level QA: 169/169 PASS, repeated 3 times after this work.
- Web build: PASS, only existing Rollup chunk-size / annotation warnings.
- `git diff --check`: no whitespace errors; only existing LF/CRLF warnings.

## Next Real-Account Procedure

When network and real credentials are available:

1. Set runtime env with `CREDENTIAL_ENC_KEY`, `SPAPI_LWA_CLIENT_ID`, `SPAPI_LWA_CLIENT_SECRET`, `ADS_LWA_CLIENT_ID`, `ADS_LWA_CLIENT_SECRET`.
2. Store SP-API refresh token via `/api/v1/integrations/credentials/spapi` with marketplace IDs.
3. Store Ads refresh token via `/api/v1/integrations/credentials/ads`.
4. Run `POST /api/v1/integrations/diagnostics` with `{ "provider":"all", "liveProbe":true, "apiProbe":true }`.
5. Save Ads `profileId`, then run `/api/v1/integrations/ads/sync/all`.
6. Verify M3 suggestions show live Ads source/freshness metadata.
7. Keep real write operations disabled until a separate production write gate is designed and approved.

## Real Ads Write Gate Added

After the user explicitly confirmed that the Amazon store is a development/test store, M3 now has a narrow real-write bridge for Amazon Ads.

Supported first live-write primitives:

- `ADJUST_BID` for Sponsored Products keyword bid via `PUT /sp/keywords`.
- `ADJUST_BID` for Sponsored Products ad group default bid via `PUT /sp/adGroups`.
- `ADJUST_BUDGET` for Sponsored Products campaign daily budget via `PUT /sp/campaigns`.

Real writes are still not globally automatic. They require all of the following:

- `ADS_REAL_WRITES_ENABLED=true`.
- `ADS_API_MOCK=false`.
- Optional but recommended `ADS_REAL_WRITES_STORE_ALLOWLIST` and `ADS_REAL_WRITES_PROFILE_ALLOWLIST`.
- `ADS_REAL_WRITES_ALLOWED_PRIMITIVES`, default `ADJUST_BID`.
- Request body has `realWriteEnabled=true`, `confirmRealWrite=true`, and `riskAccepted=true`.
- Per-action delta stays within limits:
  - `ADS_REAL_WRITE_MAX_BID_CHANGE_PCT`, default `0.10`.
  - `ADS_REAL_WRITE_MAX_BUDGET_CHANGE_PCT`, default `0.05`.
- Batch real writes are blocked; use one reviewed action at a time.

CLI helpers:

```powershell
npm run amazon:diagnostics:live -- --user-id u-demo --store-id s-my-us --provider all

node scripts/live-ads-smoke-write.mjs `
  --user-id u-demo `
  --store-id s-my-us `
  --profile-id 12345 `
  --keyword-id 9001 `
  --current-bid 1.00 `
  --new-bid 1.05 `
  --confirm
```

The smoke-write script can seed Ads credentials from `ADS_REFRESH_TOKEN` and `ADS_PROFILE_ID` if present, then creates a temporary approved M3 action-queue item and executes it through the same guarded real-write path as the API.

Additional tests:

- `tests/integrations/ads-live-action-gate.test.mjs`: confirmed keyword bid write, confirmation gate, batch-write block.

## Linux Deployment Observation - 2026-05-25

The diagnostics module is deployed on `http://47.97.252.71/` with source under `/opt/amz/src` and API service `amz-api` on `127.0.0.1:8090`.

Validated on server:

```bash
node --check apps/api/src/integrations/authorization-diagnostics.mjs
node --check apps/api/src/integrations/ads-api/live-action-executor.mjs
node --test --test-concurrency=1 tests/integrations/authorization-diagnostics.test.mjs tests/integrations/ads-live-action-gate.test.mjs
```

Result: 7/7 integration tests PASS and `amz-api` active.

Current server diagnostics are redacted and reachable after auth, but readiness is still blocked because server-side real credentials are not configured yet: `CREDENTIAL_ENC_KEY`, SP-API LWA credentials, Ads LWA credentials, and store-level SP-API/Ads credentials are absent for the demo store. M3 therefore remains `mock_until_ads_authorized` and real writes remain disabled.
