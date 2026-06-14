<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { formatCurrency } from '../utils/format';

const props = defineProps({
  suggestion: { type: Object, required: true },
});
const emit = defineEmits(['execute', 'auto-toggle', 'reject', 'view-detail']);
const router = useRouter();

function gotoStrategy() {
  router.push({ path: '/ads/strategies', query: { focus: props.suggestion.sourceStrategyId } });
}

const s = computed(() => props.suggestion);

const stateMeta = computed(() => {
  const map = {
    pending: { label: '待处理', type: 'warning' },
    observing: { label: '观察中', type: 'primary' },
    accepted: { label: '已采纳', type: 'success' },
    rejected: { label: '已忽略', type: 'info' },
    succeeded: { label: '已生效', type: 'success' },
    failed: { label: '未达预期', type: 'danger' },
  };
  return map[s.value.state] || map.pending;
});

const timeText = computed(() => {
  const d = new Date(s.value.timeBucket);
  const hour = d.getHours().toString().padStart(2, '0');
  return `${hour}:${d.getMinutes().toString().padStart(2, '0')}`;
});

const observeProgress = computed(() => {
  if (s.value.state !== 'observing' || !s.value.acceptedAt) return 0;
  const elapsed = (Date.now() - new Date(s.value.acceptedAt).getTime()) / 3600000;
  return Math.min(100, Math.round((elapsed / s.value.observationWindowHours) * 100));
});

const severityClass = computed(() => 'sev-' + (s.value.severity?.label || 'P2').toLowerCase());
const typedActionLabel = computed(() => s.value.typedAction?.actionPrimitiveLabel || s.value.typedAction?.actionPrimitive || s.value.actionType?.label || '动作');
const evidenceCount = computed(() => s.value.evidenceRefs?.length || s.value.evidence?.length || 0);
// X-P1-01: default to 'unknown' (not 'mock seed') so real-but-unlabeled data is
// never falsely branded as mock. Absent freshness means "来源未知".
const sourceFreshness = computed(() => s.value.sourceMeta?.freshness || 'unknown');
const impactLabel = computed(() => s.value.impactEstimate?.label || s.value.impact?.label || '待估算');
const confidenceFinal = computed(() => s.value.confidenceBreakdown?.final ?? s.value.confidence ?? 0);
const guardrailMeta = computed(() => {
  const status = s.value.guardrail?.status || 'needs_review';
  const map = {
    passed: { label: s.value.guardrail?.statusLabel || '护栏通过', type: 'success' },
    needs_review: { label: s.value.guardrail?.statusLabel || '需要复核', type: 'warning' },
    blocked: { label: s.value.guardrail?.statusLabel || '已阻断', type: 'danger' },
  };
  return map[status] || map.needs_review;
});
const rollbackText = computed(() => {
  const rb = s.value.rollback || s.value.rollbackPlan;
  if (!rb) return '回滚待生成';
  if (!rb.reversible) return '无需回滚';
  return `${rb.windowDays || 0} 天可回滚`;
});
</script>

<template>
  <el-card
    shadow="hover"
    class="sug-card"
    :class="['state-' + s.state, severityClass]"
  >
    <!-- 头部：时间 + 严重度 + 动作类型 + 状态 + 跨模块标记 -->
    <div class="head">
      <span class="time">⏱ {{ timeText }}</span>
      <el-tag size="small" effect="dark" :style="{ background: s.severity?.color || '#64748b', borderColor: s.severity?.color || '#64748b' }">
        {{ s.severity?.label || 'AI' }} · {{ s.severity?.text || '建议' }}
      </el-tag>
      <el-tag size="small" effect="plain" :style="{ color: s.actionType?.color || '#3b82f6', borderColor: s.actionType?.color || '#3b82f6' }">
        <el-icon v-if="s.actionType?.icon" style="margin-right: 4px"><component :is="s.actionType.icon" /></el-icon>
        {{ s.actionType?.label || typedActionLabel }}
      </el-tag>
      <el-tag v-if="s.crossModule" size="small" type="warning" effect="dark">
        🔗 跨 {{ s.crossModule }}
      </el-tag>
      <span class="spacer" />
      <el-tag size="small" :type="stateMeta.type" effect="light">{{ stateMeta.label }}</el-tag>
    </div>

    <!-- 来源策略链 -->
    <div v-if="s.sourceStrategyId" class="source-chip" @click.stop="gotoStrategy">
      <el-icon><MagicStick /></el-icon>
      <span class="source-label">来源策略</span>
      <span class="source-name">{{ s.sourceStrategyName }}</span>
      <el-icon class="source-arrow"><Right /></el-icon>
    </div>

    <div class="contract-strip">
      <span class="contract-chip primary">
        <b>TypedAction</b>{{ typedActionLabel }}
      </span>
      <span class="contract-chip" :class="'guard-' + (s.guardrail?.status || 'needs_review')">
        <b>Guardrail</b>{{ guardrailMeta.label }}
      </span>
      <span class="contract-chip">
        <b>EvidenceRef</b>{{ evidenceCount }} 条
      </span>
      <span class="contract-chip">
        <b>Rollback</b>{{ rollbackText }}
      </span>
      <span class="contract-chip muted">
        <b>Source</b>{{ sourceFreshness }}
      </span>
    </div>

    <!-- 实体路径 -->
    <div class="entity">
      <span v-if="s.entity?.sku" class="entity-chip"><b>SKU</b>&nbsp;{{ s.entity.sku }}</span>
      <span v-if="s.entity?.keyword && s.entity.keyword !== '—'" class="entity-chip">
        <b>kw</b>&nbsp;<i>"{{ s.entity.keyword }}"</i>
      </span>
      <span v-if="s.entity?.campaign && s.entity.campaign !== '新建' && s.entity.campaign !== 'multi-campaign'" class="entity-chip">
        <b>camp</b>&nbsp;{{ s.entity.campaign }}
      </span>
    </div>

    <!-- 标题 + 摘要 -->
    <h3 class="title">{{ s.title }}</h3>
    <p class="summary">{{ s.summary }}</p>

    <!-- 影响 + 置信度 -->
    <div class="metrics">
      <div class="metric">
        <span class="metric-label">期望影响</span>
        <strong class="metric-impact">{{ impactLabel }}</strong>
      </div>
      <div class="metric">
        <span class="metric-label">AI 置信度</span>
        <strong>{{ Math.round(confidenceFinal * 100) }}%</strong>
      </div>
      <div class="metric">
        <span class="metric-label">历史采纳成功率</span>
        <strong>{{ Math.round((s.historicalSuccessRate || 0) * 100) }}%</strong>
      </div>
    </div>

    <!-- 观察期进度（仅 observing 状态） -->
    <div v-if="s.state === 'observing'" class="observe-bar">
      <span class="observe-label">观察期进度</span>
      <el-progress :percentage="observeProgress" :stroke-width="6" />
      <span class="observe-text">{{ s.observationWindowHours }}h 内 AI 不会重复触发同类建议</span>
    </div>

    <!-- 已忽略状态 -->
    <div v-if="s.state === 'rejected'" class="rejected-info">
      <el-icon><InfoFilled /></el-icon>
      <span>已忽略 · {{ s.rejectReason }} · 7d 后可能重新触发</span>
    </div>

    <!-- 动作按钮（仅 pending 状态显示完整按钮组） -->
    <div v-if="s.state === 'pending'" class="actions">
      <el-button type="primary" size="default" @click="emit('execute', s)">
        <el-icon><Check /></el-icon>执行此动作
      </el-button>
      <el-button size="default" @click="emit('auto-toggle', s)">
        <el-icon><Promotion /></el-icon>加入执行篮
      </el-button>
      <el-button size="default" plain @click="emit('reject', s)">
        <el-icon><Close /></el-icon>暂缓/忽略
      </el-button>
      <span class="spacer" />
      <el-button link type="primary" @click="emit('view-detail', s)">
        查看证据与护栏 →
      </el-button>
    </div>

    <div v-else-if="s.state === 'observing'" class="actions">
      <el-button size="default" @click="emit('view-detail', s)">查看采纳后效果</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.sug-card {
  margin-bottom: 12px;
  transition: transform 0.15s, box-shadow 0.15s;
  border-left: 4px solid var(--line);
}
.sug-card.state-rejected,
.sug-card.state-rejected :deep(*) {
  opacity: 0.55;
}
.sug-card.sev-p0 { border-left-color: #ef4444; }
.sug-card.sev-p1 { border-left-color: #f59e0b; }
.sug-card.sev-p2 { border-left-color: #3b82f6; }

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.time {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: var(--text-muted);
  margin-right: 4px;
}
.spacer { flex: 1; }

.entity {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.entity-chip {
  font-size: 12px;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 2px 8px;
  color: var(--text);
}
.entity-chip b {
  color: var(--text-muted);
  font-weight: 500;
  margin-right: 4px;
}
.entity-chip i {
  font-style: normal;
  color: var(--primary);
  font-weight: 600;
}

.title {
  margin: 6px 0 4px;
  font-size: 15px;
  font-weight: 600;
}
.summary {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}

.metrics {
  display: flex;
  gap: 20px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 10px;
}
.metric { display: flex; flex-direction: column; gap: 2px; }
.metric-label {
  font-size: 11px;
  color: var(--text-muted);
}
.metric strong {
  font-size: 13px;
  font-weight: 600;
}
.metric-impact {
  color: #10b981;
}

.observe-bar {
  margin: 8px 0 10px;
  padding: 8px 12px;
  background: #eff6ff;
  border-radius: 6px;
}
.observe-label {
  font-size: 11px;
  color: var(--text-muted);
  display: block;
  margin-bottom: 4px;
}
.observe-text {
  font-size: 11px;
  color: var(--text-muted);
  display: block;
  margin-top: 4px;
}
.rejected-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #fef2f2;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--line-soft);
}

.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: linear-gradient(90deg, #ede9fe 0%, #eef2ff 100%);
  border: 1px solid #c7d2fe;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  margin-bottom: 8px;
  width: fit-content;
  transition: all 0.15s;
}
.source-chip:hover {
  background: linear-gradient(90deg, #ddd6fe 0%, #dbeafe 100%);
  border-color: #8b5cf6;
}
.source-label {
  color: var(--text-muted);
}
.source-name {
  color: #6366f1;
  font-weight: 600;
}
.source-arrow {
  color: var(--text-muted);
  font-size: 11px;
}

.contract-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 10px;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.contract-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e5e7eb;
  color: #475569;
  font-size: 11px;
}
.contract-chip b {
  color: #0f172a;
  font-weight: 700;
}
.contract-chip.primary {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}
.contract-chip.guard-passed {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #047857;
}
.contract-chip.guard-needs_review {
  border-color: #fde68a;
  background: #fffbeb;
  color: #b45309;
}
.contract-chip.guard-blocked {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}
.contract-chip.muted {
  color: #64748b;
}
</style>
