# M1 Production Listing War Room Upgrade（2026-05-25）

## 1. 背景与目标

用户指出旧 M1 “不像给人类使用”，尤其是图片展示过少、没有按真实 Amazon Listing 和真实运营流程思考。此次升级把 M1 从“文本生成/版本列表”推进为 **Listing 作战室**：运营进入一个目标后，能按真实工作顺序完成“诊断 -> 调研 -> 改写 -> 图片/A+ -> 合规 -> 发布前检查 -> 版本/实验”的闭环。

核心目标不是把 mock 做漂亮，而是让系统在未来接入真实 Amazon SP-API、Listings Items、Product Type Definitions、Catalog、图片资产、评论、广告归因后，仍然沿用同一套业务目标和交互结构，不会忘记最终要做什么。

## 2. PM 与产品经理 12 轮共识摘要

> 本轮按照用户要求，由 PM-Architect 与 Product Manager subagent 做了 10 轮以上讨论，最终收敛到以下共识。

1. **M1 默认入口必须回答“今天这个 Listing 要怎么改”**，而不是先让用户看一堆字段。
2. **图片不是几张头图**，Amazon Gallery 需要 MAIN + PT01-PT08，每个槽位有明确转化任务。
3. **A+、Video、360 不是装饰**，而是承接品牌信任、规格对比、FAQ 和高价解释。
4. **标题/五点/描述/后台词必须和关键词矩阵联动**，每个主词要看到出现位置、缺口、堆砌风险。
5. **变体和类目属性是发布成功的硬门槛**，不能只改文案；未来必须对接 Product Type Definitions。
6. **外部 ASIN 必须只读**，只能做竞品对标，不能进入发布或写入流程。
7. **发布前检查必须可审计**，任何 publish-like 动作都应进入 Audit Center。
8. **合规必须字段级定位**，包括绝对化、医疗、认证、竞品商标、保修承诺等风险。
9. **版本管理必须支持 Diff 和组合挑选**，运营经常要从多个版本拼出最好的一版。
10. **实验与复盘不能脱节**，A/B、图片/标题实验和 7/14/30 天结果应回到 M1 学习。
11. **Mock 必须带 source/confidence**，避免未来替换真实数据时混淆。
12. **界面要按人类运营的心智组织**：作战档案、竞品证据、评分、编辑、图片矩阵、合规、发布前检查、版本。

## 3. 真实运营流程模型

### 3.1 Listing 作战室流程

1. 选择目标：已有店铺 Listing / ASIN 识别 / 新建 Listing 简报。
2. 拉取快照：SKU、ASIN、类目、变体、属性、价格带、竞品池、source/confidence。
3. 竞品与 VOC 调研：标题结构、五点结构、主图视觉、A+ 结构、评论关键词。
4. 评分与差距：标题、五点、Gallery、A+、VOC 五维度评分。
5. 文案编辑：Title、Bullet 1-5、Description、Backend Search Terms。
6. 关键词矩阵：P0/P1/P2、覆盖位置、缺口、堆砌、否定冲突。
7. 图片矩阵：MAIN + PT01-PT08，每个槽位有 role/intent/requirement/prompt/status。
8. 增强内容：A+ 模块、短视频 brief、360 展示 brief。
9. 合规闸门：字段级风险、修复建议、blocked/review/pass。
10. 发布前检查：ownership、version、title、bullets、description、search terms、image matrix、A+、variation attributes、compliance、keyword coverage。
11. 版本与实验：最近 5 版、Diff、组合挑选、A/B 测试。
12. 审计与回滚：真实写入前必须走 audit / dry-run / approval / rollback。

### 3.2 图片槽位定义

| 槽位 | 角色 | 真实运营目的 |
|---|---|---|
| MAIN | 主图白底 | 获得点击，满足白底、主体占比、无角标水印 |
| PT01 | 核心卖点图 | 3 秒说明为什么买 |
| PT02 | 场景生活图 | 让买家代入真实使用场景 |
| PT03 | 功能拆解图 | 解释结构、功能、证据 |
| PT04 | 尺寸/兼容图 | 降低误购、退货、差评 |
| PT05 | 材质细节图 | 支撑质感、价格和可信度 |
| PT06 | 对比/选择图 | 帮买家选择自有型号/规格 |
| PT07 | 安装/开箱图 | 降低上手焦虑 |
| PT08 | 信任/FAQ 图 | 回答最后阻碍，承接售后/保养/常见问题 |

## 4. 已落地的后端能力

文件：`apps/api/src/data-store-listings.mjs`、`apps/api/src/store-routes-listings.mjs`

新增 production-readiness workbench API：

- `GET /api/v1/store/m1/workbench/:targetId`
- `POST /api/v1/store/m1/readiness/check`
- `GET /api/v1/store/m1/assets/matrix?targetId=&versionId=`
- `GET /api/v1/store/m1/keywords/coverage?targetId=&versionId=`
- `GET /api/v1/store/m1/compliance/:targetId?versionId=`

后端已覆盖：

- 9 个 Gallery 槽位 + A+ + video/360 placeholder。
- Keyword coverage：primary terms、long-tail、competitor gap、stuffing、negative conflicts。
- Compliance risk：医疗、绝对化、竞品商标、认证、保修承诺。
- Readiness：发布前 blocked/pass，外部 ASIN 只读阻断，A+、图片矩阵、变体属性阻断。
- Audit：`M1_READINESS_CHECK` 写入审计日志。
- Workbench 聚合：target/version/readiness/assets/keywords/compliance/variation。

## 5. 已落地的前端能力

文件：

- `apps/web-v2/src/api/m1.js`
- `apps/web-v2/src/composables/useM1State.js`
- `apps/web-v2/src/pages/ListingSelect.vue`
- `apps/web-v2/src/pages/ListingOptimize.vue`
- `apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue`
- `apps/web-v2/src/components/m1/ResearchBlock.vue`
- `apps/web-v2/src/components/m1/ScoreBlock.vue`
- `apps/web-v2/src/components/m1/GenerationBlock.vue`
- `apps/web-v2/src/components/m1/VersionBlock.vue`
- `apps/web-v2/src/components/m1/ListingDiff.vue`

前端升级：

- `ListingSelect`：清晰三模式入口；外部 ASIN 只读；新建 Listing 简报按运营信息收集。
- `ListingOptimize`：升级为“Listing 作战室”，提供作战室、调研、评分、文案/素材、图片矩阵、合规、发布前检查、版本锚点。
- `ListingWorkbenchPanel`：展示商品作战档案、变体属性、关键词矩阵、9 槽图片预览、合规风险、发布前检查。
- `GenerationBlock`：文案编辑、字段标记、AI 重写、关键词覆盖、9 槽图片生成、A+/Video/360 brief、AI 风格控制。
- `ResearchBlock`：竞品和 VOC 调研结构化展示。
- `ScoreBlock`：五维评分与优先改进项。
- `VersionBlock` / `ListingDiff`：最近 5 版、Diff、组合挑选最佳字段。
- `m1.js`：新增 workbench normalizer，兼容后端 workbench 形态，也能在 API 缺失时生成 deterministic fallback，且带 source/confidence/mock。

## 6. 未来真实 Amazon 数据接入点

| 真实数据 | 进入 M1 的位置 | 当前替代 |
|---|---|---|
| SP-API Listings Items | 当前 Listing 文案、属性、变体、发布结果 | `m1_listing_versions` + target mock |
| Product Type Definitions | 类目必填属性、变体主题、校验规则 | `variation.requiredCategoryAttributes` mock |
| Catalog Items | 标题、品牌、图片、ASIN 元数据 | products/listings seed |
| Listings Restrictions / Feed validation | 发布前阻断原因 | readiness mock rules |
| Brand Registry / A+ Content | A+ 模块、实验资格 | aPlus modules placeholder |
| Product Images / Media | MAIN/PTxx/Video/360 资产 | `m1_generated_images` picsum mock |
| Reviews / Customer Voice | VOC、差评痛点、FAQ | `m1_research_reports.review_keywords` |
| Amazon Ads / SQP | 关键词流量、转化、广告承接 | M3/M1 后续跨模块 evidence |
| Manage Your Experiments | 标题/主图/A+ A/B 实验 | `m1_ab_tests` mock z-test |

## 7. 发布安全边界

- 外部 ASIN 永远只读，不能直接生成 publish-ready。
- 真实 Amazon 写入默认关闭，必须经过显式凭证、dry-run、approval、audit、rollback。
- 当前 M1 readiness 是 mock-gated preflight，不等同真实 Amazon 发布成功。
- 所有 mock/fallback 均通过 `sourceMeta.source/confidence/mock` 标记。
- 发布前检查会写审计，作为未来真实写入闸门的基础。

## 8. 验证证据

本地已完成：

- `npm.cmd run build` in `apps/web-v2`：PASS。
- `node --check apps/api/src/data-store-listings.mjs`：PASS。
- `node --check apps/api/src/store-routes-listings.mjs`：PASS。
- `node --test --test-concurrency=1 tests/qa/m1-production-readiness.test.mjs`：7/7 PASS。
- `node --test --test-concurrency=1 tests/qa/m1-button-level.test.mjs`：94/94 PASS。
- `node --test --test-concurrency=1 tests/domain/m1-iteration-engine.test.mjs tests/domain/listing-engine.test.mjs tests/mock-scenarios/asin-listing-benchmark.test.mjs`：15/15 PASS。
- `node --test --test-concurrency=1 tests/qa/m1-frontend-workbench-contract.test.mjs`：4/4 PASS。

## 9. 当前剩余边界

- M1 已具备生产级 mock-gated 工作流，但真实 SP-API Listings 写入、PTD 校验、A+ 发布、Manage Your Experiments 仍需真实凭证和 Amazon 权限。
- 旧历史文档存在编码乱码，本轮新增/修改的 M1 前端文件已通过 contract test 排除 `???` 和常见 mojibake。
- 真图生成当前仍是 mock/picsum 或已有 `m1_generated_images`，未来需要接入真实素材库、AI 生图和上传审核链路。
- 真正发布到 Amazon 仍必须保持人工确认 + 审计中心，不允许在 M1 UI 里绕过安全闸门。
