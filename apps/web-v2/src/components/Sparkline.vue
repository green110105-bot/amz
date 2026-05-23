<script setup>
import { computed } from 'vue';

const props = defineProps({
  data: { type: Array, required: true },
  width: { type: Number, default: 120 },
  height: { type: Number, default: 32 },
  color: { type: String, default: '#2563eb' },
  stroke: { type: String, default: '' },  // alias for color (backwards-compat)
  fill: { type: String, default: '' },
  fluid: { type: Boolean, default: false },  // when true, SVG fills container width
});
const lineColor = computed(() => props.stroke || props.color);

const path = computed(() => {
  if (!props.data?.length) return '';
  const min = Math.min(...props.data);
  const max = Math.max(...props.data);
  const range = max - min || 1;
  const stepX = props.width / (props.data.length - 1 || 1);
  return props.data
    .map((v, i) => {
      const x = i * stepX;
      const y = props.height - ((v - min) / range) * (props.height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
});

const fillPath = computed(() => {
  if (!props.fill || !path.value) return '';
  return `${path.value} L ${props.width} ${props.height} L 0 ${props.height} Z`;
});
</script>

<template>
  <svg :width="fluid ? '100%' : width" :height="height" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" :style="fluid ? 'display: block; width: 100%;' : ''">
    <path v-if="fill" :d="fillPath" :fill="fill" opacity="0.2" />
    <path :d="path" :stroke="lineColor" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
  </svg>
</template>
