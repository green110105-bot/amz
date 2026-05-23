<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Histogram } from '@element-plus/icons-vue';
import { useCampaigns, usePortfolios } from '../../composables/useLxState';
import ResponsiveTable from '../../components/ResponsiveTable.vue';
import AdAnalysisDrawer from '../../components/AdAnalysisDrawer.vue';
import { useViewport } from '../../composables/useViewport';

const { isMobile } = useViewport();
const mobileCampaignCols = [
  { prop: 'name', label: '活动名' },
  { prop: 'type', label: '类型' },
  { prop: 'dailyBudget', label: '预算', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v ? (v * 100).toFixed(2) + '%' : '--' },
];

const STORES = ['亚马逊-G店铺-US', '亚马逊-G店铺-UK', '亚马逊-G店铺-DE'];

const route = useRoute();
const router = useRouter();

const { list: campaigns, fetchAll, toggle } = useCampaigns();
const { getById: getPortfolio } = usePortfolios();

onMounted(() => { fetchAll(); });

// ----- AdAnalysisDrawer -----
const drawerVisible = ref(false);
const drawerEntity = ref({});
const drawerInitialTab = ref('daily');
function openAnalysisDrawer(row, tab = 'daily') {
  const p = row.portfolioId ? getPortfolio(row.portfolioId) : null;
  drawerEntity.value = {
    id: row.id,
    type: 'campaign',
    name: row.name,
    portfolioName: p?.name,
  };
  drawerInitialTab.value = tab;
  drawerVisible.value = true;
}

// 按路由判断过滤
const typeFilter = computed(() => {
  if (route.path.endsWith('/sp')) return 'SP';
  if (route.path.endsWith('/sb')) return 'SB';
  if (route.path.endsWith('/sd')) return 'SD';
  if (route.path.endsWith('/st')) return 'ST';
  return null;
});

const title = computed(() => {
  return typeFilter.value ? `${typeFilter.value}广告` : '全部活动';
});

const rows = computed(() => {
  if (!typeFilter.value) return campaigns.value;
  return campaigns.value.filter((c) => c.type === typeFilter.value);
});

const filterStore = ref(route.query.store || '亚马逊-G店铺-US');
const filterDate = ref([new Date('2026-05-13'), new Date('2026-05-13')]);
const showCompare = ref(false);

watch(filterStore, (v) => {
  const query = { ...route.query };
  if (v && v !== '亚马逊-G店铺-US') query.store = v; else delete query.store;
  router.replace({ path: route.path, query });
});

function gotoCampaign(row) {
  router.push(`/ads/lx/campaigns/${row.id}?g=ad-groups`);
}

async function onToggle(row) {
  await toggle(row);
}
</script>

<template>
  <div class="lxall-page">
    <h2 class="page-title">{{ title }}</h2>

    <div class="filter-bar">
      <el-select v-model="filterStore" size="default" style="width: 200px">
        <el-option v-for="s in STORES" :key="s" :label="s" :value="s" />
      </el-select>
      <el-date-picker v-model="filterDate" type="daterange" size="default" style="width: 240px" />
      <el-select size="default" style="width: 140px" placeholder="服务状态">
        <el-option label="全部" value="all" />
        <el-option label="正在投放" value="serving" />
      </el-select>
      <el-select size="default" style="width: 140px" placeholder="广告组合">
        <el-option label="全部" value="all" />
      </el-select>
      <el-input size="default" placeholder="活动名称搜索" style="width: 200px" clearable />
      <el-button type="primary">查询</el-button>
      <el-button plain>重置</el-button>
    </div>

    <div class="table-toolbar">
      <el-button type="primary" :icon="'Plus'">添加广告活动 ▾</el-button>
      <span class="spacer" />
      <el-checkbox v-model="showCompare" size="small">环比</el-checkbox>
      <el-button :icon="'Bell'" size="small">对比预警</el-button>
      <el-button :icon="'Operation'" size="small">列配置 ▾</el-button>
      <el-button :icon="'Download'" size="small" link />
      <el-button :icon="'Refresh'" size="small" type="primary">同步</el-button>
    </div>

    <div class="lx-table">
      <ResponsiveTable
        :data="rows"
        :mobile-columns="mobileCampaignCols"
        row-clickable
        @row-click="gotoCampaign"
        stripe
        border
        :row-class-name="() => 'clickable'"
        size="small"
      >
        <el-table-column type="selection" width="40" fixed />
        <el-table-column label="有效" width="55" fixed>
          <template #default="{ row }"><el-switch v-model="row.enabled" size="small" @click.stop @change="onToggle(row)" /></template>
        </el-table-column>
        <el-table-column label="广告类型" width="80" fixed>
          <template #default="{ row }">
            <div class="ad-type"><strong>{{ row.type }}</strong><small>[{{ row.targetingType }}]</small></div>
          </template>
        </el-table-column>
        <el-table-column label="广告活动" prop="name" min-width="280" fixed>
          <template #default="{ row }">
            <el-icon class="quick-analysis-icon" @click.stop="openAnalysisDrawer(row)" title="快速分析（9-tab drawer）"><Histogram /></el-icon>
            <a class="link" @click.stop="gotoCampaign(row)">{{ row.name }}</a>
          </template>
        </el-table-column>
        <el-table-column label="预算" prop="dailyBudget" width="80" align="right">
          <template #default="{ row }">${{ (row.dailyBudget ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="服务状态" width="120">
          <template #default="{ row }">
            <span :style="{ color: row.serviceStateColor }">●</span>
            <span style="margin-left: 4px; font-size: 12px">{{ row.serviceState }}</span>
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
        <el-table-column label="花费" prop="spend" width="100" sortable align="right">
          <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="广告销售额" prop="sales" width="110" sortable align="right">
          <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="ACoS" prop="acos" width="90" sortable align="right">
          <template #default="{ row }">
            <span :class="row.acos && row.acos > 0.5 ? 'danger' : ''">{{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="订单" prop="orders" width="70" sortable align="right" />
        <el-table-column label="CVR" prop="cvr" width="80" sortable align="right">
          <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="标签" width="100">
          <template #default="{ row }">
            <el-tag v-for="t in (row.tags || [])" :key="t" size="small" effect="plain">{{ t }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分析" width="100" fixed="right">
          <template #default>
            <el-icon class="tool-icon"><Histogram /></el-icon>
            <el-icon class="tool-icon"><Clock /></el-icon>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click.stop="gotoCampaign(row)">进入详情</el-button>
          <el-button size="small" @click.stop="onToggle(row)">{{ row.enabled ? '暂停' : '启用' }}</el-button>
        </template>
      </ResponsiveTable>
    </div>
  </div>

  <AdAnalysisDrawer v-model="drawerVisible" :entity="drawerEntity" :initial-tab="drawerInitialTab" />
</template>

<style scoped>
.lxall-page { background: #fff; border-radius: 4px; padding: 12px 14px; }
.page-title { font-size: 15px; font-weight: 600; margin: 0 0 12px; padding-bottom: 10px; border-bottom: 1px solid #f3f4f6; }

.filter-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 0 12px; border-bottom: 1px solid #f3f4f6; }
.table-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 0; }
.spacer { flex: 1; }

.lx-table { overflow-x: auto; }
.lx-table :deep(.el-table) { font-size: 12px; }
.lx-table :deep(.el-table th) { background: #fafbfc !important; color: #6b7280; font-weight: 500; }
.lx-table :deep(.clickable) { cursor: pointer; }
.lx-table :deep(.clickable:hover td) { background: #f0f7ff !important; }

.quick-analysis-icon {
  margin-right: 6px; color: var(--text-muted, #909399); cursor: pointer;
  vertical-align: middle; font-size: 14px;
}
.quick-analysis-icon:hover { color: var(--primary, #3b82f6); }

.ad-type { display: flex; flex-direction: column; align-items: center; font-size: 11px; }
.ad-type strong { font-size: 12px; }
.ad-type small { color: var(--text-muted); }
.link { color: var(--primary); cursor: pointer; }
.link:hover { text-decoration: underline; }
.danger { color: #ef4444; font-weight: 600; }
.tool-icon { margin: 0 3px; color: var(--text-muted); font-size: 13px; cursor: pointer; }
.tool-icon:hover { color: var(--primary); }

@media (max-width: 767px) {
  .lxall-page { padding: 8px; }
  .filter-bar .el-select,
  .filter-bar .el-input,
  .filter-bar .el-date-editor { width: 100% !important; }
  .table-toolbar { flex-wrap: wrap; gap: 6px; }
}
</style>
