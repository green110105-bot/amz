# M1 商品 Listing 优化模块产品规格

**版本**：v1.0 · **日期**：2026-05-14 · **范围**：将老 M1 11 页 mock 重做为 3-Flow 线性工作流 + SQLite 持久化 + 真 API + 跨刷新一致

---

## 1. 现状诊断

### 1.1 老 M1 11 个页面逐项盘点

| # | 文件 | 当前职责 | 处置 |
|---|------|---------|------|
| 1 | `apps/web-v2/src/pages/ListingList.vue` | SKU 列表 + 评分概览 | **重做为 Flow 1** 优化目标选择 |
| 2 | `apps/web-v2/src/pages/ListingOptimize.vue` | 单 SKU 5 维评分 + 协商式生成 | **重做为 Flow 2** 核心优化室 |
| 3 | `apps/web-v2/src/pages/ListingExperiments.vue` | A/B 实验列表 + 采用 Winner | **重做为 Flow 3** A/B 中心 |
| 4 | `apps/web-v2/src/pages/ListingVersions.vue` | 单 SKU 历史版本 | **删除**，并入 Flow 2 版本块 |
| 5 | `apps/web-v2/src/pages/KeywordLibrary.vue` | 关键词库 | **保留不动** |
| 6 | `apps/web-v2/src/pages/CategoryTemplates.vue` | 类目模板 | **保留不动** |
| 7 | `apps/web-v2/src/pages/CategoryPains.vue` | 类目共性痛点 | **保留不动** |
| 8 | `apps/web-v2/src/pages/KeywordHeatmap.vue` | 关键词覆盖热力图 | **保留不动** |
| 9 | `apps/web-v2/src/pages/MultiLocale.vue` | 多语言母版 | **保留不动** |
| 10 | `apps/web-v2/src/pages/ScoringCalibration.vue` | 评分校准 | **保留不动** |

### 1.2 后端 gap
- `listings` 表只是 K-V blob；缺 5 维打分、多轮 run、版本、图片字段
- 没有调研报告 / 打分历史 / 多轮 run / 图片生成 prompt / A/B 实验持久化
- 没有 `m1_*` 前缀模块；M3 已有的 `data-store-ads.mjs` 风格未应用到 M1

### 1.3 后端待新增表（8 张，全 P0）
`m1_optimization_targets / m1_research_reports / m1_listing_scores / m1_optimization_runs / m1_listing_versions / m1_generated_images / m1_ab_tests / m1_ab_metrics`

---

## 2. 后端 8 张新表 DDL

**约定**：所有表 `(user_id, store_id)` 双分区；主键 `id TEXT PRIMARY KEY`；JSON 存 TEXT。写到新文件 `apps/api/src/data-store-listings.mjs` 的 `initListingsSchema(db)`。

### 2.1 m1_optimization_targets
```sql
CREATE TABLE IF NOT EXISTS m1_optimization_targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  mode TEXT NOT NULL,                  -- 'existing' | 'asin_input' | 'new_listing'
  product_id TEXT,
  asin TEXT,
  asin_kind TEXT,                      -- 'own' | 'external'
  is_competitor_only INTEGER DEFAULT 0,
  new_category TEXT,
  new_selling_points TEXT,             -- JSON array (3-5)
  new_target_audience TEXT,
  new_price_band TEXT,
  new_physical_specs TEXT,             -- JSON
  new_brand_positioning TEXT,
  new_target_keywords TEXT,            -- JSON array
  competitor_pool TEXT,                -- JSON array ASIN[]
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m1_targets_us ON m1_optimization_targets(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m1_targets_status ON m1_optimization_targets(user_id, store_id, status);
```

### 2.2 m1_research_reports
```sql
CREATE TABLE IF NOT EXISTS m1_research_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT, price_band TEXT,
  source_asins TEXT,                   -- JSON array
  title_pattern TEXT,                  -- JSON {theme, evidence, action}
  bullet_structure TEXT,
  main_image_visual TEXT,
  a_plus_structure TEXT,
  review_keywords TEXT,
  cached_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m1_research_us ON m1_research_reports(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m1_research_target ON m1_research_reports(user_id, store_id, target_id);
```

### 2.3 m1_listing_scores
```sql
CREATE TABLE IF NOT EXISTS m1_listing_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  scored_at TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  title_score INTEGER, title_detail TEXT,
  bullets_score INTEGER, bullets_detail TEXT,
  main_image_score INTEGER, main_image_detail TEXT,
  a_plus_score INTEGER, a_plus_detail TEXT,
  reviews_score INTEGER, reviews_detail TEXT,
  improvement_ranking TEXT             -- JSON array
);
CREATE INDEX IF NOT EXISTS idx_m1_scores_us ON m1_listing_scores(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m1_scores_target ON m1_listing_scores(user_id, store_id, target_id);
```

### 2.4 m1_optimization_runs
```sql
CREATE TABLE IF NOT EXISTS m1_optimization_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  feedback_text TEXT,
  marked_fields TEXT,                  -- JSON array
  style_short_long REAL DEFAULT 0.5,
  style_rational_emotional REAL DEFAULT 0.5,
  style_seo_natural REAL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending',
  version_id TEXT,
  generation_time_ms INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m1_runs_us ON m1_optimization_runs(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m1_runs_target ON m1_optimization_runs(user_id, store_id, target_id, round_no DESC);
```

### 2.5 m1_listing_versions
```sql
CREATE TABLE IF NOT EXISTS m1_listing_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  run_id TEXT,
  round_no INTEGER NOT NULL,
  source TEXT NOT NULL,                -- 'initial_import'|'ai_iteration'|'manual_edit'|'combined_pick'
  title TEXT,
  bullet_1 TEXT, bullet_2 TEXT, bullet_3 TEXT, bullet_4 TEXT, bullet_5 TEXT,
  description TEXT,
  a_plus_modules TEXT,                 -- JSON
  main_image_id TEXT,
  side_image_ids TEXT,                 -- JSON
  a_plus_image_ids TEXT,               -- JSON
  is_pinned INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  uploaded_to_amazon INTEGER DEFAULT 0,
  uploaded_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m1_versions_us ON m1_listing_versions(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m1_versions_target ON m1_listing_versions(user_id, store_id, target_id, round_no DESC);
```

### 2.6 m1_generated_images
```sql
CREATE TABLE IF NOT EXISTS m1_generated_images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  version_id TEXT,
  slot TEXT NOT NULL,                  -- 'main'|'side_1'..'side_4'|'a_plus_<i>'
  prompt TEXT NOT NULL,
  ref_image_url TEXT,
  style_ref_asin TEXT,
  model TEXT DEFAULT 'imagen-2',
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  generated_url TEXT,
  post_processed INTEGER DEFAULT 0,
  error_message TEXT,
  generation_time_ms INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m1_images_us ON m1_generated_images(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m1_images_version ON m1_generated_images(user_id, store_id, version_id);
```

### 2.7 m1_ab_tests
```sql
CREATE TABLE IF NOT EXISTS m1_ab_tests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  asin TEXT NOT NULL,
  test_type TEXT NOT NULL,             -- 'title'|'main_image'|'a_plus'|'manual'
  amazon_experiment_id TEXT,
  control_version_id TEXT NOT NULL,
  treatment_version_id TEXT NOT NULL,
  duration_days INTEGER DEFAULT 14,
  started_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  winner TEXT,
  lift REAL,
  significance REAL,
  manual_guidance TEXT,
  audit_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m1_ab_us ON m1_ab_tests(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m1_ab_status ON m1_ab_tests(user_id, store_id, status);
```

### 2.8 m1_ab_metrics
```sql
CREATE TABLE IF NOT EXISTS m1_ab_metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  ab_test_id TEXT NOT NULL,
  date TEXT NOT NULL,
  arm TEXT NOT NULL,                   -- 'control'|'treatment'
  impressions INTEGER, clicks INTEGER, orders INTEGER, units INTEGER,
  ctr REAL, cvr REAL, sales REAL,
  raw TEXT
);
CREATE INDEX IF NOT EXISTS idx_m1_metrics_us ON m1_ab_metrics(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m1_metrics_test ON m1_ab_metrics(user_id, store_id, ab_test_id, date);
```

### 2.9 种子数据
`seedSampleStoreData()` 末尾追加 `seedM1Listings(db, userId, storeId)`：
- 2 个 mode='existing' targets（CASE-001 / CABLE-002）
- 1 个 mode='asin_input' external ASIN → 对标池
- 1 个 mode='new_listing' draft
- 1 份 cached research_report (7 天有效)
- 2 份 listing_scores
- 1 个 target 已有 3 轮 runs + versions + 5 images
- 1 个 A/B test 已跑 7 天 mock metrics
- `removeUserStore()` 联动清理 8 张新表

---

## 3. 后端 API 契约（30 endpoints）

**约定**：`/api/v1/store/m1/*` 前缀；Bearer + X-Store-Id；写操作走 `appendAuditLog(sourceModule='M1')`；新文件 `apps/api/src/store-routes-listings.mjs`。

### 3.1 Flow 1 — Targets (5)
1. `GET /api/v1/store/m1/targets?status=&mode=`
2. `GET /api/v1/store/m1/targets/:id`
3. `POST /api/v1/store/m1/targets` — body `{mode, productId?, asin?, new_*?}`；mode='asin_input' 自动识别 own/external
4. `PUT /api/v1/store/m1/targets/:id`
5. `DELETE /api/v1/store/m1/targets/:id`

### 3.2 Flow 2 — Research (3)
6. `POST /api/v1/store/m1/research/trigger` — `{targetId, competitorAsins?}`；缓存 7 天
7. `GET /api/v1/store/m1/research/:targetId`
8. `DELETE /api/v1/store/m1/research/:targetId/cache` — 强制刷新

### 3.3 Flow 2 — Scores (2)
9. `POST /api/v1/store/m1/scores/trigger` — `{targetId}`；mode='new_listing' → 400 `scoring_not_applicable`
10. `GET /api/v1/store/m1/scores/:targetId`

### 3.4 Flow 2 — Runs (4)
11. `POST /api/v1/store/m1/runs` — `{targetId, feedbackText?, markedFields?, styleToggles?}`；第 2+ 轮只重写 markedFields
12. `GET /api/v1/store/m1/runs?targetId=`
13. `GET /api/v1/store/m1/runs/:id`
14. `POST /api/v1/store/m1/runs/:id/rewrite-field` — `{field, feedback?}`

### 3.5 Flow 2 — Versions (6)
15. `GET /api/v1/store/m1/versions?targetId=&includeArchived=`
16. `GET /api/v1/store/m1/versions/:id`
17. `POST /api/v1/store/m1/versions/:id/pin` — `{pinned}`
18. `DELETE /api/v1/store/m1/versions/:id` — 阻止 round_no=1
19. `POST /api/v1/store/m1/versions/diff` — `{versionAId, versionBId}`
20. `POST /api/v1/store/m1/versions/combined-pick` — `{targetId, fieldPicks}`

### 3.6 Flow 2 — Images (3)
21. `POST /api/v1/store/m1/images/generate` — `{targetId, versionId, slot, prompt, refImageUrl?, styleRefAsin?}`；mock 占位图 < 500ms
22. `GET /api/v1/store/m1/images?versionId=`
23. `POST /api/v1/store/m1/images/:id/regenerate` — `{prompt?, refImageUrl?, styleRefAsin?}`

### 3.7 Flow 3 — A/B (7)
24. `POST /api/v1/store/m1/ab` — `{targetId, testType, controlVersionId, treatmentVersionId, durationDays?}`；testType ∉ {title,main_image,a_plus} → status='manual_required' + manualGuidance
25. `GET /api/v1/store/m1/ab?status=&targetId=`
26. `GET /api/v1/store/m1/ab/:id`
27. `POST /api/v1/store/m1/ab/:id/start`
28. `POST /api/v1/store/m1/ab/:id/abort`
29. `GET /api/v1/store/m1/ab/:id/metrics`
30. `POST /api/v1/store/m1/ab/:id/adopt-winner`

### 3.8 错误码
- 401 `unauthorized`
- 404 `not_found`
- 400 `validation_failed` / `scoring_not_applicable` / `external_asin_cannot_optimize`
- 409 `conflict`
- 422 `manual_required`

---

## 4. 前端改造清单

### 4.1 新增文件
- `apps/web-v2/src/api/m1.js` — 7 个 namespace：`targetsApi / researchApi / scoresApi / runsApi / versionsApi / imagesApi / abApi`
- `apps/web-v2/src/composables/useM1State.js` — `useTargets / useTargetFlow(targetId) / useVersions / useAbTests`

### 4.2 重做 3 页
| 路由 | 文件 |
|------|------|
| `/listings/select` | `pages/ListingSelect.vue` (新建) |
| `/listings/optimize/:id` | `pages/ListingOptimize.vue` (重写) |
| `/listings/ab` | `pages/ListingAbCenter.vue` (新建) |

### 4.3 新组件（`apps/web-v2/src/components/m1/`）
- `ResearchBlock.vue`
- `ScoreBlock.vue`
- `GenerationBlock.vue`
- `ImagePromptEditor.vue`
- `VersionBlock.vue`
- `ListingDiff.vue`

### 4.4 删除 1 页 + 路由清理
- 删 `pages/ListingVersions.vue` + 路由 `/listings/versions`
- 修改其他文件中 `/listings/optimize` 跳转为 `/listings/optimize/:id`

### 4.5 跨刷新一致
- URL query：`/listings/select?mode=1` ；`/listings/optimize/:id?focus=score|generation|versions` ；`/listings/ab?status=running`
- localStorage：`m1_draft_prompt_<imageId>` 与 `m1_draft_new_listing`

---

## 5. 10 个核心测试场景（每个 5+ 次）

1. **Mode 1 选已有 listing → 5 维度打分入库**
2. **Mode 2 输入外部 ASIN → 仅进对标池**，POST /m1/runs 返 400 `external_asin_cannot_optimize`
3. **Mode 3 全新 listing → 跳过打分**，scores/trigger 返 400 `scoring_not_applicable`
4. **多轮生成：第 1 轮全字段，第 2 轮只改运营标红字段**（未碰过的字段 byte-identical）
5. **图片生成 5 张（1 主 + 4 副），prompt 可编辑再生成**
6. **版本管理：5 轮后第 6 轮自动折叠最早版本**；pin 后阻止归档
7. **版本 diff：左旧右新双栏 + 字段高亮**
8. **挑各版的最佳字段组合上传** → source='combined_pick' + audit M1_LISTING_UPLOAD
9. **A/B 测试创建 + 5 天 mock metrics + 显著性判定**；testType='bullets' 返 422 manual_required
10. **全流程跨 F5 一致**：3 个 version 卡片仍在，5 张图缩略图正常，prompt textarea 内容回填

每个场景含 curl + SQL 双验证。

---

## 6. 验收标准（DoD）

### 后端
- 8 张表 + 索引跨重启存活
- 30 endpoints 401/404/400/200/201 路径正确
- 每个写操作 `appendAuditLog(sourceModule='M1')`
- 删店铺联动清理 8 张表
- 种子：登录 demo 看 ≥3 targets + 2 scores + 1 cached research + 3 versions + 5 images + 1 running A/B

### 前端
- `npm run build` 通过，0 mock-data import 残留于 M1 区
- 3 Flow 页 onMounted 调真 API；6 资源页保留不动
- 跨 F5：URL query / 草稿 localStorage / 选中 targetId / tab / 风格 toggle 全保留

### 性能
- 调研 / 打分 p95 < 1.5s
- 图片生成 mock < 500ms
- 版本 diff < 200ms
- A/B metrics 列表 < 200ms

### 测试
- 10 场景每个 5+ 次 0 failures
- 5 维打分确定性：连续 trigger 5 次 total_score 完全相等

---

## 7. 工程量估算

| Sprint | 内容 | 工时 |
|---|---|---|
| 1 | 后端 DDL + targets/research/scores | 3-4h |
| 2 | 后端 runs/versions/images | 3-4h |
| 3 | 后端 A/B + mock metrics | 2-3h |
| 4 | 前端 m1.js API + useM1State | 2h |
| 5 | 前端 Flow 1 ListingSelect | 2h |
| 6 | 前端 Flow 2 ListingOptimize + 6 组件 | 4-5h |
| 7 | 前端 Flow 3 ListingAbCenter | 2h |
| 8 | 跨刷新 / URL query / 草稿 | 1.5h |
| 9 | QA 10 场景 + 修 bug | 3-4h |
| **总计** | — | **~22-28h，6 agents 并行 ≈ 3.5-4h 钟表** |

新增 13 文件 + 改 6 文件 ≈ **3500 行**

---

## 8. 关键风险

1. own/external ASIN 识别靠当前店铺 listings 表 ASIN 匹配 — 测试前先种子 ≥2 本店 listings
2. mock Imagen 占位图用 `https://picsum.photos/seed/<imageId>/1500/1500`（deterministic）
3. 多轮 markedFields 保留：deep-copy 上一轮 version，只覆盖 markedFields
4. A/B significance 用 z-test 公式：`z = (cvrT - cvrC) / sqrt(p(1-p)(1/nT+1/nC))`，|z|>1.96 → winner
5. combined-pick 幂等键：`(target_id, source='combined_pick', fieldPicks hash)`
6. store 切换：清 URL query + 清 `m1_draft_*`
7. research cache 7 天，强制刷新走 DELETE
8. 删除 round_no=1 阻止（防止误删 baseline）
