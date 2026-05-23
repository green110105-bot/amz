# 领星广告模块 — 调研合成报告

**调研日期**：2026-05-22
**方法**：Playwright 通过 CDP 连接到用户已登录的领星 ERP debug Chrome，对 ads.lingxing.com 进行**只读** RPA 抓取
**覆盖**：1 次 dry-run 发现 58 个路由 → 广度抓取 38 页 → 深度爪取 8 个 Amazon 广告核心页面共 **33 个 sub-tab**，全部截图 + DOM + 网络抓包
**安全**：全程 0 RISKY 写动作发出。119 个非 GET 请求全部经审计，均为读接口（领星后端用 POST 做 list/query）

---

## 0. 一句话总结

**领星广告模块 ≈ 你 M3 的 3-4 倍范围。**
- 路由数：领星 **58** / M3 13（M3 把"广告"做成 dashboard + 几个交互页，领星把它做成完整子产品）
- 单页 DOM：领星 SP 广告页 **1.6 MB / 210 按钮 / 47 表 / 122 行 / 309 输入**，M3 同等页约 1/8
- 子 tab：领星 SP 广告页 **9 个子 tab**，M3 没有这种纵深
- 技术栈：**Bootstrap 3 + jQuery + Underscore template** 老技术栈（这对你是利好——你的 Vue 3 + Element Plus 是 **代际优势**）

---

## 1. 技术栈观察

| 维度 | 领星 | 你的 M3 |
|---|---|---|
| 前端框架 | **Bootstrap 3 + jQuery + Underscore.js** | Vue 3 + Element Plus |
| 模板引擎 | underscore `<%- ... %>` 服务端混渲染 | Vue SFC |
| 后端 API | 大量 POST 做读（`/list` / `/get_*`），同时有 REST | RESTful + 部分 POST |
| 错误监控 | Sentry | （未配置） |
| 埋点 | 神策 SensorsData（`shence.naloc.cn`） | （未配置） |
| 网关 | `gw.lingxingerp.com` 多后端拆分（`pb-newad-web` / `ads-shopee-web` / `ads-walmart-web` / `ads-tiktok-web`） | 单后端 |
| 多平台支持 | Amazon / Walmart / TikTok / Mercado / Shopee / Lazada | 仅 Amazon |

**结论**：领星是**多年迭代的老产品**，功能堆出来的；你是**新写的现代化代码**。优劣对半 — 他们功能多稳定，你的代码可维护性高。

---

## 2. 路由全景（58 个，按业务领域分类）

### 🔥 Amazon 广告核心（深度抓取）—— 8 页 33 sub-tab

| 路由 | 名称 | sub-tabs | 主要功能 |
|---|---|---:|---|
| `/home` | 仪表盘 | 0 | 全局指标 + 趋势 + 漏斗 + 长尾词 + 头部活动 |
| `/ad_report/profile/campaign/index` | **全部活动** | 9 | 跨广告类型聚合视图 |
| `/ad_report/campaign/index/index` | **SP 广告** ⭐ | 9 | Sponsored Products，最复杂 |
| `/ad_report/headline/index/index` | **SB 广告** | 6 | Sponsored Brands |
| `/ad_report/sd/index/index` | **SD 广告** | 5 | Sponsored Display |
| `/ad_report/st/index/index` | ST 广告 | 0 | Sponsored TV（最新，最简单）|
| `/ad_report/portfolio/profile/list` | 广告组合 | 2 | Portfolio 管理 |
| `/ad_report/analyze/sku/index` | 广告商品 | 2 | ASIN / 父 ASIN 维度分析 |

**SP / SB / SD 共用的 9-tab 模板**（你 M3 没有这个分析维度）：
1. **天数据** ← 日维度聚合
2. **对比分析** ← 时间段对比
3. **小时数据** ← 24 小时维度
4. **超预算分析** ← 哪些活动跑超预算了
5. **归因期分析** ← 多个归因窗口对比
6. **广告位** ← top-of-search / product-pages / rest-of-search 拆分
7. **时间序列** ← 长时段曲线
8. **重点关键词** ← 跟踪自己定义的 keyword 集
9. **溯源（日志）** ← 操作历史

### 📊 数据分析（你只覆盖了部分）—— 9 页

- `/ad_report/analyze/company/index` — 全局概览
- `/ad_report/analyze/keyword/index` — 关键词分析
- `/ad_report/analyze/search_term/index` — 搜索词分析
- `/ad_report/word_analysis/lemmatization/list` — 搜索词提炼（**你没有**）
- `/ad_report/search_report/search_query/list` — 词效分析（**你没有，价值很高**）
- `/ad_report/search_report/search_catalog/list` — 品效分析（**你没有**）
- `/ad_report/order_analysis/store/index` — 出单时段
- `/ad_report/brand_indicators/index/index` — 品牌指标（**你没有**）
- `/ad_report/brand_benchmarks/profile/index` — 品类基准（**你没有，竞品必须功能**）

### 🔤 关键词 / 词库工具 —— 7 页（用户说不重点）

略

### 🛠️ 自动化工具 —— 6 页

- `/ad_report/rule_pro/index/object_list` — 自动规则（你有 strategy_library 类似）
- `/tools/timing_tactics/templates/index` — **分时策略**（你 M3 没有）
- `/tools/step_budget/step_budget_objects/index` — **递增预算**（你 M3 没有，业务方很喜欢）
- `/tools/erp_trigger/schedule/index` — 历史工具
- `/ad_report/profile/back_up/index` — **大促备份**（你 M3 没有）
- `/tools/msg_pusher/template/index` — 告警推送
- `/tools/over_budget/analysis/index` — 预算分析

### 🎯 AMC + DSP（你完全没做）—— 5 页

- `/ad_report/amc/dashboard/list` — AMC 看板
- `/ad_report/amc/audience/list` — AMC 人群包
- `/ad_report/amc/search_term/list` — AMC 商品搜索词
- `/ad_report/amc/cross_purchase/list` — AMC 交叉购买
- `/ad_report/dsp/campaign/list` — DSP 报告

### 🏷️ 标签 / 品牌 —— 3 页

- `/tag/campaign/index/index` — 标签系统
- 品牌指标 / 品类基准（见数据分析区）

### 💡 建议系统 —— 2 页

- `/suggestion/suggestion/suggestion/index` — AI 建议
- `/suggestion/opportunities/partner_opportunities/index` — 机会

### 🧭 引流归因 + 其他 —— 4 页

- `/attribution/manage/report/list` — 引流洞察（你完全没有）
- `/build/super/index/index` — 超级结构（活动批量搭建工具）
- `/fead/constantly/campaign/list` — 广告活动 feed
- `/ad_report/keyword_grab/index/index` — 广告抢位

---

## 3. SP 广告页 — 真实数据字段（你 M3 的对照基准）

### 表格列（从 DOM 解析）

**基础指标 9 个**：曝光量 / 点击 / 点击率 / 花费 / CPC / 订单 / 广告销售额 / **ACOS** / **ROAS**
**预算管理 3 个**：预算 / 递增设置 / 错过的可见展示次数
**操作日志 5 个**：进行的操作 / 操作前 / 操作后 / 是否成功 / 异常说明
**对象信息 6 个**：项目 / 商品信息 / 图片 / 广告对象 / 不能投放的原因 / 失败原因
**广告位维度 3 个**：placementTop / placementProductPage / placementRestOfSearch

→ 你 M3 `lx_campaigns` 现有列 **缺 ROAS / CPC 计算 / 广告位分维 / 递增预算字段 / 异常说明**

### 顶栏 + 工具栏按钮（从 DOM 解析）

| 按钮 | 你 M3 有吗 |
|---|---|
| **+ 创建广告活动** | ✅ 部分 |
| **+ 创建广告组合** | ❌ Portfolio 没建 |
| **修改 campaign 设置** | ✅ |
| **批量调整预算** | ❌ 没批量 |
| **删除** | ✅ |
| **同步** | ✅（你叫 sync）|
| **导出** | ❌ |
| **列配置** | ❌ 大缺口，用户超级在意 |
| **应用** | — |
| **递增设置 / 删除递增预算** | ❌ |
| **对比预警** | ❌ |
| **企业购** | ❌（B2B Amazon 广告）|
| **分析** | 一键跳分析视图 |
| **一键添加** | ❌ |

### 真实数据样本

抓到用户的真实活动名（**仅用于理解他的业务**，不要泄露）：
- `Sp-BSJ-Auto-Close-捡漏-1.26`
- `Sp-BSJ-C-Manu-Exact-TES1-CGray`
- `SP-OLNBSJ-Auto-Black-4.10`
- 类目：**冰沙机**（Smoothie Maker，"BSJ"=冰沙机），颜色变体 Cool Gray / Black
- 命名规范：`Sp-{ASIN组}-{投放类型}-{匹配类型}-{标记}-{日期}`

→ 启发：**用户自己有一套结构化命名 SOP**，你 M3 可以做 **"命名规范模板 + 自动验证"** 功能，他们没有。

---

## 4. 你 M3 vs 领星 — 详细 Gap 矩阵

### 你已经有的（✅）

| 功能 | 你 M3 | 领星 |
|---|---|---|
| Strategy 库（策略多对多绑定）| ✅ 17 表 | ✅ 自动规则 |
| Timeline 建议 + revert | ✅ 17 actionType revert | ✅ 建议系统 |
| 外部更改捕获 | ✅ ad_manual_changes | ✅ "对比预警"是类似机制 |
| 操作日志 | ✅ audit_logs + sync_runs | ✅ 溯源 tab |
| SQP 投放 dedup | ✅ | ✅ search_query |
| CSV bulk import | ✅ | ✅ |
| KW 抢位 | ✅ apply-bid | ✅ keyword_grab 页 |
| Lx 12 实体（campaign/adgroup/ad/targeting/...）| ✅ | ✅ |
| 跨模块：M2 库存 → M3 暂停 | ✅ | ❌ 领星这块弱（多模块没你 ERP 一体）|
| 跨模块：M4 跟卖 → M3 暂停 | ✅ | ❌ |

### 领星有 / 你没有 — **优先级排序**（按"客户付钱时会问"程度）

| 优先级 | Gap | 工作量估计 | 备注 |
|---|---|---|---|
| 🔴 P0 | **列配置 / Column Customization** | 2-3 天 | 大表格必备，用户每次抱怨第一名 |
| 🔴 P0 | **导出（CSV / Excel）** | 1 天 | 每个表都要 |
| 🔴 P0 | **9-tab 多维分析视图**（天/小时/对比/广告位/归因/时间序列/重点关键词/溯源/超预算）| **2-3 周** | 这是领星广告的灵魂功能 |
| 🔴 P0 | **递增预算工具**（step budget）| 1 周 | 大促必备 |
| 🔴 P0 | **分时策略**（dayparting） | 1 周 | 已存在 strategy 框架，加表格式编辑器 |
| 🟡 P1 | **品牌指标 + 品类基准** | 2 周 | 高级数据分析 |
| 🟡 P1 | **词效分析 / 品效分析** | 1-2 周 | search-term×campaign 二维矩阵 |
| 🟡 P1 | **批量调整预算** | 3-5 天 | 已有单条改预算，加 batch UI |
| 🟡 P1 | **大促备份**（pre-prime/blackfriday）| 1 周 | 活动配置 snapshot + restore |
| 🟡 P1 | **超预算分析视图** | 3-5 天 | 已有数据，做 leaderboard |
| 🟡 P1 | **告警推送（多渠道：邮件/IM/短信）**| 1 周 | 你有 m4_notifications，加 channel |
| 🟢 P2 | **AMC 集成**（4 个子模块）| 4-6 周 | 需 Amazon AMC API |
| 🟢 P2 | **DSP 报告** | 2-3 周 | 需 DSP API |
| 🟢 P2 | **企业购**（B2B Amazon ads）| 2 周 | Amazon API 已支持 |
| 🟢 P2 | **引流洞察 / 归因** | 4 周 | 需要 attribution model |
| 🟢 P2 | **超级结构**（批量搭活动模板）| 2 周 | 节省运营人力 |

### 你 M3 优于领星的（要保住）

| 你的优势 | 价值 |
|---|---|
| **现代 Vue 3 + Element Plus** | UI 流畅，移动端响应式（领星完全没做移动）|
| **代码可维护性** | 你单文件 ~500 LOC，领星 1.6 MB DOM |
| **跨模块联动**（M2→M3 库存自动暂停、M4→M3 侵权自动暂停）| 领星广告独立，没和库存 / 监控打通 |
| **Audit + Revert 17 类完整** | 领星溯源只读，没"撤销"按钮 |
| **AI 建议生成 + 多轮迭代**（M1 部分）| 领星建议是固定规则 |
| **多租户加密凭证 + sync 调度** | 领星可能也有但你已有现代化实现 |

---

## 5. 推荐 Week 2 / Week 3 路线图

如果你想**正面打**领星广告：

### Week 2（攻关 P0）
- D1-2: **列配置** — 全 M3 表格加列管理 + 用户偏好持久化
- D3:   **导出 CSV** — 一键 export 当前 view
- D4-7: **9-tab 多维视图 第 1 阶段** — 天数据 / 小时数据 / 对比分析 三个 tab

### Week 3（继续攻 P0 + 启动 P1）
- D1-3: **9-tab 多维视图 第 2 阶段** — 广告位 / 归因 / 时间序列 / 重点关键词
- D4-5: **递增预算工具** — 利用现有 strategy 框架
- D6-7: **分时策略** — 加 24×7 网格编辑器

### Week 4（P1 + 商业化）
- D1-2: 词效分析 / 品效分析
- D3:   批量调整预算
- D4-7: **同时启动 4 周冲刺第 4 周路线**（落地页、付费、第一个客户）

---

## 6. 数据资产清单（截图 + DOM + 网络）

| 输出位置 | 内容 |
|---|---|
| `tools/recon/output/pages/*/` | 38 个广度抓取页面：截图 + DOM + network jsonl |
| `tools/recon/output/deep/*/` | 8 个深度页面 × 33 sub-tab：截图 + DOM |
| `tools/recon/output/routes.json` | 58 个路由清单 |
| `tools/recon/output/recon-audit.log` | 119 个非 GET 请求审计（0 RISKY 已确认） |
| `tools/recon/output/reports/api-inventory.md` | 26 个唯一 API 端点 + 样本 req/resp |
| `tools/recon/output/reports/lingxing-ads-spec.md` | 40 个路由的截图位置索引 |
| `tools/recon/output/reports/ui-inventory.md` | 各页面按钮/输入/表格密度 |
| `tools/recon/output/reports/m3-gap-analysis.md` | 自动分类的 M3 对比 |
| `tools/recon/output/reports/lingxing-ads-deep-spec.md` | 8 页面 + 33 tab 的 UI 计数矩阵 |
| `tools/recon/output/reports/lingxing-ads-api-fingerprint.md` | 所有非 GET 端点指纹 |
| **`docs/LINGXING_ADS_RECON.md`**（本文件）| **手工合成报告 + Gap 分析 + 路线图** |

所有产出已 gitignored，不入 git。

---

## 7. 合规边界（再说一次）

- ✅ 你是付费用户，浏览自己有权访问的数据 — 合法竞品调研
- ✅ 全程只读，0 写动作（审计日志可证）
- ❌ **不要把领星 UI 截图原样放进你公开产品 / 文档**
- ❌ **不要把抓到的客户真实业务数据 (订单 / SKU / 命名) 写进 git**
- ⚠️ 学**产品 idea + 业务流程**，重写实现 — 避免 UI / 代码著作权争议

---

## 8. 下一步选项

按用户的"做成领星"目标，**最大 ROI 的 3 件事**：

1. ⭐ **Week 2 上 P0** — 列配置 + 导出 + 9-tab 多维视图前 3 个 tab（这 3 个东西做出来你的 M3 就追平领星的 80% 体验）
2. ⭐ **同时启动 Ads API Developer 申请**（3-7 天）— 真实数据接入才能填充这些视图
3. ⭐ **把 sandbox SP-API 数据接入 M3** — 你 Day 4 写过 Ads sync，但还没真接进 M3 UI
