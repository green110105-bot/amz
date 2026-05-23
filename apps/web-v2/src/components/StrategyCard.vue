<script setup>
import { computed } from 'vue';

const props = defineProps({
  strategy: { type: Object, required: true },
});
const emit = defineEmits(['view-detail', 'toggle', 'edit']);

const s = computed(() => props.strategy);

// 冷却期格式化（小时 → 人类可读）
function formatCooldown(hours) {
  if (!hours || hours === 0) return '常驻';
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours} 小时`;
  const days = hours / 24;
  if (days < 7) return `${Number.isInteger(days) ? days : days.toFixed(1)} 天`;
  if (days < 30) return `${Math.round(days / 7)} 周`;
  return `${Math.round(days / 30)} 月`;
}

// 冷却期色阶
const cooldownColor = computed(() => {
  const h = s.value.trigger?.cooldownHours || 0;
  if (h === 0) return { bg: '#f3f4f6', fg: '#6b7280' }; // 常驻
  if (h <= 6) return { bg: '#dcfce7', fg: '#059669' };  // 短
  if (h <= 72) return { bg: '#dbeafe', fg: '#2563eb' }; // 中 (1-3 天)
  if (h <= 168) return { bg: '#fef3c7', fg: '#b45309' }; // 长 (1 周内)
  return { bg: '#fee2e2', fg: '#dc2626' }; // 超长
});

const sovereigntyMeta = computed(() => ({
  manual: { color: '#6b7280', label: '手动' },
  semi: { color: '#3b82f6', label: '半自动' },
  auto: { color: '#10b981', label: '全自动' },
})[s.value.sovereignty]);

const sparklinePath = computed(() => {
  const data = s.value.triggerHistory || [];
  if (!data.length) return '';
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 24 - (v / max) * 22;
    return `${x},${y}`;
  });
  return 'M ' + points.join(' L ');
});

const successColor = computed(() => {
  if (s.value.successRate === null) return '#9ca3af';
  if (s.value.successRate > 0.7) return '#10b981';
  if (s.value.successRate > 0.4) return '#f59e0b';
  return '#ef4444';
});

const successTrendIcon = computed(() => {
  return { up: '↑', down: '↓', flat: '→' }[s.value.successTrend];
});
</script>

<template>
  <div class="strat-card" :class="{ disabled: !s.enabled }" @click="emit('view-detail', s)">
    <!-- 头部：状态点 + 类别 + 主权 + 层级 + 跨模块 -->
    <div class="head">
      <span class="state-dot" :class="s.enabled ? 'on' : 'off'" />
      <el-tag size="small" :style="{ background: s.categoryColor + '20', color: s.categoryColor, borderColor: 'transparent' }">
        {{ s.categoryEmoji }} {{ s.categoryLabel.split(' · ')[1] }}
      </el-tag>
      <el-tag size="small" effect="plain" :style="{ color: sovereigntyMeta.color, borderColor: sovereigntyMeta.color }">
        {{ sovereigntyMeta.label }}
      </el-tag>
      <el-tag size="small" type="info" effect="plain">{{ s.scopeLabel }}</el-tag>
      <el-tag v-if="s.crossModule" size="small" type="warning" effect="dark">🔗 跨 {{ s.crossModule }}</el-tag>
      <el-tooltip
        :content="`冷却期: 同实体在 ${formatCooldown(s.trigger?.cooldownHours)} 内不重复触发 · 频率: ${s.trigger?.frequency}`"
        placement="top"
      >
        <span class="cooldown-chip" :style="{ background: cooldownColor.bg, color: cooldownColor.fg }">
          🕐 {{ formatCooldown(s.trigger?.cooldownHours) }}
        </span>
      </el-tooltip>
      <span class="spacer" />
      <el-switch :model-value="s.enabled" size="small" @click.stop @change="emit('toggle', s)" />
    </div>

    <!-- 标题 -->
    <h3 class="name">{{ s.name }}</h3>

    <!-- 描述 -->
    <p class="desc">{{ s.description }}</p>

    <!-- 触发条件预览 -->
    <div class="condition-box">
      <span class="cond-label">触发</span>
      <code>{{ s.trigger.condition }}</code>
    </div>
    <div class="trigger-meta">
      <span class="tm-item">📅 {{ s.trigger.frequency }}</span>
      <span class="tm-divider">·</span>
      <span class="tm-item" :style="{ color: cooldownColor.fg }">🕐 冷却 {{ formatCooldown(s.trigger?.cooldownHours) }}</span>
    </div>

    <!-- 动作预览 -->
    <div class="action-box">
      <span class="act-label">动作</span>
      <code class="action">{{ s.action.desc }}</code>
    </div>

    <!-- 底部统计 -->
    <div class="foot">
      <div class="stat">
        <span class="stat-label">累计触发</span>
        <strong>{{ s.triggerCount }}</strong>
        <span class="stat-unit">次</span>
      </div>

      <div class="stat" v-if="s.successRate !== null">
        <span class="stat-label">成功率</span>
        <strong :style="{ color: successColor }">
          {{ Math.round(s.successRate * 100) }}%
          <span class="trend">{{ successTrendIcon }}</span>
        </strong>
      </div>
      <div class="stat" v-else>
        <span class="stat-label">成功率</span>
        <span class="text-muted">—</span>
      </div>

      <div class="stat">
        <span class="stat-label">绑定</span>
        <strong>{{ s.bindingsCount }}</strong>
        <span class="stat-unit">实体</span>
      </div>

      <!-- 14d sparkline -->
      <div class="sparkline">
        <svg viewBox="0 0 100 24" class="spark-svg">
          <path :d="sparklinePath" stroke="#3b82f6" stroke-width="1.5" fill="none" />
        </svg>
        <span class="spark-label">14d 触发</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.strat-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.strat-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}
.strat-card.disabled {
  opacity: 0.65;
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.state-dot.on { background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12); }
.state-dot.off { background: #d1d5db; }
.spacer { flex: 1; }

.name {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  line-height: 1.4;
}

.desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cooldown-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: help;
}

.trigger-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  font-size: 11px;
  color: var(--text-muted);
}
.tm-item { display: inline-flex; align-items: center; gap: 3px; }
.tm-divider { opacity: 0.4; }

.condition-box, .action-box {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background: #f9fafb;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-family: ui-monospace, monospace;
}
.cond-label, .act-label {
  font-size: 10px;
  color: var(--text-muted);
  padding-top: 1px;
  flex-shrink: 0;
}
.condition-box code, .action-box code {
  color: var(--text);
  word-break: break-word;
  line-height: 1.4;
}
.action-box code.action {
  color: #3b82f6;
  font-weight: 500;
}

.foot {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
}
.stat {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.stat-label {
  font-size: 10px;
  color: var(--text-muted);
}
.stat strong {
  font-size: 14px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
.stat-unit {
  font-size: 10px;
  color: var(--text-muted);
}
.trend {
  font-size: 10px;
  margin-left: 2px;
}
.text-muted { color: var(--text-muted); font-size: 13px; }

.sparkline {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.spark-svg { width: 60px; height: 22px; }
.spark-label { font-size: 9px; color: var(--text-muted); }
</style>
