<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockBudgetForecast } from '../utils/mock-data-ads';
import { formatCurrency } from '../utils/format';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'name', label: 'Campaign' },
  { prop: 'dailyBudget', label: '日预算', formatter: (v) => '$' + v },
  { prop: 'spentSoFar', label: '已花费', formatter: (v) => '$' + v },
  { prop: 'estDepleteAt', label: '耗尽时点' },
  { prop: 'recommendation', label: 'AI 建议' },
];
const { submit } = useAudit();

const data = ref({ ...mockBudgetForecast });

function actionType(c) {
  if (c.estDepleteAt === 'never') return 'info';
  const [h, m] = c.estDepleteAt.split(':').map(Number);
  if (h < 18) return 'danger';
  if (h < 22) return 'warning';
  return 'success';
}

async function adjust(c) {
  await submit({
    sourceModule: 'M3',
    actionType: 'INCREASE_BUDGET',
    target: { type: 'campaign', id: c.id },
    payload: { reason: c.recommendation },
    description: `${c.name} · ${c.recommendation}`,
  });
}
</script>

<template>
  <div>
    <PageHeader title="预算耗尽预测" subtitle="日内预算耗尽时点 + 月度预算消耗速度">
      <template #extra>
        <el-button :icon="'Refresh'">刷新</el-button>
      </template>
    </PageHeader>

    <div class="kpi-row">
      <KpiCard label="月预算" :value="formatCurrency(data.monthly.total, 'USD')" status="default" icon="Money" />
      <KpiCard label="已用" :value="formatCurrency(data.monthly.used, 'USD')" :hint="`${Math.round(data.monthly.used / data.monthly.total * 100)}% 已用`" status="info" icon="DataAnalysis" />
      <KpiCard label="剩余天数" :value="`${data.monthly.daysLeft} 天`" status="default" icon="Clock" />
      <KpiCard label="预测耗尽" :value="data.monthly.paceProjection" hint="按当前速度" status="warning" icon="WarningFilled" />
    </div>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">日内预算耗尽预测</h2>
          <span class="text-muted">每小时检查 · 当前 14:00</span>
        </div>
      </template>
      <ResponsiveTable :data="data.intraDayCampaigns" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="name" label="Campaign" min-width="220" />
        <el-table-column label="日预算" align="right" width="100"><template #default="{ row }"><span class="tnum">${{ row.dailyBudget }}</span></template></el-table-column>
        <el-table-column label="已花费" align="right" width="100">
          <template #default="{ row }">
            <span class="tnum">${{ row.spentSoFar }}</span>
            <el-progress :percentage="Math.round(row.spentSoFar / row.dailyBudget * 100)" :stroke-width="3" :show-text="false" style="margin-top: 2px" />
          </template>
        </el-table-column>
        <el-table-column label="预计耗尽时点" width="160">
          <template #default="{ row }">
            <el-tag :type="actionType(row)" size="small">{{ row.estDepleteAt }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="recommendation" label="AI 建议" min-width="280" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button v-if="row.estDepleteAt !== 'never' && row.estDepleteAt < '18:00'" size="small" type="primary" plain @click="adjust(row)">提升今日预算</el-button>
            <el-button v-else-if="row.estDepleteAt === 'never'" size="small" type="warning" plain @click="adjust(row)">考虑暂停</el-button>
            <el-button v-else size="small" link>详情</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click="adjust(row)">调整</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">月度预算预测</h2></template>
      <el-alert :title="data.monthly.paceProjection" type="warning" show-icon :closable="false">
        <template #default>
          <strong>建议：</strong>{{ data.monthly.recommendation }}
        </template>
      </el-alert>
      <el-progress :percentage="Math.round(data.monthly.used / data.monthly.total * 100)" :stroke-width="14" status="warning" style="margin-top: 16px" />
      <p class="text-muted" style="font-size: 13px; margin-top: 12px">
        当前消耗速度：${{ Math.round(data.monthly.used / (30 - data.monthly.daysLeft)) }}/天 · 健康速度应为：${{ Math.round(data.monthly.total / 30) }}/天
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 767px) { .kpi-row { grid-template-columns: 1fr; gap: 8px; } }
</style>
