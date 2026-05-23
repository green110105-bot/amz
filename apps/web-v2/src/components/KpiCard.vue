<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  hint: { type: String, default: '' },
  trend: { type: String, default: '' },
  trendType: { type: String, default: 'neutral' },
  icon: { type: String, default: '' },
  status: { type: String, default: 'default' }, // default | success | warning | danger | info
});

const statusClass = computed(() => `status-${props.status}`);
const trendIcon = computed(() => {
  if (props.trendType === 'up') return 'CaretTop';
  if (props.trendType === 'down') return 'CaretBottom';
  return '';
});
const trendClass = computed(() => `trend-${props.trendType}`);
</script>

<template>
  <div class="kpi-card" :class="statusClass">
    <div class="kpi-head">
      <span class="kpi-label">{{ label }}</span>
      <el-icon v-if="icon" class="kpi-icon"><component :is="icon" /></el-icon>
    </div>
    <div class="kpi-value tnum">{{ value }}</div>
    <div class="kpi-foot">
      <span v-if="trend" class="kpi-trend tnum" :class="trendClass">
        <el-icon v-if="trendIcon" :size="12"><component :is="trendIcon" /></el-icon>
        {{ trend }}
      </span>
      <span v-if="hint" class="kpi-hint">{{ hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.kpi-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
}
.kpi-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
}
.kpi-card.status-success::before { background: var(--success); }
.kpi-card.status-warning::before { background: var(--warning); }
.kpi-card.status-danger::before { background: var(--danger); }
.kpi-card.status-info::before { background: var(--info); }
.kpi-card.status-default::before { background: var(--primary); }

.kpi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.kpi-label {
  font-size: 12px;
  color: var(--text-muted);
}
.kpi-icon {
  color: var(--text-soft);
  font-size: 16px;
}
.kpi-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 8px 0 4px;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.kpi-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}
.kpi-trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 500;
}
.trend-up { color: var(--success); }
.trend-down { color: var(--danger); }
.trend-neutral { color: var(--text-muted); }
.kpi-hint { color: var(--text-muted); }
</style>
