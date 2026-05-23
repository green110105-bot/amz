# 跨模块：自动操作审计中心

> **状态**：开发就绪规格
> **版本**：v1.0
> **最后更新**：2026-05-08
> **依赖**：M2 / M3 / M4 各自的自动执行机制

---

## 1. 为什么需要

M2、M3、M4 都有"自动执行"动作：
- M2：小额漏点自动修复（暂停 Campaign / 调出价 / 修改采购成本估算）
- M3：广告策略自动执行（出价调整 / 否词 / 加预算 / 暂停）
- M4：异常自动处置（跟价 / 申诉草稿 / 模板回复）

**问题**：
- 各模块独立日志 → 用户找不到全部
- 无统一回滚 → 多模块同时改广告时可能冲突
- 无统一审计 → 出问题归责困难

**解决**：建立**统一的"自动操作审计中心"**，所有跨亚马逊 API 的写操作必须经过它。

---

## 2. 核心职责

| 职责 | 描述 |
|---|---|
| **统一记录** | 所有 M2/M3/M4 的自动写操作（API 调用 + 输入 + 输出 + 上下文）落地一份 |
| **冲突检测** | 同一资源（Campaign / Listing / 价格）短时间多源调整时，检测冲突并阻断 |
| **统一回滚** | 7 天内的自动操作可一键回滚，且联动反向 API 调用 |
| **限流配额** | 跨模块统一管控"单租户日自动操作上限"，避免某模块异常导致超限 |
| **失败熔断** | 单模块连续 3 次失败 → 暂停该模块 4h；跨模块 5 次失败 → 全自动模式紧急停止 |
| **可解释审计** | 每条记录可回溯：哪个 AI 决策 → 哪个 prompt → 哪个上下文 → 哪条规则 |

---

## 3. 数据模型

```sql
-- 统一审计表（M2/M3/M4 的自动操作全部入此表）
CREATE TABLE audit_center_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- 来源
  source_module VARCHAR(10) NOT NULL,    -- 'M2' / 'M3' / 'M4'
  source_decision_id UUID,               -- 关联到原模块的决策记录
  source_action_type VARCHAR(50),        -- 标准枚举（见 §4）
  
  -- 范围
  resource_type VARCHAR(30),             -- 'campaign' / 'keyword' / 'listing' / 'price' / 'review_appeal' / ...
  resource_id VARCHAR(100),              -- Campaign ID / SKU / ASIN / Review ID
  
  -- 操作
  amazon_api VARCHAR(100),               -- 调用的 Amazon API 名
  request_payload JSONB,
  response_payload JSONB,
  
  -- 状态
  status VARCHAR(20),                    -- 'queued' / 'in_progress' / 'success' / 'failed' / 'reverted'
  error_message TEXT,
  
  -- 时间
  queued_at TIMESTAMP DEFAULT NOW(),
  executed_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- 执行者
  executor VARCHAR(20),                  -- 'auto_system' / 'user_manual' / 'user_batch'
  user_id UUID REFERENCES users(id),
  
  -- 跟踪
  before_snapshot JSONB,                 -- 操作前资源状态
  after_snapshot JSONB,
  outcome_metrics JSONB,                 -- 7/14/30 天后的效果跟踪
  
  -- 回滚
  is_reverted BOOLEAN DEFAULT FALSE,
  reverted_at TIMESTAMP,
  reverted_by VARCHAR(20),               -- 'user' / 'system_safety' / 'auto_failure_circuit'
  revert_reason TEXT,
  reverse_log_id UUID,                   -- 回滚操作的 log id
  
  -- 元数据
  ai_decision_chain JSONB,               -- 完整推理链（prompt + reasoning）
  
  CONSTRAINT idx_audit_resource_time
    UNIQUE (tenant_id, resource_type, resource_id, queued_at)
);

CREATE INDEX idx_audit_tenant_time ON audit_center_logs(tenant_id, queued_at DESC);
CREATE INDEX idx_audit_source_module ON audit_center_logs(source_module, status);
CREATE INDEX idx_audit_resource ON audit_center_logs(resource_type, resource_id);
CREATE INDEX idx_audit_revertable ON audit_center_logs(tenant_id, executed_at)
  WHERE is_reverted = FALSE AND status = 'success';
```

```sql
-- 资源锁（短时间内同资源被多源操作 → 冲突检测）
CREATE TABLE resource_locks (
  resource_type VARCHAR(30),
  resource_id VARCHAR(100),
  acquired_by_module VARCHAR(10),
  acquired_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  audit_log_id UUID REFERENCES audit_center_logs(id),
  PRIMARY KEY (resource_type, resource_id)
);
```

```sql
-- 跨模块配额
CREATE TABLE auto_operation_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- 单日配额
  daily_max_operations INTEGER DEFAULT 200,
  daily_used INTEGER DEFAULT 0,
  daily_reset_at TIMESTAMP,
  
  -- 单模块配额
  module_quotas JSONB,
    -- {"M2": 50, "M3": 100, "M4": 50}
  
  -- 失败计数
  consecutive_failures_per_module JSONB,
    -- {"M2": 0, "M3": 2, "M4": 1}
  total_failures_today INTEGER DEFAULT 0,
  
  -- 熔断状态
  circuit_breaker_state JSONB,
    -- {"M2": {"open": false}, "M3": {"open": false, "until": null}, "global": {"open": false}}
  
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. 标准动作枚举

所有自动操作必须使用以下标准类型（防止字符串散乱）：

```
M2 来源：
  - profit.adjust_estimated_cost      调整估算成本
  - inventory.create_removal_order    创建移除订单
  - inventory.match_amazon_price       跟价（来自滞销 / 跟价决策）
  - po.update_status                   更新 PO 状态
  - po.create_from_recommendation      从建议生成 PO 草稿

M3 来源：
  - ad.adjust_bid                      调整出价
  - ad.adjust_budget                   调整预算
  - ad.add_negative_keyword            添加否词
  - ad.pause_campaign                  暂停 Campaign
  - ad.resume_campaign                 恢复 Campaign
  - ad.promote_search_term             转手动关键词
  - ad.create_creative                 创建创意
  - ad.start_ab_test                   启动 A/B

M4 来源：
  - monitor.match_competitor_price     跟价（异常响应）
  - monitor.start_coupon               启动 Coupon
  - monitor.submit_review_appeal       提交评论申诉
  - monitor.send_recovery_email        发送挽回邮件
  - monitor.send_buyer_message_template 客服模板回复
  - monitor.acknowledge_anomaly        确认异常
```

---

## 5. 写操作流程（必须经过审计中心）

```
[ 模块决策（M2/M3/M4） ]
         ↓
[ 创建 audit_center_logs 记录（status=queued） ]
         ↓
[ 检查配额 + 熔断状态 ]
   ├─ 超配额 → 拒绝 + 标 'rejected_quota'
   └─ 熔断中 → 拒绝 + 标 'rejected_circuit_breaker'
         ↓
[ 申请资源锁（resource_locks，TTL=60s） ]
   ├─ 锁失败 → 标 'rejected_conflict'，返回冲突详情
   └─ 锁成功 → 继续
         ↓
[ 调用 Amazon API（实际执行写操作） ]
   ├─ 成功 → status='success'，记录响应 + 释放锁
   └─ 失败 → status='failed'，记录错误 + 释放锁 + 失败计数 +1
         ↓
[ 启动效果跟踪 Worker ]
   - 7/14/30 天采集 outcome_metrics
   - 写回 audit_center_logs.outcome_metrics
```

---

## 6. 冲突检测规则

| 冲突类型 | 例子 | 处理 |
|---|---|---|
| 同资源同时多源 | M2 在改某 SKU 价格 + M4 也在跟价同 SKU | 后到者 rejected_conflict，提示用户 |
| 反向操作短时间内 | 1 小时前刚加预算，现在又要降 | 警告 + 需用户额外确认 |
| 用户手动 + 自动 | 用户刚改了 Listing，自动模式又要改 | 自动模式跳过 + 通知用户"已检测到手动改动" |

---

## 7. 一键回滚

### 7.1 单条回滚

UI 上每条审计记录有"回滚"按钮（7 天内）：

```
[审计] 2026-05-07 10:30 - M3 调整出价
  关键词 "phone case" $1.50 → $1.20
  操作者：自动系统
  状态：成功
  跟踪：14 天后 ROAS +12%
  [回滚此操作]
```

回滚 = 系统调用反向 API 调整回 $1.50，并在新的 audit_log 中标 reverse_log_id 关联。

### 7.2 批量回滚

按时间窗 / 模块筛选 → 批量回滚（用于"昨晚自动模式跑歪了"场景）：

```
[批量回滚] 2026-05-07 03:00 - 06:00 期间所有 M3 自动操作
  共 23 条 → 全部回滚
  确认？[确认] [取消]
```

### 7.3 回滚不可用场景

- 操作 > 7 天（亚马逊数据已沉淀，回滚不准确）
- 操作类型不可逆（如"Listing 已被亚马逊审核拒"）
- 关联资源已变（如 Campaign 已删除）

---

## 8. 熔断机制

```yaml
熔断规则：
  
  单模块连续失败 3 次（24h 内）：
    - 该模块自动模式暂停 4h
    - 通知 admin
  
  单模块单日失败 ≥ 10 次：
    - 该模块自动模式停止当日剩余时间
    - 紧急通知
  
  全租户单日失败 ≥ 30 次：
    - 全部自动模式紧急停止
    - 通知所有 admin + 系统支持
  
  Amazon API 5xx 连续 5 次：
    - 全自动模式暂停 2h（亚马逊侧问题）
    - 重启时分批恢复
```

---

## 9. UI

### 9.1 主页：`/audit`

```
┌── 自动操作审计中心 ──────────────────────────┐
│                                                │
│ 今日操作: 47 条 (M2: 5, M3: 38, M4: 4)        │
│ 成功率: 96% (45 成功 / 2 失败)                 │
│                                                │
│ 配额: 47/200 (24% 已用)                        │
│ 熔断状态: 🟢 所有模块正常                       │
│                                                │
│ [筛选: 模块 ▾] [类型 ▾] [状态 ▾] [时间]        │
│                                                │
│ 时间          模块  类型          资源    状态  │
│ 10:30:15  M3   调整出价      KW-X    ✓     │
│ 10:25:02  M4   跟价          B0XXX   ✓     │
│ 10:20:31  M3   暂停 Campaign C-001   ✓     │
│ ...                                            │
│                                                │
│ [批量回滚选中] [导出审计报告]                  │
└────────────────────────────────────────────────┘
```

### 9.2 详情页：`/audit/{id}`

完整可视化：
- 决策起源（链回原模块决策记录）
- 完整 AI 推理链
- 操作前后状态
- 30 天效果跟踪图

---

## 10. API 端点

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/audit | 审计列表 |
| GET | /api/v1/audit/{id} | 详情 |
| POST | /api/v1/audit/{id}/revert | 回滚 |
| POST | /api/v1/audit/batch-revert | 批量回滚 |
| GET | /api/v1/audit/quotas | 当前配额 |
| GET | /api/v1/audit/circuit-breakers | 熔断状态 |
| POST | /api/v1/audit/circuit-breakers/reset | 重置熔断（admin） |
| GET | /api/v1/audit/conflicts | 待解决冲突 |

---

## 11. 实施 Checklist

- [ ] 数据模型创建（audit_center_logs / resource_locks / auto_operation_quotas）
- [ ] M2/M3/M4 所有写操作改造：必须经过审计中心 SDK
- [ ] 冲突检测逻辑实现
- [ ] 反向 API 映射表（每个动作 → 对应回滚动作）
- [ ] 熔断器实现（按模块 + 全局）
- [ ] 配额限流实现
- [ ] 审计 UI（列表 + 详情 + 批量回滚）
- [ ] 效果跟踪 Worker（7/14/30 天采集）
- [ ] 单元测试 + 集成测试
- [ ] 5 轮自迭代质量门禁

---

## 12. 验收标准

- [ ] 100% 的 M2/M3/M4 自动写操作经过审计中心
- [ ] 冲突检测召回率 ≥ 95%（同资源 60s 内多源改动）
- [ ] 7 天内回滚成功率 ≥ 99%（除资源已变情况）
- [ ] 熔断触发后 100% 暂停对应模块
- [ ] 审计页加载 < 1s（10000 条记录）

---

> **本文档定义跨模块的写操作管控基础设施。任何 M2/M3/M4 的自动执行都必须先实现到此规范。**
