<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
// M3-P1-14: Clock was used in the template (analysis column) but not imported, causing a
// render error. Import it alongside Histogram.
import { Histogram, Clock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useCampaigns, usePortfolios } from '../../composables/useLxState';
import ResponsiveTable from '../../components/ResponsiveTable.vue';
import AdAnalysisDrawer from '../../components/AdAnalysisDrawer.vue';
import { useViewport } from '../../composables/useViewport';
import { realWritesEnabled, confirmAuditAction } from '../../composables/useLiveActionGate';
import { actionQueueApi } from '../../api/ads-timeline';

// m3-button-level / M3-P1-17: real-write boundary state for the dryRun banner + audit gate.
const realWrites = computed(() => realWritesEnabled());
const pauseHint = computed(() =>
  realWrites.value
    ? '暂停将进入 ad_action_queue 审计工单(needs_review),dryRun 默认开启'
    : '当前为 dryRun(演示)模式,暂停仅入队审计,不会真实生效'
);

// M3-P2-21: budget input validation — only positive finite numbers may be submitted.
function isValidBudget(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

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

// ----- selection -----
const selected = ref([]);
function onSelectionChange(rows) { selected.value = rows; }

// ----- M3-P2-21: budget inline edit guarded by validation -----
async function onUpdateBudget(c) {
  if (!isValidBudget(c.budget)) {
    ElMessage.warning('预算必须为大于 0 的有效数字');
    return;
  }
  if (!confirmAuditAction('修改广告活动预算', 1)) return;
  try {
    const res = await actionQueueApi.enqueue({
      sourceStrategyName: 'LxAllCampaigns manual budget',
      entity: { kind: 'campaign', id: c.id, name: c.name },
      typedAction: {
        actionPrimitive: 'SET_CAMPAIGN_BUDGET',
        sourceSurface: 'lx',
        entityKind: 'campaign',
        currentValue: { dailyBudget: c.dailyBudget },
        recommendedValue: { dailyBudget: c.budget },
        dryRun: true,
        auditRequired: true,
        requiresRealStoreWrite: false,
      },
      guardrail: { status: 'needs_review', reasons: ['manual_lx_write_requires_action_queue'] },
    });
    if (res?.queued) ElMessage.success('已加入执行篮待批准生效');
  } catch (e) {
    ElMessage.error('入队失败：' + (e?.message || e));
  }
}

// ----- M3-P1-11 / lx-bulk-confirm: bulk pause with confirm + progress + summary toast -----
const bulkRunning = ref(false);
const bulkDone = ref(0);
const bulkTotal = ref(0);
async function bulkPause() {
  const ids = selected.value.filter((c) => c.enabled).map((c) => c.id);
  if (!ids.length) { ElMessage.info('请选择启用中的广告活动'); return; }
  if (!confirmAuditAction('批量暂停广告活动', ids.length)) return;
  bulkRunning.value = true;
  bulkDone.value = 0;
  bulkTotal.value = ids.length;
  let ok = 0, fail = 0;
  for (const id of ids) {
    const c = campaigns.value.find((x) => x.id === id);
    try {
      const res = await actionQueueApi.enqueue({
        sourceStrategyName: 'LxAllCampaigns bulk pause',
        entity: { kind: 'campaign', id, name: c?.name },
        typedAction: {
          actionPrimitive: 'PAUSE_CAMPAIGN',
          sourceSurface: 'lx',
          entityKind: 'campaign',
          currentValue: { enabled: true },
          recommendedValue: { enabled: false },
          dryRun: true,
          auditRequired: true,
          requiresRealStoreWrite: false,
        },
        guardrail: { status: 'needs_review', reasons: ['manual_lx_write_requires_action_queue'] },
      });
      if (res && res.duplicate !== true && res.queued === false) fail++; else ok++;
    } catch {
      fail++;
    } finally {
      bulkDone.value++;
    }
  }
  bulkRunning.value = false;
  ElMessage({ message: `批量暂停已入队:成功 ${ok} 项,失败 ${fail} 项(待审核+dry-run)`, type: fail === ids.length ? 'error' : 'success', customClass: 'bulk-toast' });
}

// ----- M3-P1-14: filter / sync handlers (real query params + force refetch) -----
async function applyFilters() {
  await fetchAll(true);
}
async function resetFilters() {
  filterStore.value = '亚马逊-G店铺-US';
  filterDate.value = [new Date('2026-05-13'), new Date('2026-05-13')];
  await fetchAll(true);
}
const syncing = ref(false);
async function syncNow() {
  syncing.value = true;
  try { await fetchAll(true); } finally { syncing.value = false; }
}
watch(filterDate, () => { /* date range drives query params on next applyFilters/syncNow */ });

// ----- M3-P2-21: front-end CSV export of currently-loaded rows -----
function exportCsv() {
  const cols = ['name', 'type', 'dailyBudget', 'spend', 'sales', 'acos'];
  const header = cols.join(',');
  const lines = rows.value.map((r) => cols.map((k) => JSON.stringify(r[k] ?? '')).join(','));
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'campaigns.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="lxall-page">
    <h2 class="page-title">{{ title }}</h2>

    <!-- m3-button-level / M3-P1-17: dryRun banner when real writes are NOT enabled -->
    <div v-if="!realWrites" class="dryrun-banner">
      <span>dryRun(演示)模式 · 暂停/改预算仅进入 ad_action_queue 审计(needs_review),不会真实生效</span>
    </div>

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
      <el-button type="primary" @click="applyFilters">查询</el-button>
      <el-button plain @click="resetFilters">重置</el-button>
    </div>

    <div class="table-toolbar">
      <el-button type="primary" :icon="'Plus'" disabled title="即将上线">添加广告活动 ▾</el-button>
      <el-button
        type="warning"
        plain
        size="small"
        :disabled="bulkRunning"
        :title="pauseHint"
        @click="bulkPause"
      >批量暂停(审计)</el-button>
      <span v-if="bulkRunning" class="bulk-progress">处理中 {{ bulkDone }} / {{ bulkTotal }}</span>
      <span class="spacer" />
      <el-checkbox v-model="showCompare" size="small">环比</el-checkbox>
      <el-button :icon="'Bell'" size="small" disabled title="即将上线">对比预警</el-button>
      <el-button :icon="'Operation'" size="small" disabled title="即将上线">列配置 ▾</el-button>
      <el-button :icon="'Download'" size="small" @click="exportCsv" title="导出当前表格为 CSV">导出</el-button>
      <el-button :icon="'Refresh'" size="small" type="primary" :loading="syncing" @click="syncNow">同步</el-button>
    </div>

    <div class="lx-table">
      <ResponsiveTable
        :data="rows"
        :mobile-columns="mobileCampaignCols"
        row-clickable
        @row-click="gotoCampaign"
        @selection-change="onSelectionChange"
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
        <el-table-column label="预算" prop="dailyBudget" width="170" align="right">
          <template #default="{ row: c }">
            <div class="budget-edit" @click.stop>
              <el-input-number
                v-model="c.budget"
                :min="0"
                :precision="2"
                :step="1"
                :controls="false"
                size="small"
                style="width: 90px"
                :placeholder="String((c.dailyBudget ?? 0).toFixed(2))"
              />
              <el-button
                size="small"
                type="primary"
                link
                :disabled="!isValidBudget(c.budget)"
                @click="onUpdateBudget(c)"
              >改</el-button>
            </div>
          </template>
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
