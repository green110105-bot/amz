<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import DataTablePro from '../components/DataTablePro.vue';
import KpiCard from '../components/KpiCard.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { campaignReportApi } from '../api/ads-reports';
import { campaignsApi } from '../api/lx';
import { useAudit } from '../composables/useAudit';
import { useViewport } from '../composables/useViewport';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();

const props = defineProps({ embedded: { type: Boolean, default: false } });
const { submit } = useAudit();

const rows = ref([]);

async function load() {
  try {
    const items = await campaignReportApi.list();
    rows.value = Array.isArray(items) ? items : [];
  } catch (e) {
    ElMessage.error(`加载活动报表失败：${e.message || e}`);
    rows.value = [];
  }
}

onMounted(load);

const kpi = computed(() => {
  const arr = rows.value;
  const totalSpend = arr.reduce((s, r) => s + (r.spend || 0), 0);
  const totalSales = arr.reduce((s, r) => s + (r.sales || 0), 0);
  const totalOrders = arr.reduce((s, r) => s + (r.orders || 0), 0);
  const active = arr.filter((r) => r.state === '启用').length;
  return {
    totalSpend, totalSales, totalOrders, active,
    avgAcos: totalSales > 0 ? totalSpend / totalSales : 0,
    avgRoas: totalSpend > 0 ? totalSales / totalSpend : 0,
  };
});

const columns = [
  { prop: 'name', label: 'Campaign 名', minWidth: 220, fixed: 'left' },
  { prop: 'type', label: '类型', width: 80, type: 'tag',
    tagType: (r) => ({ SP: 'primary', SB: 'success', SD: 'warning' }[r.type] || 'info'),
    tagLabel: (r) => r.type },
  { prop: 'targetingType', label: '投放方式', width: 110 },
  { prop: 'state', label: '状态', width: 90, type: 'tag',
    tagType: (r) => r.state === '启用' ? 'success' : 'info',
    tagLabel: (r) => r.state },
  { prop: 'stage', label: '生命周期', width: 110, type: 'tag',
    tagType: (r) => ({ launch: 'info', growth: 'success', mature: 'warning', decline: 'danger' }[r.stage]),
    tagLabel: (r) => ({ launch: '🌱 Launch', growth: '🌳 Growth', mature: '🌲 Mature', decline: '🍂 Decline' }[r.stage]) },
  { prop: 'dailyBudget', label: '日预算', width: 100, type: 'money', align: 'right' },
  { prop: 'spend', label: '花费 (7d)', width: 110, type: 'money', align: 'right' },
  { prop: 'sales', label: '销售额 (7d)', width: 120, type: 'money', align: 'right' },
  { prop: 'orders', label: '订单', width: 80, type: 'int', align: 'right' },
  { prop: 'clicks', label: '点击', width: 90, type: 'int', align: 'right' },
  { prop: 'impressions', label: '曝光', width: 100, type: 'int', align: 'right' },
  { prop: 'acos', label: 'ACOS', width: 100, align: 'right',
    type: 'percent', signal: (r) => r.acos === null || r.acos === undefined ? 'bad' : r.acos > 0.5 ? 'bad' : r.acos < 0.3 ? 'good' : 'warn' },
  { prop: 'roas', label: 'ROAS', width: 90, align: 'right' },
  { prop: 'ctr', label: 'CTR', width: 90, type: 'percent', align: 'right' },
  { prop: 'cvr', label: 'CVR', width: 90, type: 'percent', align: 'right' },
];

const bulkActions = [
  {
    label: '批量启用',
    icon: 'VideoPlay',
    type: 'success',
    handler: async (s) => {
      for (const r of s) {
        try {
          await campaignsApi.toggle(r.id, true);
          r.state = '启用';
        } catch (e) { ElMessage.error(`启用失败：${r.name}`); }
      }
    },
  },
  {
    label: '批量暂停',
    icon: 'VideoPause',
    type: 'warning',
    confirm: true,
    handler: async (s) => {
      for (const r of s) {
        try {
          await submit({
            sourceModule: 'M3', actionType: 'PAUSE_CAMPAIGN',
            target: { type: 'campaign', id: r.id, sku: r.name },
            payload: {}, description: `暂停 Campaign：${r.name}`,
          });
          await campaignsApi.toggle(r.id, false);
          r.state = '已暂停';
        } catch (e) { ElMessage.error(`暂停失败：${r.name}`); }
      }
    },
  },
  {
    label: '批量改预算',
    icon: 'Money',
    type: 'primary',
    handler: () => ElMessage.info('PoC: 弹出批量改预算对话框'),
  },
  {
    label: '批量改 sovereignty',
    icon: 'Setting',
    type: 'default',
    handler: () => ElMessage.info('PoC: 弹出批量改主权对话框'),
  },
];
</script>

<template>
  <MobileFallback
    v-if="isMobile && !embedded"
    page-name="广告活动报表"
    reason="本页为 Campaign 维度宽表（多列对比 + 批量启停 / 改预算），建议在桌面端操作。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <p style="margin: 0">7/30 天对比 · 批量改预算 · 改主权 — 完整列需在桌面端查看。</p>
        <el-button type="primary" style="margin-top: 16px; width: 100%" @click="$router.push('/workbench')">返回工作台</el-button>
      </el-card>
    </template>
  </MobileFallback>
  <div v-else>
    <PageHeader
      v-if="!embedded"
      title="广告活动报表"
      subtitle="Campaign 维度 · 7 天 / 30 天 / 自定义对比 · 批量启停 / 改预算 / 改主权"
    >
      <template #extra>
        <el-button :icon="'View'">趋势图模式</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="12" class="kpi-row">
      <el-col :xs="12" :sm="8" :md="5"><KpiCard label="启用 Campaign" :value="kpi.active" :hint="`共 ${rows.length} 个`" icon="DataAnalysis" /></el-col>
      <el-col :xs="12" :sm="8" :md="5"><KpiCard label="7d 总花费" :value="formatCurrency(kpi.totalSpend, 'USD')" status="info" icon="Money" /></el-col>
      <el-col :xs="12" :sm="8" :md="5"><KpiCard label="7d 总销售" :value="formatCurrency(kpi.totalSales, 'USD')" status="success" icon="TrendCharts" /></el-col>
      <el-col :xs="12" :sm="12" :md="5"><KpiCard label="加权 ACOS" :value="formatPercent(kpi.avgAcos)" :status="kpi.avgAcos > 0.4 ? 'warning' : 'success'" icon="Discount" /></el-col>
      <el-col :xs="24" :sm="12" :md="4"><KpiCard label="加权 ROAS" :value="kpi.avgRoas.toFixed(2)" status="success" icon="Discount" /></el-col>
    </el-row>

    <DataTablePro
      title="广告活动报表"
      :data="rows"
      :columns="columns"
      :bulk-actions="bulkActions"
      :show-compare="true"
      :default-time-range="'7d'"
    />
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 12px; }
</style>
