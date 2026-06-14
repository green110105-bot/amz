# Amazon 授权接入中心 - 2026-05-26

## 目标

把真实 Amazon 接入从“命令行 curl + 人工排错”改成运营/研发都能使用的页面化流程。当前范围是真实读取与同步，不开启真实写入：

- SP-API：保存 refresh token、marketplaceIds、region、sellingPartnerId，并同步订单、结算、库存、Catalog。
- Amazon Ads：保存 refresh token、发现/保存 profileId，并同步 Campaign / Ad Group / Product Ads / Keywords 层级。
- 诊断：离线检查不触网；真实诊断必须由用户点击触发，只调用 LWA token exchange 与安全读取接口。
- 业务闭环：同步后 M2/M3/M4 读取真实落库数据，M3 真实写入仍保持审计/干跑保护。

## 页面入口

- 路由：`/settings/amazon-auth`
- 导航：主分组 `main` 可见入口 `Amazon 授权接入`
- 设置页店铺授权列不再做“模拟授权”，统一跳转到授权接入中心，并自动切换到所选店铺。

页面分 4 个步骤：

1. **环境检查**：展示 `CREDENTIAL_ENC_KEY`、SP-API LWA、Ads LWA 是否配置。
2. **保存凭证**：按当前店铺加密保存 SP-API / Ads refresh token。
3. **诊断与 profileId**：运行真实诊断，展示 blockers/warnings/nextActions，列出 Ads profileId 候选。
4. **同步真实数据**：触发 Orders、Settlement、Inventory、Catalog、Ads 层级或全部同步。

## 后端接口

已有接口继续复用：

- `GET /api/v1/integrations/status`
- `GET /api/v1/integrations/diagnostics`
- `POST /api/v1/integrations/diagnostics`
- `POST /api/v1/integrations/credentials/spapi`
- `POST /api/v1/integrations/credentials/ads`
- `POST /api/v1/integrations/spapi/sync/orders`
- `POST /api/v1/integrations/spapi/sync/settlement`
- `POST /api/v1/integrations/spapi/sync/inventory`
- `POST /api/v1/integrations/spapi/sync/catalog`
- `POST /api/v1/integrations/ads/sync/all`
- `POST /api/v1/integrations/sync/all`

本轮新增：

- `POST /api/v1/integrations/credentials/ads/profile`
  - Body：`{ "profileId": "1234567890" }`
  - 用途：在 Ads refresh token 已保存后，单独写入/更新 profileId。
  - 保护：没有 Ads 凭证行时返回 `404 ads_credentials_missing`，避免孤立 profileId。

`GET /status` 现在返回 Ads `profileId`，前端可以回填同步表单并在授权状态表中脱敏展示。

## 数据与安全边界

- refresh token 只加密落库，不在诊断、状态、结果面板中回显。
- 离线诊断不触发网络请求；真实诊断必须显式点击。
- 同步按钮只做真实读取和本地落库，不修改 Amazon 店铺或广告账户。
- M3 real write gate 不随本页面自动开启；即使 Ads 同步成功，`m3Impact.realWriteEnabled` 仍为 `false`。
- 所有接口仍按 Bearer token 与 `X-Store-Id` 解析店铺范围，多店铺数据隔离。

## 真实数据落点

- Orders / GMV：SP-API Orders 同步到 M2 订单与利润链路。
- Settlement / Fees：SP-API Reports/Settlement 同步到费用/结算链路。
- Inventory：SP-API inventory 同步到库存决策链路。
- Catalog / Listing：SP-API Catalog 同步到 Listing/ASIN 上下文。
- Ads hierarchy：Amazon Ads Campaign、Ad Group、Product Ads、Keywords 同步到 `lx_*` 表，供 M3 领星等价广告模块使用。

## 运营使用流程

1. 服务端先配置 `.env`：
   - `CREDENTIAL_ENC_KEY`
   - `SPAPI_LWA_CLIENT_ID`
   - `SPAPI_LWA_CLIENT_SECRET`
   - `ADS_LWA_CLIENT_ID`
   - `ADS_LWA_CLIENT_SECRET`
   - 生产读取时设置 `ADS_API_MOCK=false`，并确认 SP-API/Ads sandbox 变量符合环境。
2. 登录系统，切换到目标店铺，进入 `/settings/amazon-auth`。
3. 在“保存凭证”中填写 SP-API refresh token、marketplaceIds、region。
4. 填写 Ads refresh token；profileId 可先留空。
5. 点击“真实诊断”，若 Ads profiles 列出候选，选择并保存 profileId。
6. 先分步同步 Orders / Inventory / Catalog / Ads，确认结果面板无 blocker；再按需要执行“同步全部真实数据”。
7. 回到 M4 日报、M3 Control Tower、M2 经营利润确认 source/freshness 元数据。

## 验收与回归

本轮本地验证：

- `node --check apps/api/src/integrations/sync-routes.mjs`
- `node --check apps/api/src/integrations/ads-api/credentials.mjs`
- `node --check apps/api/src/integrations/provider-mode.mjs`
- `node --test --test-concurrency=1 tests/integrations/sync-routes.test.mjs`：19/19 PASS
- `node --test --test-concurrency=1 tests/integrations/authorization-diagnostics.test.mjs`：4/4 PASS
- `node --test --test-concurrency=1 tests/qa/amazon-auth-center-contract.test.mjs`：4/4 PASS
- `node --test --test-concurrency=1 tests/qa/m4-daily-report-api.test.mjs`：3/3 PASS
- `node --test --test-concurrency=1 tests/qa/m4-daily-report-contract.test.mjs`：4/4 PASS
- `node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs`：169/169 PASS
- `node --test --test-concurrency=1 tests/integrations/ads-api.test.mjs`：14/14 PASS
- `node --test --test-concurrency=1 tests/integrations/ads-live-action-gate.test.mjs`：3/3 PASS
- `apps/web-v2` `npm run build`：PASS，仅保留既有 Rollup annotation/chunk-size warning。

## 后续可选增强

- 增加完整 OAuth redirect 回调页：在确认正式域名、LWA app redirect URI 与 Selling Partner App 信息后，把“粘贴 refresh token”升级为一键跳 Seller Central / Amazon Ads 授权。
- 增加同步任务队列：长耗时 SP-API Reports 与 Ads Reporting 可从 HTTP 同步改为后台 job + 页面轮询。
- 增加 profileId 详情：候选列表展示 countryCode、marketplace、accountInfo，减少多账户误选。
