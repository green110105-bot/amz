<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useFx } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();
const mobileExposureCols = [
  { prop: 'currency', label: '币种' },
  { prop: 'cnyEquivalent', label: 'CNY 等价', formatter: (v, r) => formatCurrency(v ?? r.cny_equivalent) },
  { prop: 'share', label: '占比', formatter: (v) => `${Math.round((v || 0) * 100)}%` },
];
const mobileSensitivityCols = [
  { prop: 'delta', label: 'USD/CNY 变化', formatter: (v) => `${v > 0 ? '+' : ''}${v}%` },
  { prop: 'profitImpactCny', label: '月利润影响', formatter: (v, r) => formatCurrency(v ?? r.profit_impact_cny) },
];

const route = useRoute();
const router = useRouter();
const fx = useFx();

const days = ref(Number(route.query.days) || 30);

async function load() {
  await fx.fetch(days.value);
}

watch(days, () => {
  router.replace({ query: { ...route.query, days: String(days.value) } });
  load();
});

onMounted(load);

const data = computed(() => fx.data.value || {});
const rateHistory = computed(() => data.value.rateHistory || []);
const sensitivity = computed(() => data.value.sensitivity || []);
const exposures = computed(() => data.value.exposures || []);
const recommendations = computed(() => data.value.recommendations || []);
const totalExposureCny = computed(() => data.value.totalExposureCny || 0);

const chart = computed(() => {
  const points = rateHistory.value;
  const w = 600, h = 120;
  if (!points.length) return { w, h, path: '', points: [] };
  const min = Math.min(...points.map((p) => p.usdCny || p.rate));
  const max = Math.max(...points.map((p) => p.usdCny || p.rate));
  const stepX = w / (points.length - 1 || 1);
  const path = points.map((p, i) => {
    const x = i * stepX;
    const y = h - 20 - (((p.usdCny || p.rate) - min) / (max - min || 1)) * (h - 40);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  return { w, h, path, points, min, max };
});
</script>

<template>
  <div>
    <PageHeader title="汇率管理与风险" subtitle="多币种敞口 · 敏感度分析 · 远期跟踪">
      <template #extra>
        <el-radio-group v-model="days" size="small">
          <el-radio-button :value="7">7d</el-radio-button>
          <el-radio-button :value="30">30d</el-radio-button>
          <el-radio-button :value="90">90d</el-radio-button>
        </el-radio-group>
      </template>
    </PageHeader>

    <el-row v-loading="fx.loading.value" :gutter="16" class="kpi-row">
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="总敞口 (CNY)" :value="formatCurrency(totalExposureCny)" status="default" icon="Money" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="USD 占比" :value="formatPercent(exposures.find(e => e.currency === 'USD')?.share || 0)" hint="主要敞口" status="warning" icon="DataAnalysis" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard v-if="rateHistory.length" label="当前 USD/CNY" :value="Number(rateHistory[rateHistory.length - 1].usdCny || rateHistory[rateHistory.length - 1].rate || 0).toFixed(2)" :hint="`vs 起始 ${Number(rateHistory[0].usdCny || rateHistory[0].rate || 0).toFixed(2)}`" status="info" icon="TrendCharts" /><KpiCard v-else label="当前 USD/CNY" value="-" status="info" icon="TrendCharts" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="ACCS 警告" value="启用中" hint="隐性 3-4% 损失" status="danger" icon="WarningFilled" /></el-col>
    </el-row>

    <el-row :gutter="16" class="mt-16">
      <el-col :xs="24" :sm="24" :md="12" :lg="12">
        <el-card shadow="never" style="margin-bottom: 16px">
          <template #header><h2 class="section-title">币种敞口</h2></template>
          <ResponsiveTable :data="exposures" :mobile-columns="mobileExposureCols" size="default" empty-text="无敞口数据">
            <el-table-column prop="currency" label="币种" width="80" />
            <el-table-column label="原币金额" align="right" width="120">
              <template #default="{ row }"><span class="tnum">{{ (row.amountSource || row.amount_source || 0).toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column label="CNY 等价" align="right" width="120">
              <template #default="{ row }"><span class="tnum">{{ formatCurrency(row.cnyEquivalent || row.cny_equivalent) }}</span></template>
            </el-table-column>
            <el-table-column label="占比">
              <template #default="{ row }">
                <el-progress :percentage="Math.round((row.share || 0) * 100)" :stroke-width="6" />
              </template>
            </el-table-column>
          </ResponsiveTable>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="12" :lg="12">
        <el-card shadow="never">
          <template #header><h2 class="section-title">敏感度分析（汇率波动 → 利润影响）</h2></template>
          <ResponsiveTable :data="sensitivity" :mobile-columns="mobileSensitivityCols" size="default" empty-text="无敏感度数据">
            <el-table-column label="USD/CNY 变化" align="center">
              <template #default="{ row }">
                <strong :class="row.delta > 0 ? 'text-success' : 'text-danger'">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}%</strong>
              </template>
            </el-table-column>
            <el-table-column label="月利润影响" align="right">
              <template #default="{ row }">
                <span class="tnum" :class="(row.profitImpactCny || row.profit_impact_cny) > 0 ? 'text-success' : 'text-danger'">{{ formatCurrency(row.profitImpactCny || row.profit_impact_cny) }}</span>
              </template>
            </el-table-column>
          </ResponsiveTable>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">USD/CNY {{ days }} 天走势</h2></template>
      <EmptyState v-if="!rateHistory.length" title="无汇率数据" description="后端尚未返回汇率历史" />
      <svg v-else :viewBox="`0 0 ${chart.w} ${chart.h}`" class="rate-chart">
        <path :d="chart.path" stroke="#2563eb" stroke-width="2" fill="none" />
        <circle v-for="(p, i) in chart.points" :key="i" :cx="i * (chart.w / (chart.points.length - 1 || 1))" :cy="chart.h - 20 - (((p.usdCny || p.rate) - chart.min) / (chart.max - chart.min || 1)) * (chart.h - 40)" r="3" fill="#2563eb" />
        <text v-for="(p, i) in chart.points.filter((_, idx) => idx % Math.ceil(chart.points.length / 8) === 0)" :key="`t-${i}`" :x="chart.points.indexOf(p) * (chart.w / (chart.points.length - 1 || 1))" :y="chart.h - 4" font-size="10" fill="#6b7280" text-anchor="middle">{{ (p.date || p.rate_date || '').slice(-5) }}</text>
      </svg>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">AI 建议</h2></template>
      <ul v-if="recommendations.length" class="recommend">
        <li v-for="(r, i) in recommendations" :key="i">{{ r }}</li>
      </ul>
      <p v-else class="text-muted">暂无 AI 建议</p>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row .el-col { margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.rate-chart { width: 100%; height: 120px; }
.recommend { font-size: 13px; line-height: 1.8; padding-left: 18px; }
</style>
