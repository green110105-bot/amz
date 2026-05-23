<script setup>
import { ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockExperiments } from '../utils/mock-data';
import { formatPercent } from '../utils/format';
import { useAudit } from '../composables/useAudit';
const { submit } = useAudit();
const { isMobile } = useViewport();

const experiments = ref([...mockExperiments]);

async function adoptWinner(t) {
  await submit({
    sourceModule: 'M1',
    actionType: 'ADOPT_AB_WINNER',
    target: { type: 'sku', id: t.sku },
    payload: { experimentId: t.id, winner: t.winner, lift: t.lift },
    expectedImpact: { metric: 'cvr_lift', change: `+${(t.lift * 100).toFixed(1)}%` },
    description: `采用 ${t.id} Winner（lift ${(t.lift * 100).toFixed(1)}%）`,
  });
}

function statusType(s) {
  return { running: 'warning', completed: 'success', failed: 'danger' }[s] || '';
}
function winnerLabel(w) {
  return { control: 'Control 胜', treatment: 'Treatment 胜', no_difference: '无显著差异' }[w] || '进行中';
}

const mobileCols = [
  { prop: 'id', label: '实验 ID' },
  { prop: 'sku', label: 'SKU' },
  { prop: 'type', label: '类型', formatter: (v) => (v === 'main_image' ? '主图' : 'A+ 模块') },
  { prop: 'lift', label: '提升', formatter: (v) => (v > 0 ? '+' : '') + formatPercent(v) },
  { prop: 'status', label: '状态', formatter: (v) => (v === 'running' ? '进行中' : '已完成') },
];
</script>

<template>
  <div>
    <PageHeader title="A/B 实验" subtitle="亚马逊原生主图 / A+ 模块 A/B 测试 · 14 天周期 · 显著性双指标">
      <template #extra>
        <el-button type="primary" :icon="'Plus'">启动新实验</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <ResponsiveTable :data="experiments" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="id" label="实验 ID" width="120" />
        <el-table-column prop="sku" label="SKU" width="120" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.type === 'main_image' ? '主图' : 'A+ 模块' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" width="160">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <el-progress :percentage="Math.round((row.daysRunning / row.daysTotal) * 100)" :stroke-width="6" :show-text="false" style="flex: 1" />
              <span class="tnum text-muted" style="font-size: 12px">{{ row.daysRunning }}/{{ row.daysTotal }}d</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Control CVR" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ formatPercent(row.controlCvr) }}</span></template></el-table-column>
        <el-table-column label="Treatment CVR" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ formatPercent(row.treatmentCvr) }}</span></template></el-table-column>
        <el-table-column label="提升" align="right" width="100">
          <template #default="{ row }">
            <span class="tnum" :class="row.lift > 0 ? 'text-success' : 'text-danger'">
              {{ row.lift > 0 ? '+' : '' }}{{ formatPercent(row.lift) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="显著性" align="right" width="100">
          <template #default="{ row }">
            <span class="tnum" :class="row.significance >= 0.95 ? 'text-success' : row.significance >= 0.8 ? 'text-warning' : 'text-muted'">
              {{ Math.round(row.significance * 100) }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态 / 结论" width="160">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ row.status === 'running' ? '进行中' : '已完成' }}</el-tag>
            <span v-if="row.winner" style="margin-left: 4px; font-size: 12px">{{ winnerLabel(row.winner) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="row.status === 'completed' && row.winner === 'treatment'" type="primary" size="small" plain @click="adoptWinner(row)">采用 Winner</el-button>
            <el-button v-else size="small" link type="primary">详情</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button v-if="row.status === 'completed' && row.winner === 'treatment'" type="primary" size="small" @click.stop="adoptWinner(row)">采用 Winner</el-button>
          <el-button v-else size="small" type="primary" plain>详情</el-button>
        </template>
      </ResponsiveTable>
    </el-card>
  </div>
</template>
