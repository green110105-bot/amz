<script setup>
import { onMounted } from 'vue';
import { useOpLog } from '../../../composables/useLxState';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';

const props = defineProps({ campaign: Object });
const { list: rows, fetch } = useOpLog(props.campaign.id);
const mobileCols = [
  { prop: 'time', label: '时间' },
  { prop: 'operator', label: '操作人' },
  { prop: 'source', label: '来源' },
  { prop: 'action', label: '动作' },
  { prop: 'detail', label: '详情' },
];

onMounted(() => { fetch(); });
</script>

<template>
  <div class="sub-toolbar">
    <el-date-picker type="daterange" size="default" style="width: 240px" />
    <el-select placeholder="操作类型" size="default" style="width: 140px" clearable />
    <el-select placeholder="操作来源" size="default" style="width: 140px" clearable />
    <el-select placeholder="操作人" size="default" style="width: 140px" clearable />
    <el-button type="primary">查询</el-button>
    <span class="spacer" />
    <el-button :icon="'Download'" size="small" link />
  </div>

  <ResponsiveTable :data="rows" :mobile-columns="mobileCols" stripe border size="small">
    <el-table-column label="时间" prop="time" width="180" />
    <el-table-column label="操作人" prop="operator" width="140">
      <template #default="{ row }">
        <el-tag size="small" :type="(row.operator || '').includes('AI') ? 'success' : 'info'">{{ row.operator }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="来源" prop="source" width="120">
      <template #default="{ row }">
        <span :class="row.source === '本工具' ? 'good' : row.source === '自动规则' ? '' : 'warn'">{{ row.source }}</span>
      </template>
    </el-table-column>
    <el-table-column label="动作" prop="action" width="140" />
    <el-table-column label="详情" prop="detail" min-width="300" />
    <el-table-column label="审计" width="120">
      <template #default>
        <el-button link size="small" type="primary">查看 / 回滚</el-button>
      </template>
    </el-table-column>
    <template #mobile-actions>
      <el-button size="small" type="primary">查看 / 回滚</el-button>
    </template>
  </ResponsiveTable>
</template>

<style scoped>
.sub-toolbar { display: flex; gap: 8px; padding: 0 0 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
.good { color: #10b981; }
.warn { color: #f59e0b; }
@media (max-width: 767px) {
  .sub-toolbar .el-select,
  .sub-toolbar .el-date-editor { width: 100% !important; }
}
</style>
