<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import RadarChart from '../components/RadarChart.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockStructureHealth } from '../utils/mock-data-ads';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();
const mobileImpCols = [
  { prop: 'subLabel', label: '维度' },
  { prop: 'action', label: '改进动作' },
  { prop: 'expectedLift', label: '提升', formatter: (v) => '+' + v + '分' },
];

const { submit } = useAudit();
const data = ref({ ...mockStructureHealth });

const radarItems = computed(() => data.value.subScores.map((s) => ({ label: s.id, value: (s.score / s.weight) * 100 })));

const allImprovements = computed(() => {
  const items = [];
  for (const sub of data.value.subScores) {
    for (const imp of sub.improvements || []) {
      items.push({ ...imp, subId: sub.id, subLabel: sub.label });
    }
  }
  return items.sort((a, b) => b.expectedLift - a.expectedLift);
});

async function applyImprovement(imp) {
  const r = await submit({
    sourceModule: 'M3',
    actionType: 'STRUCTURE_HEALTH_IMPROVE',
    target: { type: 'campaign', id: imp.subId, sku: '*' },
    payload: { action: imp.action, expectedLift: imp.expectedLift },
    expectedImpact: { metric: 'health_score', change: imp.expectedLift },
    description: imp.action,
  });
  if (r.ok) {
    // 模拟分数更新
    const sub = data.value.subScores.find((s) => s.id === imp.subId);
    if (sub) {
      sub.score = Math.min(sub.weight, sub.score + Math.round(imp.expectedLift * sub.weight / 20));
      sub.improvements = sub.improvements.filter((x) => x !== imp);
      data.value.totalScore = data.value.subScores.reduce((s, x) => s + x.score, 0);
    }
  }
}

function scoreColor(score, weight) {
  const ratio = score / weight;
  if (ratio >= 0.8) return 'var(--success)';
  if (ratio >= 0.5) return 'var(--warning)';
  return 'var(--danger)';
}

const gradeLabel = computed(() => ({ good: '健康', medium: '中等', poor: '需优化' })[data.value.grade] || '-');
</script>

<template>
  <div>
    <PageHeader title="投放结构健康分" subtitle="8 子项 · 百分制 · 一键改进">
      <template #extra>
        <el-button :icon="'Refresh'">重新审计</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16">
      <el-col :xs="24" :md="9">
        <el-card shadow="never" class="score-card">
          <div class="score-head">
            <h2 class="score-title">总分</h2>
            <el-tag :type="data.grade === 'good' ? 'success' : data.grade === 'medium' ? 'warning' : 'danger'" size="default">{{ gradeLabel }}</el-tag>
          </div>
          <div class="score-big">
            <strong class="tnum">{{ data.totalScore }}</strong>
            <span class="text-muted">/ 100</span>
          </div>
          <el-progress :percentage="data.totalScore" :stroke-width="10" :status="data.totalScore >= 70 ? 'success' : data.totalScore >= 50 ? 'warning' : 'exception'" :show-text="false" />

          <div style="display: flex; justify-content: center; padding: 24px 0">
            <RadarChart :items="radarItems" :size="280" />
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="15">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <h2 class="section-title">8 子项详情</h2>
              <span class="text-muted">点击查看每项改进建议</span>
            </div>
          </template>

          <el-collapse>
            <el-collapse-item v-for="sub in data.subScores" :key="sub.id" :name="sub.id">
              <template #title>
                <div class="sub-row">
                  <strong class="sub-id">{{ sub.id }}</strong>
                  <span class="sub-label">{{ sub.label }}</span>
                  <span class="sub-weight text-muted">权重 {{ sub.weight }}</span>
                  <strong class="sub-score tnum" :style="{ color: scoreColor(sub.score, sub.weight) }">{{ sub.score }}/{{ sub.weight }}</strong>
                  <el-icon v-if="sub.improvements?.length" style="color: var(--warning); margin-left: 6px"><WarningFilled /></el-icon>
                </div>
              </template>
              <div class="sub-detail">
                <div class="sub-block"><span class="block-label">现状</span><p>{{ sub.currentValue }}</p></div>
                <div class="sub-block"><span class="block-label">标准</span><p>{{ sub.standard }}</p></div>
                <div v-if="sub.issues?.length" class="sub-block">
                  <span class="block-label">问题</span>
                  <ul>
                    <li v-for="(iss, i) in sub.issues" :key="i">{{ iss }}</li>
                  </ul>
                </div>
                <div v-if="sub.improvements?.length" class="improvement-block">
                  <span class="block-label">改进建议</span>
                  <div v-for="(imp, i) in sub.improvements" :key="i" class="improvement-item">
                    <div>
                      <p class="imp-action">{{ imp.action }}</p>
                      <span class="text-muted" style="font-size: 12px">预计 +{{ imp.expectedLift }} 分</span>
                    </div>
                    <el-button v-if="imp.oneClick" size="small" type="primary" @click="applyImprovement(imp)">一键改进</el-button>
                  </div>
                </div>
                <p v-else class="text-success" style="font-size: 13px"><el-icon><CircleCheck /></el-icon> 此项健康</p>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">推荐改进（按 ROI 排序）</h2></template>
      <ResponsiveTable :data="allImprovements" :mobile-columns="mobileImpCols" stripe>
        <el-table-column label="子项" width="120">
          <template #default="{ row }"><strong>{{ row.subId }}</strong></template>
        </el-table-column>
        <el-table-column prop="subLabel" label="维度" width="160" />
        <el-table-column prop="action" label="改进动作" min-width="280" />
        <el-table-column label="预期提升" width="100" align="right">
          <template #default="{ row }"><span class="tnum text-success">+{{ row.expectedLift }} 分</span></template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="row.oneClick" size="small" type="primary" plain @click="applyImprovement(row)">一键改进</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button v-if="row.oneClick" size="small" type="primary" @click="applyImprovement(row)">一键改进</el-button>
        </template>
      </ResponsiveTable>
    </el-card>
  </div>
</template>

<style scoped>
.score-card { min-height: 540px; }
.score-head { display: flex; justify-content: space-between; align-items: center; }
.score-title { font-size: 14px; font-weight: 500; margin: 0; color: var(--text-muted); }
.score-big { font-size: 56px; font-weight: 700; color: var(--text); margin: 8px 0; line-height: 1; }
.score-big .text-muted { font-size: 16px; margin-left: 4px; }

.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }

.sub-row { display: flex; align-items: center; gap: 12px; flex: 1; padding-right: 12px; }
.sub-id { width: 36px; font-size: 14px; color: var(--primary); }
.sub-label { flex: 1; font-size: 14px; }
.sub-weight { font-size: 11px; }
.sub-score { font-size: 16px; font-weight: 700; }

.sub-detail { padding: 0 4px 12px 40px; }
.sub-block { padding: 8px 0; }
.block-label { display: block; font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 4px; }
.sub-block p { margin: 0; font-size: 13px; }
.sub-block ul { margin: 0; padding-left: 20px; font-size: 13px; }

.improvement-block { padding: 8px 0; }
.improvement-item { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; background: var(--primary-soft); border-radius: 6px; margin-bottom: 6px; }
.imp-action { margin: 0 0 4px; font-size: 13px; font-weight: 500; }
</style>
