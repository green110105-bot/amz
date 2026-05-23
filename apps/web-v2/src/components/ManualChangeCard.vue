<script setup>
import { computed } from 'vue';

const props = defineProps({
  change: { type: Object, required: true },
});
const emit = defineEmits(['apply-alternative', 'ignore', 'view-detail']);

const c = computed(() => props.change);

const verdictMeta = computed(() => {
  const map = {
    reasonable: { type: 'success', icon: 'CircleCheckFilled', label: '✓ 合理', color: '#10b981' },
    neutral: { type: 'warning', icon: 'WarningFilled', label: '⚠ 中性可惜', color: '#f59e0b' },
    oppose: { type: 'danger', icon: 'CircleCloseFilled', label: '✗ 反对', color: '#ef4444' },
  };
  return map[c.value.aiVerdict] || map.neutral;
});

const sourceMeta = computed(() => {
  const map = {
    'amazon-backend': { icon: '🌐', label: 'Amazon 后台', color: '#6b7280' },
    'our-tool': { icon: '🛠', label: '本工具', color: '#3b82f6' },
    'external-tool': { icon: '↗️', label: '其他工具', color: '#8b5cf6' },
  };
  return map[c.value.operator?.source] || map['amazon-backend'];
});

const timeText = computed(() => {
  const d = new Date(c.value.timestamp);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
});

const isResolved = computed(() => c.value.state === 'resolved');
</script>

<template>
  <el-card
    shadow="hover"
    class="mch-card"
    :class="['verdict-' + c.aiVerdict, { resolved: isResolved }]"
  >
    <!-- 头：操作者 + 时间 + 来源 -->
    <div class="head">
      <el-avatar :size="28" style="background: var(--text-muted); color: #fff; font-size: 13px">
        {{ c.operator?.avatar }}
      </el-avatar>
      <div class="op-info">
        <strong>{{ c.operator?.name }}</strong>
        <span class="op-source">{{ sourceMeta.icon }} {{ sourceMeta.label }}</span>
      </div>
      <span class="spacer" />
      <span class="time">{{ timeText }}</span>
      <el-tag v-if="isResolved" size="small" type="success" effect="light">已处置</el-tag>
    </div>

    <!-- 操作内容 -->
    <div class="op-block">
      <div class="op-entity">📍 {{ c.operation.entity }}</div>
      <div class="op-detail">
        <span class="op-action">{{ c.operation.action }}</span>
        <span class="op-arrow">
          <span class="before">{{ c.operation.before }}</span>
          <el-icon><Right /></el-icon>
          <span class="after">{{ c.operation.after }}</span>
        </span>
        <span v-if="c.operation.change && c.operation.change !== '—'" class="op-change">{{ c.operation.change }}</span>
      </div>
    </div>

    <!-- AI 评价 -->
    <div class="verdict-block" :style="{ borderLeftColor: verdictMeta.color }">
      <div class="verdict-head">
        <el-tag :type="verdictMeta.type" effect="dark" size="default">
          AI 评价：{{ c.aiVerdictText }}
        </el-tag>
      </div>
      <p class="verdict-reason">{{ c.reason }}</p>
    </div>

    <!-- 替代建议 -->
    <div v-if="c.suggestedAlternative" class="alt-block">
      <div class="alt-label">🤖 AI 替代建议</div>
      <div class="alt-body">
        <span class="alt-text">{{ c.suggestedAlternative.label }}</span>
        <span class="alt-impact">{{ c.suggestedAlternative.impact }}</span>
      </div>
    </div>

    <!-- 已处置追溯 -->
    <div v-if="isResolved" class="resolved-info">
      <el-icon><CircleCheck /></el-icon>
      <span>已按 AI 替代建议处理 · {{ new Date(c.resolvedAt).toLocaleString('zh-CN') }}</span>
    </div>

    <!-- 动作 -->
    <div v-if="!isResolved" class="actions">
      <el-button
        v-if="c.suggestedAlternative"
        :type="c.aiVerdict === 'oppose' ? 'primary' : 'default'"
        size="default"
        @click="emit('apply-alternative', c)"
      >
        <el-icon><Right /></el-icon>采纳替代建议
      </el-button>
      <el-button size="default" plain @click="emit('ignore', c)">
        <el-icon><Close /></el-icon>{{ c.aiVerdict === 'reasonable' ? '知道了' : '忽略 AI 建议' }}
      </el-button>
      <span class="spacer" />
      <el-button link type="primary" @click="emit('view-detail', c)">详情 →</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.mch-card {
  margin-bottom: 12px;
  border-left: 4px solid var(--line);
  transition: transform 0.15s;
}
.mch-card.verdict-reasonable { border-left-color: #10b981; }
.mch-card.verdict-neutral { border-left-color: #f59e0b; }
.mch-card.verdict-oppose { border-left-color: #ef4444; }
.mch-card.resolved {
  opacity: 0.75;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.op-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.op-info strong {
  font-size: 13px;
}
.op-source {
  font-size: 11px;
  color: var(--text-muted);
}
.spacer { flex: 1; }
.time {
  font-size: 11px;
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
}

.op-block {
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 10px;
}
.op-entity {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.op-detail {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.op-action {
  font-weight: 600;
  font-size: 13px;
}
.op-arrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.before { color: var(--text-muted); text-decoration: line-through; }
.after { color: var(--primary); font-weight: 600; }
.op-change {
  font-size: 12px;
  color: var(--text-muted);
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--line);
}

.verdict-block {
  padding: 10px 12px;
  background: #fafafa;
  border-left: 3px solid var(--line);
  border-radius: 0 6px 6px 0;
  margin-bottom: 10px;
}
.verdict-head {
  margin-bottom: 6px;
}
.verdict-reason {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
}

.alt-block {
  padding: 10px 12px;
  background: #eff6ff;
  border-radius: 6px;
  margin-bottom: 10px;
}
.alt-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.alt-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.alt-text {
  font-size: 13px;
  font-weight: 500;
}
.alt-impact {
  font-size: 12px;
  color: #10b981;
  font-weight: 600;
}

.resolved-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #ecfdf5;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text);
}
.actions {
  display: flex;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--line-soft);
}
</style>
