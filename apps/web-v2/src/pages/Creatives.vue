<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import { useViewport } from '../composables/useViewport';
import { mockCreatives } from '../utils/mock-data-ads';
import { formatPercent } from '../utils/format';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();
const { submit } = useAudit();

const data = ref([...mockCreatives]);

async function adoptWinner(t) {
  const lift = (t.treatment.cvr - t.control.cvr) / t.control.cvr;
  await submit({
    sourceModule: 'M3',
    actionType: 'ADOPT_CREATIVE_WINNER',
    target: { type: 'campaign', id: t.campaignId },
    payload: { winnerHeadline: t.treatment.headline, lift },
    expectedImpact: { metric: 'cvr_lift', change: `+${(lift * 100).toFixed(1)}%`, horizonDays: 30 },
    description: `采用 Treatment 为主创意（Lift +${(lift * 100).toFixed(1)}%）`,
  });
}
</script>

<template>
  <div>
    <PageHeader title="创意 A/B（自建框架）" subtitle="双 AdGroup 平行 · 14 天周期 · 显著性 95% 判定 Winner">
      <template #extra><el-button type="primary" :icon="'Plus'">启动新 A/B</el-button></template>
    </PageHeader>

    <el-alert type="info" show-icon :closable="false">
      <template #title>注意：亚马逊 SB / SD 没有原生 A/B</template>
      <template #default>
        本系统通过<strong>双 AdGroup 平行</strong>（关键词 / 出价 / 预算各 50%）或<strong>时段轮替</strong>实现 A/B。需 ≥ 14 天 + 单组 ≥ 500 clicks 才能判显著性。
      </template>
    </el-alert>

    <el-row :gutter="16" class="mt-16">
      <el-col v-for="t in data" :key="t.id" :xs="24" :md="12">
        <el-card shadow="never" class="ab-card">
          <div class="ab-head">
            <div>
              <strong>{{ t.id }}</strong>
              <el-tag size="small" effect="plain">{{ t.type }}</el-tag>
              <el-tag size="small" :type="t.status === 'completed' ? 'success' : 'warning'">{{ t.status === 'completed' ? '已完成' : '进行中' }}</el-tag>
            </div>
            <span class="text-muted">{{ t.daysRunning }}/{{ t.daysTotal }} 天</span>
          </div>
          <p class="text-muted" style="font-size: 12px; margin: 4px 0 12px">模式：{{ t.mode === 'parallel_adgroups' ? '双 AdGroup 平行' : '时段轮替' }} · 起始 {{ t.startedAt }}</p>

          <div class="ab-row">
            <div class="ab-cell">
              <span class="cell-label">Control</span>
              <p class="cell-headline">{{ t.control.headline }}</p>
              <div class="cell-metrics">
                <span>{{ t.control.clicks }} clicks</span>
                <span>CTR {{ formatPercent(t.control.ctr) }}</span>
                <span>CVR {{ formatPercent(t.control.cvr) }}</span>
                <strong class="tnum">{{ t.control.roas.toFixed(1) }}x</strong>
              </div>
            </div>
            <div class="ab-cell" :class="{ winner: t.winner === 'treatment' }">
              <span class="cell-label">Treatment {{ t.winner === 'treatment' ? '🏆' : '' }}</span>
              <p class="cell-headline">{{ t.treatment.headline }}</p>
              <div class="cell-metrics">
                <span>{{ t.treatment.clicks }} clicks</span>
                <span>CTR {{ formatPercent(t.treatment.ctr) }}</span>
                <span>CVR {{ formatPercent(t.treatment.cvr) }}</span>
                <strong class="tnum">{{ t.treatment.roas.toFixed(1) }}x</strong>
              </div>
            </div>
          </div>

          <div class="ab-foot">
            <div>
              <span class="text-muted">显著性：</span>
              <strong :class="t.significance >= 0.95 ? 'text-success' : t.significance >= 0.8 ? 'text-warning' : 'text-muted'">{{ Math.round(t.significance * 100) }}%</strong>
              <span v-if="t.winner === 'treatment'" class="text-success" style="margin-left: 12px">Lift +{{ formatPercent((t.treatment.cvr - t.control.cvr) / t.control.cvr) }}</span>
            </div>
            <el-button v-if="t.winner === 'treatment'" type="primary" size="small" @click="adoptWinner(t)">采用 Winner</el-button>
            <el-button v-else size="small" link>详情</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.ab-card { margin-bottom: 16px; }
.ab-head { display: flex; justify-content: space-between; align-items: center; }
.ab-head strong { font-family: ui-monospace, monospace; margin-right: 8px; }
.ab-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 767px) {
  .ab-row { grid-template-columns: 1fr; }
  .ab-head { flex-wrap: wrap; gap: 6px; }
  .ab-foot { flex-direction: column; align-items: stretch; gap: 8px; }
}
.ab-cell { padding: 12px 14px; background: #f9fafb; border-radius: 8px; border: 1px solid var(--line-soft); }
.ab-cell.winner { background: var(--success-soft); border-color: var(--success); }
.cell-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; }
.cell-headline { font-size: 13px; line-height: 1.5; margin: 6px 0 10px; }
.cell-metrics { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--text-muted); align-items: center; }
.cell-metrics strong { font-size: 14px; color: var(--text); margin-left: auto; }
.ab-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; margin-top: 12px; border-top: 1px dashed var(--line); font-size: 13px; }
</style>
