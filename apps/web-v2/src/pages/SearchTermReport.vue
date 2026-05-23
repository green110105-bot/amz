<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import DataTablePro from '../components/DataTablePro.vue';
import KpiCard from '../components/KpiCard.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { searchTermsReportApi } from '../api/ads-reports';
import { useAudit } from '../composables/useAudit';
import { useViewport } from '../composables/useViewport';
import ResponsiveDrawer from '../components/ResponsiveDrawer.vue';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();

const props = defineProps({ embedded: { type: Boolean, default: false } });
const route = useRoute();
const router = useRouter();
const { submit } = useAudit();

const rows = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const items = await searchTermsReportApi.list();
    rows.value = Array.isArray(items) ? items : [];
  } catch (e) {
    ElMessage.error(`加载搜索词报告失败：${e.message || e}`);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const drawerOpen = ref(false);
const drawerRow = ref(null);

// 信号过滤（URL query 同步）
const signalFilter = ref(route.query.signal || 'all');

const filteredRows = computed(() => {
  if (signalFilter.value === 'all') return rows.value;
  return rows.value.filter((r) => r.signal === signalFilter.value);
});

// 顶部 KPI
const kpi = computed(() => {
  const arr = rows.value;
  const totalSpend = arr.reduce((s, r) => s + (r.spend || 0), 0);
  const totalSales = arr.reduce((s, r) => s + (r.sales || 0), 0);
  const totalOrders = arr.reduce((s, r) => s + (r.orders || 0), 0);
  const totalClicks = arr.reduce((s, r) => s + (r.clicks || 0), 0);
  const wasteCount = arr.filter((r) => r.signal === 'waste').length;
  const harvestCount = arr.filter((r) => r.signal === 'harvest').length;
  return {
    totalSpend,
    totalSales,
    avgAcos: totalSales > 0 ? totalSpend / totalSales : 0,
    avgRoas: totalSpend > 0 ? totalSales / totalSpend : 0,
    totalOrders,
    wasteCount,
    harvestCount,
    wasteSpend: arr.filter((r) => r.signal === 'waste').reduce((s, r) => s + (r.spend || 0), 0),
  };
});

const columns = [
  { prop: 'term', label: '搜索词', minWidth: 200, fixed: 'left' },
  { prop: 'sku', label: 'SKU', width: 110 },
  { prop: 'match', label: '匹配类型', width: 100, type: 'tag',
    tagType: (r) => ({ exact: 'success', phrase: 'warning', broad: 'info' }[r.match] || 'info'),
    tagLabel: (r) => ({ exact: '精准', phrase: '词组', broad: '广泛' }[r.match] || r.match) },
  { prop: 'campaign', label: 'Campaign', minWidth: 180 },
  { prop: 'adGroup', label: 'AdGroup', minWidth: 180, defaultHidden: true },
  { prop: 'impressions', label: '曝光', width: 100, type: 'int', align: 'right' },
  { prop: 'clicks', label: '点击', width: 90, type: 'int', align: 'right' },
  { prop: 'ctr', label: 'CTR', width: 90, type: 'percent', align: 'right' },
  { prop: 'cpc', label: 'CPC', width: 90, type: 'money', align: 'right' },
  { prop: 'spend', label: '花费', width: 100, type: 'money', align: 'right' },
  { prop: 'orders', label: '订单', width: 80, type: 'int', align: 'right' },
  { prop: 'sales', label: '销售额', width: 110, type: 'money', align: 'right' },
  { prop: 'acos', label: 'ACOS', width: 100, align: 'right',
    type: 'percent', signal: (r) => r.acos === null || r.acos === undefined ? 'bad' : r.acos > 0.6 ? 'bad' : r.acos < 0.3 ? 'good' : 'warn' },
  { prop: 'roas', label: 'ROAS', width: 90, align: 'right' },
  { prop: 'cvr', label: 'CVR', width: 90, type: 'percent', align: 'right' },
  { prop: 'signal', label: '信号', width: 110, type: 'tag',
    tagType: (r) => ({ waste: 'danger', harvest: 'success', high_acos: 'warning', normal: 'info' }[r.signal]),
    tagLabel: (r) => ({ waste: '💸 浪费', harvest: '⭐ 可升手动', high_acos: '⚠ ACOS 高', normal: '—' }[r.signal]) },
];

const bulkActions = [
  {
    label: '一键升手动 (Promote to Manual)',
    icon: 'Promotion',
    type: 'primary',
    confirm: true,
    handler: async (selected) => {
      for (const row of selected) {
        try {
          await submit({
            sourceModule: 'M3',
            actionType: 'PROMOTE_TO_MANUAL',
            target: { type: 'search_term', term: row.term, sku: row.sku },
            payload: { term: row.term, suggestedBid: (row.cpc || 0) * 1.1 },
            description: `升手动精准：${row.term}（基于 CPC × 1.1 = $${((row.cpc || 0) * 1.1).toFixed(2)}）`,
          });
          await searchTermsReportApi.promote({ id: row.id, term: row.term, sku: row.sku, suggestedBid: (row.cpc || 0) * 1.1 });
        } catch (e) {
          ElMessage.error(`升手动失败：${row.term} — ${e.message || e}`);
        }
      }
    },
  },
  {
    label: '一键加否定 (Negate)',
    icon: 'CloseBold',
    type: 'danger',
    confirm: true,
    handler: async (selected) => {
      for (const row of selected) {
        try {
          await submit({
            sourceModule: 'M3',
            actionType: 'ADD_NEGATIVE_KEYWORD',
            target: { type: 'search_term', term: row.term, sku: row.sku },
            payload: { term: row.term, matchType: 'exact', scope: 'AdGroup' },
            description: `加 negative-exact "${row.term}" 至 ${row.adGroup}`,
          });
          await searchTermsReportApi.negate({ id: row.id, term: row.term, sku: row.sku, matchType: 'exact', scope: 'AdGroup' });
        } catch (e) {
          ElMessage.error(`加否定失败：${row.term} — ${e.message || e}`);
        }
      }
    },
  },
  {
    label: '批量改 match type',
    icon: 'Switch',
    type: 'default',
    handler: async (selected) => {
      ElMessage.info(`PoC: 批量改 match type 弹窗（${selected.length} 行）`);
    },
  },
];

function viewDetail(row) {
  drawerRow.value = row;
  drawerOpen.value = true;
}

function jumpToTimeline() {
  router.push('/ads/timeline');
}
</script>

<template>
  <MobileFallback
    v-if="isMobile && !embedded"
    page-name="搜索词报告"
    reason="本页含跨 SKU 全量大数据表与多列筛选，建议在桌面端操作。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <p style="margin: 0">领星核心报表 — 收割高转化词 → 升手动；浪费词 → 加否定。建议桌面端使用以查看完整列。</p>
        <el-button type="primary" style="margin-top: 16px; width: 100%" @click="$router.push('/workbench')">返回工作台</el-button>
      </el-card>
    </template>
  </MobileFallback>
  <div v-else>
    <PageHeader
      v-if="!embedded"
      title="搜索词报告"
      subtitle="领星核心报表 · 收割高转化词 → 升手动；浪费词 → 加否定 · 跨 SKU 全量"
    >
      <template #extra>
        <el-button :icon="'Upload'">CSV 批量改</el-button>
        <el-button :icon="'View'" plain @click="jumpToTimeline">🤖 看 AI Timeline 上的建议</el-button>
      </template>
    </PageHeader>

    <!-- KPI -->
    <el-row :gutter="12" class="kpi-row">
      <el-col :xs="12" :sm="6">
        <KpiCard label="时段总曝光花费" :value="formatCurrency(kpi.totalSpend, 'USD')" icon="Money" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="加权 ACOS" :value="formatPercent(kpi.avgAcos)"
          :status="kpi.avgAcos > 0.4 ? 'warning' : 'success'" icon="Discount" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="💸 浪费词" :value="kpi.wasteCount" :hint="`已浪费 ${formatCurrency(kpi.wasteSpend, 'USD')}`" status="danger" icon="WarningFilled" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="⭐ 可升手动" :value="kpi.harvestCount" hint="符合 GROWTH-1 收割条件" status="success" icon="Promotion" />
      </el-col>
    </el-row>

    <!-- 信号快速过滤 -->
    <el-card shadow="never" class="filter-card">
      <span class="filter-label">快速筛选</span>
      <el-radio-group v-model="signalFilter" size="small">
        <el-radio-button value="all">全部 ({{ rows.length }})</el-radio-button>
        <el-radio-button value="waste">💸 浪费 ({{ kpi.wasteCount }})</el-radio-button>
        <el-radio-button value="harvest">⭐ 可升手动 ({{ kpi.harvestCount }})</el-radio-button>
        <el-radio-button value="high_acos">⚠ 高 ACOS</el-radio-button>
        <el-radio-button value="normal">常规</el-radio-button>
      </el-radio-group>
    </el-card>

    <DataTablePro
      title="搜索词报告"
      :data="filteredRows"
      :columns="columns"
      :bulk-actions="bulkActions"
      :row-clickable="true"
      :show-compare="true"
      @row-click="viewDetail"
    />

    <!-- 详情抽屉（最小） -->
    <ResponsiveDrawer v-model="drawerOpen" :with-header="false" size="540px">
      <div v-if="drawerRow" class="drawer">
        <h2 class="dt">"{{ drawerRow.term }}"</h2>
        <div class="dt-sub">
          <el-tag size="small">SKU {{ drawerRow.sku }}</el-tag>
          <el-tag size="small" type="info">{{ drawerRow.campaign }}</el-tag>
          <el-tag size="small" effect="plain">{{ drawerRow.match }}</el-tag>
          <el-tag v-if="drawerRow.signal === 'waste'" size="small" type="danger">💸 浪费</el-tag>
          <el-tag v-if="drawerRow.signal === 'harvest'" size="small" type="success">⭐ 可升手动</el-tag>
        </div>
        <h3 class="sh">7 天表现</h3>
        <el-row :gutter="8">
          <el-col :span="8"><div class="cell"><span>曝光</span><strong>{{ (drawerRow.impressions ?? 0).toLocaleString() }}</strong></div></el-col>
          <el-col :span="8"><div class="cell"><span>点击</span><strong>{{ drawerRow.clicks }}</strong></div></el-col>
          <el-col :span="8"><div class="cell"><span>CTR</span><strong>{{ formatPercent(drawerRow.ctr ?? 0) }}</strong></div></el-col>
          <el-col :span="8"><div class="cell"><span>CPC</span><strong>{{ formatCurrency(drawerRow.cpc ?? 0, 'USD') }}</strong></div></el-col>
          <el-col :span="8"><div class="cell"><span>花费</span><strong>{{ formatCurrency(drawerRow.spend ?? 0, 'USD') }}</strong></div></el-col>
          <el-col :span="8"><div class="cell"><span>订单</span><strong>{{ drawerRow.orders }}</strong></div></el-col>
          <el-col :span="8"><div class="cell"><span>销售额</span><strong>{{ formatCurrency(drawerRow.sales ?? 0, 'USD') }}</strong></div></el-col>
          <el-col :span="8"><div class="cell"><span>ACOS</span><strong>{{ drawerRow.acos !== null && drawerRow.acos !== undefined ? formatPercent(drawerRow.acos) : '—' }}</strong></div></el-col>
          <el-col :span="8"><div class="cell"><span>ROAS</span><strong>{{ drawerRow.roas }}</strong></div></el-col>
        </el-row>

        <div v-if="drawerRow.signal === 'waste'" class="ai-suggestion oppose">
          <strong>🤖 AI 建议</strong>
          <p>该搜索词 {{ drawerRow.clicks }} 点击 0 转化，浪费 {{ formatCurrency(drawerRow.spend ?? 0, 'USD') }}。建议加 negative-exact 至 {{ drawerRow.adGroup }}。</p>
          <el-button type="danger" size="small">加 negative-exact</el-button>
        </div>
        <div v-else-if="drawerRow.signal === 'harvest'" class="ai-suggestion success">
          <strong>🤖 AI 建议</strong>
          <p>该词转化率 {{ formatPercent(drawerRow.cvr ?? 0) }}，已稳定 14d+，符合 GROWTH-1 升手动条件。建议升 manual exact，bid 起 ${{ ((drawerRow.cpc || 0) * 1.1).toFixed(2) }}，同时给原 ad group 加 negative-exact。</p>
          <el-button type="primary" size="small">升 manual exact</el-button>
        </div>
      </div>
    </ResponsiveDrawer>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 12px; }

.filter-card { margin-bottom: 12px; }
.filter-card :deep(.el-card__body) {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-label { font-size: 12px; color: var(--text-muted); }

.drawer { padding: 20px; }
.dt { font-size: 18px; margin: 0 0 8px; }
.dt-sub { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.sh { font-size: 13px; margin: 16px 0 8px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.cell {
  background: #f9fafb;
  border-radius: 4px;
  padding: 10px;
  text-align: center;
  margin-bottom: 6px;
}
.cell span { display: block; font-size: 11px; color: var(--text-muted); }
.cell strong { font-size: 15px; margin-top: 2px; display: block; font-family: ui-monospace, monospace; }
.ai-suggestion {
  margin-top: 18px;
  padding: 12px 14px;
  background: #f0f7ff;
  border-left: 3px solid var(--primary);
  border-radius: 6px;
}
.ai-suggestion.oppose {
  background: #fef2f2;
  border-left-color: #ef4444;
}
.ai-suggestion.success {
  background: #f0fdf4;
  border-left-color: #10b981;
}
.ai-suggestion strong { display: block; margin-bottom: 6px; font-size: 13px; }
.ai-suggestion p { margin: 0 0 10px; font-size: 13px; line-height: 1.6; }
</style>
