<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockBudgetAllocation } from '../utils/mock-data-ads';
import { formatCurrency } from '../utils/format';
import { actionQueueApi } from '../api/ads-timeline';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'name', label: 'Campaign' },
  { prop: 'currentBudget', label: '当前', formatter: (v) => '$' + v + '/天' },
  { prop: 'recommendedBudget', label: '推荐', formatter: (v) => '$' + v + '/天' },
  { prop: 'marginalRoi', label: '边际 ROI', formatter: (v) => v.toFixed(1) + 'x' },
];

const data = ref({ ...mockBudgetAllocation });
const applying = ref(false);

const totalRecommended = computed(() => data.value.campaigns.reduce((s, c) => s + c.recommendedBudget, 0));
const totalCurrent = computed(() => data.value.campaigns.reduce((s, c) => s + c.currentBudget, 0));

function changePct(c) {
  return (c.recommendedBudget - c.currentBudget) / c.currentBudget;
}

// M3-P0-05/M3-P0-08: budget mutations must NOT use the audit-submit bypass (that skips
// ActionQueue/guardrail/dry_run). They go through actionQueueApi.enqueue, which lands
// a needs_review + dryRun=1 row in ad_action_queue. The LOCAL value is updated ONLY
// after the enqueue succeeds (ok). A failed enqueue must NOT change the local table.
async function enqueueBudget(c) {
  return actionQueueApi.enqueue({
    sourceStrategyName: 'Budget Allocator (manual)',
    entity: { kind: 'campaign', id: c.id, name: c.name },
    typedAction: {
      actionPrimitive: 'SET_CAMPAIGN_BUDGET',
      sourceSurface: 'budget_allocator',
      entityKind: 'campaign',
      resourceId: c.id,
      currentValue: { dailyBudget: c.currentBudget },
      recommendedValue: { dailyBudget: c.recommendedBudget },
      dryRun: true,
      auditRequired: true,
    },
    guardrail: { status: 'needs_review', reasons: ['manual_budget_write_requires_action_queue'] },
    rollbackPlan: { method: 'manual_revert_required', needsManualReview: true },
    expectedImpact: { metric: 'monthly_profit', change: c.deltaProfit },
    note: `${c.name} → $${c.recommendedBudget}/天`,
  });
}

async function applyAll() {
  if (applying.value) return;
  applying.value = true;
  let queued = 0;
  try {
    for (const c of data.value.campaigns) {
      if (c.currentBudget === c.recommendedBudget) continue;
      try {
        const item = await enqueueBudget(c);
        // gate on TRUE enqueue: a duplicate (queued:false) is not a fresh write — don't
        // optimistically mutate local budget or count it as queued.
        if (item && item.queued !== false) { c.currentBudget = c.recommendedBudget; queued += 1; }
      } catch { /* gate on success: leave local value unchanged on failure */ }
    }
    if (queued > 0) ElMessage.success(`已加入执行篮 ${queued} 条（待审核 + dry-run，未触达 Amazon）`);
    else ElMessage.warning('未加入任何条目（无变更或入队失败）');
  } finally {
    applying.value = false;
  }
}
async function applyOne(c) {
  if (applying.value) return;
  applying.value = true;
  try {
    const item = await enqueueBudget(c);
    if (!item) { ElMessage.warning('入队失败，本地预算未变更'); return; }
    // A duplicate (queued:false) is already surfaced as info by the api layer; do not
    // mutate local budget or claim a fresh enqueue.
    if (item.queued === false) return;
    c.currentBudget = c.recommendedBudget; // gate on success
    ElMessage.success('已加入执行篮 1 条（待审核 + dry-run，未触达 Amazon）');
  } catch (e) {
    ElMessage.error(`入队失败：${e?.message || e}（本地预算未变更）`);
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader title="预算分配优化器" subtitle="基于边际收益曲线，在多 Campaign 间智能分配月预算">
      <template #extra>
        <el-button type="primary" :icon="'CircleCheck'" @click="applyAll">应用全部推荐</el-button>
      </template>
    </PageHeader>

    <div class="kpi-row">
      <KpiCard label="月总预算" :value="formatCurrency(data.monthBudget, 'USD')" status="default" icon="Wallet" />
      <KpiCard label="已用" :value="formatCurrency(data.used, 'USD')" :hint="`${Math.round(data.used / data.monthBudget * 100)}% 已用`" status="info" icon="Money" />
      <KpiCard label="剩余天数" :value="`${data.daysLeft} 天`" status="default" icon="Clock" />
      <KpiCard label="预期月利润提升" :value="`+${formatCurrency(data.expectedMonthlyProfit, 'USD')}`" hint="vs 当前分配" status="success" icon="TrendCharts" />
    </div>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">推荐分配（按边际收益排序）</h2>
          <span class="text-muted">从低 ROI 调到高 ROI · 总额：{{ formatCurrency(totalCurrent, 'USD') }}/天 → {{ formatCurrency(totalRecommended, 'USD') }}/天</span>
        </div>
      </template>
      <ResponsiveTable :data="data.campaigns" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="name" label="Campaign" min-width="220" />
        <el-table-column label="当前预算" align="right" width="120"><template #default="{ row }"><span class="tnum">${{ row.currentBudget }}/天</span></template></el-table-column>
        <el-table-column label="推荐预算" align="right" width="120">
          <template #default="{ row }">
            <span class="tnum" style="font-weight: 700">${{ row.recommendedBudget }}/天</span>
          </template>
        </el-table-column>
        <el-table-column label="变化" align="right" width="100">
          <template #default="{ row }">
            <span class="tnum" :class="changePct(row) > 0 ? 'text-success' : changePct(row) < 0 ? 'text-danger' : 'text-muted'">
              {{ changePct(row) > 0 ? '+' : '' }}{{ Math.round(changePct(row) * 100) }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column label="边际 ROI" align="right" width="100">
          <template #default="{ row }">
            <span class="tnum" :class="row.marginalRoi > 1 ? 'text-success' : 'text-danger'">{{ row.marginalRoi.toFixed(1) }}x</span>
          </template>
        </el-table-column>
        <el-table-column label="预期月利润" align="right" width="140">
          <template #default="{ row }">
            <span class="tnum" :class="row.deltaProfit > 0 ? 'text-success' : 'text-danger'">
              {{ row.deltaProfit > 0 ? '+' : '' }}{{ formatCurrency(row.deltaProfit, 'USD') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="applyOne(row)">应用</el-button></template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click="applyOne(row)">应用</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">优化算法说明</h2></template>
      <p class="text-muted" style="font-size: 13px">
        <strong style="color: var(--text)">目标：</strong>max(Σ profit_per_campaign) · 约束：Σ budget ≤ 月预算 · 单 Campaign budget_min ≤ b ≤ budget_max
      </p>
      <p class="text-muted" style="font-size: 13px">
        <strong style="color: var(--text)">方法：</strong>基于历史数据拟合每 Campaign 的"边际收益曲线"（每多 ¥1 预算能产生多少利润），凸优化求边际收益相等的最优解。
      </p>
      <p class="text-muted" style="font-size: 13px">
        <strong style="color: var(--text)">原则：</strong>从低 ROI Campaign 调到高 ROI Campaign，直到所有 Campaign 边际收益相等。
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
