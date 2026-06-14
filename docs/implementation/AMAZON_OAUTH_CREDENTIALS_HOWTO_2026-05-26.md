# Amazon 一键授权参数获取指南 - 2026-05-26

## 0. 先说明白

你想要的“一键授权”是正确的：

```text
点击系统里的“一键授权”
-> 跳到 Amazon 官方授权页面
-> 店铺账号点击确认
-> 回到系统
-> 系统自动保存 refresh token / marketplaceId / profileId
```

但 Amazon 有一个前提：系统必须先有一套“Amazon 开发者应用”的参数。否则 Amazon 不知道：

- 这是哪个应用在请求授权
- 授权成功后应该回调到哪里
- 回调 code 应该用哪个 client secret 去换 refresh token

所以要区分两类东西：

| 类型 | 谁配置 | 配几次 | 例子 |
|---|---|---:|---|
| 系统应用级参数 | 管理员/研发 | 一次 | `SPAPI_OAUTH_APPLICATION_ID`、`SPAPI_LWA_CLIENT_ID`、`ADS_LWA_CLIENT_ID` |
| 店铺授权 | 运营/店铺账号 | 每个店铺点一次 | 在 Amazon 官方页面点击确认授权 |

最终目标不是让运营填参数，而是管理员把应用级参数配好后，运营只点按钮。

---

## 1. 当前还缺哪些参数

服务器现在还缺这些 Amazon 官方提供的应用级参数：

```env
SPAPI_OAUTH_APPLICATION_ID=
SPAPI_LWA_CLIENT_ID=
SPAPI_LWA_CLIENT_SECRET=
ADS_LWA_CLIENT_ID=
ADS_LWA_CLIENT_SECRET=
```

如果 SP-API 应用还处于 Draft / Beta 状态，可能还需要：

```env
SPAPI_OAUTH_VERSION=beta
```

服务器这边已经配置好的基础项：

```env
CREDENTIAL_ENC_KEY=已配置
AMZ_WEB_BASE_URL=http://47.97.252.71
SPAPI_OAUTH_LOGIN_URI=http://47.97.252.71/api/v1/integrations/oauth/spapi/login
SPAPI_OAUTH_REDIRECT_URI=http://47.97.252.71/api/v1/integrations/oauth/spapi/callback
ADS_OAUTH_REDIRECT_URI=http://47.97.252.71/api/v1/integrations/oauth/ads/callback
ADS_OAUTH_SCOPE=advertising::campaign_management
ADS_API_MOCK=false
```

---

## 2. 强烈建议先准备 HTTPS 域名

现在系统地址是：

```text
http://47.97.252.71
```

开发测试可以先试，但 Amazon/LWA 很可能要求 OAuth Redirect URI 使用 HTTPS。若 Amazon 后台不允许保存 HTTP IP，或者授权时报：

```text
redirect_uri_mismatch
invalid_redirect_uri
```

就不要继续怀疑代码，应该先配置域名和 HTTPS。

推荐最终地址：

```text
https://你的域名/api/v1/integrations/oauth/spapi/login
https://你的域名/api/v1/integrations/oauth/spapi/callback
https://你的域名/api/v1/integrations/oauth/ads/callback
```

临时测试地址：

```text
http://47.97.252.71/api/v1/integrations/oauth/spapi/login
http://47.97.252.71/api/v1/integrations/oauth/spapi/callback
http://47.97.252.71/api/v1/integrations/oauth/ads/callback
```

回调地址必须完全一致，包括 `http/https`、域名/IP、路径、端口、尾部斜杠。

---

# 3. SP-API 参数怎么获得

SP-API 需要 3 个参数：

```env
SPAPI_OAUTH_APPLICATION_ID=
SPAPI_LWA_CLIENT_ID=
SPAPI_LWA_CLIENT_SECRET=
```

## 3.1 登录 Seller Central 开发者后台

用有管理员权限的 Seller Central 账号登录。

常见入口类似：

```text
Seller Central
-> Apps & Services
-> Develop Apps / Developer Central
```

不同站点页面名称可能不同，以 Amazon 后台实际显示为准。

如果账号从未注册 SP-API Developer，需要先完成开发者注册。Amazon 可能要求填写：

- 公司/开发者信息
- 应用名称
- 网站 URL
- 隐私政策 URL
- 应用用途说明
- 需要访问哪些 SP-API
- 如何保护卖家数据
- 是否访问受限数据或 PII

## 3.2 创建 Public App

创建或打开一个 SP-API 应用，类型应选择：

```text
Public app / 公共应用
```

不要把 Self authorization 当成最终方案。Self authorization 会让你手动复制 refresh token，不是我们要的“一键授权”。

## 3.3 填写 Login URI 和 Redirect URI

在 SP-API 应用的 OAuth / Authorization 配置中填写：

```env
Login URI:
http://47.97.252.71/api/v1/integrations/oauth/spapi/login

Redirect URI:
http://47.97.252.71/api/v1/integrations/oauth/spapi/callback
```

如果已经有 HTTPS 域名，就用 HTTPS 版本：

```env
Login URI:
https://你的域名/api/v1/integrations/oauth/spapi/login

Redirect URI:
https://你的域名/api/v1/integrations/oauth/spapi/callback
```

## 3.4 获取 `SPAPI_OAUTH_APPLICATION_ID`

在 SP-API 应用详情页找到：

```text
Application ID / App ID
```

格式通常类似：

```text
amzn1.sellerapps.app.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

填到服务器：

```env
SPAPI_OAUTH_APPLICATION_ID=amzn1.sellerapps.app.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

没有这个值，系统无法生成 Seller Central 授权链接。

## 3.5 获取 `SPAPI_LWA_CLIENT_ID` 和 `SPAPI_LWA_CLIENT_SECRET`

在同一个 SP-API 应用详情页找到：

```text
Login with Amazon credentials
LWA credentials
Client identifier
Client secret
```

复制到服务器：

```env
SPAPI_LWA_CLIENT_ID=amzn1.application-oa2-client.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPAPI_LWA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

注意：

- `client secret` 只能放服务器环境变量。
- 不要提交到 git。
- 如果泄露，需要去 Amazon 后台 rotate / regenerate。

## 3.6 Draft 应用可能需要 beta

如果 SP-API 应用还没有正式发布，授权链接可能需要加版本参数：

```env
SPAPI_OAUTH_VERSION=beta
```

如果应用已经发布，通常留空：

```env
SPAPI_OAUTH_VERSION=
```

## 3.7 SP-API 配好后按钮会怎么跳

配置完成后，点击系统里的：

```text
一键授权 SP-API
```

系统会跳到类似地址：

```text
https://sellercentral.amazon.com/apps/authorize/consent?application_id=amzn1.sellerapps.app...&state=...
```

后续自动完成：

1. 店铺账号在 Amazon 官方页面确认授权。
2. Amazon 调用系统的 Login URI。
3. 系统把授权流程带回 Amazon。
4. Amazon 把 `spapi_oauth_code` 回调到系统 Redirect URI。
5. 系统用 LWA client id / secret 换 refresh token。
6. 系统加密保存 refresh token。
7. 系统自动调用 SP-API 发现 marketplaceId。

---

# 4. Amazon Ads 参数怎么获得

Amazon Ads 需要 2 个参数：

```env
ADS_LWA_CLIENT_ID=
ADS_LWA_CLIENT_SECRET=
```

## 4.1 先申请 Amazon Ads API access

Amazon Ads API 不是普通广告账号默认就有，需要申请 API access。

常见入口：

```text
Amazon Ads
-> Advanced Tools Center
-> Amazon Ads API
-> Request API access
```

申请时通常要选择身份：

| 身份 | 适合情况 |
|---|---|
| Direct advertiser | 只管理自己的广告账号 |
| Partner / Agency / Tool provider | 给多个广告主或多个店铺提供工具 |

如果只是这个测试店铺，可以按 Direct advertiser 理解。未来做成 SaaS 工具，则更接近 Partner / Tool provider。

申请时可能需要说明：

- 公司/账号信息
- API 用途
- 是否代表第三方广告主
- 需要报表还是投放管理
- 数据安全与权限控制

如果 Ads API access 没批，即使有普通 LWA client，也可能出现：

```text
invalid_scope
unknown scope advertising::campaign_management
unauthorized_client
```

## 4.2 获取 Ads 的 LWA Client ID / Secret

Ads API access 通过后，在 Amazon Ads API / Advanced Tools / LWA Security Profile 里找到：

```text
Client ID
Client Secret
```

填到服务器：

```env
ADS_LWA_CLIENT_ID=amzn1.application-oa2-client.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ADS_LWA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 4.3 填写 Ads Redirect URI

在 Ads/LWA 应用后台的 Redirect URL / Allowed Return URL 中加入：

```env
http://47.97.252.71/api/v1/integrations/oauth/ads/callback
```

如果有 HTTPS 域名，就用：

```env
https://你的域名/api/v1/integrations/oauth/ads/callback
```

必须和服务器环境变量完全一致：

```env
ADS_OAUTH_REDIRECT_URI=http://47.97.252.71/api/v1/integrations/oauth/ads/callback
```

## 4.4 Ads Scope

系统当前使用：

```env
ADS_OAUTH_SCOPE=advertising::campaign_management
```

这个 scope 用于广告数据读取和管理能力授权。

当前系统仍然默认关闭真实写入：

```env
ADS_REAL_WRITES_ENABLED=false
```

所以 Ads 授权成功后，默认只用于真实读取、结构同步、报表和 M3 策略建议，不会自动改广告。

## 4.5 Ads 配好后按钮会怎么跳

配置完成后，点击系统里的：

```text
一键授权 Amazon Ads
```

系统会跳到类似地址：

```text
https://www.amazon.com/ap/oa?client_id=amzn1.application-oa2-client...&scope=advertising::campaign_management&response_type=code&redirect_uri=...
```

后续自动完成：

1. 用户在 Amazon 官方页面确认授权。
2. Amazon 把 `code` 回调到系统 Ads callback URI。
3. 系统用 Ads LWA client id / secret 换 refresh token。
4. 系统加密保存 refresh token。
5. 系统调用 Ads `/v2/profiles` 自动发现 profileId。
6. 只有一个 profileId 时自动保存；多个 profileId 时让用户选择。

---

# 5. 拿到参数后怎么填服务器

建议用 systemd override，不要写进 git。

在服务器执行：

```bash
cat >/etc/systemd/system/amz-api.service.d/amazon-oauth-secrets.conf <<'EOF'
[Service]
Environment=SPAPI_OAUTH_APPLICATION_ID=amzn1.sellerapps.app.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Environment=SPAPI_LWA_CLIENT_ID=amzn1.application-oa2-client.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Environment=SPAPI_LWA_CLIENT_SECRET=替换为真实_SPAPI_SECRET
Environment=ADS_LWA_CLIENT_ID=amzn1.application-oa2-client.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Environment=ADS_LWA_CLIENT_SECRET=替换为真实_ADS_SECRET
# 如果 SP-API 应用还是 Draft，取消下一行注释：
# Environment=SPAPI_OAUTH_VERSION=beta
EOF

systemctl daemon-reload
systemctl restart amz-api
systemctl is-active amz-api
```

如果使用 HTTPS 域名，还要把 base 配置也改成 HTTPS：

```bash
cat >/etc/systemd/system/amz-api.service.d/amazon-oauth-base.conf <<'EOF'
[Service]
Environment=AMZ_WEB_BASE_URL=https://你的域名
Environment=WEB_BASE_URL=https://你的域名
Environment=SPAPI_OAUTH_LOGIN_URI=https://你的域名/api/v1/integrations/oauth/spapi/login
Environment=SPAPI_OAUTH_REDIRECT_URI=https://你的域名/api/v1/integrations/oauth/spapi/callback
Environment=ADS_OAUTH_REDIRECT_URI=https://你的域名/api/v1/integrations/oauth/ads/callback
Environment=ADS_OAUTH_AUTHORIZE_URL=https://www.amazon.com/ap/oa
Environment=ADS_OAUTH_SCOPE=advertising::campaign_management
Environment=ADS_API_MOCK=false
Environment=ADS_API_USE_SANDBOX=false
Environment=SPAPI_USE_SANDBOX=false
EOF

systemctl daemon-reload
systemctl restart amz-api
```

---

# 6. 怎么检查是否配好了

登录系统后，打开：

```text
http://47.97.252.71/#/settings/amazon-auth
```

如果配置完整，页面上应该显示：

```text
OAuth 已配置
```

点击按钮应直接跳 Amazon 官方页面。

也可以用 API 检查：

```bash
curl -s http://127.0.0.1:8090/api/v1/integrations/oauth/config \
  -H "Authorization: Bearer 你的登录 token" | jq
```

`spapi.ready` 和 `ads.ready` 都为 `true` 时，才算应用级配置完整。

---

# 7. 常见错误

## 7.1 缺 `SPAPI_OAUTH_APPLICATION_ID`

说明没有配置 SP-API 应用的 Application ID。

去 SP-API 应用详情页复制：

```text
amzn1.sellerapps.app...
```

## 7.2 缺 `SPAPI_LWA_CLIENT_ID` / `SPAPI_LWA_CLIENT_SECRET`

说明没有配置 SP-API 应用的 LWA credentials。

去 SP-API 应用详情页找：

```text
Login with Amazon credentials
```

## 7.3 缺 `ADS_LWA_CLIENT_ID` / `ADS_LWA_CLIENT_SECRET`

说明没有配置 Ads API 对应的 LWA credentials。

去 Amazon Ads API / Advanced Tools / LWA Security Profile 中复制。

## 7.4 `redirect_uri_mismatch`

几乎一定是 Amazon 后台登记的 Redirect URI 和系统发出的 URI 不完全一致。

检查：

- `http` 和 `https` 是否一致
- 域名/IP 是否一致
- 路径是否一致
- 有没有多余尾部 `/`
- 有没有端口差异

## 7.5 Ads 报 `invalid_scope`

常见原因：

- Ads API access 还没审批通过
- 用了普通 LWA client，不是 Ads API 授权过的 client
- scope 拼错

当前 scope 应为：

```env
advertising::campaign_management
```

## 7.6 SP-API Draft 应用授权失败

尝试加：

```env
SPAPI_OAUTH_VERSION=beta
```

然后：

```bash
systemctl daemon-reload
systemctl restart amz-api
```

## 7.7 授权成功但找不到 Ads profileId

可能原因：

- 授权的 Amazon 用户没有广告账户权限
- 该店铺没有开通广告账户
- 该 marketplace 没有 profile
- Ads API access 还没有完全生效

用同一个 Amazon 用户登录 Advertising Console，确认能看到广告账号。

---

# 8. 最终你需要交给系统的值

最少需要：

```env
SPAPI_OAUTH_APPLICATION_ID=...
SPAPI_LWA_CLIENT_ID=...
SPAPI_LWA_CLIENT_SECRET=...
ADS_LWA_CLIENT_ID=...
ADS_LWA_CLIENT_SECRET=...
```

如果 SP-API 应用还在 Draft：

```env
SPAPI_OAUTH_VERSION=beta
```

配好这些后，页面里的按钮才会真正变成：

```text
点一键授权 -> 跳 Amazon 官方授权页 -> 点确认 -> 回系统完成授权
```

---

# 9. 官方参考链接

- SP-API Website Authorization Workflow: https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow
- SP-API Public Developer Registration: https://developer-docs.amazon.com/sp-api/docs/register-as-a-public-developer
- SP-API Application Credentials: https://developer-docs.amazon.com/sp-api/docs/viewing-your-application-information-and-credentials
- Login with Amazon Authorization Code Grant: https://www.developer.amazon.com/docs/login-with-amazon/authorization-code-grant.html
- Amazon Ads API: https://advertising.amazon.com/about-api/

---

# 10. 如果现在还没有 Amazon 开发者应用，怎么继续

## 10.1 先选路线

当前有三条路线：

| 路线 | 能不能马上继续 | 是否是一键授权 | 适合场景 |
|---|---:|---:|---|
| A. 申请 SP-API Public App + Ads API App | 需要等 Amazon 审核 | 是 | 最终 SaaS/多店铺授权形态 |
| B. 先做 SP-API Private App / 自授权 | 较快 | 否 | 先把测试店铺真实订单/库存/报表接进来 |
| C. 继续 mock/CSV/手工导入 | 立刻 | 否 | 等 Amazon 审核期间继续开发 M2/M3/M4 |

建议实际执行：

1. **最终目标走 A**：申请 Public App，保证以后店铺可以真正点“一键授权”。
2. **开发测试先走 B/C**：在 Amazon 审核期间，不要停工；先用 Private App 或 CSV/Mock 把数据链路继续打通。

## 10.2 路线 A：申请最终的一键授权应用

### A1. SP-API Public Developer / Public App

适合最终形态：多个店铺都能通过 OAuth 授权。

步骤：

1. 登录 Seller Central 管理员账号。
2. 进入 `Apps & Services -> Develop Apps / Developer Central`。
3. 如果没有开发者资料，先填写 Developer Profile。
4. Data Access 选择 Public Developer。
5. 选择需要的最小 API roles。
6. 填写应用用途、网站、隐私政策、数据安全说明。
7. 提交后等待 Amazon 审核。
8. 审核通过后创建 Public App。
9. 配置系统的 Login URI / Redirect URI。
10. 复制 `Application ID`、`LWA Client ID`、`LWA Client Secret` 到服务器。

注意：

- Amazon 官方要求 public developer 通过 OAuth 获得每个 seller/vendor 的明确授权。
- Public app 通常还涉及 Selling Partner Appstore 发布/列表要求。
- 如果申请 restricted roles，会触发更严格的安全/架构审查。

### A2. Amazon Ads API Access

适合最终 M3 广告真实数据和未来可控写入。

步骤：

1. 进入 Amazon Ads API / Advanced Tools Center。
2. 选择 Request API access。
3. 说明你是 Direct advertiser，还是 Partner / tool provider。
4. 填写 API 用途，例如广告报表、结构同步、策略建议、投放管理。
5. 等待 Amazon Ads 审核。
6. 审核通过后获取 LWA Client ID / Client Secret。
7. 在 LWA / Ads app 后台登记 Ads callback URI。
8. 把 `ADS_LWA_CLIENT_ID`、`ADS_LWA_CLIENT_SECRET` 填到服务器。

注意：

- Ads API access 没通过时，按钮即使能跳 LWA，也可能在 scope 阶段失败。
- 常见错误是 `invalid_scope`、`unauthorized_client`。

## 10.3 路线 B：先用 Private App / 自授权继续

如果你只是先接自己的测试店铺，SP-API 可以考虑 Private App。

优点：

- 通常比 Public App 快。
- 可以先拿到 refresh token，让 M2/M4 的订单、库存、报表、Catalog 数据先跑起来。

缺点：

- 不是最终一键授权。
- 通常是 self-authorized，需要复制 refresh token 到系统高级表单。
- 不适合未来让很多外部店铺自己点授权。

当前系统怎么用：

1. 在 Seller Central 创建 Private SP-API app。
2. 完成 self authorization，拿到 refresh token。
3. 打开系统：

```text
http://47.97.252.71/#/settings/amazon-auth
```

4. 展开 `高级手动接入 / 排障工具`。
5. 填入 SP-API refresh token、region、marketplaceId。
6. 保存后运行真实诊断和同步。

这条路线可以让真实 SP-API 读取先跑起来，但不是“一键授权”的最终方案。

## 10.4 路线 C：没有任何 Amazon 应用时继续开发

如果现在连 Private App 也没有，可以继续做这些：

### 后端/数据链路

- 继续使用 mock adapter。
- 保持所有接口的 `source/freshness/confidence` 元数据。
- 继续完善 M2/M3/M4 的真实数据表结构。
- 继续跑同步入口，只是 provider 显示为 mock/blocked。

### M3 广告

- 继续使用 Ads fixtures 和领星调研沉淀的结构。
- 可以用 Amazon Ads bulk/report CSV 手动导入作为过渡数据源。
- 真实写入继续关闭，等 Ads API access 批准后再开。

### M4 日报

- 继续做日报 UI、维度切换、趋势、告警、sourceMeta。
- 没有真实 SP-API/Ads 前，日报显示 mock/blocked 数据源，不伪装成真实。

### 授权中心

- 保持一键授权按钮在主流程。
- 缺应用参数时显示“系统授权应用未完成配置”。
- 不再让运营理解 refresh token/profileId/marketplaceId。

## 10.5 推荐时间顺序

建议按这个顺序推进：

1. 先准备一个可公开访问的网站/隐私政策页面。
2. 给 `47.97.252.71` 配正式域名和 HTTPS。
3. 同时申请 SP-API Developer Profile / Public App。
4. 同时申请 Amazon Ads API access。
5. 等审核时，先用 Private App 或 mock/CSV 继续开发和测试。
6. 拿到 Application ID / Client ID / Secret 后填服务器。
7. 再回到系统点击一键授权，完成真实店铺接入。

## 10.6 当前项目在没有开发者应用时的结论

当前不能真正跳 Amazon 授权页，不是按钮代码问题，而是缺 Amazon app-level 身份。

现在可以继续：

- 用 mock/CSV 保持 M1/M2/M3/M4 功能开发。
- 如果能建 Private SP-API app，则先接真实 SP-API 读取。
- 同步申请 Public SP-API app 和 Ads API access，作为最终一键授权的前置条件。
