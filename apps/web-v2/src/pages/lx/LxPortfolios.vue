<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Histogram } from '@element-plus/icons-vue';
import { usePortfolios } from '../../composables/useLxState';
import AiActivityBanner from '../../components/AiActivityBanner.vue';
import ResponsiveTable from '../../components/ResponsiveTable.vue';
import AdAnalysisDrawer from '../../components/AdAnalysisDrawer.vue';
import { useViewport } from '../../composables/useViewport';

const { isMobile } = useViewport();
const mobilePortfolioCols = [
  { prop: 'name', label: '广告组合' },
  { prop: 'serviceState', label: '状态' },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v !== null && v !== undefined ? (v * 100).toFixed(2) + '%' : '--' },
];

const router = useRouter();
const route = useRoute();

const STORES = ['亚马逊-G店铺-US', '亚马逊-G店铺-UK', '亚马逊-G店铺-DE'];

const { list: rows, fetch } = usePortfolios();

onMounted(() => { fetch(); });

// 筛选状态用 URL query 同步
const filterStore = ref(route.query.store || '亚马逊-G店铺-US');
const filterDateRange = ref([new Date('2026-05-13'), new Date('2026-05-13')]);
const filterServiceState = ref(route.query.svc || 'all');
const filterPortfolioId = ref(route.query.pf || 'all');
const filterName = ref(route.query.q || '');

watch([filterStore, filterServiceState, filterPortfolioId, filterName], ([s, svc, pf, q]) => {
  const query = { ...route.query };
  if (s && s !== '亚马逊-G店铺-US') query.store = s; else delete query.store;
  if (svc !== 'all') query.svc = svc; else delete query.svc;
  if (pf !== 'all') query.pf = pf; else delete query.pf;
  if (q) query.q = q; else delete query.q;
  router.replace({ path: route.path, query });
});

const showCompare = ref(false);

function gotoDetail(row) {
  router.push(`/ads/lx/portfolios/${row.id}`);
}

// AdAnalysisDrawer
const drawerVisible = ref(false);
const drawerEntity = ref({});
function openAnalysisDrawer(row) {
  drawerEntity.value = { id: row.id, type: 'portfolio', name: row.name };
  drawerVisible.value = true;
}

function sync() {
  fetch(true).then(() => ElMessage.success('已从 Amazon Ads-API 同步最新数据'));
}
</script>

<template>
  <div class="lx1-page">
    <!-- 顶部一行筛选器 -->
    <div class="filter-bar">
      <el-select v-model="filterStore" size="default" style="width: 200px">
        <el-option v-for="s in STORES" :key="s" :label="s" :value="s" />
      </el-select>
      <el-date-picker
        v-model="filterDateRange"
        type="daterange"
        range-separator="-"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        size="default"
        style="width: 260px"
      />
      <el-select v-model="filterServiceState" size="default" style="width: 160px">
        <el-option label="全部服务状态" value="all" />
        <el-option label="正在投放" value="serving" />
        <el-option label="超预算" value="out_of_budget" />
        <el-option label="已暂停" value="paused" />
      </el-select>
      <el-select v-model="filterPortfolioId" size="default" style="width: 200px">
        <el-option label="广告组合" value="all" />
        <el-option v-for="p in rows" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <el-input v-model="filterName" placeholder="请输入广告活动名称" size="default" style="width: 240px" clearable />
      <el-button :icon="'Filter'">筛选模板</el-button>
      <el-button type="primary">查询</el-button>
      <el-button plain>重置</el-button>
    </div>

    <!-- 已选筛选 chip -->
    <div class="filter-chip">
      <el-tag closable type="primary" effect="light">{{ filterStore }}</el-tag>
      <el-button :icon="'Delete'" link size="small">清空</el-button>
    </div>

    <!-- 表格上方右侧工具栏 -->
    <div class="table-toolbar">
      <el-button :icon="'Calendar'" size="small">按开始结束时间</el-button>
      <span class="spacer" />
      <el-checkbox v-model="showCompare" size="small">环比</el-checkbox>
      <el-button :icon="'EditPen'" size="small" link />
      <el-button :icon="'Bell'" size="small">对比预警</el-button>
      <el-button :icon="'Operation'" size="small">列配置 ▾</el-button>
      <el-button :icon="'Reading'" size="small" link />
      <el-button :icon="'Download'" size="small" link />
      <el-button :icon="'Refresh'" size="small" type="primary" @click="sync">同步</el-button>
    </div>

    <!-- 22 列大表 -->
    <div class="lx-table-wrap">
      <ResponsiveTable
        :data="rows"
        :mobile-columns="mobilePortfolioCols"
        row-clickable
        @row-click="gotoDetail"
        stripe
        border
        :row-class-name="() => 'clickable'"
        size="small"
      >
        <el-table-column type="selection" width="40" fixed />
        <el-table-column label="服务状态" prop="serviceState" width="110" fixed>
          <template #default="{ row }">
            <span :style="{ color: '#10b981', fontSize: '12px' }" v-if="row.serviceState === '正在投放'">●</span>
            <span :style="{ color: '#f59e0b', fontSize: '12px' }" v-else>●</span>
            <span style="margin-left: 4px; font-size: 12px">{{ row.serviceState }}</span>
          </template>
        </el-table-column>
        <el-table-column label="广告组合" prop="name" min-width="240" fixed>
          <template #default="{ row }">
            <el-icon class="quick-analysis-icon" @click.stop="openAnalysisDrawer(row)" title="快速分析"><Histogram /></el-icon>
            <a class="link" @click.stop="gotoDetail(row)">{{ row.name }}</a>
          </template>
        </el-table-column>
        <el-table-column label="🤖" width="60" fixed>
          <template #default="{ row }">
            <AiActivityBanner :sku="row.sku" :compact="true" />
          </template>
        </el-table-column>
        <el-table-column label="曝光量" prop="impressions" width="100" sortable align="right">
          <template #default="{ row }"><span class="num">{{ (row.impressions ?? 0).toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column label="点击" prop="clicks" width="80" sortable align="right">
          <template #default="{ row }"><span class="num">{{ row.clicks }}</span></template>
        </el-table-column>
        <el-table-column label="点击%" prop="clickPct" width="90" sortable align="right">
          <template #default="{ row }">{{ row.clickPct }}%</template>
        </el-table-column>
        <el-table-column label="CTR" prop="ctr" width="80" sortable align="right">
          <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="CPC" prop="cpc" width="80" sortable align="right">
          <template #default="{ row }"><span class="num">${{ (row.cpc ?? 0).toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column label="花费" prop="spend" width="100" sortable align="right">
          <template #default="{ row }"><span class="num">${{ (row.spend ?? 0).toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column label="花费%" prop="spendPct" width="90" sortable align="right">
          <template #default="{ row }">{{ row.spendPct }}%</template>
        </el-table-column>
        <el-table-column label="广告销售额" prop="sales" width="120" sortable align="right">
          <template #default="{ row }"><span class="num">${{ (row.sales ?? 0).toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column label="广告销售额%" prop="salesPct" width="110" sortable align="right">
          <template #default="{ row }">{{ row.salesPct }}%</template>
        </el-table-column>
        <el-table-column label="直接销售额" prop="directSales" width="110" sortable align="right">
          <template #default="{ row }">${{ (row.directSales ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="ACoS" prop="acos" width="100" sortable align="right">
          <template #default="{ row }">
            <span :class="row.acos > 0.5 ? 'danger' : row.acos < 0.3 && row.acos > 0 ? 'good' : ''">
              {{ row.acos !== null && row.acos !== undefined ? (row.acos * 100).toFixed(2) + '%' : '--' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="广告订单" prop="orders" width="100" sortable align="right" />
        <el-table-column label="直接订单" prop="directOrders" width="100" sortable align="right" />
        <el-table-column label="CPA" prop="cpa" width="90" sortable align="right">
          <template #default="{ row }">{{ row.cpa !== null && row.cpa !== undefined ? '$' + row.cpa.toFixed(2) : '--' }}</template>
        </el-table-column>
        <el-table-column label="CVR" prop="cvr" width="90" sortable align="right">
          <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="广告笔单价" prop="adUnitPrice" width="110" sortable align="right">
          <template #default="{ row }">${{ (row.adUnitPrice ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="广告销量" prop="adUnits" width="100" sortable align="right" />
        <el-table-column label="分析" width="100" fixed="right">
          <template #default>
            <el-tooltip content="趋势图"><el-icon class="tool-icon"><Histogram /></el-icon></el-tooltip>
            <el-tooltip content="对比"><el-icon class="tool-icon"><DataAnalysis /></el-icon></el-tooltip>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click.stop="gotoDetail(row)">进入详情</el-button>
        </template>
      </ResponsiveTable>
    </div>

    <div class="page-footer">
      <span class="meta">共 <strong>{{ rows.length }}</strong> 条</span>
      <el-pagination :total="rows.length" :page-size="25" layout="sizes, prev, pager, next, jumper" background small />
    </div>
  </div>

  <AdAnalysisDrawer v-model="drawerVisible" :entity="drawerEntity" />
</template>

<style scoped>
.lx1-page {
  background: #fff;
  border-radius: 4px;
  padding: 12px 14px;
}

.quick-analysis-icon {
  margin-right: 6px; color: var(--text-muted, #909399); cursor: pointer;
  vertical-align: middle; font-size: 14px;
}
.quick-analysis-icon:hover { color: var(--primary, #3b82f6); }

.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 0 10px;
  border-bottom: 1px solid #f3f4f6;
}
.filter-chip {
  padding: 8px 0;
  display: flex;
  gap: 6px;
  align-items: center;
  border-bottom: 1px solid #f3f4f6;
}
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
}
.spacer { flex: 1; }

.lx-table-wrap {
  overflow-x: auto;
}
.lx-table-wrap :deep(.el-table) {
  font-size: 12px;
}
.lx-table-wrap :deep(.el-table th) {
  background: #fafbfc !important;
  color: #6b7280;
  font-weight: 500;
  padding: 8px 0;
}
.lx-table-wrap :deep(.el-table td) {
  padding: 6px 0;
}
.lx-table-wrap :deep(.clickable) { cursor: pointer; }
.lx-table-wrap :deep(.clickable:hover td) { background: #f0f7ff !important; }

.link {
  color: var(--primary);
  cursor: pointer;
  text-decoration: none;
}
.link:hover { text-decoration: underline; }
.num {
  font-family: ui-monospace, monospace;
}
.danger { color: #ef4444; }
.good { color: #10b981; }

.tool-icon {
  margin: 0 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
}
.tool-icon:hover { color: var(--primary); }

.page-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 14px;
  font-size: 12px;
  color: var(--text-muted);
}
.page-footer strong { color: var(--text); }

@media (max-width: 767px) {
  .lx1-page { padding: 8px; }
  .filter-bar { gap: 6px; }
  .filter-bar .el-select,
  .filter-bar .el-input,
  .filter-bar .el-date-editor { width: 100% !important; }
  .table-toolbar { flex-wrap: wrap; gap: 6px; }
  .page-footer { flex-direction: column; gap: 8px; align-items: stretch; }
}
</style>
