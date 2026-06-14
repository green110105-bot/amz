<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { severityColor, severityLabel, formatCurrency, actionLabel } from '../utils/format';
import { useAudit } from '../composables/useAudit';
import { auditApi } from '../api/audit';
import ReasonChain from './ReasonChain.vue';

const { submit } = useAudit();

const props = defineProps({
  // 通用形态：title / subtitle / 严重度 / 证据 / 影响 / 推理 / 来源
  card: { type: Object, required: true },
  sourceModule: { type: String, default: 'M3' }, // 决策来源模块（M2/M3/M4）
});

const emit = defineEmits(['execute', 'reject']);

const expanded = ref(false);
// W7:防重入 —— execute 期间禁用按钮，避免 200ms 内双击产生两条 pending 审计行。
const submitting = ref(false);
// W7: emit('execute') 之后乐观置灰本卡（父组件标 verdict=pending 非 splice 移除）。
const executed = ref(false);
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
    // W12: auditRequired 取后端真值，不再兜底 true（后端 false 必须如实透传）。
    auditRequired: card.auditRequired,
    payload: card.payload || null,
  };
});

// W12: 缺依据时禁用「一键执行」—— payload/evidence/recommendation 全空即视为无依据，
// 防止产生无依据的审计行。
const hasEvidence = computed(() => {
  const card = props.card || {};
  const payloadEmpty =
    card.payload == null || (typeof card.payload === 'object' && Object.keys(card.payload).length === 0);
  return c.value.evidence.length > 0 || !!c.value.reason || !payloadEmpty;
});
const executeDisabled = computed(() => submitting.value || executed.value || !hasEvidence.value);

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
  // W7: 防重入 —— 已在提交中 / 已入队 / 缺依据 时直接返回。
  if (executeDisabled.value) return;
  submitting.value = true;
  try {
    // W7: 接 submit 返回值，被阻断（{ok:false}）则不 emit('execute')。
    const r = await submit({
      sourceModule: props.sourceModule,
      actionType: c.value.actionType || 'GENERIC_DECISION',
      target: { id: props.card.id || props.card.campaignId, sku: props.card.sku, asin: props.card.asin },
      payload: { keyword: c.value.keyword, lifecycleStage: c.value.lifecycleStage },
      expectedImpact: typeof c.value.impact === 'object' ? c.value.impact : { change: c.value.impact },
      description: c.value.title,
    });
    if (!r.ok) return;
    // W7: verdict 为 pending（非终态成功），乐观置灰本卡并交父组件标「已入队待审」。
    executed.value = true;
    emit('execute', props.card);
  } finally {
    submitting.value = false;
  }
}

// B-2 / N6-w11: reject 改为先落库（POST /api/v1/audit/dismiss 落一条
// DASHBOARD_CARD_DISMISS 审计行）再 emit('reject') 移除卡片。落库失败则不移除，
// 文案从「本次会话已隐藏」改「已忽略并记录」，诚实反映已持久化留痕。
async function reject() {
  if (submitting.value || executed.value) return;
  submitting.value = true;
  try {
    const resourceId =
      props.card?.id || props.card?.campaignId || props.card?.payload?.id || props.card?.title;
    await auditApi.dismiss({ resourceId, reason: c.value.title });
    ElMessage.success(`${c.value.title} 已忽略并记录`);
    emit('reject', props.card);
  } catch (e) {
    ElMessage.error(`忽略失败：${e?.message || e}`);
  } finally {
    submitting.value = false;
  }
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
        <el-button size="small" :disabled="submitting || executed" @click="reject">忽略</el-button>
        <!-- W12: 缺依据时禁用并提示「缺少依据不可执行」；W7: loading/disabled 防重入。 -->
        <el-tooltip
          :disabled="hasEvidence"
          content="缺少依据不可执行"
          placement="top"
        >
          <span>
            <el-button
              type="primary"
              size="small"
              :loading="submitting"
              :disabled="executeDisabled"
              @click="execute"
            >
              <el-icon v-if="!submitting"><Promotion /></el-icon>
              {{ executed ? '已入队待审' : '一键执行' }}
            </el-button>
          </span>
        </el-tooltip>
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
