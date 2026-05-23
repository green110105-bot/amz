<script setup>
import { onMounted, ref } from 'vue';
import { useAdGroups } from '../../../composables/useLxState';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';
import AdAnalysisDrawer from '../../../components/AdAnalysisDrawer.vue';

const props = defineProps({ campaign: Object });
const { list: rows, fetch, setBid, toggle } = useAdGroups(props.campaign.id);
const mobileCols = [
  { prop: 'name', label: '广告组' },
  { prop: 'defaultBid', label: '默认 bid', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v ? (v * 100).toFixed(2) + '%' : '--' },
];

onMounted(() => { fetch(); });

async function onSwitch(row) {
  await toggle(row);
}

async function onBidChange(row, val) {
  await setBid(row, val);
}

// ----- AdAnalysisDrawer integration -----
const drawerVisible = ref(false);
const drawerEntity = ref({});
const drawerInitialTab = ref('daily');
function openAnalysisDrawer(row, tab = 'daily') {
  drawerEntity.value = {
    id: row.id,
    type: 'adgroup',
    name: row.name,
    campaignName: props.campaign?.name,
  };
  drawerInitialTab.value = tab;
  drawerVisible.value = true;
}
</script>

<template>
  <div class="sub-toolbar">
    <el-button type="primary" :icon="'Plus'">添加广告组</el-button>
    <span class="spacer" />
    <el-button :icon="'Operation'" size="small">列配置 ▾</el-button>
    <el-button :icon="'Download'" size="small" link />
  </div>

  <div class="lx-table">
    <ResponsiveTable :data="rows" :mobile-columns="mobileCols" stripe border size="small">
      <el-table-column type="selection" width="40" fixed />
      <el-table-column label="启用" width="55" fixed>
        <template #default="{ row }"><el-switch v-model="row.enabled" size="small" @change="onSwitch(row)" /></template>
      </el-table-column>
      <el-table-column label="广告组" prop="name" min-width="240" fixed>
        <template #default="{ row }"><a class="link" @click="openAnalysisDrawer(row)">{{ row.name }}</a></template>
      </el-table-column>
      <el-table-column label="默认 bid" width="110">
        <template #default="{ row }">
          <el-input-number v-model="row.defaultBid" :precision="2" :step="0.05" :controls="false" size="small" style="width: 80px" @change="(v) => onBidChange(row, v)" />
        </template>
      </el-table-column>
      <el-table-column label="曝光量" prop="impressions" width="90" sortable align="right">
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="点击" prop="clicks" width="80" sortable align="right" />
      <el-table-column label="CTR" prop="ctr" width="80" sortable align="right">
        <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="CPC" prop="cpc" width="80" sortable align="right">
        <template #default="{ row }">${{ (row.cpc ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="花费" prop="spend" width="90" sortable align="right">
        <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="广告销售额" prop="sales" width="110" sortable align="right">
        <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" prop="acos" width="80" sortable align="right">
        <template #default="{ row }">{{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}</template>
      </el-table-column>
      <el-table-column label="订单" prop="orders" width="70" sortable align="right" />
      <el-table-column label="CVR" prop="cvr" width="80" sortable align="right">
        <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default>
          <el-button link size="small">编辑</el-button>
          <el-button link size="small">复制</el-button>
          <el-button link type="danger" size="small">归档</el-button>
        </template>
      </el-table-column>
      <template #mobile-actions="{ row }">
        <el-button size="small" type="primary">编辑</el-button>
        <el-button size="small" @click="onSwitch(row)">{{ row.enabled ? '暂停' : '启用' }}</el-button>
      </template>
    </ResponsiveTable>
  </div>

  <AdAnalysisDrawer v-model="drawerVisible" :entity="drawerEntity" :initial-tab="drawerInitialTab" />
</template>

<style scoped>
.sub-toolbar { display: flex; gap: 8px; padding: 0 0 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
.lx-table { overflow-x: auto; }
.lx-table :deep(.el-table) { font-size: 12px; }
.lx-table :deep(.el-table th) { background: #fafbfc !important; color: #6b7280; font-weight: 500; }
.link { color: var(--primary); cursor: pointer; }
</style>
