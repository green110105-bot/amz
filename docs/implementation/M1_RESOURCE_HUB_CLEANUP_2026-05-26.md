# M1 Resource Hub Cleanup（2026-05-26）

## 1. 背景

用户指出 `商品 · 资源库` 里的 `关键词热力图`、`多语言母版` 没有实际运营价值。复核当前 M1 后，问题本质不是资源太少，而是把“资料页 / 漂亮图表 / 未来概念”直接暴露给运营，导致用户不知道这些页面如何帮助一个真实 Amazon Listing 上线、优化和复盘。

本轮目标：

- 去掉无用入口，不让它们继续占用主导航。
- 保留对 Listing 作战室有直接作用的素材能力。
- 把“资源库”改成“素材规则中心”：每条素材必须能约束具体字段、检查项或评分规则。
- 旧 URL 不 404，避免外部链接和测试环境被打断。

## 2. 三轮产品判断

### Round 1：哪些应该下线

- `关键词热力图`：如果脱离具体标题、五点、Description、A+、图片脚本字段，只是在看覆盖颜色；真实运营需要的是字段级关键词矩阵、缺口、否词冲突和 keyword stuffing 风险，这些已经属于 Listing 作战室 D1 检查。
- `多语言母版`：在没有真实站点 Catalog、Product Type Definition、Brand Registry 审核、本地化属性和站点转化数据时，它只是翻译表；多站点能力未来应挂在单个 ASIN 的版本管理里，而不是作为独立资源库入口。

结论：两个页面从日常流程下线，旧路径重定向到新中心并说明原因。

### Round 2：哪些应该保留

保留项必须满足“能直接进入作战室”的标准：

1. **关键词护栏**：主词、否词、类目必备词，约束标题/五点/A+ 与 D1 评分。
2. **类目发布规则**：标题公式、必填属性、认证、9 槽图片矩阵、A+ 必备模块。
3. **VOC 痛点库**：从 Review/竞品差评转成预防性卖点、图片脚本、FAQ。
4. **评分规则校准**：把 AI 五维评分和人工经验、A/B CVR lift 对齐。

结论：这些旧页面不再在侧边栏平铺，而是作为新中心的深链工具。

### Round 3：最终体验

运营的主流程应变为：

1. 在 `M1 素材规则中心` 收口素材。
2. 在 `Listing 作战室` 选择 SKU 并加载这些素材。
3. 通过发布前检查、版本、A/B 和真实数据回写来校准素材。

因此，`商品 · 资源库` 这个导航组被移除，`素材规则中心` 作为 M1 主流程的一部分出现。

## 3. 已落地改造

### 3.1 新增单入口

- 新增页面：`apps/web-v2/src/pages/M1ResourceHub.vue`
- 新路由：`/listings/resources`
- 导航位置：`商品 · 主流程 (M1)`
- 页面包含：
  - 作战室补给线定位说明。
  - 关键词护栏、类目发布规则、VOC 痛点库、评分规则校准 4 个工具卡。
  - “日常用法”：收口素材 -> 进入作战室 -> 真实结果反哺。
  - “素材如何进入 Listing 作战室”：素材来源与字段/检查项映射。
  - “已下线”：说明 `关键词热力图` 和 `多语言母版` 为什么不再作为日常入口。

### 3.2 路由收口

更新：`apps/web-v2/src/router/index.js`

- `/listings/resources` 进入 `M1ResourceHub`，并显示在 `m1-main`。
- `/listings/keywords-library`、`/listings/templates`、`/listings/category-pains`、`/listings/calibration` 保留为深链工具，但不再属于任何 sidebar group。
- `/listings/keyword-heatmap` 重定向到 `/listings/resources?retired=keyword-heatmap`。
- `/listings/multi-locale` 重定向到 `/listings/resources?retired=multi-locale`。

### 3.3 侧边栏收口

更新：`apps/web-v2/src/layouts/DefaultLayout.vue`

- 移除 `m1-resources` 分组。
- 移除 `商品 · 资源库` 导航组。
- M1 主流程现在包含目标选择、优化室、A/B 测试中心、素材规则中心。

### 3.4 契约测试

新增：`tests/qa/m1-resource-hub-contract.test.mjs`

覆盖：

- M1 资源能力是否收口到 `/listings/resources`。
- 侧边栏是否不再出现 `商品 · 资源库` / `m1-resources`。
- `关键词热力图`、`多语言母版` 是否被重定向而非继续暴露。
- 有用资源页是否保留深链但不进入主导航。
- 新中心页是否包含四类有效素材、日常用法、作战室映射和下线说明。

## 4. 设计边界

- 不删除旧 Vue 文件，避免仓库历史和外部测试出现硬断裂。
- 不让下线功能继续进入主导航。
- 不把低频配置伪装成运营日常任务。
- 不新增真实 Amazon 写入；仍沿用现有 mock / adapter / audit 边界。
- 不重写 M1 作战室已有工作流，只调整资源入口与信息架构。

## 5. 后续接真实 Amazon 数据时的落点

- 搜索词报告、SQP、广告搜索词进入 `关键词护栏`，由运营确认主词/否词/必备词。
- Product Type Definitions、Listing Items、Catalog 属性进入 `类目发布规则`。
- Review、退货原因、竞品差评进入 `VOC 痛点库`。
- A/B、CVR、Unit Session Percentage、退货率、广告转化进入 `评分规则校准`。
- 多站点本地化未来应作为单个 Listing 的版本分支，不应恢复为独立的 `多语言母版` 顶层页。

## 6. 验收标准

- 主导航不再出现 `商品 · 资源库`。
- 主导航不再出现 `关键词热力图`、`多语言母版`。
- `/listings/resources` 成为 M1 资源唯一主入口。
- 四个有效工具仍可从新中心进入。
- 旧无用 URL 有明确下线说明，不 404。
- 契约测试和 web 构建通过。

## 7. 本地验证

- `node --test --test-concurrency=1 tests/qa/m1-resource-hub-contract.test.mjs`：4/4 PASS。
- `node --test --test-concurrency=1 tests/qa/m1-frontend-workbench-contract.test.mjs`：4/4 PASS。
- `node --test --test-concurrency=1 tests/qa/m2-m4-workbench-ia-contract.test.mjs`：4/4 PASS，确认本轮未破坏上一轮信息架构收口。
- `npm.cmd run build`（`apps/web-v2`）：PASS；仅保留 Vite/Rollup 已有大 chunk 与 VueUse pure annotation warning。
