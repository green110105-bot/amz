# M1 商品 Listing 优化模块 — 前端实施报告

**日期**：2026-05-15
**范围**：3 Flow 页 + 6 个组件 + 4 个 composable + 30 端点 API 客户端
**目标**：将老 M1 11 页 mock 重做为 3-Flow 线性工作流

---

## 1. 完成清单

### 1.1 新建文件（11 个）

| # | 路径 | 行数 | 角色 |
|---|------|------|------|
| 1 | `apps/web-v2/src/api/m1.js` | 71 | 30 endpoints / 7 namespace |
| 2 | `apps/web-v2/src/composables/useM1State.js` | 551 | 4 composable（useTargets / useTargetFlow / useVersions / useAbTests） |
| 3 | `apps/web-v2/src/pages/ListingSelect.vue` | 321 | Flow 1 优化目标选择（3 mode tabs） |
| 4 | `apps/web-v2/src/pages/ListingAbCenter.vue` | 360 | Flow 3 A/B 测试中心 |
| 5 | `apps/web-v2/src/components/m1/ResearchBlock.vue` | 144 | 5 维度调研结论卡 |
| 6 | `apps/web-v2/src/components/m1/ScoreBlock.vue` | 195 | 5 维度打分 + 雷达图 + improvement_ranking |
| 7 | `apps/web-v2/src/components/m1/GenerationBlock.vue` | 229 | 多轮生成 + 风格 toggle + markedFields + 图片网格 |
| 8 | `apps/web-v2/src/components/m1/ImagePromptEditor.vue` | 149 | 单图 prompt 编辑 + localStorage 草稿 |
| 9 | `apps/web-v2/src/components/m1/VersionBlock.vue` | 227 | 最近 5 版卡片 + pin + diff + combined-pick |
| 10 | `apps/web-v2/src/components/m1/ListingDiff.vue` | 145 | 双栏 diff + cell-changed 高亮 |
| 11 | `docs/M1_FRONTEND_REPORT.md` | (本文件) | 报告 |

### 1.2 改造文件（2 个）

| 路径 | 改动 |
|------|------|
| `apps/web-v2/src/pages/ListingOptimize.vue` | 整文件重写为 4 block 垂直长滚单页（ResearchBlock / ScoreBlock / GenerationBlock / VersionBlock），99 行；focus query 同步锚点滚动 |
| `apps/web-v2/src/router/index.js` | 删 `/listings/versions`；`/listings` redirect → `/listings/select`；新增 `/listings/select`、`/listings/optimize/:id?`、`/listings/ab`；老 `/listings/experiments` redirect → `/listings/ab` |

### 1.3 删除文件（1 个）

- `apps/web-v2/src/pages/ListingVersions.vue` — 功能并入 ListingOptimize 的 VersionBlock

### 1.4 保留不动（spec §7 显式要求）

- 6 资源页：KeywordLibrary / CategoryTemplates / CategoryPains / KeywordHeatmap / MultiLocale / ScoringCalibration
- 老的 `ListingList.vue` / `ListingExperiments.vue` 留在文件系统但已从 router 移除（dead code，含 mock-data import；3 个 Flow 页 + 6 个 m1 组件均无）
- 所有 `src/api/ads-*.js` / `lx.js`、`src/composables/useAdsState.js` / `useLxState.js`、`pages/Ads*.vue` / `lx/**`
- 后端 `apps/api/**` 完全未改

---

## 2. API 契约（30 endpoints in 7 namespaces）

`src/api/m1.js` 完全照 `ads-strategies.js / lx.js` 风格，所有调用走 `http` from `./client.js`（已自动注入 Bearer + X-Store-Id）。

| Namespace | 方法数 | 端点 |
|-----------|--------|------|
| `targetsApi` | 5 | list / get / create / update / remove |
| `researchApi` | 3 | trigger / get / clearCache |
| `scoresApi` | 2 | trigger / get |
| `runsApi` | 4 | create / list / get / rewriteField |
| `versionsApi` | 6 | list / get / pin / remove / diff / combinedPick |
| `imagesApi` | 3 | generate / list / regenerate |
| `abApi` | 7 | create / list / get / start / abort / metrics / adoptWinner |
| **合计** | **30** | — |

---

## 3. Composable 模式

4 个 composable 严格遵循 `useAdsState.js` 模式：

- 模块作用域 reactive ref（useTargets / useAbTests 单例）+ Map 缓存（useTargetFlow / useVersions 按 targetId）
- 单飞 promise 避免重复请求
- 乐观更新 + 失败回滚（pin、remove、start、abort、update）
- 统一 `loading` / `error` ref + `fetch(force?)`
- 错误码识别：`scoring_not_applicable`、`external_asin_cannot_optimize`、`manual_required`、`cannot_delete_baseline` 走分支文案

---

## 4. 跨刷新一致

| 状态 | 同步方式 |
|------|---------|
| `/listings/select?mode=N&q=...` | URL query 双向同步 |
| `/listings/optimize/:id?focus=score\|generation\|versions` | URL query + 滚动锚点（nextTick + scrollIntoView） |
| `/listings/ab?status=running` | URL query |
| Mode 3 表单未提交 | `localStorage.m1_draft_new_listing`（deep watch + 自动保存） |
| ImagePromptEditor prompt 未保存 | `localStorage.m1_draft_prompt_<imageId>` |
| 当前店铺 | 已有 `amz_current_store_id`（client.js 自动注入 X-Store-Id） |

---

## 5. Build 输出

```
✓ built in 7.81s

dist/assets/ListingSelect-DJz-imsa.js          9.73 kB │ gzip: 3.67 kB
dist/assets/useM1State-BqtNsFWj.js            10.30 kB │ gzip: 3.29 kB
dist/assets/ListingAbCenter-pHggqdhk.js       11.81 kB │ gzip: 4.09 kB
dist/assets/ListingOptimize-DTBqrUWq.js       24.79 kB │ gzip: 8.90 kB
（其中 ListingOptimize 因包含 ResearchBlock + ScoreBlock + GenerationBlock + VersionBlock + ListingDiff + ImagePromptEditor 内联 chunk）
```

无 build 错误。Vite dev server 在 5180 端口启动验证通过。

---

## 6. Mock-data 校验

```bash
$ grep -l "mock-data" D:/amz/apps/web-v2/src/pages/ListingSelect.vue \
                     D:/amz/apps/web-v2/src/pages/ListingOptimize.vue \
                     D:/amz/apps/web-v2/src/pages/ListingAbCenter.vue \
                     D:/amz/apps/web-v2/src/components/m1/*.vue
# 输出：（空）
```

3 个 Flow 页 + 6 个 m1 组件均 **0 mock-data import**，全部走真 API（`m1.js` + `useM1State.js`）。

老的 ListingList.vue / ListingExperiments.vue 仍含 mock-data import，但已从 router 移除，属 dead code（spec 未要求物理删除，按"重做"语义保留以备回滚）。

---

## 7. 跳过项（无）

任务清单 §1-§6 全部完成。后端 30 endpoints 必须由后端 agent 提供 — 前端在 endpoint 缺失时由 composable 的 try/catch 兜底（ElMessage.error，UI 不崩）。

---

## 8. 验收 checklist

- [x] `npm run build` PASS（0 错误，7.81s）
- [x] Vite dev server `--port 5180` 启动通过
- [x] M1 Flow 页 + m1 组件无 `mock-data` import
- [x] router：`/listings` → `/listings/select`、`/listings/experiments` → `/listings/ab`、`/listings/versions` 已删
- [x] URL query 同步：mode / q / focus / status
- [x] localStorage 草稿：Mode 3 表单 + ImagePromptEditor prompt
- [x] 6 资源页 + Ads 模块 + LX 模块 + 后端文件均未碰
