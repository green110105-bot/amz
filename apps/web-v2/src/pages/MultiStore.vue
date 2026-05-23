<script setup>
import { ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockMultiStore } from '../utils/mock-data-extras';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();

const data = ref({ ...mockMultiStore });

function regionEmoji(r) {
  return { US: '🇺🇸', UK: '🇬🇧', DE: '🇩🇪', CA: '🇨🇦', JP: '🇯🇵', FR: '🇫🇷' }[r] || '🌐';
}
const mobileStoreCols = [
  { prop: 'name', label: '店铺', formatter: (v, r) => `${regionEmoji(r.region)} ${v}` },
  { prop: 'gmv', label: 'GMV', formatter: (v) => formatCurrency(v) },
  { prop: 'profit', label: '净利润', formatter: (v) => formatCurrency(v) },
  { prop: 'profitRate', label: '利润率', formatter: (v) => formatPercent(v) },
];
</script>

<template>
  <div>
    <PageHeader title="多店铺合并视图" subtitle="所有店铺统一 KPI · 多币种自动换算到 CNY" />

    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="合并 GMV" :value="formatCurrency(data.storesAggregate.gmv)" status="default" icon="DataAnalysis" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="合并净利润" :value="formatCurrency(data.storesAggregate.profit)" :hint="formatPercent(data.storesAggregate.profitRate)" status="success" icon="Money" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="合并订单" :value="data.storesAggregate.orders.toLocaleString()" hint="所有店铺" status="info" icon="ShoppingBag" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="店铺数" :value="data.stores.length" hint="多国家站" status="default" icon="OfficeBuilding" /></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">各店铺贡献</h2></template>
      <ResponsiveTable :data="data.stores" :mobile-columns="mobileStoreCols" stripe>
        <el-table-column label="店铺" min-width="200">
          <template #default="{ row }">
            <span style="font-size: 16px">{{ regionEmoji(row.region) }}</span>
            <strong style="margin-left: 8px">{{ row.name }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="GMV (CNY)" align="right" width="140"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.gmv) }}</span></template></el-table-column>
        <el-table-column label="净利润 (CNY)" align="right" width="140"><template #default="{ row }"><span class="tnum text-success">{{ formatCurrency(row.profit) }}</span></template></el-table-column>
        <el-table-column label="利润率" align="right" width="100">
          <template #default="{ row }"><span class="tnum" :class="row.profitRate >= 0.15 ? 'text-success' : row.profitRate >= 0.10 ? '' : 'text-warning'">{{ formatPercent(row.profitRate) }}</span></template>
        </el-table-column>
        <el-table-column label="订单数" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ row.orders.toLocaleString() }}</span></template></el-table-column>
        <el-table-column label="占比" width="160">
          <template #default="{ row }">
            <el-progress :percentage="Math.round(row.gmv / data.storesAggregate.gmv * 100)" :stroke-width="6" :show-text="true" />
          </template>
        </el-table-column>
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">AI 洞察</h2></template>
      <ul class="insights">
        <li v-for="(item, i) in data.insights" :key="i">{{ item }}</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row .el-col { margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.insights { font-size: 13px; line-height: 1.8; padding-left: 18px; color: var(--text); }
</style>
