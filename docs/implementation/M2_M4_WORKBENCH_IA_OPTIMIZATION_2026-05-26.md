# M2 / M4 Workbench IA Optimization（2026-05-26）

## 1. 背景

用户指出 M2 与 M4 内容冗余、入口过多、难以判断从哪里修改。经代码与文档核对，问题不是功能过多，而是把底层能力直接平铺给人类运营：

- M2：利润、SKU、订单、漏点、现金流、补货、滞销、跟价、PO、供应商、调拨、汇率、支付、税务、LTV、自定义报警等约 19 个显性入口。
- M4：异常、SLA、案例、复盘、跟卖、侵权、Review、聚类、趋势、申诉、挽回、竞品、图片变化等约 13 个显性入口。

本轮目标是“收口”，不是删功能：旧页面、旧 URL、旧 API、状态机与审计仍保留；主导航只暴露人类日常运营真正需要的任务型入口。

## 2. PM / Product 12 轮结论

1. 用户不是缺功能，而是缺“今天该做什么”的入口。
2. 旧页面不能删除，必须保留深链、测试兼容和高级能力。
3. M2 的核心问题是“钱”：利润是否漏、库存是否断/积压、采购和现金是否撑得住、是否要调价。
4. M4 的核心问题是“事”：异常、差评、跟卖、侵权、竞品变化必须统一进入风险收件箱。
5. M2 不再作为 19 个页面的菜单集合，而是“经营利润工作台”。
6. M4 不再作为异常/Review/竞品页面堆，而是“运营风险工作台”。
7. 旧页面降级为：分析下钻、配置/资料库、详情深链、任务抽屉。
8. 任何写操作仍走现有 API 状态机与 Audit Center，不允许绕过审计。
9. 工作台必须显示 source/confidence/mock 语义，不能把 mock 装成真实数据。
10. 首轮只做 IA 与聚合壳，不重写所有旧页面，避免大面积回归风险。
11. 侧边栏 M2/M4 必须显著瘦身，让用户默认从主工作台进入。
12. 验收重点是：主入口清晰、旧深链不坏、任务两次点击可达、构建与契约测试通过。

## 3. 最终信息架构

### 3.1 M2：经营利润工作台

新增主入口：

- `/m2/workbench`
- 侧边栏分组：`利润库存 (M2)`
- 侧边栏标题：`经营利润工作台`

工作台区块：

- **经营健康 KPI**：30 天净利润、收入、待处理决策、现金预警。
- **今日必须处理**：利润漏点、补货、滞销、跟价、现金流预警统一成决策卡。
- **利润雷达**：简化版 SKU 利润表，完整分析进入旧深水页。
- **资金与采购**：未闭环 PO、供应商、调拨、税务、LTV 摘要。
- **高级工具**：SKU 利润、订单瀑布、漏点、情景模拟、补货、滞销、PO、供应商、汇率、支付、税务、LTV、自定义报警等旧功能入口。

旧页面保留：

- `/profit/overview`
- `/profit/skus`
- `/profit/orders/sample`
- `/profit/leaks`
- `/profit/cashflow`
- `/profit/scenario`
- `/inventory/reorder`
- `/inventory/slow-moving`
- `/repricing`
- `/inventory/po`
- `/inventory/suppliers`
- `/inventory/transfers`
- `/profit/multi-store`
- `/profit/dimensions`
- `/profit/fx`
- `/costs/payment-channels`
- `/tax`
- `/profit/ltv`
- `/alerts/custom`
- `/ads/inventory-link`

### 3.2 M4：运营风险工作台

新增主入口：

- `/m4/workbench`
- 侧边栏分组：`运营监控 (M4)`
- 侧边栏标题：`运营风险工作台`

工作台区块：

- **风险收件箱**：异常、Review、跟卖、侵权、竞品图片变化统一成风险任务卡。
- **客户声音**：负面 Review、差评聚类、申诉、挽回邮件。
- **竞品雷达**：监控竞品、图片变化、评分/趋势快照。
- **处置与复盘**：处置案例、复盘报告、SLA 看板。

旧页面保留：

- `/monitor/anomalies`
- `/monitor/sla`
- `/monitor/cases`
- `/monitor/postmortems`
- `/monitor/hijacking`
- `/monitor/infringement`
- `/reviews`
- `/reviews/clusters`
- `/reviews/trends`
- `/reviews/appeals`
- `/reviews/recovery`
- `/competitors`
- `/competitors/image-diff`

## 4. 已落地文件

- 新增 M2 工作台：`apps/web-v2/src/pages/M2ControlTower.vue`
- 新增 M4 工作台：`apps/web-v2/src/pages/M4OpsWorkbench.vue`
- 更新路由：`apps/web-v2/src/router/index.js`
- 更新侧边栏分组：`apps/web-v2/src/layouts/DefaultLayout.vue`
- 新增契约测试：`tests/qa/m2-m4-workbench-ia-contract.test.mjs`

## 5. 设计边界

- 不删除旧页面、旧路由、旧 API、旧数据表。
- 不合并 M2 / M4 模块边界。
- 不绕过 Audit Center。
- 不直接触发真实 Amazon、付款、邮件或广告写操作。
- 不重写旧页面内部逻辑，只做主入口收口和聚合展示。
- 不把低频配置伪装成日常任务。

## 6. 验收标准

- 侧边栏 M2 只展示一个主入口：经营利润工作台。
- 侧边栏 M4 只展示一个主入口：运营风险工作台。
- M2 工作台能聚合利润、库存、调价、现金和采购入口。
- M4 工作台能聚合异常、Review、跟卖、侵权、竞品变化入口。
- 旧 URL 仍可访问，不 404。
- 前端构建通过。
- 契约测试验证路由、导航收口、深链保留和工作台核心文案。
