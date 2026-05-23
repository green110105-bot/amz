<script setup>
// 小时数据 — 24h 折线 + 24 行明细
import { computed, ref, watchEffect } from 'vue';
import { generateMockHourlyRows } from './_mock-data.js';
import Sparkline from '../Sparkline.vue';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });

const rows = ref([]);

watchEffect(() => {
  if (!props.active || !props.entity?.id) return;
  rows.value = generateMockHourlyRows(props.entity);
});

const series = computed(() => rows.value.map((r) => r.spend));
</script>

<template>
  <div class="tab-hourly">
    <div class="trend">
      <div class="trend-label">24h 花费趋势</div>
      <Sparkline :data="series" :height="64" :width="800" color="#3b82f6" fluid />
    </div>

    <el-table :data="rows" stripe size="small" border max-height="320">
      <el-table-column prop="hour" label="时段" width="80" align="center">
        <template #default="{ row }">{{ row.hour }}:00</template>
      </el-table-column>
      <el-table-column prop="impressions" label="曝光" align="right" sortable>
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="clicks" label="点击" align="right" sortable />
      <el-table-column label="CTR" align="right">
        <template #default="{ row }">{{ (row.ctr * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="CPC" align="right">
        <template #default="{ row }">${{ row.cpc.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="花费" align="right" sortable prop="spend">
        <template #default="{ row }">${{ row.spend.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="orders" label="订单" align="right" sortable />
      <el-table-column label="销售额" align="right">
        <template #default="{ row }">${{ row.sales.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" align="right">
        <template #default="{ row }">{{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.tab-hourly { padding: 8px 0; }
.trend { padding: 12px 16px; background: #fafbfc; border: 1px solid #eef0f3; border-radius: 6px; margin-bottom: 12px; }
.trend-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
:deep(.el-table) { font-size: 12px; }
</style>
