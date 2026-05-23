<script setup>
// 天数据 — 日维度聚合表。最常用、所有 entity 都有。
import { computed, ref, watchEffect } from 'vue';
import { generateMockDailyRows } from './_mock-data.js';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });

const rows = ref([]);
const loading = ref(false);

watchEffect(async () => {
  if (!props.active || !props.entity?.id) return;
  loading.value = true;
  try {
    // TODO(week-2): swap to real SP-API Reports endpoint via api/lx.js
    rows.value = generateMockDailyRows(props.entity, props.dateRange);
  } finally { loading.value = false; }
});

const totals = computed(() => {
  const sum = (k) => rows.value.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const impressions = sum('impressions');
  const clicks = sum('clicks');
  const spend = sum('spend');
  const sales = sum('sales');
  const orders = sum('orders');
  return {
    date: '总计',
    impressions, clicks, spend, sales, orders,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    acos: sales > 0 ? spend / sales : 0,
    cvr: clicks > 0 ? orders / clicks : 0,
  };
});

const tableData = computed(() => [totals.value, ...rows.value]);
</script>

<template>
  <div class="tab-daily">
    <el-table :data="tableData" stripe size="small" border max-height="380" v-loading="loading">
      <el-table-column prop="date" label="日期" width="120" fixed>
        <template #default="{ row, $index }">
          <span :class="{ 'total-row': $index === 0 }">{{ row.date }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="impressions" label="曝光量" align="right" sortable>
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="clicks" label="点击" align="right" sortable />
      <el-table-column label="CTR" align="right">
        <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="CPC" align="right">
        <template #default="{ row }">${{ (row.cpc ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="花费" align="right" sortable prop="spend">
        <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="orders" label="订单" align="right" sortable />
      <el-table-column label="销售额" align="right" sortable prop="sales">
        <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" align="right">
        <template #default="{ row }">
          <span :class="{ danger: row.acos > 0.5, good: row.acos < 0.3 && row.acos > 0 }">
            {{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="CVR" align="right">
        <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.tab-daily { padding: 8px 0; }
.total-row { font-weight: 600; color: var(--text); }
.danger { color: #ef4444; font-weight: 600; }
.good { color: #10b981; font-weight: 600; }
:deep(.el-table) { font-size: 12px; }
:deep(.el-table th) { background: #fafbfc !important; color: #6b7280; font-weight: 500; }
</style>
