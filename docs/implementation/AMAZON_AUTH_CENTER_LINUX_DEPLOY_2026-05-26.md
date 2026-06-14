# Amazon 授权接入中心 Linux 部署 - 2026-05-26

## 部署范围

本次部署把 Amazon 授权接入中心推送到 `47.97.252.71`：

- 后端：
  - `apps/api/src/integrations/sync-routes.mjs`
  - `apps/api/src/integrations/ads-api/credentials.mjs`
  - `apps/api/src/integrations/provider-mode.mjs`
- 前端：
  - `apps/web-v2/src/api/integrations.js`
  - `apps/web-v2/src/pages/AmazonAuthCenter.vue`
  - `apps/web-v2/src/pages/Settings.vue`
  - `apps/web-v2/src/router/index.js`
- 测试与文档：
  - `tests/integrations/sync-routes.test.mjs`
  - `tests/qa/amazon-auth-center-contract.test.mjs`
  - `docs/implementation/AMAZON_AUTH_CENTER_2026-05-26.md`
  - `PROJECT_STATUS.md`
  - `MEMORY.md`

## 构建与备份

- 本地 web 构建：`apps/web-v2` `npm run build` PASS。
- Web dist 包：`dist/release/amz-web-v2-dist-amazon-auth-center-20260526T011319Z.tar.gz`。
- 服务器源码目录：`/opt/amz/src`。
- 服务器 web 目录：`/var/www/amz-web`。
- 部署前备份：`/opt/amz/backups/20260526T011409Z-amazon-auth-center`。

## 远端验证

远端验证全部通过：

- Node syntax：
  - `apps/api/src/integrations/sync-routes.mjs`
  - `apps/api/src/integrations/ads-api/credentials.mjs`
  - `apps/api/src/integrations/provider-mode.mjs`
- Remote tests：
  - `tests/integrations/sync-routes.test.mjs`
  - `tests/qa/amazon-auth-center-contract.test.mjs`
  - `tests/integrations/authorization-diagnostics.test.mjs`
  - 合计 `27/27 PASS`
- nginx：
  - `nginx -t` PASS
- API service：
  - `systemctl restart amz-api` PASS
  - `systemctl is-active amz-api` -> `active`
- Health：
  - `GET http://127.0.0.1:8090/health` PASS
  - `GET http://127.0.0.1:8090/ready` PASS
- Demo auth smoke：
  - `demo@amz.local` 登录 PASS
  - `GET /api/v1/integrations/status` PASS，mode `hybrid`
  - `GET /api/v1/integrations/diagnostics` PASS，mode `hybrid`
- Web asset：
  - `/var/www/amz-web/assets/AmazonAuthCenter-_-DaHeux.js`
  - `HEAD /assets/AmazonAuthCenter-_-DaHeux.js` -> `200 OK`

## 部署后状态

- 线上入口：`http://47.97.252.71/#/settings/amazon-auth`
- 当前服务器 `/health` 仍显示 `mode: mock`，这是 provider mode，不代表页面是 mock；真实同步需要配置 LWA 环境变量并保存店铺 refresh token。
- `/ready` 显示 `realWritesEnabled=false`，符合本轮目标：真实读取/同步可接入，真实写入继续保持关闭。
