# Amazon ?? OAuth Linux ???? - 2026-05-26

## ????

? `/settings/amazon-auth` ??? refresh token ??????? OAuth ????????????? `http://47.97.252.71/`?

## ????

### ??

- ?? `apps/api/src/integrations/oauth-flow.mjs`
  - OAuth readiness config
  - SP-API start/login/callback
  - Amazon Ads start/callback
  - token exchange??????marketplace/profile ?????????
- ?? `apps/api/src/integrations/sync-routes.mjs`
  - `GET /api/v1/integrations/oauth/config`
  - `POST /api/v1/integrations/oauth/:provider/start`
  - `GET /api/v1/integrations/oauth/spapi/login`
  - `GET /api/v1/integrations/oauth/:provider/callback`
- ?? `apps/api/src/integrations/sp-api/credentials.mjs`
  - `updateSpApiCredentialMetadata()` ?? OAuth ????? marketplaceIds/scope/sellingPartnerId

### ??

- ?? `apps/web-v2/src/pages/AmazonAuthCenter.vue`
  - ?????? SP-API / Ads ??
  - ??????? NA/EU/FE
  - ?????????????????????????
  - Ads Mock / Sandbox ????
  - OAuth ??????????? + live diagnostics
  - ?? refresh token ?????????
- ?? `apps/web-v2/src/api/integrations.js`
  - `oauthConfig()`
  - `startOAuth(provider, body)`

### ??/??/??

- `.env.example` ?? SP-API/Ads OAuth ? `AMZ_WEB_BASE_URL` ???
- ?? `tests/integrations/oauth-flow.test.mjs`?
- ?? `tests/qa/amazon-auth-center-contract.test.mjs`?
- ?????? `docs/implementation/AMAZON_ONE_CLICK_OAUTH_AUTH_2026-05-26.md`?

## ????

- ????`47.97.252.71`
- Source root?`/opt/amz/src`
- Web root?`/var/www/amz-web`
- API service?`amz-api`?Node `/root/.nvm/versions/node/v24.15.0/bin/node`?
- ??????`/opt/amz/backups/20260526T015827Z-one-click-oauth`
- Web dist archive?`dist/release/amz-web-v2-dist-one-click-oauth-20260526T015724Z.tar.gz`
- ??? asset?`/var/www/amz-web/assets/AmazonAuthCenter-DG6F5u4N.js`

## ????

- `node --check apps/api/src/integrations/oauth-flow.mjs` PASS
- `node --check apps/api/src/integrations/sync-routes.mjs` PASS
- `node --check apps/api/src/integrations/sp-api/credentials.mjs` PASS
- `node --test --test-concurrency=1 tests/integrations/oauth-flow.test.mjs` PASS 4/4
- `node --test --test-concurrency=1 tests/integrations/sync-routes.test.mjs` PASS 19/19
- `node --test --test-concurrency=1 tests/integrations/authorization-diagnostics.test.mjs` PASS 4/4
- `node --test --test-concurrency=1 tests/qa/amazon-auth-center-contract.test.mjs` PASS 4/4
- `node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs` PASS 169/169
- `apps/web-v2 npm run build` PASS?????? Rollup annotation / chunk-size warning
- `git diff --check` ?????? PASS?? CRLF ???

## ????

- `node --check apps/api/src/integrations/oauth-flow.mjs` PASS
- `node --check apps/api/src/integrations/sync-routes.mjs` PASS
- ?????? PASS?
  - `tests/integrations/oauth-flow.test.mjs` 4/4
  - `tests/qa/amazon-auth-center-contract.test.mjs` 4/4
  - `tests/integrations/sync-routes.test.mjs` 19/19
- ?? M3 ???`tests/qa/m3-button-level.test.mjs` PASS 169/169
- `nginx -t` PASS
- `systemctl restart amz-api` PASS??? active
- `GET /health` PASS
- `GET /ready` PASS
- demo login PASS
- `GET /api/v1/integrations/oauth/config` PASS??? `spapi` + `ads`???? secret
- `GET /api/v1/integrations/status` PASS
- `GET /api/v1/integrations/diagnostics` PASS
- Public check?`http://47.97.252.71/health` PASS
- Public asset check?`http://47.97.252.71/assets/AmazonAuthCenter-DG6F5u4N.js` HEAD 200

## ????????

???????????????????????????????? Amazon ?????

- SP-API ???`CREDENTIAL_ENC_KEY`?`SPAPI_LWA_CLIENT_ID`?`SPAPI_LWA_CLIENT_SECRET`?`SPAPI_OAUTH_APPLICATION_ID`??? Seller Central ?????
  - Login URI?`http://47.97.252.71/api/v1/integrations/oauth/spapi/login`
  - Redirect URI?`http://47.97.252.71/api/v1/integrations/oauth/spapi/callback`
- Amazon Ads ???`CREDENTIAL_ENC_KEY`?`ADS_LWA_CLIENT_ID`?`ADS_LWA_CLIENT_SECRET`??? LWA/Ads ?????
  - Redirect URI?`http://47.97.252.71/api/v1/integrations/oauth/ads/callback`
- ?? Ads ???? `ADS_API_MOCK=false`??????? `ADS_API_USE_SANDBOX=false`?`SPAPI_USE_SANDBOX=false`?
- M3 ?????????????`ADS_REAL_WRITES_ENABLED` ???????

## ??

?????

1. ?? `/opt/amz/backups/20260526T015827Z-one-click-oauth/src` ??????
2. ? `/opt/amz/backups/20260526T015827Z-one-click-oauth/web/amz-web-before.tar.gz` ?? `/var/www/amz-web`?
3. `systemctl restart amz-api`?
4. `nginx -t && curl http://127.0.0.1:8090/health`?
