<script setup>
// 旧版 M3 深度页 (架构树) · 已被 lx Portfolio/Campaign 详情体系取代
// 保留 stub 以避免路由 404；引导用户去新版页面
//
// 历史依赖：mockAdTree（在 utils/mock-data-ads.js）+ mock-data-ads-timeline
// 重构状态：已移除 mock 依赖，建议直接走 /ads/lx/portfolios

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { campaignReportApi } from '../api/ads-reports';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();

const router = useRouter();

const rows = ref([]);

onMounted(async () => {
  try {
    const items = await campaignReportApi.list();
    rows.value = Array.isArray(items) ? items : [];
  } catch {
    rows.value = [];
  }
});

const kpis = computed(() => {
  const totalSpend = rows.value.reduce((s, c) => s + (c.spend || 0), 0);
  const totalSales = rows.value.reduce((s, c) => s + (c.sales || 0), 0);
  const acos = totalSales > 0 ? totalSpend / totalSales : 0;
  return { totalSpend, totalSales, acos, count: rows.value.length };
});
</script>

<template>
  <div>
    <PageHeader title="广告 Campaign · 架构树（旧版）" subtitle="该深度页已被广告组合 (领星等价) 体系取代 · 入口已迁移到 /ads/lx">
      <template #extra>
        <el-button type="primary" :icon="'Right'" @click="router.push('/ads/lx/portfolios')">去新版 lx 广告组合</el-button>
      </template>
    </PageHeader>

    <div class="kpi-row">
      <KpiCard label="活跃 Campaign" :value="kpis.count" hint="过去 7 天" status="default" icon="DataAnalysis" />
      <KpiCard label="7d 花费" :value="formatCurrency(kpis.totalSpend, 'USD')" status="info" icon="Money" />
      <KpiCard label="7d 销售" :value="formatCurrency(kpis.totalSales, 'USD')" status="success" icon="TrendCharts" />
      <KpiCard label="加权 ACOS" :value="formatPercent(kpis.acos)" :status="kpis.acos > 0.3 ? 'warning' : 'success'" icon="Discount" />
    </div>

    <MobileFallback v-if="isMobile" page-name="架构树（旧版）" reason="该深度页推荐桌面使用。请在移动端前往 广告组合 (lx) 体系。" />

    <el-empty v-else description="架构树体验已迁移">
      <template #default>
        <p style="margin-bottom: 12px; color: #6b7280; font-size: 13px;">请使用：</p>
        <el-button type="primary" @click="router.push('/ads/lx/portfolios')">广告组合（lx1）→ Campaign 详情 → 11 子 tab</el-button>
        <p style="margin-top: 16px; color: #9ca3af; font-size: 12px;">完整 22 列指标 + 关键词抢位 + 否定 / 投放 / 广告位 / SQP 全功能</p>
      </template>
    </el-empty>
  </div>
</template>

<style scoped>
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 767px) { .kpi-row { grid-template-columns: 1fr; gap: 8px; } }
</style>
