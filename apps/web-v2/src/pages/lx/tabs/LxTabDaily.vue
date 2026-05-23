<script setup>
import { onMounted } from 'vue';
import { useDailyData } from '../../../composables/useLxState';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';

const props = defineProps({ campaign: Object });
const { list: rows, fetch } = useDailyData(props.campaign.id);
const mobileCols = [
  { prop: 'date', label: '日期' },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v ? (v * 100).toFixed(2) + '%' : '--' },
  { prop: 'orders', label: '订单' },
];

onMounted(() => { fetch(); });
</script>

<template>
  <div class="sub-toolbar">
    <el-date-picker type="daterange" size="default" style="width: 240px" />
    <el-button type="primary">查询</el-button>
    <span class="spacer" />
    <el-button :icon="'Operation'" size="small">列配置 ▾</el-button>
    <el-button :icon="'Download'" size="small" link />
  </div>

  <ResponsiveTable :data="rows" :mobile-columns="mobileCols" stripe border size="small">
    <el-table-column label="日期" prop="date" width="120" fixed />
    <el-table-column label="曝光量" prop="impressions" width="100" sortable align="right">
      <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
    </el-table-column>
    <el-table-column label="点击" prop="clicks" width="80" sortable align="right" />
    <el-table-column label="CTR" prop="ctr" width="80" sortable align="right">
      <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
    </el-table-column>
    <el-table-column label="CPC" prop="cpc" width="80" sortable align="right">
      <template #default="{ row }">${{ (row.cpc ?? 0).toFixed(2) }}</template>
    </el-table-column>
    <el-table-column label="花费" prop="spend" width="100" sortable align="right">
      <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
    </el-table-column>
    <el-table-column label="销售额" prop="sales" width="110" sortable align="right">
      <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
    </el-table-column>
    <el-table-column label="ACoS" prop="acos" width="90" sortable align="right">
      <template #default="{ row }">{{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}</template>
    </el-table-column>
    <el-table-column label="订单" prop="orders" width="80" sortable align="right" />
    <el-table-column label="CVR" prop="cvr" width="80" sortable align="right">
      <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
    </el-table-column>
  </ResponsiveTable>
</template>

<style scoped>
.sub-toolbar { display: flex; gap: 8px; padding: 0 0 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
@media (max-width: 767px) {
  .sub-toolbar .el-date-editor { width: 100% !important; }
}
</style>
