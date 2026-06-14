<script setup>
import { computed, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useLTV } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'sku', label: 'SKU' },
  { prop: 'repeatRate', label: '复购率', formatter: (v, r) => formatPercent(v ?? r.repeat_rate) },
  { prop: 'ltv', label: 'LTV', formatter: (v) => formatCurrency(v, 'USD') },
  { prop: 'status', label: '评估', formatter: (v) => v === 'high_ltv' ? '高 LTV / 可激进' : '低 LTV / 严控' },
];

const ltv = useLTV();

// M2-P2-05: LTV 为累计指标，不接 range（移除无效 range 切换控件）
async function load() {
  await ltv.fetch();
}

onMounted(load);

const list = computed(() => ltv.list.value || []);
</script>

<template>
  <div>
    <PageHeader title="LTV 与复购视角" subtitle="客户生命周期价值估算（累计指标，不随周期变化）· 决定广告 CAC 容忍度" />

    <el-alert type="info" show-icon :closable="false">
      <template #title>LTV 来源说明</template>
      <template #default>
        亚马逊不直接提供买家信息。LTV 估算基于 Subscribe & Save 数据 + Brand Analytics 复购信号 + 行业类目均值。仅供决策参考。
      </template>
    </el-alert>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">SKU LTV 估算</h2></template>
      <ResponsiveTable :data="list" :mobile-columns="mobileCols" v-loading="ltv.loading.value" stripe empty-text="无 LTV 数据">
        <el-table-column prop="sku" label="SKU" width="120" />
        <el-table-column label="首单数" align="right" width="140"><template #default="{ row }"><span class="tnum">{{ (row.firstOrderCount || row.first_order_count || 0).toLocaleString() }}</span></template></el-table-column>
        <el-table-column label="复购率" align="right" width="100">
          <template #default="{ row }"><span class="tnum" :class="(row.repeatRate || row.repeat_rate) >= 0.20 ? 'text-success' : 'text-warning'">{{ formatPercent(row.repeatRate || row.repeat_rate) }}</span></template>
        </el-table-column>
        <el-table-column label="平均复购次数" align="right" width="140"><template #default="{ row }"><span class="tnum">{{ Number(row.avgRepeats || row.avg_repeats || 0).toFixed(1) }}</span></template></el-table-column>
        <el-table-column label="客单价" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.avgOrderValue || row.avg_order_value, 'USD') }}</span></template></el-table-column>
        <el-table-column label="LTV" align="right" width="120">
          <template #default="{ row }"><strong class="tnum">{{ formatCurrency(row.ltv, 'USD') }}</strong></template>
        </el-table-column>
        <el-table-column label="保本 ACOS" align="right" width="120">
          <template #default="{ row }"><span class="tnum">{{ formatPercent((row.cacBreakeven || row.cac_breakeven || 0) / (row.avgOrderValue || row.avg_order_value || 1)) }}</span></template>
        </el-table-column>
        <el-table-column label="当前 ACOS" align="right" width="120">
          <template #default="{ row }">
            <span class="tnum" :class="(row.ad30dAcos || row.ad_30d_acos) > (row.cacBreakeven || row.cac_breakeven) / (row.avgOrderValue || row.avg_order_value || 1) ? 'text-warning' : 'text-success'">{{ formatPercent(row.ad30dAcos || row.ad_30d_acos) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="评估" width="140">
          <template #default="{ row }">
            <el-tag :type="row.status === 'high_ltv' ? 'success' : 'info'" size="small">{{ row.status === 'high_ltv' ? '高 LTV / 可激进' : '低 LTV / 严控' }}</el-tag>
          </template>
        </el-table-column>
      </ResponsiveTable>
      <EmptyState v-if="!ltv.loading.value && !list.length" title="暂无 LTV 数据" description="后端尚未生成 LTV 快照" />
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">如何用 LTV</h2></template>
      <ul class="explain">
        <li><strong>高 LTV 类目</strong>（耗材、订阅、消耗品）：可容忍更高 CAC（首单亏也 OK，复购赚回来）</li>
        <li><strong>低 LTV 类目</strong>（一次性购买）：必须保住单笔利润，ACOS 严控</li>
        <li>本页 LTV 仅作决策参考，亚马逊不直接给买家级数据</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.explain { font-size: 13px; line-height: 1.8; padding-left: 18px; color: var(--text-muted); }
.explain strong { color: var(--text); }
</style>
