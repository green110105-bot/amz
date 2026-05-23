<script setup>
// 超预算分析（Campaign only）— 哪些时段跑超预算 + 错过的曝光
import { computed, ref, watchEffect } from 'vue';
import { generateMockOverBudget } from './_mock-data.js';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });
const data = ref({ rows: [], missedImpressions: 0, overruns: 0 });

watchEffect(() => {
  if (!props.active || !props.entity?.id) return;
  data.value = generateMockOverBudget(props.entity);
});
</script>

<template>
  <div class="tab-overbudget">
    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-val">{{ data.overruns }}</div>
        <div class="kpi-label">超预算次数（近 14 天）</div>
      </div>
      <div class="kpi">
        <div class="kpi-val">{{ data.missedImpressions.toLocaleString() }}</div>
        <div class="kpi-label">估算错过的可见曝光</div>
      </div>
      <div class="kpi danger" v-if="data.overruns > 0">
        <div class="kpi-val">建议提预算 +{{ (data.overruns * 5).toFixed(0) }}%</div>
        <div class="kpi-label">触发自动规则提议</div>
      </div>
    </div>

    <el-table :data="data.rows" stripe border size="small" max-height="320" empty-text="近 14 天无超预算事件">
      <el-table-column prop="day" label="日期" width="120" />
      <el-table-column prop="hourOverrun" label="超预算时段" width="150" />
      <el-table-column prop="budget" label="日预算" align="right">
        <template #default="{ row }">${{ row.budget.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="actualSpend" label="实际花费" align="right">
        <template #default="{ row }">${{ row.actualSpend.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="missedImpressions" label="错过曝光" align="right">
        <template #default="{ row }">{{ row.missedImpressions.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="cause" label="原因" />
    </el-table>
  </div>
</template>

<style scoped>
.tab-overbudget { padding: 8px 0; }
.kpi-row { display: flex; gap: 12px; margin-bottom: 16px; }
.kpi { flex: 1; padding: 12px 16px; background: #fafbfc; border: 1px solid #eef0f3; border-radius: 6px; }
.kpi.danger { background: #fef2f2; border-color: #fecaca; }
.kpi-val { font-size: 22px; font-weight: 600; color: var(--text); }
.kpi-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
:deep(.el-table) { font-size: 12px; }
</style>
