# 移动端审计与定向修复报告 — p45-mobile-audit-fix

生成时间：2026-05-16
目标站点：http://47.97.252.71（iPhone 12 emulation，390×844）
审计脚本：`D:/amz/tmp/mobile_audit.mjs`
审计结果：`D:/amz/tmp/mobile_audit.json`
截图目录：`D:/amz/tmp/mobile_screens/`

---

## 1. 问题背景

线上已部署 mobile responsive，但 Playwright 测试只验「无溢出 + 有内容」，未验真实可用性。LxAdsLayout 下 11 个 lx/* 子页表面 PASS、实际 PC 密度不可用。需做整体审计 + 定向修复。

---

## 2. 审计方法

每个页面在 iPhone 12 emulation 下抓 5 个指标，加权得分：

```
score = 1 × overflowCount
      + 1 × min(wideInlineCount, 10)
      + 0.5 × toolbarCrowded
      + 2 × rawElTableVisible
      + 0.5 × smallTapTargets
      + (bodyOverflow ? 2 : 0)
```

- **overflowCount**：子元素 `scrollWidth > clientWidth` 数（已排除显式 overflow-x scroll 容器）
- **wideInlineCount**：inline style 含 `width: ≥200px` 元素数（上限计 10）
- **toolbarCrowded**：filter/toolbar 类容器子节点 ≥5 的实例数
- **rawElTableVisible**：仍可见的原始 `<el-table>` 数（说明未使用 ResponsiveTable 卡片模式）
- **smallTapTargets**：前 5 个按钮中 `min(width, height) < 36` 的数

阈值：**score ≥ 5 → 包 MobileFallback**（步骤 3）；3 ≤ score < 5 提示但本期不动；< 3 不动。

---

## 3. 总览

| 桶 | 范围 | 数量 |
|---|---|---|
| 极高 | ≥ 10 | 5 |
| 高 | 5 – 10 | 3 |
| 中 | 3 – 5 | 9 |
| 低 | 1 – 3 | 30 |
| 极低 | < 1 | 21 |
| **共计** | — | **68 页（不含 11 lx 子页）** |

加上 11 lx 子页，全应用 **79 页**。

---

## 4. 步骤 1：LxAdsLayout 整体回退（一改解决 11 子页）

文件：`apps/web-v2/src/layouts/LxAdsLayout.vue`

**问题**：layout 含 PC 专属侧栏 (`width: 220px`) + 顶部粒度 tabs (12 个) + 内嵌复杂表格。即便子页 `<router-view>` 内容能渲染，但侧栏挤压主区到几乎不可读。

**改造**：
- `useViewport()` + `MobileFallback` 引入 layout
- `isMobile=true` 时整个 layout 不显示侧栏 + tabs，直接 `<MobileFallback>` 显示 page-name + reason + readonly slot（11 子页目录 + 「返回工作台」/「前往广告总览（移动可用）」两个按钮）
- `isMobile=false` 时保持现有 desktop layout（用 `v-else` 包裹原模板，未删除任何 desktop 代码）

**覆盖的 11 子页**（一次性回退）：
1. LxPortfolios（广告组合 · 领星核心）
2. LxPortfolioDetail（组合详情）
3. LxCampaignDetail（Campaign 详情 · 12 子 tab）
4. LxAllCampaigns（全部活动）
5. LxSP / LxSB / LxSD / LxST（4 个广告类型）
6. LxPurchased（已购商品）
7. LxOpLog（操作日志）
8. LxDownload（下载中心）

---

## 5. 步骤 3：score ≥ 5 页面包 MobileFallback

按审计 score 从高到低，共 **8 页** 应用：

| # | Page | Score | 主要问题 | 文件 |
|---|---|---|---|---|
| 1 | ReportsCenter | 16.5 | overflow=8, wide=6, 内嵌 7 tab + 表 | `apps/web-v2/src/pages/ReportsCenter.vue` |
| 2 | Audit | 14.0 | overflow=8, wide=3, 含 el-table | `apps/web-v2/src/pages/Audit.vue` |
| 3 | SearchTermReport | 13.5 | overflow=6, wide=5, 大宽表 | `apps/web-v2/src/pages/SearchTermReport.vue` |
| 4 | Settings | 13.5 | wide=9, 多 tab + 表格 | `apps/web-v2/src/pages/Settings.vue` |
| 5 | CampaignReport | 12.5 | overflow=5, wide=5 | `apps/web-v2/src/pages/CampaignReport.vue` |
| 6 | StrategyLibrary | 5.5 | wide=4, 9 类卡片网格 | `apps/web-v2/src/pages/StrategyLibrary.vue` |
| 7 | SqpReport | 5.5 | overflow=4, funnel 图 | `apps/web-v2/src/pages/SqpReport.vue` |
| 8 | Lifecycle | 5.0 | overflow=4, 4 阶段并列卡 | `apps/web-v2/src/pages/Lifecycle.vue` |

**改造模式**（所有 8 页统一）：
1. import `MobileFallback`
2. 若未引入 `useViewport` 则引入并取 `isMobile`
3. `<template>` 内最外层加 `<MobileFallback v-if="isMobile" ...>` + readonly slot（含「返回工作台」按钮）
4. 原有桌面模板包在 `<div v-else>` 内（**不删任何 desktop 代码**）
5. 对 `SearchTermReport / CampaignReport / SqpReport` — 因可被 `ReportsCenter` 以 `embedded` prop 嵌入，fallback 条件为 `v-if="isMobile && !embedded"`，避免 ReportsCenter 在 mobile 下嵌入它们再叠加 fallback（实际上 ReportsCenter 自己 mobile 已直接 fallback，所以子组件 fallback 只在直链访问时生效）

---

## 6. 步骤 2 中 3 ≤ score < 5 的页面（**本期不动**）

| Page | Score | 已有 Fallback? | 备注 |
|---|---|---|---|
| ScenarioSimulator | 4.5 | YES | T3 — fallback 已生效 |
| RepricingDecision | 4.5 | — | 接近阈值，建议下期跟进 |
| AdsTimeline | 4.5 | — | T1 一等公民，wide=4，建议改 KPI 网格 |
| Dayparting | 4.5 | YES | T3 — fallback 已生效（7×24 矩阵） |
| Workbench | 4.0 | — | T1 一等公民，overflow=3，建议局部修 |
| ProfitSkus | 3.5 | — | 边缘 — 下期跟进 |
| ResolutionCases | 3.5 | — | 边缘 |
| ReviewClusters | 3.5 | — | 边缘 |
| ImageDiff | 3.5 | — | 边缘 |

**理由**：本期严格遵循 score ≥ 5 阈值。3–5 区间多为「单个 chart / 4 列卡」类小问题，不属于"PC 密度不可用"程度。

---

## 7. score < 3 的页面（51 页，**不动**）

含全部 T1 / 大多数 T2 页：Workbench / Notifications / MonitorAnomalies / ProfitOverview / ListingOptimize / TaxAssist / PurchaseOrders / Playbook 等。其中已包 fallback 的：

| Page | Score | Fallback |
|---|---|---|
| TaxAssist | 2.5 | YES |
| Playbook | 2.5 | YES |
| Campaigns | 0.5 | YES |

剩余低分页均通过 ResponsiveTable / KPI 响应式网格已经移动友好。

---

## 8. 构建验证

```
cd D:/amz/apps/web-v2 && npm run build
✓ built in 6.16s
buildExit: 0
```

无错误。仅有一处既存的 chunk size 警告（index.js > 500 kB），与本期改动无关。

---

## 9. 关键约束确认

- 未动 router / api / composables / useM*State.js
- 未动后端
- 未动 SPEC 文档
- 未执行 git 操作
- 未 SSH
- 桌面端保持原样（v-else 完整包裹原模板）

---

## 10. 产物清单

| 类别 | 路径 |
|---|---|
| 审计脚本 | `D:/amz/tmp/mobile_audit.mjs` |
| 审计 JSON | `D:/amz/tmp/mobile_audit.json` |
| 截图目录 | `D:/amz/tmp/mobile_screens/` (17 张, score ≥ 3 各一) |
| Layout 改造 | `D:/amz/apps/web-v2/src/layouts/LxAdsLayout.vue` |
| Page 改造 (×8) | ReportsCenter / Audit / SearchTermReport / Settings / CampaignReport / StrategyLibrary / SqpReport / Lifecycle |
| 本报告 | `D:/amz/docs/MOBILE_AUDIT_REPORT.md` |
| DONE 哨兵 | `D:/amz/tmp/sentinels/p45-mobile-audit-fix.DONE` |

### 截图列表
```
00_Workbench.png            11_ProfitSkus.png         15_ScenarioSimulator.png
18_RepricingDecision.png    30_AdsTimeline.png        31_StrategyLibrary.png
32_ReportsCenter.png        33_SearchTermReport.png   34_CampaignReport.png
35_SqpReport.png            40_Lifecycle.png          45_Dayparting.png
54_ResolutionCases.png      59_ReviewClusters.png     64_ImageDiff.png
66_Audit.png                67_Settings.png
```

注：截图来自 **审计时刻**（修复前），可作为问题证据。修复后需重新部署 + 再跑审计验证（不在本阶段范围）。

---

## 11. 后续建议（非本阶段）

1. 中分页面 (3–5)：RepricingDecision / AdsTimeline / Workbench / ProfitSkus 等改 KPI 网格 + ResponsiveTable
2. 重新部署后跑 `node tmp/mobile_audit.mjs` 验证 score 是否归 0~1（fallback 生效后页面只剩外壳 + button）
3. 增加 Playwright e2e 用例：mobile 视口下访问 lx/* + 上述 8 页，断言 `text=桌面端推荐` 存在
