<script setup>
import { computed } from 'vue';

const props = defineProps({
  // [{ label, value, type: 'positive'|'negative'|'total' }]
  items: { type: Array, required: true },
  height: { type: Number, default: 240 },
});

const layout = computed(() => {
  const items = props.items;
  let cumulative = 0;
  const bars = [];
  let max = 0;
  for (const item of items) {
    if (item.type === 'total') {
      bars.push({ ...item, start: 0, end: item.value });
      max = Math.max(max, Math.abs(item.value));
    } else {
      const start = cumulative;
      cumulative += item.value;
      bars.push({ ...item, start, end: cumulative });
      max = Math.max(max, Math.abs(start), Math.abs(cumulative));
    }
  }
  return { bars, max: max || 1 };
});

function pct(v) {
  return ((Math.abs(v) / layout.value.max) * 100).toFixed(1) + '%';
}

function colorFor(type) {
  return { positive: '#059669', negative: '#dc2626', total: '#2563eb' }[type] || '#6b7280';
}
</script>

<template>
  <div class="waterfall" :style="{ height: height + 'px' }">
    <div v-for="(bar, i) in layout.bars" :key="i" class="bar-row">
      <div class="bar-label">{{ bar.label }}</div>
      <div class="bar-track">
        <div
          class="bar"
          :style="{
            left: pct(Math.min(bar.start, bar.end)),
            width: pct(Math.abs(bar.value)),
            background: colorFor(bar.type),
          }"
        />
      </div>
      <div class="bar-value tnum" :class="{ pos: bar.type === 'positive', neg: bar.type === 'negative', total: bar.type === 'total' }">
        {{ (bar.type === 'negative' ? '-' : '') + Math.abs(bar.value).toFixed(2) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.waterfall {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bar-row {
  display: grid;
  grid-template-columns: 140px 1fr 100px;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}
.bar-label {
  color: var(--text-muted);
  font-size: 12px;
  text-align: right;
}
.bar-track {
  position: relative;
  height: 22px;
  background: #f3f4f6;
  border-radius: 4px;
}
.bar {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 3px;
}
.bar-value {
  text-align: right;
  font-size: 13px;
  color: var(--text);
}
.bar-value.pos { color: var(--success); }
.bar-value.neg { color: var(--danger); }
.bar-value.total { color: var(--primary); font-weight: 700; }
</style>
