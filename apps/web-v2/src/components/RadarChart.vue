<script setup>
import { computed } from 'vue';

const props = defineProps({
  // [{ label, value(0-100) }]
  items: { type: Array, required: true },
  size: { type: Number, default: 240 },
  color: { type: String, default: '#2563eb' },
});

const layout = computed(() => {
  const n = props.items.length;
  const cx = props.size / 2;
  const cy = props.size / 2;
  const r = props.size / 2 - 28;
  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const points = props.items.map((item, i) => {
    const a = angleFor(i);
    const ratio = Math.max(0, Math.min(1, item.value / 100));
    return {
      ...item,
      x: cx + Math.cos(a) * r * ratio,
      y: cy + Math.sin(a) * r * ratio,
      lx: cx + Math.cos(a) * (r + 16),
      ly: cy + Math.sin(a) * (r + 16),
    };
  });
  // 4 个网格圆
  const grids = [0.25, 0.5, 0.75, 1].map((g) => ({
    points: props.items
      .map((_, i) => {
        const a = angleFor(i);
        return `${cx + Math.cos(a) * r * g},${cy + Math.sin(a) * r * g}`;
      })
      .join(' '),
  }));
  // 数据多边形
  const dataPoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  // 轴线
  const axes = props.items.map((_, i) => {
    const a = angleFor(i);
    return { x1: cx, y1: cy, x2: cx + Math.cos(a) * r, y2: cy + Math.sin(a) * r };
  });
  return { cx, cy, r, points, grids, dataPoints, axes };
});
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
    <polygon
      v-for="(g, i) in layout.grids"
      :key="i"
      :points="g.points"
      fill="none"
      :stroke="i === layout.grids.length - 1 ? '#9ca3af' : '#e5e7eb'"
      stroke-width="1"
    />
    <line
      v-for="(a, i) in layout.axes"
      :key="i"
      :x1="a.x1"
      :y1="a.y1"
      :x2="a.x2"
      :y2="a.y2"
      stroke="#e5e7eb"
      stroke-width="1"
    />
    <polygon :points="layout.dataPoints" :fill="color" fill-opacity="0.18" :stroke="color" stroke-width="2" stroke-linejoin="round" />
    <circle v-for="(p, i) in layout.points" :key="`pt-${i}`" :cx="p.x" :cy="p.y" r="3" :fill="color" />
    <text
      v-for="(p, i) in layout.points"
      :key="`lb-${i}`"
      :x="p.lx"
      :y="p.ly"
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="11"
      fill="#374151"
    >
      {{ p.label }}
    </text>
  </svg>
</template>
