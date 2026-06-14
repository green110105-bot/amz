<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useRepricing } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();
const mobileScenarioCols = [
  { prop: 'price', label: '售价', formatter: (v) => `$${v}` },
  { prop: 'label', label: '方案' },
  { prop: 'margin', label: '毛利率', formatter: (v) => formatPercent(v) },
  { prop: 'expectedTotalProfit30d', label: '30日总利润', formatter: (v) => `$${v}` },
];

const route = useRoute();
const router = useRouter();
const repricing = useRepricing();

const currentId = ref(route.query.id || '');
const statusFilter = ref(route.query.status || 'all');

async function load() {
  const params = {};
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  await repricing.fetch(params);
  if (!currentId.value && repricing.list.value.length) {
    currentId.value = repricing.list.value[0].id;
  }
}

watch(currentId, (v) => {
  router.replace({ query: { ...route.query, id: v || undefined } });
});
watch(statusFilter, () => {
  router.replace({ query: { ...route.query, status: statusFilter.value === 'all' ? undefined : statusFilter.value } });
  load();
});

onMounted(load);

const current = computed(() => repricing.list.value.find((x) => x.id === currentId.value) || repricing.list.value[0] || null);

const chart = computed(() => {
  if (!current.value) return { w: 800, h: 200, points: [] };
  const w = 800;
  const h = 200;
  const sc = current.value.scenarios || [];
  if (!sc.length) return { w, h, points: [] };
  const minP = Math.min(...sc.map((s) => s.expectedTotalProfit30d));
  const maxP = Math.max(...sc.map((s) => s.expectedTotalProfit30d));
  const minPrice = Math.min(...sc.map((s) => s.price));
  const maxPrice = Math.max(...sc.map((s) => s.price));
  const points = sc.map((s) => {
    const x = ((s.price - minPrice) / (maxPrice - minPrice || 1)) * (w - 40) + 20;
    const y = h - 30 - ((s.expectedTotalProfit30d - minP) / (maxP - minP || 1)) * (h - 60);
    return { x, y, ...s };
  });
  return { w, h, points };
});

async function apply(s) {
  if (!current.value) return;
  const breakEven = Number(current.value.breakEvenPrice || current.value.break_even_price || 0);
  const belowBe = breakEven > 0 && Number(s.price) < breakEven;
  try {
    await ElMessageBox.confirm(
      `将建议售价改为 $${s.price}（${s.label || ''}）？此操作仅生成 M1 调价草稿，需到 M1 上架才真实改价。`,
      '采纳跟价建议', { type: belowBe ? 'warning' : 'info' });
  } catch { return; }
  try {
    await repricing.apply(current.value.id, s.price);
    await load();
  } catch (e) {
    // M2-P0-04: 后端拒绝低于保本价 → 二次危险确认后带 confirmBelowBreakeven 重试
    if (e?.validation) {
      try {
        await ElMessageBox.confirm(
          `$${s.price} 低于保本价 $${e.validation.breakEvenPrice ?? breakEven}，将亏本销售。仍生成草稿？（需到 M1 上架才真实改价）`,
          '亏本调价确认', { type: 'warning', confirmButtonText: '仍然生成草稿', cancelButtonText: '取消' });
      } catch { return; }
      try { await repricing.apply(current.value.id, s.price, true); await load(); } catch {}
    }
  }
}

async function reject() {
  if (!current.value) return;
  try {
    const { value } = await ElMessageBox.prompt('拒绝原因（可选）', '拒绝跟价建议', {
      confirmButtonText: '确认拒绝', cancelButtonText: '取消', inputPlaceholder: '如：竞品已回价',
    });
    await repricing.reject(current.value.id, value || '');
    await load();
  } catch {}
}
</script>

<template>
  <div>
    <PageHeader :title="current ? `跟价决策 · ${current.sku}` : '跟价决策'" subtitle="价格-利润曲线 · 30 日总利润预测 · 销量弹性测算">
      <template #extra>
        <el-select v-model="currentId" filterable size="default" style="width: 220px" placeholder="选择 SKU">
          <el-option v-for="r in repricing.list.value" :key="r.id" :label="`${r.sku} → $${r.recommendedPrice || r.recommended_price || ''}`" :value="r.id" />
        </el-select>
        <el-radio-group v-model="statusFilter" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="pending">待处理</el-radio-button>
          <el-radio-button value="applied">已应用</el-radio-button>
          <el-radio-button value="rejected">已拒绝</el-radio-button>
        </el-radio-group>
      </template>
    </PageHeader>

    <EmptyState v-if="!current && !repricing.loading.value"
      :title="statusFilter !== 'all' ? '当前筛选无结果' : '暂无重定价建议'"
      :description="statusFilter !== 'all' ? '切换筛选条件或清除筛选查看全部建议' : '后端暂未生成跟价建议'" />

    <template v-if="current">
      <el-row :gutter="16" class="kpi-row">
        <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="我方现价" :value="formatCurrency(current.ourPrice || current.our_price, 'USD')" status="default" icon="PriceTag" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="竞品价" :value="formatCurrency(current.competitorPrice || current.competitor_price, 'USD')" :hint="`从 ${formatCurrency(current.competitorOldPrice || current.competitor_old_price || 0, 'USD')} 降下`" status="warning" icon="ArrowDown" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="保本价" :value="formatCurrency(current.breakEvenPrice || current.break_even_price, 'USD')" hint="低于此即亏本" status="danger" icon="Bottom" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="价格弹性" :value="Number(current.priceElasticity || current.price_elasticity || 0).toFixed(2)" hint="价格 -1% 销量 +X%" status="info" icon="DataAnalysis" /></el-col>
      </el-row>

      <el-card shadow="never" class="mt-16">
        <template #header><h2 class="section-title">价格-利润曲线（30 日预测）</h2></template>
        <svg :viewBox="`0 0 ${chart.w} ${chart.h}`" preserveAspectRatio="none" class="curve-svg">
          <line v-for="(p, i) in chart.points.slice(0, -1)" :key="i" :x1="p.x" :y1="p.y" :x2="chart.points[i + 1].x" :y2="chart.points[i + 1].y" stroke="#2563eb" stroke-width="2" />
          <circle v-for="p in chart.points" :key="p.price" :cx="p.x" :cy="p.y" :r="p.recommended ? 8 : 5" :fill="p.recommended ? '#059669' : '#2563eb'" stroke="#fff" stroke-width="2" />
          <text v-for="p in chart.points" :key="`t-${p.price}`" :x="p.x" :y="chart.h - 8" font-size="11" fill="#6b7280" text-anchor="middle">${{ p.price }}</text>
          <text v-for="p in chart.points" :key="`t2-${p.price}`" :x="p.x" :y="p.y - 12" font-size="11" :fill="p.recommended ? '#059669' : '#1f2937'" text-anchor="middle" :font-weight="p.recommended ? 700 : 400">${{ p.expectedTotalProfit30d }}</text>
        </svg>
      </el-card>

      <el-card shadow="never" class="mt-16">
        <template #header><h2 class="section-title">情景对比</h2></template>
        <ResponsiveTable :data="current.scenarios || []" :mobile-columns="mobileScenarioCols" stripe>
          <el-table-column label="售价" align="right" width="100"><template #default="{ row }"><span class="tnum" style="font-weight: 600">${{ row.price }}</span></template></el-table-column>
          <el-table-column prop="label" label="方案" />
          <el-table-column label="单件毛利" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ row.unitProfit > 0 ? `$${row.unitProfit}` : `-$${Math.abs(row.unitProfit)}` }}</span></template></el-table-column>
          <el-table-column label="毛利率" align="right" width="100"><template #default="{ row }"><span class="tnum" :class="row.margin < 0.10 ? 'text-warning' : 'text-success'">{{ formatPercent(row.margin) }}</span></template></el-table-column>
          <el-table-column label="预期销量(30d)" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ row.expectedVolume30d }}</span></template></el-table-column>
          <el-table-column label="30 日总利润" align="right" width="120">
            <template #default="{ row }">
              <strong class="tnum" :class="row.recommended ? 'text-success' : ''">${{ row.expectedTotalProfit30d }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button v-if="row.recommended" type="primary" size="small" :disabled="current.status === 'applied' || current.status === 'rejected'" @click="apply(row)">采用 ⭐</el-button>
              <el-button v-else size="small" plain :disabled="current.status === 'applied' || current.status === 'rejected'" @click="apply(row)">采用</el-button>
            </template>
          </el-table-column>
          <template #mobile-actions="{ row }">
            <el-button :type="row.recommended ? 'primary' : 'default'" size="small" :disabled="current.status === 'applied' || current.status === 'rejected'" @click.stop="apply(row)">
              {{ row.recommended ? '采用 ⭐' : '采用' }}
            </el-button>
          </template>
        </ResponsiveTable>
        <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center">
          <el-button size="small" plain type="danger" :disabled="current.status === 'applied' || current.status === 'rejected'" @click="reject">拒绝此建议</el-button>
          <span v-if="current.status === 'rejected'" class="text-muted">该建议已拒绝</span>
        </div>
        <p v-if="current.status === 'applied'" class="text-muted" style="margin-top: 8px">
          已生成 M1 调价草稿 → version
          <span class="tnum">{{ current.m1VersionId || current.m1_listing_version_id }}</span>
          （需到 M1 上架才真实生效）
        </p>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.kpi-row .el-col { margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.curve-svg { width: 100%; height: 200px; }
</style>
