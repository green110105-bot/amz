# amz Web v2 — Vue 3 + Element Plus 重构版前端

> 状态：W1 框架 + 工作台首页可用；其它模块占位中。
> 旧版 vanilla 实现保留在 `apps/web/`，作为参考；本版稳定后替换。

## 快速开始

```bash
# 1. 启动后端 API（依然是 apps/api 的 Node mock）
# 在仓库根目录执行：
node apps/api/src/server.mjs
# → 监听 http://localhost:8080

# 2. 安装前端依赖（首次）
cd apps/web-v2
npm install

# 3. 启动开发服务器
npm run dev
# → 默认 http://localhost:5173 ，自动代理 /api → 8080
```

打开浏览器访问 [http://localhost:5173](http://localhost:5173) 即可。

## 目录结构

```
apps/web-v2/
├── package.json
├── vite.config.js          # 含 /api → 8080 代理
├── index.html
├── src/
│   ├── main.js              # Element Plus + Pinia + Router 装载
│   ├── App.vue
│   ├── router/index.js      # 路由 + 侧边栏分组
│   ├── stores/app.js        # 全局状态（侧栏折叠 / 当前店铺 / 主权 等）
│   ├── api/                 # 调用后端 mock API 的薄客户端
│   │   ├── client.js        # axios 实例
│   │   ├── dashboard.js     # /api/v1/dashboard
│   │   ├── profit.js        # /api/v1/profit/...
│   │   ├── ads.js           # /api/v1/ads/...
│   │   ├── monitor.js       # /api/v1/monitor/...
│   │   ├── inventory.js     # /api/v1/inventory/...
│   │   └── audit.js         # /api/v1/audit/mock-execute
│   ├── layouts/
│   │   └── DefaultLayout.vue   # 侧栏 + 顶栏 + 内容区
│   ├── components/
│   │   ├── PageHeader.vue
│   │   ├── KpiCard.vue
│   │   ├── DecisionCard.vue    # AI 决策卡片（M2/M3/M4 共享）
│   │   ├── ReasonChain.vue     # "为什么这么建议"展开
│   │   └── EmptyState.vue
│   ├── pages/
│   │   ├── Workbench.vue           # ✅ W1 完整实现
│   │   ├── ProfitOverview.vue      # ✅ 列表骨架（含订单利润表）
│   │   ├── AdsActions.vue          # ✅ 决策列表骨架
│   │   ├── MonitorAnomalies.vue    # ✅ 决策列表骨架
│   │   ├── InventoryReorder.vue    # ✅ 补货建议表骨架
│   │   ├── ListingList.vue         # 占位（W4）
│   │   └── Placeholder.vue         # 通用占位
│   ├── styles/
│   │   ├── global.css              # 设计 token + 工具类
│   │   └── element-overrides.css   # Element Plus 主题微调
│   └── utils/format.js             # 货币 / 百分比 / 严重度 / 标签
└── public/favicon.svg
```

## W1 已交付

- ✅ 项目骨架 + Vite + Vue 3 + Element Plus + Pinia + Vue Router
- ✅ 侧栏（按 M1/M2/库存/M3/M4 分组）+ 顶栏（搜索 + 通知 + 用户）
- ✅ 通用组件：KpiCard / DecisionCard / ReasonChain / EmptyState / PageHeader
- ✅ **工作台首页**：4 KPI + 待处理决策列表 + 类型筛选 + 使用提示 + 系统状态
- ✅ DecisionCard 支持"为什么这么建议"展开（证据 / 阶段 / 动作 / 关键词 / 置信度 / 来源）
- ✅ 利润总览 / 广告操作清单 / 异常监控 / 补货建议 — 列表骨架可用
- ✅ 真接 `/api/v1/dashboard` `/api/v1/profit/overview` `/api/v1/ads/suggestions` `/api/v1/monitor/overview` `/api/v1/inventory/decisions`

## 设计原则（与领星看齐）

- **首页只回答"今天做什么"**，不要场景切换、不要角色教学
- **数字克制**：单一品牌蓝；红/黄/绿仅用于状态
- **每个决策都附"为什么"**：点开看完整证据链，不在主屏堆字
- **写操作有明确反馈**："已提交审计中心"而不是 "BLOCKED"
- **列表 → 详情 → 操作** 是标准工作流，所有模块统一

## 路线图

| 周 | 任务 |
|---|---|
| **W1（已完成）** | 框架 + 工作台 + 通用组件 + 4 列表骨架 |
| **W2** | M2 利润详细 / 库存补货 / 采购单 完整实现 |
| **W3** | M3 广告（Campaign 详情 / 关键词 / 周期管理）+ M4 异常详情 |
| **W4** | M1 商品（含图像生成 UI）+ Review + 竞品 + 审计 + 设置 |

## 与旧版（`apps/web/`）的关系

- 旧版用纯 vanilla JS（零依赖）写成，作为开发期 mock 演示
- 新版（本目录）使用 Vue 3 + Element Plus，作为正式产品 UI
- 两个版本同时可跑，端口不冲突（旧 3000 / 新 5173）
- 新版稳定通过用户验收后，可在 `infra/deploy/docker-compose.yml` 中替换

## 已知边界

- 所有写操作走 `/api/v1/audit/mock-execute`，**不会真改店铺**
- LLM 在后端走 `codex_local`，前端只展示 mock 推理链
- 真实 SP-API / Ads API 接入在 `PROJECT_STATUS.md` 中标记为 `external_blocked`
