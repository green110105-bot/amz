<script setup>
// 广告位 — Top / Product / Rest 三段拆分
import { computed, ref, watchEffect } from 'vue';
import { generateMockPlacementRows } from './_mock-data.js';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });

const rows = ref([]);

watchEffect(() => {
  if (!props.active || !props.entity?.id) return;
  rows.value = generateMockPlacementRows(props.entity);
});

const totals = computed(() => {
  const sum = (k) => rows.value.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return {
    placement: '总计',
    impressions: sum('impressions'),
    clicks: sum('clicks'),
    spend: sum('spend'),
    sales: sum('sales'),
    orders: sum('orders'),
    bidModifier: '—',
  };
});

const tableData = computed(() => [...rows.value, totals.value]);
</script>

<template>
  <div class="tab-placement">
    <el-table :data="tableData" stripe border size="small" max-height="360">
      <el-table-column prop="placement" label="广告位" width="160">
        <template #default="{ row, $index }">
          <span :class="{ 'total-row': $index === tableData.length - 1 }">{{ row.placement }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="impressions" label="曝光" align="right" sortable>
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="clicks" label="点击" align="right" sortable />
      <el-table-column label="CTR" align="right">
        <template #default="{ row }">{{ row.clicks && row.impressions ? ((row.clicks / row.impressions) * 100).toFixed(2) + '%' : '--' }}</template>
      </el-table-column>
      <el-table-column label="CPC" align="right">
        <template #default="{ row }">{{ row.clicks ? '$' + (row.spend / row.clicks).toFixed(2) : '--' }}</template>
      </el-table-column>
      <el-table-column label="花费" align="right" sortable prop="spend">
        <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="orders" label="订单" align="right" />
      <el-table-column label="销售额" align="right">
        <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" align="right">
        <template #default="{ row }">{{ row.sales ? ((row.spend / row.sales) * 100).toFixed(2) + '%' : '--' }}</template>
      </el-table-column>
      <el-table-column prop="bidModifier" label="bid 加成" align="right" width="100" />
    </el-table>
  </div>
</template>

<style scoped>
.tab-placement { padding: 8px 0; }
.total-row { font-weight: 600; color: var(--text); }
:deep(.el-table) { font-size: 12px; }
</style>
