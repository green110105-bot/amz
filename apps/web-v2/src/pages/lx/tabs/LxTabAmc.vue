<script setup>
import { onMounted } from 'vue';
import { useAmcAudiences } from '../../../composables/useLxState';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';

const { list: rows, fetch } = useAmcAudiences();
const mobileCols = [
  { prop: 'name', label: '人群包' },
  { prop: 'size', label: '人数', formatter: (v) => (v ?? 0).toLocaleString() },
  { prop: 'source', label: '来源' },
];

onMounted(() => { fetch(); });
</script>

<template>
  <div class="sub-toolbar">
    <el-button type="primary" :icon="'Plus'">关联人群包</el-button>
    <span class="spacer" />
    <el-button :icon="'Download'" size="small" link />
  </div>

  <el-alert type="info" :closable="false" show-icon
    title="AMC 人群包"
    description="AMC (Amazon Marketing Cloud) 人群包仅限 SD/DSP 广告。SP 广告不支持。"
    style="margin-bottom: 12px" />

  <ResponsiveTable :data="rows" :mobile-columns="mobileCols" stripe border size="small">
    <el-table-column type="selection" width="40" />
    <el-table-column label="人群包" prop="name" min-width="220" />
    <el-table-column label="人数" prop="size" width="120" align="right">
      <template #default="{ row }">{{ (row.size ?? 0).toLocaleString() }}</template>
    </el-table-column>
    <el-table-column label="来源" prop="source" width="120" />
    <el-table-column label="状态" width="100">
      <template #default><el-tag size="small" type="info">未关联</el-tag></template>
    </el-table-column>
    <el-table-column label="操作" width="120">
      <template #default>
        <el-button link size="small">关联到广告组</el-button>
      </template>
    </el-table-column>
    <template #mobile-actions>
      <el-button size="small" type="primary">关联到广告组</el-button>
    </template>
  </ResponsiveTable>
</template>

<style scoped>
.sub-toolbar { display: flex; gap: 8px; padding: 0 0 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
</style>
