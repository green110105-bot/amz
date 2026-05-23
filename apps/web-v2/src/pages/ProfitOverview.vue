<script setup>
import { computed, onMounted, watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useProfit } from '../composables/useM2State';
import { formatCurrency, formatPercent, formatNumber } from '../utils/format';

const { isMobile } = useViewport();
const mobileOrderCols = [
  { prop: 'orderId', label: '订单号' },
  { prop: 'sku', label: 'SKU' },
  { prop: 'netProfit', label: '净利润', formatter: (v) => formatCurrency(v) },
  { prop: 'profitMargin', label: '利润率', formatter: (v) => formatPercent(v) },
];

const route = useRoute();
const router = useRouter();
const profit = useProfit();

const range = ref(route.query.range || '30d');
const orders = ref([]);
const recomputing = ref(false);

async function load() {
  const ov = await profit.fetchOverview(range.value);
  // orders 单独走 /m2/orders（轻量分页），首屏先拉前 50 条
  const orderList = await profit.fetchOrders({ limit: 50 });
  orders.value = orderList || [];
  return ov;
}

watch(range, (v) => {
  router.replace({ query: { ...route.query, range: v } });
  load();
});

onMounted(load);

async function recompute() {
  recomputing.value = true;
  try {
    await profit.recompute(range.value);
    await load();
  } finally {
    recomputing.value = false;
  }
}

const data = computed(() => profit.overview.value);
const loading = computed(() => profit.overviewLoading.value);

const kpis = computed(() => {
  const ov = data.value?.overview;
  if (!ov) return [];
  return [
    { label: 'GMV', value: formatCurrency(ov.revenue), hint: `${formatNumber(ov.orders)} 订单`, icon: 'Money', status: 'default' },
    {
      label: '净利润',
      value: formatCurrency(ov.netProfit),
      trend: formatPercent(ov.profitMargin || 0),
      trendType: ov.netProfit > 0 ? 'up' : ov.netProfit < 0 ? 'down' : 'neutral',
      hint: '利润率',
      icon: 'TrendCharts',
      status: ov.netProfit < 0 ? 'danger' : 'success',
    },
    { label: '总成本', value: formatCurrency(ov.totalCosts), hint: '14 项费用', icon: 'Tickets', status: 'info' },
    { label: '平均置信度', value: formatPercent(ov.confidence || 0, 0), hint: '暂估 vs 终值', icon: 'CircleCheck', status: ov.confidence < 0.7 ? 'warning' : 'success' },
  ];
});

const accuracyTagType = (level) => {
  if (level === 'final') return 'success';
  if (level === 'high_estimate') return 'primary';
  if (level === 'estimate') return 'warning';
  return 'info';
};
const accuracyLabel = (level) =>
  ({ final: '🟢 终值', high_estimate: '🟡 高置信暂估', estimate: '🟠 暂估', unavailable: '🔴 不可用' }[level] || level);

function openOrder(row) {
  router.push({ path: '/profit/orders/sample', query: { orderId: row.orderId } });
}
</script>

<template>
  <div>
    <PageHeader title="利润总览" subtitle="按订单 / SKU 看真实利润，区分暂估与终值">
      <template #extra>
        <el-radio-group v-model="range" size="default">
          <el-radio-button value="7d">7 天</el-radio-button>
          <el-radio-button value="30d">30 天</el-radio-button>
          <el-radio-button value="90d">90 天</el-radio-button>
        </el-radio-group>
        <el-button :icon="'Refresh'" :loading="recomputing" @click="recompute">重新计算</el-button>
      </template>
    </PageHeader>

    <el-row v-loading="loading" :gutter="16" class="kpi-row">
      <el-col v-for="(kpi, i) in kpis" :key="i" :xs="24" :sm="12" :md="12" :lg="6">
        <KpiCard v-bind="kpi" />
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">订单利润明细</h2>
          <span class="text-muted">点击行查看费用瀑布</span>
        </div>
      </template>
      <ResponsiveTable :data="orders" :mobile-columns="mobileOrderCols" row-clickable v-loading="loading" stripe size="default" empty-text="暂无订单" @row-click="openOrder">
        <el-table-column prop="orderId" label="订单号" min-width="180">
          <template #default="{ row }">
            <span class="tnum">{{ row.orderId }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sku" label="SKU / Product" min-width="160" />
        <el-table-column label="收入" width="120" align="right">
          <template #default="{ row }">
            <span class="tnum">{{ formatCurrency(row.revenue) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="成本" width="120" align="right">
          <template #default="{ row }">
            <span class="tnum">{{ formatCurrency(row.totalCosts) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="净利润" width="120" align="right">
          <template #default="{ row }">
            <span class="tnum" :class="row.netProfit < 0 ? 'text-danger' : 'text-success'">{{ formatCurrency(row.netProfit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="利润率" width="100" align="right">
          <template #default="{ row }">
            <span class="tnum" :class="row.profitMargin < 0 ? 'text-danger' : 'text-success'">{{ formatPercent(row.profitMargin) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="精确性" width="160">
          <template #default="{ row }">
            <el-tag :type="accuracyTagType(row.accuracy?.level || row.accuracyLevel)" size="small" effect="light">
              {{ accuracyLabel(row.accuracy?.level || row.accuracyLevel) }}
            </el-tag>
            <span class="text-muted" style="margin-left: 6px; font-size: 12px">{{ Math.round((row.accuracy?.confidence || row.confidence || 0) * 100) }}%</span>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click.stop="openOrder(row)">查看</el-button>
        </template>
      </ResponsiveTable>
      <EmptyState v-if="!loading && orders.length === 0" title="无订单数据" description="可能后端未就绪" />
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 0; }
.kpi-row .el-col { margin-bottom: 16px; }
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
</style>
