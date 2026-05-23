<script setup>
// 时间序列（Campaign only）— 长时段曲线（30/90/180 天）
import { computed, ref, watchEffect } from 'vue';
import { generateMockTimeSeries } from './_mock-data.js';
import Sparkline from '../Sparkline.vue';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });
const period = ref(30);
const series = ref([]);

watchEffect(() => {
  if (!props.active || !props.entity?.id) return;
  series.value = generateMockTimeSeries(props.entity, period.value);
});

const PERIODS = [
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
  { value: 180, label: '近 180 天' },
];

const spendArr = computed(() => series.value.map((d) => d.spend));
const salesArr = computed(() => series.value.map((d) => d.sales));
const acosArr  = computed(() => series.value.map((d) => d.acos));
</script>

<template>
  <div class="tab-timeseries">
    <div class="toolbar">
      <el-radio-group v-model="period" size="small">
        <el-radio-button v-for="p in PERIODS" :key="p.value" :value="p.value">{{ p.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="series">
      <div class="serie">
        <div class="serie-label">花费</div>
        <Sparkline :data="spendArr" :height="60" :width="400" color="#3b82f6" fluid />
      </div>
      <div class="serie">
        <div class="serie-label">销售额</div>
        <Sparkline :data="salesArr" :height="60" :width="400" color="#10b981" fluid />
      </div>
      <div class="serie">
        <div class="serie-label">ACoS</div>
        <Sparkline :data="acosArr" :height="60" :width="400" color="#ef4444" fluid />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-timeseries { padding: 8px 0; }
.toolbar { margin-bottom: 12px; }
.series { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.serie { padding: 12px 16px; background: #fafbfc; border: 1px solid #eef0f3; border-radius: 6px; }
.serie-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
@media (max-width: 768px) { .series { grid-template-columns: 1fr; } }
</style>
