<script setup>
// 归因期分析（Campaign only）— 不同归因窗口的销售额对比
import { computed, ref, watchEffect } from 'vue';
import { generateMockAttribution } from './_mock-data.js';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });
const windows = ref([]);

watchEffect(() => {
  if (!props.active || !props.entity?.id) return;
  windows.value = generateMockAttribution(props.entity);
});
</script>

<template>
  <div class="tab-attribution">
    <p class="hint">归因窗口越长，转化数越多但精度越低。选择合适窗口避免高估广告效果。</p>
    <el-table :data="windows" stripe border size="small" max-height="320">
      <el-table-column prop="windowLabel" label="归因窗口" width="120" />
      <el-table-column prop="orders" label="订单数" align="right" sortable />
      <el-table-column prop="sales" label="销售额" align="right" sortable>
        <template #default="{ row }">${{ row.sales.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="acos" label="ACoS" align="right" sortable>
        <template #default="{ row }">{{ (row.acos * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column prop="roas" label="ROAS" align="right" sortable>
        <template #default="{ row }">{{ row.roas.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="cvr" label="CVR" align="right">
        <template #default="{ row }">{{ (row.cvr * 100).toFixed(2) }}%</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.tab-attribution { padding: 8px 0; }
.hint { font-size: 12px; color: var(--text-muted); margin: 0 0 12px; }
:deep(.el-table) { font-size: 12px; }
</style>
