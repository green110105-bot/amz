<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { severityColor, severityLabel, formatCurrency, actionLabel } from '../utils/format';
import { useAudit } from '../composables/useAudit';
import ReasonChain from './ReasonChain.vue';

const { submit } = useAudit();

const props = defineProps({
  // 通用形态：title / subtitle / 严重度 / 证据 / 影响 / 推理 / 来源
  card: { type: Object, required: true },
  sourceModule: { type: String, default: 'M3' }, // 决策来源模块（M2/M3/M4）
});

const emit = defineEmits(['execute', 'reject']);

const expanded = ref(false);
const c = computed(() => {
  const card = props.card || {};
  const severity = card.severity || card.priority;
  return {
    title: card.title || actionLabel(card.actionType) || card.type || '决策',
    subtitle: card.sku ? `${card.sku}${card.asin ? ' · ' + card.asin : ''}` : (card.campaignId || ''),
    severity,
    severityColor: severityColor(severity),
    severityLabel: severityLabel(severity),
    reason: card.recommendation || card.recommendedAction || card.reason || '',
    evidence: Array.isArray(card.evidence) ? card.evidence : (card.evidence ? [card.evidence] : []),
    impact: card.expectedImpact || card.estimatedMonthlyImpact || null,
    keyword: card.keyword || '',
    lifecycleStage: card.lifecycleStage || '',
    actionType: card.actionType || card.type,
    confidence: card.confidence ?? card.accuracy?.confidence ?? null,
    sourceMode: card.sourceMode || 'mock',
    auditRequired: card.auditRequired ?? true,
  };
});

const impactText = computed(() => {
  const i = c.value.impact;
  if (i === null || i === undefined) return '';
  if (typeof i === 'number') return `预计可挽回 ${formatCurrency(i)}/月`;
  if (typeof i === 'object') {
    const change = i.change;
    const metric = i.metric || '影响';
    const horizon = i.horizonDays ? ` · ${i.horizonDays} 天窗口` : '';
    if (typeof change === 'number') {
      const prefix = change > 0 ? '+' : '';
      return `${metric} ${prefix}${change}${horizon}`;
    }
    return `${metric}${horizon}`;
  }
  return String(i);
});

async function execute() {
  await submit({
    sourceModule: props.sourceModule,
    actionType: c.value.actionType || 'GENERIC_DECISION',
    target: { id: props.card.id || props.card.campaignId, sku: props.card.sku, asin: props.card.asin },
    payload: { keyword: c.value.keyword, lifecycleStage: c.value.lifecycleStage },
    expectedImpact: typeof c.value.impact === 'object' ? c.value.impact : { change: c.value.impact },
    description: c.value.title,
  });
  emit('execute', props.card);
}

function reject() {
  ElMessage.info(`${c.value.title} 已忽略，反馈已记录`);
  emit('reject', props.card);
}
</script>

<template>
  <el-card class="decision-card" shadow="never">
    <div class="decision-head">
      <el-tag
        :color="c.severityColor"
        :style="{ color: '#fff', borderColor: c.severityColor }"
        size="small"
        effect="dark"
      >
        {{ c.severityLabel }}
      </el-tag>
      <span class="decision-title">{{ c.title }}</span>
      <span v-if="c.subtitle" class="decision-subtitle">{{ c.subtitle }}</span>
    </div>

    <p v-if="c.reason" class="decision-reason">{{ c.reason }}</p>

    <div v-if="impactText" class="decision-impact">
      <el-icon><TrendCharts /></el-icon>
      <span>{{ impactText }}</span>
    </div>

    <ReasonChain
      v-if="expanded"
      :evidence="c.evidence"
      :keyword="c.keyword"
      :lifecycle-stage="c.lifecycleStage"
      :action-type="c.actionType"
      :confidence="c.confidence"
      :source-mode="c.sourceMode"
    />

    <div class="decision-foot">
      <el-button text type="primary" size="small" @click="expanded = !expanded">
        <el-icon><InfoFilled /></el-icon>
        <span>{{ expanded ? '收起依据' : '为什么这么建议' }}</span>
      </el-button>
      <div class="decision-actions">
        <el-button size="small" @click="reject">忽略</el-button>
        <el-button type="primary" size="small" @click="execute">
          <el-icon><Promotion /></el-icon>
          一键执行
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.decision-card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  margin-bottom: 12px;
  transition: border-color 0.15s;
}
.decision-card:hover {
  border-color: #cbd5e1;
}
.decision-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.decision-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.decision-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
}
.decision-reason {
  margin: 4px 0 8px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.55;
}
.decision-impact {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--success-soft);
  color: var(--success);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 12px;
}
.decision-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}
.decision-actions {
  display: flex;
  gap: 8px;
}
</style>
