<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockPlacements } from '../utils/mock-data-ads';
import { formatCurrency, formatPercent } from '../utils/format';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'campaign', label: 'Campaign' },
  { prop: 'topOfSearchSales', label: '搜索首页销售', formatter: (v) => formatCurrency(v, 'USD') },
  { prop: 'productPagesSales', label: '详情页销售', formatter: (v) => formatCurrency(v, 'USD') },
  { prop: 'recommendation', label: 'AI 推荐' },
];
const { submit } = useAudit();

const data = ref([...mockPlacements]);

async function applyRec(c) {
  await submit({
    sourceModule: 'M3',
    actionType: 'ADJUST_PLACEMENTS',
    target: { type: 'campaign', id: c.campaign },
    payload: { recommendation: c.recommendation },
    description: `${c.campaign} 位置加成：${c.recommendation}`,
  });
}
</script>

<template>
  <div>
    <PageHeader title="位置加成（Placements）" subtitle="搜索结果首页 / 详情页 / 其他位置 分别加成 bid">
      <template #extra><el-button :icon="'Refresh'">刷新</el-button></template>
    </PageHeader>

    <el-card shadow="never">
      <ResponsiveTable :data="data" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="campaign" label="Campaign" min-width="180" />
        <el-table-column label="搜索首页" align="center">
          <template #default="{ row }">
            <div>
              <strong class="tnum">{{ formatCurrency(row.topOfSearchSales, 'USD') }}</strong>
              <small class="text-muted block">花 ${{ row.topOfSearchSpend }} · ACOS {{ formatPercent(row.topOfSearchAcos) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="详情页" align="center">
          <template #default="{ row }">
            <div>
              <strong class="tnum">{{ formatCurrency(row.productPagesSales, 'USD') }}</strong>
              <small class="text-muted block">花 ${{ row.productPagesSpend }} · ACOS <span :class="row.productPagesAcos > 0.4 ? 'text-warning' : ''">{{ formatPercent(row.productPagesAcos) }}</span></small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="其它位置" align="center">
          <template #default="{ row }">
            <div>
              <strong class="tnum">{{ formatCurrency(row.restSales, 'USD') }}</strong>
              <small class="text-muted block">花 ${{ row.restSpend }} · ACOS <span :class="row.restAcos > 0.5 ? 'text-danger' : ''">{{ formatPercent(row.restAcos) }}</span></small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="AI 推荐调整" min-width="240">
          <template #default="{ row }">
            <span class="text-warning">{{ row.recommendation }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="applyRec(row)">应用推荐</el-button></template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click="applyRec(row)">应用推荐</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">为什么要分位置加成</h2></template>
      <p class="explain">
        亚马逊 PPC 同一个出价在不同位置（搜索首页 / 详情页 / 其它）的转化效果差异很大。<strong>搜索首页 CVR 通常是详情页 2-3 倍</strong>。
        通过位置加成，同一个 base bid 可以在高 CVR 位置加成 +30%、低 CVR 位置降权 -50%，提高整体 ROAS。
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.block { display: block; margin-top: 4px; }
.explain { font-size: 13px; color: var(--text-muted); line-height: 1.7; margin: 0; }
.explain strong { color: var(--text); }
</style>
