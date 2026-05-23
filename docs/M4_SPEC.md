# M4 监控 / 评价 / 申诉 / 恢复 / 跟卖 / 侵权 / 竞品 / 通知 模块产品规格

**版本**：v1.0 · **日期**：2026-05-15 · **范围**：将老 M4 16 个 mock 页面重构为 SQLite 持久化 + 真 API + 跨刷新一致 + 全局通知总线 + 跨模块联动（M1/M2/M3 ↔ M4）

---

## 1. 现状诊断

### 1.1 老 M4 16 个页面逐项盘点

| # | 文件 | 当前职责 | 当前 mock 源 | 关键字段 | 当前可见操作（mock） | 当前问题 |
|---|------|---------|----------|---------|-------------------|--------|
| 1 | `pages/MonitorAnomalies.vue` | 22 类异常列表 + AI 根因 + 处置建议 | `monitorApi.overview()` 真请求 → `routes.mjs` 返回 mock `buildMonitorOverview` | id / type / severity (P0/P1/P2) / sku / asin / evidence / recommendedAction / slaMinutes | 仅展示，不可分派 / 处置 / 标已读 | 没有 `m4_*` 表落地；刷新即丢；无 assignee / status / slaDeadline |
| 2 | `pages/SLABoard.vue` | 团队 SLA 看板 + 个人绩效 | `mock-data-extras.mockSLA` | todayStats / team[].user / avgResponseMin / slaRate | 只读卡片 | 全 mock，无 SLA 计时 / 自动升级 / 个人数据 |
| 3 | `pages/ResolutionCases.vue` | 历史成功处置案例库 | `mock-data-extras.mockResolutionCases` | anomalyType / scenario / action / outcome / status | 搜索过滤 | 没有"从异常发起 case → 跟踪 → 收尾沉淀案例"流程 |
| 4 | `pages/Postmortems.vue` | P0 后复盘报告 | `mock-data-extras.mockPostmortems` + `useAudit.submit('GENERATE_POSTMORTEM')` | title / anomalyIds / rootCause / resolution / verdict / improvements / lossEstimate | "手动生成复盘"按钮（仅写 audit_log） | 不存表；不能挂关联异常 / case；无时间线 |
| 5 | `pages/Hijacking.vue` | 跟卖处置 (Test Buy 流程) | `mock-data-extras.mockHijacking` | asin / hijackerSeller / hijackerPrice / type / status / durationMin / estimatedLossPerHour | 启动 TestBuy / 上传开箱照（改 ref 字段） | 状态改不入库；没接 M3 暂停广告联动 |
| 6 | `pages/Infringement.vue` | 侵权告警 + AI 投诉草稿 | `mock-data-extras.mockInfringement` | type (trademark/patent/copyright/counterfeit) / reportedBy / severity / status | "起草投诉"按钮（仅写 audit_log） | 草稿不存；状态不更新 |
| 7 | `pages/ReviewList.vue` | Review 中心 | `mock-data.mockReviews` | id / rating / sentiment / cluster / appeal / recovery / body / verified | 起草申诉 / 挽回 / 推 M1 | 评价 → 申诉 / 挽回 草稿不落地；推 M1 没真创 target |
| 8 | `pages/ReviewClusters.vue` | 差评聚类 + 改进路径 | `mock-data.mockReviewClusters` | name / rootCause / count / percent / improvements[].layer / estimatedRatingLift | 推送改进到 M1 | 聚类 / improvement 不落地 |
| 9 | `pages/ReviewTrends.vue` | 评分趋势 | `mock-data-extras.mockReviewTrends` | avgRating / trend / last7d / last30d / ratingDistribution | 只读 | 全 mock；没有时序快照表 |
| 10 | `pages/Appeals.vue` | 申诉中心 + AI 文案 | `mock-data-extras.mockAppeals` | reviewId / violationType / confidence / status / amazonCaseId | 提交申诉（ref 改 + audit_log） | 草稿不入库；状态机不完整 |
| 11 | `pages/RecoveryEmails.vue` | 挽回邮件中心 | `mock-data-extras.mockRecoveryEmails` | author / subject / preview / status / replied / reviewUpdated / newRating | 发送邮件（ref + audit） | 模板 / 多轮跟进 / 评分对比不入库 |
| 12 | `pages/Competitors.vue` | 9 维监控 + 跨模块跳转 | `mock-data.mockCompetitors` | asin / title / price / bsr / rating / changes[] / linkedActions | 跳转其他模块 | 没有快照时序表；变化只能 mock；linkedActions 是字符串硬编码 |
| 13 | `pages/ImageDiff.vue` | 竞品图像变化（多模态对比） | `mock-data-extras.mockImageDiff` | competitorAsin / imageRole / changeType / aiAnalysis / strategyInferred / impactOnUs | 推 M1 改进 | 图片对比记录不落地；没接 M1 创建优化 target |
| 14 | `pages/CompetitorAttack.vue` | 竞品 ASIN 攻击（SD/SP） | `mock-data-ads.mockCompetitorTargets` | asin / bsr / rating / attackability / recommendedBudget / recommendedBid / expectedShare | 批量启动攻击（audit log） | 攻击目标 / 启动记录 / 效果跟踪不入库 |
| 15 | `pages/BrandDefense.vue` | 4 层级品牌词防御 | `mock-data-ads.mockBrandDefense` | brandRegistered / layers[].status / brandKeywords[].ourPosition | 启用层 / 反攻击 | 层状态 / 监测记录 / 反攻击 → M3 加价不入库 |
| 16 | `pages/Notifications.vue` | 通知中心（站内 + 邮件 + 微信） | `mock-data-extras.mockNotifications` + `useLocalStore.notificationsRead` | severity / source / title / body / channels / createdAt / readAt | 标已读 / 全部已读 | 通知列表是 mock；已读状态走本地 localStorage；没有右上角铃铛红点；M1/M2/M3/M4 关键事件无法注入 |

### 1.2 后端 gap

| 资源 | 表名 | 优先级 | 状态 |
|---|---|---|---|
| 异常事件 | `m4_anomalies` | P0 | 新建 |
| SLA 计时事件 | `m4_sla_events` | P0 | 新建 |
| 处置案例 | `m4_resolution_cases` | P0 | 新建 |
| 复盘报告 | `m4_postmortems` | P0 | 新建 |
| 跟卖事件 | `m4_hijacking` | P0 | 新建 |
| 侵权事件 | `m4_infringement` | P0 | 新建 |
| 评论扩展 | `reviews` ALTER | P0 | 表已存在，扩字段 |
| 评论聚类 | `m4_review_clusters` | P0 | 新建 |
| 评分时序快照 | `m4_review_trend_snapshots` | P1 | 新建 |
| 申诉 | `m4_appeals` | P0 | 新建 |
| 挽回邮件 | `m4_recovery_emails` | P0 | 新建 |
| 竞品快照 | `m4_competitor_snapshots` | P0 | 新建 |
| 竞品图片差异 | `m4_image_diffs` | P0 | 新建 |
| 品牌防御层 | `m4_brand_defense_layers` | P0 | 新建 |
| 应用内通知 | `m4_notifications` | P0 | 新建（替代 mock） |

15 个数据载体（13 张新 `m4_*` 表 + 现有 `reviews` 扩字段 + 现有 `notifications_read` 沿用），全部走 `(user_id, store_id)` 双分区 + JSON-as-TEXT + Mulberry32 seed + `appendAuditLog(sourceModule='M4')`。

### 1.3 跨模块 gap

- 跟卖 `counterfeit_confirmed` → 应自动暂停对应 ASIN 的 M3 广告 24h；当前无管线
- 图片差异 / Review 聚类 → 应自动在 M1 创建 `m1_optimization_targets` 记录；当前仅 audit 占位
- M1 上传新 listing / M2 滞销触发 / M3 攻击启动 → 应注入 `m4_notifications`；当前不存在
- 没有右上角铃铛 / 未读小红点 / 跨模块事件总线 (`useNotificationsBus.js`)

---

## 2. 数据模型 DDL

**约定**：所有表 `(user_id, store_id)` 双分区；主键 `id TEXT PRIMARY KEY`；JSON 存 TEXT；写文件位置 `apps/api/src/data-store-monitor.mjs`（新建）→ 在 `data-store.mjs` 的 `initSchema()` 末尾 `initMonitorSchema(db)`；时间字段用 ISO 字符串。

### 2.1 m4_anomalies — 异常事件主表

```sql
CREATE TABLE IF NOT EXISTS m4_anomalies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  anomaly_code TEXT NOT NULL,                 -- 'A1_SALES_DROP' / 'A4_BB_LOST' / 'A8_REFUND_SPIKE' / ... 22 种
  category TEXT NOT NULL,                     -- 'traffic'|'conversion'|'buybox'|'refund'|'account_health'|'inventory'|'hijack'|'ip'|'review'|'competitor'
  severity TEXT NOT NULL CHECK (severity IN ('P0','P1','P2')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','assigned','investigating','resolving','resolved','dismissed','escalated')),
  sku TEXT,
  asin TEXT,
  title TEXT NOT NULL,
  evidence TEXT,                              -- JSON array of evidence rows
  recommended_action TEXT,
  ai_root_cause TEXT,
  expected_impact TEXT,                       -- JSON {metric, change, horizonDays}
  assignee_user_id TEXT,
  assignee_label TEXT,
  detected_at TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at TEXT,
  sla_minutes INTEGER NOT NULL,               -- 计划 SLA（按 severity 默认）
  sla_deadline TEXT NOT NULL,                 -- detected_at + sla_minutes
  sla_breached INTEGER DEFAULT 0,
  resolution_case_id TEXT,
  postmortem_id TEXT,
  source_module TEXT DEFAULT 'M4',            -- 来源模块 (M2/M3/M4 都可注入异常)
  skip_anomaly_emit INTEGER DEFAULT 0,        -- 防 M3↔M4 联动循环
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_anom_us ON m4_anomalies(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_anom_sev ON m4_anomalies(user_id, store_id, severity, status);
CREATE INDEX IF NOT EXISTS idx_m4_anom_sla ON m4_anomalies(user_id, store_id, sla_deadline);
CREATE INDEX IF NOT EXISTS idx_m4_anom_asin ON m4_anomalies(user_id, store_id, asin);
```

### 2.2 m4_sla_events — SLA 计时事件流

```sql
CREATE TABLE IF NOT EXISTS m4_sla_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  anomaly_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('detected','assigned','acknowledged','escalated','resolved','breached','dismissed')),
  operator_user_id TEXT,
  operator_label TEXT,
  elapsed_minutes INTEGER,                    -- 距 detected_at 的分钟差
  detail TEXT,                                -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m4_sla_us ON m4_sla_events(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_sla_anom ON m4_sla_events(user_id, store_id, anomaly_id, created_at);
```

### 2.3 m4_resolution_cases — 处置案例

```sql
CREATE TABLE IF NOT EXISTS m4_resolution_cases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  anomaly_id TEXT,                            -- nullable（可手动创建独立 case）
  anomaly_code TEXT,
  scenario TEXT NOT NULL,
  action_plan TEXT NOT NULL,
  outcome TEXT,
  outcome_score REAL,                         -- 0~1，处置评分
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','successful','partial','failed','archived')),
  reusable INTEGER DEFAULT 0,                 -- 是否沉淀为可复用案例
  reference_count INTEGER DEFAULT 0,          -- 被多少新 case 引用
  tags TEXT,                                  -- JSON array
  duration_minutes INTEGER,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_rc_us ON m4_resolution_cases(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_rc_status ON m4_resolution_cases(user_id, store_id, status);
CREATE INDEX IF NOT EXISTS idx_m4_rc_anom ON m4_resolution_cases(user_id, store_id, anomaly_id);
```

### 2.4 m4_postmortems — 复盘报告

```sql
CREATE TABLE IF NOT EXISTS m4_postmortems (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  anomaly_ids TEXT,                           -- JSON array
  resolution_case_ids TEXT,                   -- JSON array
  loss_estimate REAL,
  root_cause TEXT,
  resolution TEXT,
  verdict TEXT NOT NULL
    CHECK (verdict IN ('successful','partial','failed','draft')),
  improvements TEXT,                          -- JSON array of strings
  timeline TEXT,                              -- JSON array {at, event, note}
  generated_by TEXT,                          -- 'auto'|'manual'
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_pm_us ON m4_postmortems(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_pm_date ON m4_postmortems(user_id, store_id, event_date DESC);
```

### 2.5 m4_hijacking — 跟卖事件

```sql
CREATE TABLE IF NOT EXISTS m4_hijacking (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  asin TEXT NOT NULL,
  sku TEXT,
  hijacker_seller TEXT NOT NULL,
  hijacker_price REAL,
  our_price REAL,
  detected_at TEXT NOT NULL,
  duration_min INTEGER,                       -- 持续分钟（动态计算）
  type TEXT NOT NULL
    CHECK (type IN ('price_competition','counterfeit_suspect','counterfeit_confirmed','genuine_authorized')),
  status TEXT NOT NULL DEFAULT 'pending_test_buy'
    CHECK (status IN ('pending_test_buy','test_buy_in_transit','test_buy_received','appeal_drafted','appeal_submitted','appeal_accepted','genuine','closed')),
  test_buy_order_id TEXT,
  test_buy_received_at TEXT,
  proof_images TEXT,                          -- JSON array urls
  appeal_id TEXT,                             -- → m4_appeals.id
  appeal_case_id TEXT,
  estimated_loss_per_hour REAL,
  m3_ads_paused INTEGER DEFAULT 0,            -- 是否已联动暂停广告
  m3_pause_dedup_key TEXT,                    -- 24h dedup 标记
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_hj_us ON m4_hijacking(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_hj_status ON m4_hijacking(user_id, store_id, status);
CREATE INDEX IF NOT EXISTS idx_m4_hj_asin ON m4_hijacking(user_id, store_id, asin);
```

### 2.6 m4_infringement — 侵权事件

```sql
CREATE TABLE IF NOT EXISTS m4_infringement (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  asin TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('trademark','patent','copyright','counterfeit')),
  source TEXT,                                -- 'amazon_brand_registry'|'third_party_monitor'|'manual'
  reported_by TEXT,
  description TEXT,
  severity TEXT CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'investigating'
    CHECK (status IN ('investigating','pending_legal_review','draft','submitted','accepted','rejected','resolved','dismissed')),
  draft_content TEXT,
  amazon_complaint_id TEXT,
  detected_at TEXT NOT NULL,
  submitted_at TEXT,
  resolved_at TEXT,
  legal_disclaimer_ack INTEGER DEFAULT 0,     -- 用户已确认免责声明
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_inf_us ON m4_infringement(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_inf_status ON m4_infringement(user_id, store_id, status);
```

### 2.7 reviews ALTER — 评论扩展

```sql
-- 已有：id / user_id / store_id / product_id / rating / title / body / created_at
ALTER TABLE reviews ADD COLUMN asin TEXT;
ALTER TABLE reviews ADD COLUMN sku TEXT;
ALTER TABLE reviews ADD COLUMN reviewer TEXT;
ALTER TABLE reviews ADD COLUMN verified INTEGER DEFAULT 0;
ALTER TABLE reviews ADD COLUMN sentiment TEXT;       -- 'positive'|'neutral'|'negative'
ALTER TABLE reviews ADD COLUMN cluster_id TEXT;
ALTER TABLE reviews ADD COLUMN appeal_eligible INTEGER DEFAULT 0;
ALTER TABLE reviews ADD COLUMN appeal_id TEXT;       -- → m4_appeals.id
ALTER TABLE reviews ADD COLUMN recovery_id TEXT;     -- → m4_recovery_emails.id
ALTER TABLE reviews ADD COLUMN recovery_status TEXT; -- 'n/a'|'pending'|'drafted'|'sent'|'replied'|'updated'
ALTER TABLE reviews ADD COLUMN posted_at TEXT;
ALTER TABLE reviews ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_reviews_asin ON reviews(user_id, store_id, asin);
CREATE INDEX IF NOT EXISTS idx_reviews_sent ON reviews(user_id, store_id, sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_cluster ON reviews(user_id, store_id, cluster_id);
```

> 注：SQLite `ALTER TABLE ADD COLUMN` 在重复执行时会报错，需先 `PRAGMA table_info(reviews)` 判断列是否存在；写在 `data-store-monitor.mjs` 的 `migrateReviewsTable(db)` 内，幂等执行。

### 2.8 m4_review_clusters — 差评聚类

```sql
CREATE TABLE IF NOT EXISTS m4_review_clusters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  asin TEXT,
  sku TEXT,
  name TEXT NOT NULL,                         -- 聚类名（如"按钮松动"）
  sentiment TEXT CHECK (sentiment IN ('negative','neutral','positive')),
  root_cause TEXT CHECK (root_cause IN ('product_quality','listing_issue','packaging','expectation_mgmt','documentation','highlight')),
  count INTEGER NOT NULL DEFAULT 0,
  percent REAL,
  samples TEXT,                               -- JSON array of strings
  improvements TEXT,                          -- JSON array {layer, action, m1_target_id?}
  estimated_rating_lift REAL,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','fixing','pushed','resolved','archived')),
  pushed_m1_target_ids TEXT,                  -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_rc2_us ON m4_review_clusters(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_rc2_asin ON m4_review_clusters(user_id, store_id, asin);
CREATE INDEX IF NOT EXISTS idx_m4_rc2_status ON m4_review_clusters(user_id, store_id, status);
```

### 2.9 m4_review_trend_snapshots — 评分时序快照

```sql
CREATE TABLE IF NOT EXISTS m4_review_trend_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  asin TEXT NOT NULL,
  sku TEXT,
  snapshot_date TEXT NOT NULL,                -- YYYY-MM-DD
  avg_rating REAL,
  total_reviews INTEGER,
  added_7d INTEGER,
  avg_7d REAL,
  added_30d INTEGER,
  avg_30d REAL,
  trend TEXT CHECK (trend IN ('stable','declining','declining_strong','rising','rising_strong')),
  trend_delta REAL,
  distribution TEXT,                          -- JSON {1:n,2:n,3:n,4:n,5:n}
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m4_rts_us ON m4_review_trend_snapshots(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_rts_asin_date ON m4_review_trend_snapshots(user_id, store_id, asin, snapshot_date DESC);
```

### 2.10 m4_appeals — 申诉

```sql
CREATE TABLE IF NOT EXISTS m4_appeals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  review_id TEXT,                             -- 关联 reviews.id（可空，跟卖申诉用 hijacking_id）
  hijacking_id TEXT,
  sku TEXT,
  asin TEXT,
  author TEXT,
  rating INTEGER,
  body TEXT,
  violation_type TEXT
    CHECK (violation_type IN ('unrelated_to_product','conflict_of_interest','logistics_unrelated','duplicate','hateful','hijacking_counterfeit','other')),
  confidence REAL,
  draft_content TEXT,                         -- AI 起草文案
  drafted_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','under_review','accepted','rejected','withdrawn')),
  amazon_case_id TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  amazon_response TEXT,
  retry_count INTEGER DEFAULT 0,
  parent_appeal_id TEXT,                      -- 驳回后重提的链接
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_ap_us ON m4_appeals(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_ap_status ON m4_appeals(user_id, store_id, status);
CREATE INDEX IF NOT EXISTS idx_m4_ap_review ON m4_appeals(user_id, store_id, review_id);
```

### 2.11 m4_recovery_emails — 挽回邮件

```sql
CREATE TABLE IF NOT EXISTS m4_recovery_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  review_id TEXT,
  sku TEXT,
  asin TEXT,
  author TEXT,
  rating INTEGER,
  template_id TEXT,
  subject TEXT,
  body TEXT,
  preview TEXT,
  round_no INTEGER DEFAULT 1,                 -- 第几轮跟进
  parent_email_id TEXT,                       -- 上一轮邮件
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','draft','sent','replied','review_updated','closed','failed')),
  drafted_at TEXT,
  sent_at TEXT,
  replied_at TEXT,
  replied_body TEXT,
  review_updated INTEGER DEFAULT 0,
  old_rating INTEGER,
  new_rating INTEGER,
  channel TEXT DEFAULT 'buyer_seller_messaging',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_re_us ON m4_recovery_emails(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_re_status ON m4_recovery_emails(user_id, store_id, status);
CREATE INDEX IF NOT EXISTS idx_m4_re_review ON m4_recovery_emails(user_id, store_id, review_id);
```

### 2.12 m4_competitor_snapshots — 竞品 9 维快照

```sql
CREATE TABLE IF NOT EXISTS m4_competitor_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  competitor_asin TEXT NOT NULL,
  our_asin TEXT,                              -- 对标我方哪个
  snapshot_at TEXT NOT NULL,
  title TEXT,
  price REAL,
  bsr INTEGER,
  rating REAL,
  review_count INTEGER,
  ad_positions TEXT,                          -- JSON array
  listing_changes TEXT,                       -- JSON array of {dimension, from, to, strategy, interpretation, linkedActions}
  raw TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m4_cs_us ON m4_competitor_snapshots(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_cs_asin_at ON m4_competitor_snapshots(user_id, store_id, competitor_asin, snapshot_at DESC);
```

### 2.13 m4_image_diffs — 竞品图片差异

```sql
CREATE TABLE IF NOT EXISTS m4_image_diffs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  competitor_asin TEXT NOT NULL,
  image_role TEXT,                            -- 'main'|'gallery_1..6'|'a_plus_1..7'
  old_image_url TEXT,
  new_image_url TEXT,
  phash_distance INTEGER,                     -- pHash 海明距离
  change_type TEXT,
  ai_analysis TEXT,
  strategy_inferred TEXT,
  impact_on_us TEXT,
  detected_at TEXT NOT NULL,
  pushed_m1_target_id TEXT,                   -- 推 M1 后生成的 target.id
  status TEXT DEFAULT 'new'
    CHECK (status IN ('new','reviewed','pushed','dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_id_us ON m4_image_diffs(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_id_asin ON m4_image_diffs(user_id, store_id, competitor_asin);
```

### 2.14 m4_brand_defense_layers — 品牌防御层

```sql
CREATE TABLE IF NOT EXISTS m4_brand_defense_layers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  layer_code TEXT NOT NULL,                   -- 'L1_BRAND_CAMPAIGN'|'L2_LONG_TAIL'|'L3_SD_SELF'|'L4_COUNTER_MONITOR'
  label TEXT,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('disabled','partial','enabled','monitoring')),
  brand_registered INTEGER DEFAULT 0,
  brand_keywords TEXT,                        -- JSON array {term, impressions7d, ourBid, ourPosition, competitorBid}
  bound_strategy_ids TEXT,                    -- JSON array → ad_strategies.id
  bound_campaign_ids TEXT,                    -- JSON array → lx_campaigns.id
  last_counter_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_bd_us ON m4_brand_defense_layers(user_id, store_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_m4_bd_unique ON m4_brand_defense_layers(user_id, store_id, layer_code);
```

### 2.15 m4_notifications — 应用内通知

```sql
CREATE TABLE IF NOT EXISTS m4_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('P0','P1','P2')),
  source_module TEXT NOT NULL,                -- 'M1'|'M2'|'M3'|'M4A'|'M4B'|'M4C'|'M4D'
  source_event TEXT,                          -- 触发事件简短码
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                                  -- 前端路由 deep link
  related_resource_type TEXT,                 -- 'anomaly'|'review'|'appeal'|'hijacking'|'competitor'|...
  related_resource_id TEXT,
  channels TEXT,                              -- JSON array ['in_app','email','wechat','wecom']
  delivery_status TEXT,                       -- JSON {in_app:'delivered', email:'sent'|'queued', ...}
  silent_window_skipped INTEGER DEFAULT 0,    -- 静默时段被跳过的通道数
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m4_notif_us ON m4_notifications(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m4_notif_sev ON m4_notifications(user_id, store_id, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_m4_notif_src ON m4_notifications(user_id, store_id, source_module);
```

> 已读状态沿用现有 `notifications_read(user_id, notif_id, read_at)` 表，无需新建。

### 2.16 removeUserStore 联动清理

新增 `MONITOR_TABLES_TO_CLEAN` 数组，包含 13 张 `m4_*` 表 + `reviews`（按 user/store 清）；导出后在 `data-store.mjs.removeUserStore()` 末尾追加 `for (const tbl of MONITOR_TABLES_TO_CLEAN) db.prepare('DELETE FROM ' + tbl + ' WHERE user_id=? AND store_id=?').run(userId, storeId);`。

---

## 3. 后端 API 契约（57 个 endpoint）

**约定**：所有路径前缀 `/api/v1/store/m4/...`；需 Bearer + X-Store-Id；写操作必走 `appendAuditLog(sourceModule='M4', actionType=..., resourceType=..., resourceId=...)`；新文件 `apps/api/src/store-routes-monitor.mjs`，并在 `server.mjs` 注册。

### 3.1 异常事件 Anomalies (8)

**1. `GET /api/v1/store/m4/anomalies?severity=&status=&assignee=&sku=&asin=&q=`**
- 响应：`{ items: [{id, anomalyCode, category, severity, status, sku, asin, title, evidence, recommendedAction, slaMinutes, slaDeadline, slaBreached, detectedAt, ...}], summary: { totalOpen, p0, p1, p2, breached }, total }`

**2. `GET /api/v1/store/m4/anomalies/:id`**
- 响应：单条 anomaly + `slaEvents: [...]` + `linkedCase`、`linkedPostmortem`

**3. `POST /api/v1/store/m4/anomalies`** — 手动新建
- 请求：`{ anomalyCode, category, severity, sku?, asin?, title, evidence?, recommendedAction? }`
- 响应：新 anomaly；副作用：写 `m4_sla_events(event_type='detected')` + audit `ANOMALY_CREATE` + emit `m4_notifications`

**4. `POST /api/v1/store/m4/anomalies/:id/assign`**
- 请求：`{ assigneeUserId, assigneeLabel }`
- 响应：updated anomaly；副作用：sla_events(`assigned`) + audit `ANOMALY_ASSIGN`

**5. `POST /api/v1/store/m4/anomalies/:id/acknowledge`**
- 请求：`{}`；副作用：sla_events(`acknowledged`) + audit `ANOMALY_ACK`

**6. `POST /api/v1/store/m4/anomalies/:id/resolve`**
- 请求：`{ resolutionCaseId?, note? }`
- 响应：updated anomaly；副作用：sla_events(`resolved`) + audit `ANOMALY_RESOLVE`；若 resolutionCaseId 提供则把 case 状态置 `successful`

**7. `POST /api/v1/store/m4/anomalies/:id/dismiss`**
- 请求：`{ reason }`；副作用：sla_events(`dismissed`) + audit `ANOMALY_DISMISS`

**8. `POST /api/v1/store/m4/anomalies/:id/escalate`**
- 请求：`{ reason, escalateTo? }`；副作用：sla_events(`escalated`) + 发 P0 通知 + audit `ANOMALY_ESCALATE`

### 3.2 SLA 看板 (2)

**9. `GET /api/v1/store/m4/sla/board?range=today|7d|30d`**
- 响应：`{ todayStats: { p0Total, p0Avg, p0Sla, p1Total, p1Avg, p1Sla, escalations }, team: [{user, anomaliesAssigned, avgResponseMin, withinSla, escalated, slaRate}] }`
- 计算源：聚合 `m4_anomalies` + `m4_sla_events`，按 `assignee_user_id` 分组

**10. `GET /api/v1/store/m4/sla/events?anomalyId=`**
- 响应：`{ items: [...] }`

### 3.3 处置案例 (5)

**11. `GET /api/v1/store/m4/cases?status=&q=&reusable=`** — 列表

**12. `POST /api/v1/store/m4/cases`** — `{ anomalyId?, scenario, actionPlan }`；audit `CASE_CREATE`

**13. `GET /api/v1/store/m4/cases/:id`**

**14. `PUT /api/v1/store/m4/cases/:id`** — patch（含 status / outcome / outcomeScore / reusable / tags）；audit `CASE_UPDATE`

**15. `GET /api/v1/store/m4/cases/recommend?anomalyId=`** — AI 推荐相似案例（基于 anomaly_code 模糊匹配 + tags 相似度）；返回 top 5

### 3.4 复盘报告 (4)

**16. `GET /api/v1/store/m4/postmortems?verdict=`**

**17. `POST /api/v1/store/m4/postmortems/generate`** — `{ anomalyIds: [...], title? }`；自动生成 timeline + rootCause + improvements（mock 模板填充）；audit `POSTMORTEM_GENERATE`

**18. `GET /api/v1/store/m4/postmortems/:id`**

**19. `PUT /api/v1/store/m4/postmortems/:id`** — 编辑 verdict / improvements；audit `POSTMORTEM_UPDATE`

### 3.5 跟卖 Hijacking (6) — 含跨模块联动

**20. `GET /api/v1/store/m4/hijacking?status=&type=`**

**21. `POST /api/v1/store/m4/hijacking/scan`** — `{ asins?: [] }` 触发一次扫描；mock 随机产出 0-2 条新跟卖；audit `HIJACK_SCAN`

**22. `POST /api/v1/store/m4/hijacking/:id/start-test-buy`** — `{}`；status → `test_buy_in_transit`；生成 testBuyOrderId；audit `HIJACK_START_TESTBUY`

**23. `POST /api/v1/store/m4/hijacking/:id/upload-proof`** — `{ proofImages: [url], type: 'counterfeit_confirmed'|'genuine_authorized' }`
- 副作用：
  - status → `test_buy_received`
  - 若 type=='counterfeit_confirmed'：调用 M3 `pauseAdsForAsin(asin, 24h)`，写 `m3_ads_paused=1`、`m3_pause_dedup_key='hj-'+asin+'-'+date`（24h 内重复忽略）；在 ad_suggestions 插入一条 `skipAnomalyEmit=1` 标记以防 M3 反向触发 M4 异常
  - 自动起草 m4_appeals(violation_type='hijacking_counterfeit', hijacking_id=id, status='draft')
  - audit `HIJACK_CONFIRM_COUNTERFEIT` + `M3_PAUSE_ADS_FROM_M4`

**24. `POST /api/v1/store/m4/hijacking/:id/submit-appeal`** — `{ appealId }`；status → `appeal_submitted`；audit `HIJACK_SUBMIT_APPEAL`

**25. `POST /api/v1/store/m4/hijacking/:id/close`** — `{ outcome }`；status → `closed`；若广告 paused 24h 已过期自动恢复（写 audit `M3_RESUME_ADS_FROM_M4`）

### 3.6 侵权 Infringement (5)

**26. `GET /api/v1/store/m4/infringement?status=&type=`**

**27. `POST /api/v1/store/m4/infringement`** — `{ asin, type, source, reportedBy, description, severity }`；audit `INFRINGEMENT_CREATE`

**28. `POST /api/v1/store/m4/infringement/:id/draft`** — `{ legalDisclaimerAck: true }`；生成 draftContent（mock 模板），status → `draft`；audit `DRAFT_IP_COMPLAINT`

**29. `POST /api/v1/store/m4/infringement/:id/submit`** — `{ amazonComplaintId? }`；status → `submitted`；audit `SUBMIT_IP_COMPLAINT`

**30. `POST /api/v1/store/m4/infringement/:id/resolve`** — `{ outcome: 'accepted'|'rejected'|'dismissed' }`；audit `IP_COMPLAINT_RESOLVE`

### 3.7 Review 中心 (5)

**31. `GET /api/v1/store/m4/reviews?sentiment=&rating=&clusterId=&asin=&q=`** — 列表
- 响应：`{ items: [...], summary: { total, negative, appealCandidates, recoveryPending } }`

**32. `GET /api/v1/store/m4/reviews/:id`**

**33. `POST /api/v1/store/m4/reviews/sync`** — `{ asins?, limit? }` mock 拉取新评（生成 Mulberry32 deterministic 数据 + 自动分类 sentiment + 自动尝试聚类）；audit `REVIEW_SYNC`；若有新负面爆发（短时 ≥3 条 1-2 星）→ 自动创建 anomaly + emit notification

**34. `POST /api/v1/store/m4/reviews/:id/mark-appealable`** — `{ appealable: true|false, violationType? }`；audit `REVIEW_MARK_APPEAL`

**35. `POST /api/v1/store/m4/reviews/:id/push-m1`** — `{ clusterId?, focus? }`
- 副作用：调用 M1 `createOptimizationTarget({ mode:'existing', productId, asin })`，写回 `pushed_m1_target_ids`；audit `PUSH_M1_IMPROVEMENT`

### 3.8 评论聚类 (4)

**36. `GET /api/v1/store/m4/review-clusters?status=&asin=`**

**37. `POST /api/v1/store/m4/review-clusters/recompute`** — `{ asin? }`；重新跑聚类；audit `REVIEW_CLUSTER_RECOMPUTE`

**38. `GET /api/v1/store/m4/review-clusters/:id`**

**39. `POST /api/v1/store/m4/review-clusters/:id/push-m1`** — `{ layer }`
- 副作用：根据 layer ('listing'/'documentation' → 创 M1 target；'manufacturer'/'packaging' → 写入供应链待办占位)；写 `pushed_m1_target_ids`；status → `pushed`；audit `CLUSTER_PUSH_M1`

### 3.9 评分趋势 (2)

**40. `GET /api/v1/store/m4/review-trends?asin=`** — 返回最新快照 + 历史 30 天序列

**41. `POST /api/v1/store/m4/review-trends/snapshot`** — `{ asins? }`；触发当日快照；audit `TREND_SNAPSHOT`

### 3.10 申诉 Appeals (5)

**42. `GET /api/v1/store/m4/appeals?status=`**
- 响应含 summary `{ draft, submitted, accepted, rejected, successRate }`

**43. `POST /api/v1/store/m4/appeals/draft`** — `{ reviewId?, hijackingId?, violationType, payload }`；audit `DRAFT_REVIEW_APPEAL`

**44. `POST /api/v1/store/m4/appeals/:id/submit`** — `{}`；状态机：`draft → submitted`，自动生成 `amazonCaseId`；audit `SUBMIT_APPEAL`

**45. `POST /api/v1/store/m4/appeals/:id/review`** — `{ outcome: 'accepted'|'rejected'|'under_review', amazonResponse? }`；audit `APPEAL_REVIEW`

**46. `POST /api/v1/store/m4/appeals/:id/retry`** — `{ note? }` 从 rejected 重提：创建子 appeal（parent_appeal_id 链接），状态 `draft`，retry_count++；audit `APPEAL_RETRY`

### 3.11 挽回邮件 Recovery (5)

**47. `GET /api/v1/store/m4/recovery?status=`**

**48. `POST /api/v1/store/m4/recovery/draft`** — `{ reviewId, templateId?, parentEmailId? }`；audit `DRAFT_RECOVERY_EMAIL`

**49. `POST /api/v1/store/m4/recovery/:id/send`** — `{}`；status → `sent`；audit `SEND_RECOVERY_EMAIL`

**50. `POST /api/v1/store/m4/recovery/:id/record-reply`** — `{ repliedBody, reviewUpdated?, newRating? }`；audit `RECOVERY_REPLY`

**51. `POST /api/v1/store/m4/recovery/:id/next-round`** — `{ templateId? }`；创建 round_no+1 邮件草稿，parent_email_id 串联；audit `RECOVERY_NEXT_ROUND`

### 3.12 竞品 Competitors (5)

**52. `GET /api/v1/store/m4/competitors?asin=`** — 返回最新快照 + changes 时间线

**53. `POST /api/v1/store/m4/competitors`** — `{ competitorAsin, ourAsin? }`；audit `COMPETITOR_ADD`

**54. `POST /api/v1/store/m4/competitors/snapshot`** — `{ asins? }`；批量抓快照 mock；自动 diff 上一快照填 `listing_changes`；audit `COMPETITOR_SNAPSHOT`

**55. `GET /api/v1/store/m4/competitors/:asin/timeline?from=&to=`** — 时间线

**56. `POST /api/v1/store/m4/competitors/:asin/dismiss-change`** — `{ changeIdx, reason }`；audit `COMPETITOR_DISMISS_CHANGE`

### 3.13 图片差异 ImageDiff (3)

**57. `GET /api/v1/store/m4/image-diffs?status=&competitorAsin=`**

**58. `POST /api/v1/store/m4/image-diffs/scan`** — `{ competitorAsins? }`；mock pHash 距离 → 新差异；audit `IMAGE_DIFF_SCAN`

**59. `POST /api/v1/store/m4/image-diffs/:id/push-m1`** — `{}`
- 副作用：调 M1 `createOptimizationTarget({ mode:'existing'/'asin_input', asin:ourAsinIfExists })`；写 `pushed_m1_target_id`；status → `pushed`；audit `IMAGE_DIFF_PUSH_M1`

### 3.14 品牌防御 (4)

**60. `GET /api/v1/store/m4/brand-defense`** — 返回 4 层状态 + brandKeywords + brandRegistered

**61. `POST /api/v1/store/m4/brand-defense/:layerCode/enable`** — `{ boundStrategyIds?, boundCampaignIds? }`；audit `ENABLE_BRAND_DEFENSE_LAYER`

**62. `POST /api/v1/store/m4/brand-defense/:layerCode/disable`** — `{ reason }`；audit `DISABLE_BRAND_DEFENSE_LAYER`

**63. `POST /api/v1/store/m4/brand-defense/counter`** — `{ term, bidIncrease }`
- 副作用：调 M3 `bulkUpdateTargetingBids` 给品牌词加价；audit `BRAND_COUNTER_ATTACK`；emit notification

### 3.15 通知 Notifications (5)

**64. `GET /api/v1/store/m4/notifications?severity=&source=&unread=&since=`**
- 响应：`{ items: [...], summary: { unread, p0, p1, p2 } }`
- 联表 `notifications_read` 计算 `readAt`

**65. `POST /api/v1/store/m4/notifications`** — 内部 / 跨模块注入 `{ severity, sourceModule, sourceEvent, title, body, link?, relatedResource?, channels? }`
- 默认 channels 按 severity 路由：P0=`['in_app','email','wechat']`，P1=`['in_app','email']`，P2=`['in_app']`
- 静默时段（用户 settings.silent_window）跳过 email/wechat（写 silent_window_skipped 计数）

**66. `POST /api/v1/store/m4/notifications/:id/read`** — 标已读（写 `notifications_read`，无 audit）

**67. `POST /api/v1/store/m4/notifications/read-all`** — 批量已读

**68. `GET /api/v1/store/m4/notifications/unread-count`** — 给铃铛红点用，p99 < 30ms

### 3.16 错误码

| 状态 | 含义 |
|---|---|
| 401 `unauthorized` | 缺/错 Bearer |
| 403 `store_required` | 缺 X-Store-Id 或店铺不属于用户 |
| 404 `not_found` | 资源 / 路径不存在 |
| 400 `validation_failed` | 字段缺失 / 取值非法 |
| 400 `state_transition_forbidden` | 状态机非法跳转（如 `accepted → draft`） |
| 409 `conflict` | 重复操作（如 24h 内重复 pauseAds、重复 sync） |
| 422 `manual_required` | 需用户在 Amazon Brand Registry / SAS 端手动完成 |

---

## 4. 前端改造蓝图

### 4.1 新增文件

- `apps/web-v2/src/api/m4.js` — 12 个命名空间
- `apps/web-v2/src/composables/useM4State.js` — 12 个 use*（与 12 namespaces 对齐）
- `apps/web-v2/src/composables/useNotificationsBus.js` — **新建全局通知总线**
- `apps/web-v2/src/components/m4/NotificationBell.vue` — **新建右上角铃铛组件**

### 4.2 `api/m4.js` — 12 命名空间签名

```js
// anomaliesApi
list, get, create, assign, acknowledge, resolve, dismiss, escalate
// slaApi
board, events
// resolutionApi
list, get, create, update, recommend
// postmortemsApi
list, get, generate, update
// hijackingApi
list, scan, startTestBuy, uploadProof, submitAppeal, close
// infringementApi
list, create, draft, submit, resolve
// reviewsApi
list, get, sync, markAppealable, pushM1
// clustersApi（聚类子命名空间挂在 reviewsApi.clusters 或独立）
listClusters, recomputeClusters, getCluster, pushClusterM1
// trendsApi
list, snapshot
// appealsApi
list, draft, submit, review, retry
// recoveryApi
list, draft, send, recordReply, nextRound
// competitorsApi
list, add, snapshot, timeline, dismissChange
// imageDiffsApi
list, scan, pushM1
// brandDefenseApi
get, enableLayer, disableLayer, counter
// notificationsApi
list, post, markRead, markAllRead, unreadCount
```

12 命名空间合计为：**anomaliesApi / slaApi / resolutionApi / postmortemsApi / hijackingApi / infringementApi / reviewsApi（含 clusters + trends 子方法）/ appealsApi / recoveryApi / competitorsApi / imageDiffsApi / notificationsApi**（按用户要求 12 个；brandDefense 并入 competitors 域或单列为第 13 个 brandDefenseApi，命名上不计入 12 数）。

### 4.3 `useNotificationsBus.js` — 全局通知总线

```js
// 单例 reactive bus，跨模块订阅
const events = ref([]);
const unreadCount = ref(0);
let pollTimer = null;

export function useNotificationsBus() {
  function startPolling(intervalMs = 15000) { /* setInterval → notificationsApi.unreadCount + 增量 list */ }
  function stopPolling() { clearInterval(pollTimer); }
  function emit(evt) { events.value.unshift(evt); unreadCount.value++; }       // 本地乐观写
  function markRead(id) { ... }
  function pushLocal(evt) { /* 仅本地（用于 toast），不入库 */ }
  return { events, unreadCount, startPolling, stopPolling, emit, markRead, pushLocal };
}
```

- M1/M2/M3 任何写操作 → 在 `useAudit.submit` 成功回调中 `bus.pushLocal(...)`
- 后端写操作内部直接 `INSERT INTO m4_notifications`，前端轮询拉取
- `App.vue` 在 layout 顶部装载 `<NotificationBell />`

### 4.4 `NotificationBell.vue` — 右上角铃铛

- 显示 `<el-badge :value="unreadCount" :max="99" :hidden="unreadCount===0">`
- 点击展开 `<el-popover>` 显示最近 10 条；点条目走 router.push(link) + markRead
- 底部"查看全部"跳 `/notifications`

### 4.5 useM4State.js

```js
export function useAnomalies(filters) { /* list + refresh + cache */ }
export function useSLABoard(range) { /* board.value + refresh */ }
export function useResolutionCases() { /* CRUD */ }
export function usePostmortems() { /* list + generate */ }
export function useHijacking() { /* list + actions */ }
export function useInfringement() { /* list + actions */ }
export function useReviewCenter() { /* reviews + clusters + trends 合并 */ }
export function useAppeals() { /* list + statemachine */ }
export function useRecovery() { /* list + multiround */ }
export function useCompetitorWar() { /* list + snapshot + timeline */ }
export function useImageDiffs() { /* list + push m1 */ }
export function useBrandDefense() { /* layers + counter */ }
```

### 4.6 16 个 .vue 页面改造矩阵

| 页面 | 删除 | 新增 | 接 API |
|---|---|---|---|
| MonitorAnomalies.vue | `import { monitorApi }` 旧调用、`actionLabel` 占位 | 分派 / 确认 / 升级 / 解决按钮，URL query `?sev=&status=&assignee=` | `anomaliesApi.list/get/assign/acknowledge/resolve/dismiss/escalate` |
| SLABoard.vue | `import { mockSLA }` | range 切换 7d/30d；点 team 行钻取 | `slaApi.board` |
| ResolutionCases.vue | `import { mockResolutionCases }` | reusable 过滤 / 从 anomaly 发起 case | `resolutionApi.list/create/update/recommend` |
| Postmortems.vue | `import { mockPostmortems }` | 选 anomalyIds 多选生成、verdict / improvements 可编辑 | `postmortemsApi.list/generate/update` |
| Hijacking.vue | `import { mockHijacking }` | 扫描按钮 + 上传开箱照真接 / 联动 M3 paused 显示 | `hijackingApi.*` |
| Infringement.vue | `import { mockInfringement }` | 法律免责勾选 → draft；submit → resolve 状态机 | `infringementApi.*` |
| ReviewList.vue | `import { mockReviews }` | sync 按钮 + filter 按 asin / cluster / sentiment | `reviewsApi.list/sync/markAppealable/pushM1` |
| ReviewClusters.vue | `import { mockReviewClusters }` | recompute / 钻取到 reviews | `reviewsApi.listClusters/recomputeClusters/pushClusterM1` |
| ReviewTrends.vue | `import { mockReviewTrends }` | snapshot 按钮 + 30 天时序 echarts | `reviewsApi.trends.list/snapshot` |
| Appeals.vue | `import { mockAppeals }` | 多 tab + 重提 retry / 详情抽屉 | `appealsApi.*` |
| RecoveryEmails.vue | `import { mockRecoveryEmails }` | 多轮 next-round / 记录回复 | `recoveryApi.*` |
| Competitors.vue | `import { mockCompetitors }` | snapshot 按钮 + linkedActions 接真路由 | `competitorsApi.list/snapshot/timeline/dismissChange` |
| ImageDiff.vue | `import { mockImageDiff }` | scan 按钮 + pushM1 真创 target → 跳 `/listings/optimize/:id` | `imageDiffsApi.list/scan/pushM1` |
| CompetitorAttack.vue | `import { mockCompetitorTargets }` | 接 M3 后端 `/ads/competitor-attack/*`（M3 spec 已规划） | 走 M3 namespace（M4 视图复用） |
| BrandDefense.vue | `import { mockBrandDefense }` | 启用/反攻击真接 → 触发 M3 加价 | `brandDefenseApi.get/enableLayer/disableLayer/counter` |
| Notifications.vue | `import { mockNotifications }`、`useLocalStore.isNotificationRead` 已读改用后端 read 状态 | unread tab 默认；全选已读真接 | `notificationsApi.list/markRead/markAllRead` |

### 4.7 跨刷新一致

- URL query 同步：`?sev=`、`?status=`、`?assignee=`、`?asin=`、`?tab=` 等
- localStorage 草稿：`m4_draft_appeal_<reviewId>`、`m4_draft_recovery_<reviewId>`、`m4_draft_infringement_<id>`
- store 切换时清空 URL query + 草稿
- 铃铛轮询 15s（可在 settings 调），切店清 events / unreadCount

---

## 5. 跨模块联动（重点）

### 5.1 M4 跟卖检测 → M3 暂停广告

**触发链**：

```
POST /m4/hijacking/:id/upload-proof { type:'counterfeit_confirmed' }
   └─→ data-store-monitor.confirmHijackingCounterfeit()
         ├─ UPDATE m4_hijacking SET status='test_buy_received', type='counterfeit_confirmed'
         ├─ 检查 24h dedup：
         │    若 m3_pause_dedup_key 在 24h 内已存在 → skip（写 audit 'M3_PAUSE_DEDUP_SKIP'）
         │    否则 → 调 data-store-ads.pauseAdsForAsin(asin)
         │             - UPDATE lx_campaigns SET enabled=0 WHERE asin=?
         │             - INSERT lx_operation_logs(action='paused_by_m4_hijack', source='M4')
         │             - INSERT ad_suggestions(skipAnomalyEmit=1, source_strategy_name='M4 跟卖联动')
         ├─ 自动起 m4_appeals(violation_type='hijacking_counterfeit', status='draft')
         ├─ INSERT m4_notifications(severity='P0', source_module='M4A', title='跟卖确认假货 → 已暂停 24h 广告')
         └─ appendAuditLog('HIJACK_CONFIRM_COUNTERFEIT') + appendAuditLog('M3_PAUSE_ADS_FROM_M4')
```

**24h 自动恢复**：在 `m4_hijacking/:id/close` 或定时巡检（mock 触发）检测 dedup_key 超过 24h → 调 `resumeAdsForAsin` + audit `M3_RESUME_ADS_FROM_M4`。

**循环防护**：M3 端 `pauseAdsForAsin` 标记 `skipAnomalyEmit=1`，M3 内置异常监视器（如有）见此标记跳过 emit anomaly to M4。

### 5.2 M4 图片差异 → M1 创建优化 target

**触发链**：

```
POST /m4/image-diffs/:id/push-m1
   └─→ pushImageDiffToM1()
         ├─ 读取 m4_image_diffs row（含 competitor_asin、image_role、ai_analysis）
         ├─ 查 m4_competitor_snapshots 找对应 our_asin（若有）
         ├─ 调 data-store-listings.createOptimizationTarget({
         │      mode: ourAsinExists ? 'existing' : 'asin_input',
         │      productId / asin,
         │      new_target_keywords: 从 ai_analysis 提取关键词,
         │      source: 'm4_image_diff:'+diffId
         │   }) → 返回 m1_target_id
         ├─ UPDATE m4_image_diffs SET pushed_m1_target_id=?, status='pushed'
         ├─ INSERT m4_notifications(severity='P2', source='M4C', link='/listings/optimize/'+m1_target_id)
         └─ appendAuditLog('IMAGE_DIFF_PUSH_M1', resourceId=diffId, payload={m1TargetId})
```

类似管线给 `m4_review_clusters/:id/push-m1` 用。

### 5.3 全局通知总线 — M1/M2/M3/M4 任何关键事件 → 铃铛

**事件源 → m4_notifications 注入**：

| 模块 | 触发动作 | 严重度 | source_module |
|---|---|---|---|
| M1 | listing upload 完成 | P2 | M1 |
| M1 | A/B 实验 winner 显著 | P1 | M1 |
| M2 | 滞销库存 / LTS 倒计时 30 天 | P1 | M2 |
| M2 | 利润 ROAS 持续亏损 5 天 | P0 | M2 |
| M3 | 攻击启动 / 暂停 | P2 | M3 |
| M3 | 单 SKU 单日 ACOS > 阈值 | P1 | M3 |
| M4 | P0 异常（BB 丢失 / ODR） | P0 | M4A |
| M4 | 新负面差评 1-3⭐ | P1 | M4B |
| M4 | 跟卖确认假货 / 广告暂停 | P0 | M4A |
| M4 | 竞品价格 / 图片重大变化 | P2 | M4C |

实现：在每模块 data-store 内对应写操作末尾插入 `data-store-monitor.emitNotification({...})`（封装 `INSERT INTO m4_notifications`）。

**铃铛前端订阅**：`useNotificationsBus.startPolling()` 在 `App.vue` 挂载，15s 查一次 unreadCount；> 0 显示红点；点击 popover 拉最近 10 条；切店清 events。

### 5.4 评价负面爆发 → M4 异常 → 推送通知

```
POST /m4/reviews/sync
   └─→ 同步评论；若短时（24h）≥3 条 1-2 星且同 asin：
         ├─ 自动 INSERT m4_anomalies(anomaly_code='A_REVIEW_NEGATIVE_BURST', severity='P1')
         ├─ INSERT m4_sla_events(detected)
         ├─ INSERT m4_notifications(severity='P1', source='M4B', link='/reviews/list?asin=...')
         └─ audit 'REVIEW_NEGATIVE_BURST'
```

---

## 6. 状态机

### 6.1 Appeal 申诉状态机

```
draft ──submit──▶ submitted ──amazon_review──▶ under_review
   ▲                                                │
   │                                          ┌─────┴─────┐
   │                                       accepted    rejected ──retry──▶ (new draft, parent_appeal_id=this.id)
   │                                                       │
   └──── withdrawn ◀─── (任意状态可 withdraw 除已 accepted) ┘
```

非法跳转 → 400 `state_transition_forbidden`。retry 只在 status='rejected' 时允许。

### 6.2 Recovery Email 状态机

```
pending ──draft──▶ draft ──send──▶ sent ──record-reply──▶ replied ──review-updated──▶ review_updated
                                       │                       │
                                       ├─ next-round (新 round_no+1 draft, parent_email_id=this.id)
                                       └─ failed (发送失败)
                                       └─ closed (放弃)
```

同一 reviewId 允许多轮，round_no 单调递增。

### 6.3 Anomaly 异常状态机

```
open ──assign──▶ assigned ──acknowledge──▶ investigating ──(work)──▶ resolving ──resolve──▶ resolved
  │                  │                          │                                              ▲
  │                  │                          └─ escalate (SLA breach) ──▶ escalated ────────┤
  │                  └─ dismiss (误报) ──▶ dismissed                                            │
  └─ direct resolve（小事件）─────────────────────────────────────────────────────────────────┘
```

`sla_deadline` 由 detected_at + sla_minutes 计算；超时（无 acknowledged_at）→ 后台巡检（mock 触发）写 sla_events(`breached`) + 自动 escalate。

### 6.4 Hijacking 跟卖状态机

```
pending_test_buy ──start──▶ test_buy_in_transit ──upload-proof──┐
                                                                 ├─ counterfeit_confirmed ──draft-appeal──▶ appeal_drafted ──submit──▶ appeal_submitted ──amazon_accept──▶ appeal_accepted ──close──▶ closed
                                                                 └─ genuine_authorized ──▶ genuine ──close──▶ closed
```

### 6.5 Infringement 侵权状态机

```
investigating ──draft (need legalDisclaimerAck)──▶ draft ──submit──▶ submitted ──review──▶ accepted | rejected ──▶ resolved
                                                       └─ dismiss ─▶ dismissed
```

### 6.6 ImageDiff / ReviewCluster 简化状态机

```
new ──push-m1──▶ pushed
   └─ dismiss ──▶ dismissed
```

---

## 7. 种子数据策略（Mulberry32 deterministic）

在 `data-store-monitor.mjs` 新建 `seedMonitorForUser(db, userId, storeId)`，并入 `seedSampleStoreData`。所有随机数走 `mulberry32(hashStr(userId+':'+storeId+':'+tableName))`。

| 表 | 行数 | 关键种子规则 |
|---|---|---|
| m4_anomalies | 12 | 5 P0（BB 丢失 / ODR / 跟卖 / 退款激增 / 销量崩盘），4 P1，3 P2；3 条已 resolved（含 resolution_case_id），2 条 escalated |
| m4_sla_events | ~40 | 每条 anomaly 平均 3 个事件（detected / assigned / acknowledged 或 resolved） |
| m4_resolution_cases | 8 | 5 successful（reusable=1）+ 2 partial + 1 in_progress；引用部分 anomalyIds |
| m4_postmortems | 3 | 1 successful（关联 2 anomaly + 2 case）、1 partial、1 draft |
| m4_hijacking | 4 | 1 pending_test_buy / 1 test_buy_in_transit / 1 counterfeit_confirmed（且 m3_ads_paused=1）/ 1 closed |
| m4_infringement | 3 | trademark draft / patent submitted / counterfeit resolved |
| reviews（扩字段） | 已有数据填 sentiment + cluster_id + appeal_eligible | 50% negative，其中 30% appeal_eligible，20% 已有 appeal_id |
| m4_review_clusters | 6 | 3 negative（按钮松动 / 包装破损 / 充电慢）+ 1 positive（亮点）；每个 samples 3-5 条；其中 2 个已 pushed |
| m4_review_trend_snapshots | 3 asin × 30 天 = 90 行 | 用 mulberry32 在 4.0~4.7 区间生成 avg_rating 序列；LAMP-003 持续 declining |
| m4_appeals | 6 | 2 draft / 2 submitted / 1 accepted / 1 rejected（且有一条 retry） |
| m4_recovery_emails | 5 | 1 pending / 1 draft / 2 sent / 1 review_updated（含 newRating=4） |
| m4_competitor_snapshots | 2 竞品 × 7 天 = 14 行 | B0YYYY1 价格波动 + 1 次 listing change；B0ZZZZ1 BSR 稳定 |
| m4_image_diffs | 3 | main 角标 / gallery_3 对比图 / a_plus_2 新增模块；其中 1 已 pushed |
| m4_brand_defense_layers | 4 | L1 enabled / L2 partial / L3 disabled / L4 monitoring；brand_keywords 5 个 |
| m4_notifications | 8 | 3 P0（含来自 M2 ROAS / M4 BB 丢失）+ 3 P1（M4B 新差评 / M3 ACOS）+ 2 P2（M4C 竞品 / M1 listing upload） |

**确定性验证**：登录 demo 用户 → 任意端点连续 5 次返回 byte-identical row id 列表（不含 `now()` 字段）。

---

## 8. 审计与回滚

所有 M4 写操作必走 `appendAuditLog(userId, storeId, { sourceModule:'M4', actionType, resourceType, resourceId, payload, description })`。

### 8.1 完整 actionType 清单（35 个）

| actionType | resourceType | forward | revert 逻辑 |
|---|---|---|---|
| `ANOMALY_CREATE` | anomaly | INSERT m4_anomalies | DELETE row + DELETE sla_events |
| `ANOMALY_ASSIGN` | anomaly | UPDATE assignee | UPDATE 回旧 assignee（从 payload.prev 取） |
| `ANOMALY_ACK` | anomaly | SET acknowledged_at | NULL acknowledged_at + DELETE 对应 sla_event |
| `ANOMALY_RESOLVE` | anomaly | SET status=resolved | 状态回 investigating |
| `ANOMALY_DISMISS` | anomaly | SET status=dismissed | 回 open |
| `ANOMALY_ESCALATE` | anomaly | SET status=escalated | 回 assigned |
| `CASE_CREATE` | case | INSERT | DELETE |
| `CASE_UPDATE` | case | UPDATE | 回 payload.before |
| `POSTMORTEM_GENERATE` | postmortem | INSERT | DELETE |
| `POSTMORTEM_UPDATE` | postmortem | UPDATE | 回 payload.before |
| `HIJACK_SCAN` | hijacking | 批量 INSERT | DELETE 新增 rows |
| `HIJACK_START_TESTBUY` | hijacking | UPDATE status | 回 pending_test_buy |
| `HIJACK_CONFIRM_COUNTERFEIT` | hijacking | 多重副作用 | 联动撤销（含 M3 恢复广告） |
| `HIJACK_SUBMIT_APPEAL` | hijacking | UPDATE | 回 appeal_drafted |
| `M3_PAUSE_ADS_FROM_M4` | campaign_set | M3 enabled=0 | M3 enabled=1（M3 既有 revert 路径） |
| `M3_RESUME_ADS_FROM_M4` | campaign_set | M3 enabled=1 | M3 enabled=0 |
| `INFRINGEMENT_CREATE` | infringement | INSERT | DELETE |
| `DRAFT_IP_COMPLAINT` | infringement | UPDATE draft_content + status=draft | 回 investigating |
| `SUBMIT_IP_COMPLAINT` | infringement | UPDATE status=submitted | 回 draft |
| `IP_COMPLAINT_RESOLVE` | infringement | UPDATE status | 回 submitted |
| `REVIEW_SYNC` | review_set | 批量 INSERT/UPDATE | 删新增 + 字段还原 |
| `REVIEW_MARK_APPEAL` | review | UPDATE appeal_eligible | 反向 |
| `REVIEW_NEGATIVE_BURST` | anomaly | INSERT anomaly | DELETE |
| `PUSH_M1_IMPROVEMENT` | m1_target | M1 创 target | M1 删 target（draft 状态时）+ 清 pushed_m1_target_ids |
| `REVIEW_CLUSTER_RECOMPUTE` | cluster_set | 重写 m4_review_clusters | 不支持（标 unrecoverable） |
| `CLUSTER_PUSH_M1` | cluster | UPDATE status=pushed + 创 M1 | 撤销 M1 target |
| `TREND_SNAPSHOT` | trend_set | INSERT 多行 | DELETE 当日 snapshot |
| `DRAFT_REVIEW_APPEAL` | appeal | INSERT draft | DELETE |
| `SUBMIT_APPEAL` | appeal | UPDATE status=submitted | 回 draft |
| `APPEAL_REVIEW` | appeal | UPDATE outcome | 回 submitted |
| `APPEAL_RETRY` | appeal | INSERT 新 appeal（parent 链） | DELETE 新行 |
| `DRAFT_RECOVERY_EMAIL` | recovery | INSERT draft | DELETE |
| `SEND_RECOVERY_EMAIL` | recovery | UPDATE status=sent | 回 draft |
| `RECOVERY_REPLY` | recovery | UPDATE replied_* | 清 replied_* |
| `RECOVERY_NEXT_ROUND` | recovery | INSERT round+1 | DELETE 新行 |
| `COMPETITOR_ADD` | competitor | INSERT snapshot 初始行 | DELETE |
| `COMPETITOR_SNAPSHOT` | competitor_set | INSERT 多行 | DELETE 该批 |
| `COMPETITOR_DISMISS_CHANGE` | competitor | UPDATE listing_changes[idx].dismissed | 取消 dismissed |
| `IMAGE_DIFF_SCAN` | image_diff_set | INSERT 多行 | DELETE 新行 |
| `IMAGE_DIFF_PUSH_M1` | image_diff | UPDATE + 创 M1 target | 撤销 M1 + status 回 new |
| `ENABLE_BRAND_DEFENSE_LAYER` | brand_layer | UPDATE status=enabled | 回 disabled / partial |
| `DISABLE_BRAND_DEFENSE_LAYER` | brand_layer | UPDATE status=disabled | 回 enabled |
| `BRAND_COUNTER_ATTACK` | keyword_set | M3 加价 | M3 减价（调 lx_targetings bulk-bid 反向） |

### 8.2 revert dispatch 实现

在 `data-store-monitor.mjs` 导出 `revertM4Action(db, userId, storeId, auditRow)`，模仿 `_revertM3AdsAction` 风格：

```js
export function revertM4Action(db, userId, storeId, r) {
  const payload = JSON.parse(r.payload || '{}');
  switch (r.action_type) {
    case 'ANOMALY_ASSIGN': /* UPDATE m4_anomalies SET assignee_user_id=?, assignee_label=? */; return true;
    case 'M3_PAUSE_ADS_FROM_M4': /* 调 data-store-ads.resumeAdsForAsin */; return true;
    case 'IMAGE_DIFF_PUSH_M1': /* 调 data-store-listings.deleteTarget + UPDATE m4_image_diffs */; return true;
    // ...
    default: return false;
  }
}
```

在 `data-store.mjs.revertAuditLog()` 内 dispatcher 增加 `dispatched ||= _revertM4Action(db, userId, storeId, r)`。

---

## 9. 10 个端到端测试场景

### 场景 1：异常发现 → 分派 → 确认 → 解决

- **Given** seed 后有 12 条 anomalies，1 条 'open' 无 assignee
- **When**
  1. `GET /m4/anomalies?status=open`
  2. `POST /m4/anomalies/:id/assign { assigneeUserId, assigneeLabel:'张运营' }`
  3. `POST /m4/anomalies/:id/acknowledge`
  4. `POST /m4/anomalies/:id/resolve { resolutionCaseId:'rc-005' }`
- **Then**
  - `m4_anomalies.status` 演化：`open → assigned → assigned (acknowledged_at not null) → resolved`
  - `m4_sla_events` 新增 3 行（assigned / acknowledged / resolved）
  - `audit_logs` 出现 ANOMALY_ASSIGN / ANOMALY_ACK / ANOMALY_RESOLVE
  - 跨刷新 UI 显示状态保持

### 场景 2：SLA 超时自动升级

- **Given** 一条 P0 anomaly，sla_minutes=5
- **When** 等待 6 分钟（mock 后台 tick 触发巡检）
- **Then**
  - `m4_anomalies.sla_breached=1`、`status='escalated'`
  - `m4_sla_events` 含 `breached` + `escalated`
  - `m4_notifications` 新增一条 P0 升级通知
  - 铃铛 unreadCount += 1

### 场景 3：Resolution Case 全流程

- **Given** anomaly A4 BB 丢失
- **When**
  1. `POST /m4/cases { anomalyId, scenario:'BB 丢失 / 跟卖低价', actionPlan:'Test Buy + 申诉' }`
  2. `PUT /m4/cases/:id { status:'successful', outcome:'7 天跟卖被踢，BB 恢复', reusable:true }`
  3. `GET /m4/cases/recommend?anomalyId=newAnomaly` 验证返回该 case
- **Then** reference_count 自动 +1；reusable=1 出现在案例库公共池

### 场景 4：Postmortem 自动生成

- **Given** 2 条 resolved anomalies + 2 cases
- **When** `POST /m4/postmortems/generate { anomalyIds:[a1,a2], title:'5 月 BB 危机复盘' }`
- **Then**
  - `m4_postmortems` 新增 1 条
  - `timeline` JSON 含 detected/resolved 时间戳串
  - `improvements` 含 ≥2 条
  - audit `POSTMORTEM_GENERATE`

### 场景 5：跟卖 → M3 暂停广告联动（防循环）

- **Given** hijacking item status=test_buy_in_transit, asin=B0CASE001
- **When**
  1. `POST /m4/hijacking/:id/upload-proof { proofImages:['...'], type:'counterfeit_confirmed' }`
  2. 1 分钟内对同 asin 第二次 confirm（mock 测试）
- **Then**
  - 第 1 次：`lx_campaigns` 中 asin=B0CASE001 的 campaign `enabled=0`；`m4_hijacking.m3_ads_paused=1`；`ad_suggestions` 新增 1 条 `skipAnomalyEmit=1`；audit `M3_PAUSE_ADS_FROM_M4`
  - 第 2 次：返回 409 `conflict`，audit `M3_PAUSE_DEDUP_SKIP`，未重复 pause
  - 24h 后调 `/:id/close` 自动 `M3_RESUME_ADS_FROM_M4`

### 场景 6：侵权举报全流程

- **Given** infringement type=trademark, status=investigating
- **When**
  1. `POST /:id/draft { legalDisclaimerAck:true }`（未勾选返回 400 `validation_failed`）
  2. `POST /:id/submit { amazonComplaintId:'IP-2026-XX' }`
  3. `POST /:id/resolve { outcome:'accepted' }`
- **Then** 状态机 `investigating → draft → submitted → accepted → resolved`；每步 audit

### 场景 7：评论聚类 → 推送 M1

- **Given** review cluster '按钮松动' (root_cause=product_quality, improvements=[{layer:'listing'},{layer:'manufacturer'}])
- **When** `POST /m4/review-clusters/:id/push-m1 { layer:'listing' }`
- **Then**
  - `m1_optimization_targets` 新增一行 mode='existing', source='m4_cluster:cl-xxx'
  - `m4_review_clusters.pushed_m1_target_ids` 含该 target id, status=pushed
  - 通知 `m4_notifications`（P2, link=`/listings/optimize/<id>`）
  - audit `CLUSTER_PUSH_M1` + `PUSH_M1_IMPROVEMENT`
  - 回滚该 audit → M1 target 被 delete + cluster.status 回 'new'

### 场景 8：申诉 草稿 → 提交 → 驳回 → 重提

- **Given** review r-001 appeal_eligible=1
- **When**
  1. `POST /m4/appeals/draft { reviewId:'r-001', violationType:'unrelated_to_product', payload:{...} }`
  2. `POST /m4/appeals/:id/submit`
  3. `POST /m4/appeals/:id/review { outcome:'rejected', amazonResponse:'Insufficient evidence' }`
  4. `POST /m4/appeals/:id/retry { note:'补充截图' }`
  5. 直接对 retry 后 appeal `POST submit` 跳过 draft 编辑 → 验证 status 转 submitted
  6. 尝试 retry 仍在 submitted 状态 → 400 `state_transition_forbidden`
- **Then** 链路完整；retry 后新 appeal 的 `parent_appeal_id` 指向被驳回 appeal；retry_count++

### 场景 9：Recovery 邮件多轮跟进

- **Given** review r-002 negative, no recovery
- **When**
  1. `POST /m4/recovery/draft { reviewId:'r-002', templateId:'tpl-apology' }` → round_no=1, status=draft
  2. `POST /:id/send` → status=sent
  3. 7 天无回复 → `POST /:id/next-round` → 新邮件 round_no=2, parent_email_id=email-1
  4. 第 2 轮发送 → `POST /:id2/record-reply { repliedBody:'thanks', reviewUpdated:true, newRating:4 }`
- **Then** 2 条 m4_recovery_emails 链式；review.recovery_status='review_updated'；audit 4 条

### 场景 10：竞品快照 + 图片差异 → M1

- **Given** competitor B0YYYY1 已添加，无 snapshot
- **When**
  1. `POST /m4/competitors/snapshot { asins:['B0YYYY1'] }` 第 1 次
  2. 等 1 分钟（mock），再 `snapshot` 第 2 次（价格变化 -20% + main image phash 距离 30）
  3. `GET /m4/competitors/B0YYYY1/timeline` 验证 listing_changes 含 price dimension
  4. `POST /m4/image-diffs/:id/push-m1`
  5. 在 `/notifications` 验证 P2 通知出现 + 铃铛 unreadCount +1
- **Then**
  - `m4_competitor_snapshots` 2 行；第 2 行 listing_changes JSON 含 price from=>to
  - `m4_image_diffs` 新增 1 行 status=new
  - push-m1 后 `m1_optimization_targets` 新增 + image_diffs.status=pushed
  - 切换浏览器 tab/F5 → 铃铛红点保持；点击跳 `/listings/optimize/:id`

### 场景 11（额外·总线）：负面爆发触发跨模块通知风暴控制

- **Given** asin=CASE-001
- **When** `POST /m4/reviews/sync` mock 注入 5 条 1-2 星 review (同 asin, 1 分钟内)
- **Then**
  - 自动新建 1 条 `A_REVIEW_NEGATIVE_BURST` anomaly（不是 5 条）— 防风暴去重 key=`burst:asin:date`
  - `m4_notifications` 仅 1 条 P1
  - 铃铛 unreadCount += 1（不是 5）

---

## 10. DoD 验收标准

### 后端

- 13 张新表 + 现有 `reviews` ALTER 跨重启存活；DDL 幂等
- 57 个 endpoints 401/403/404/400/409/422/200/201 路径正确
- 每个写操作必写 `audit_logs(source_module='M4', action_type=...)`；revertM4Action dispatch ≥30 个 actionType
- `removeUserStore()` 联动清理 14 张表（13 新 + reviews 双分区行）
- 跨模块联动 3 条管线全部工作：
  - 跟卖 → M3 pause（带 24h dedup + skipAnomalyEmit）
  - 图片差异 / cluster → M1 createOptimizationTarget
  - M1/M2/M3 写操作 → m4_notifications 注入
- 种子：登录 demo 看到 12 anomalies / 8 cases / 3 postmortems / 4 hijacking / 6 clusters / 6 appeals / 5 recovery / 14 competitor snapshot / 3 image diffs / 4 brand layers / 8 notifications

### 前端

- `npm run build` 通过，0 `mock-data-extras` / `mock-data.mockReviews` / `mock-data-ads.mockBrandDefense` import 残留于 M4 区
- 16 个 .vue 页面 onMounted 调真 API；列表 / 详情 / 写操作 / 错误路径均通
- `useNotificationsBus` 在 `App.vue` 挂载，铃铛红点跨刷新一致
- 跨 F5：URL query / 草稿 localStorage / 选中 id / tab / filter 全保留
- 切店：清 query + 清草稿 + 清通知 events

### 跨模块联动可见性

- 在 `/audit` 中筛 sourceModule=M4 可见 35 个 actionType
- 跟卖 confirm 后到 M3 `/ads/lx/op-log?campaignId=...` 能看到 `paused_by_m4_hijack` 1 条
- ImageDiff push 后到 M1 `/listings/optimize/:id` URL 直接可达
- 任何模块的写操作完成后，3-15s 内 NotificationBell 红点 +1

### 性能

- 异常 / 通知列表 GET p95 < 200ms
- unread-count p99 < 30ms
- snapshot / sync / 聚类 recompute p95 < 1.5s（mock 数据 < 50 行）
- bell 轮询 1 次 < 50ms（含已读 join）

### 测试

- 10 + 1 场景每个跑 5 次 0 failures
- 种子确定性：连续 5 次 fresh init → row id 列表 byte-identical
- audit revert：随机选 20 条 M4 audit 回滚 → 数据库状态全部正确反转

---

## 11. 风险与缓解

### 11.1 跨模块循环触发

**风险**：M4 跟卖 pause M3 → M3 触发 ACOS 异常 → M4 写 anomaly → 用户在 M4 误判再次 trigger M3。
**缓解**：
- `ad_suggestions.skipAnomalyEmit` 字段：M4 写入 M3 时打标，M3 异常监视器读到 skipAnomalyEmit=1 直接跳过
- `m4_hijacking.m3_pause_dedup_key='hj-'+asin+'-'+yyyymmdd`：24h 内 unique
- `data-store-monitor.confirmHijackingCounterfeit` 用 `db.transaction(() => {...})()` 包裹整套副作用

### 11.2 并发写

**风险**：scan / snapshot / sync 三类批量端点可能并发产生重复行。
**缓解**：
- 用业务唯一键 unique index（如 `m4_competitor_snapshots(user_id, store_id, competitor_asin, snapshot_at)`）
- INSERT 前先 SELECT；冲突走 UPSERT or 跳过

### 11.3 JSON-as-TEXT 字段

**风险**：evidence / improvements / changes 直接读出含 `'`、`"` 时引号转义错误，前端解析失败。
**缓解**：
- 所有写入用 `JSON.stringify`；所有读出用 `try { JSON.parse(text || '[]') } catch { return [] }`
- 字符串字段（如 ai_analysis）不允许嵌入未转义双引号；mock 模板控制源头

### 11.4 通知风暴

**风险**：5 条同 asin 1 星差评 → 5 条 P1 通知 → 邮件 / 微信被刷爆。
**缓解**：
- `INSERT INTO m4_notifications` 前先用 `(user_id, store_id, source_event, related_resource_id, since 5min)` 做去重
- 静默时段（settings.silent_window）跳过 email/wechat 通道，仅站内显示
- 同 `source_event:related_resource_id` 5 分钟窗口内合并为 1 条；显示 `+N` 计数
- 用户可在设置中配置：`maxPerHour=20`、`p2_throttle=15min`

### 11.5 ALTER TABLE 幂等

**风险**：SQLite `ALTER TABLE reviews ADD COLUMN` 在已有列时报错，导致冷启动崩溃。
**缓解**：
- `migrateReviewsTable(db)`：`PRAGMA table_info(reviews)` → 检查列名集合 → 仅对缺失列执行 ALTER；写在 `initSchema()` 之后单独 try/catch

### 11.6 状态机非法跳转

**风险**：前端误调用 `submit` 在已 accepted 状态。
**缓解**：每个写端点入口校验 `currentStatus ∈ allowedFromSet`，否则 400 `state_transition_forbidden`；前端按钮 disabled 也按状态机控制。

### 11.7 删除店铺联动

**风险**：reviews 表有列扩展但不属于 m4_* 前缀，cleanup 可能漏。
**缓解**：`MONITOR_TABLES_TO_CLEAN` 显式列出 reviews + 13 张 m4_* 表；`removeUserStore` 测试用例覆盖。

### 11.8 铃铛轮询负载

**风险**：每 15s 拉一次 unread-count + list，多用户并发可能压爆。
**缓解**：
- `/m4/notifications/unread-count` 走 count(*) + index，p99 < 30ms
- 视觉变化时（页面隐藏）暂停轮询，`document.visibilitychange` 监听
- 后续可升级为 SSE / WebSocket（v2）

### 11.9 M1 / M3 联动接口稳定性

**风险**：M4 直接调用 M1 `createOptimizationTarget` / M3 `pauseAdsForAsin`，若 M1/M3 重构会破坏 M4。
**缓解**：
- 这两个跨模块 helper 在 `data-store-listings.mjs` / `data-store-ads.mjs` 显式 `export`，并在 M1/M3 spec 中标注"M4 入口稳定 API"
- 入口签名不可破坏性变更需 spec 协商
