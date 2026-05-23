<script setup>
import { ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockCalibration } from '../utils/mock-data-extras';

const { isMobile } = useViewport();

const data = ref({ ...mockCalibration });

function statusType(s) {
  return s === 'passed' ? 'success' : 'warning';
}

const mobileDimCols = [
  { prop: 'dim', label: '维度' },
  { prop: 'humanAvg', label: '人工分' },
  { prop: 'aiAvg', label: 'AI 分' },
  { prop: 'gap', label: '差距', formatter: (v) => (v > 0 ? '+' : '') + v },
];
</script>

<template>
  <div>
    <PageHeader title="评分系统校准" subtitle="3 阶段校准计划 · 确保 AI 评分能真预测 CVR lift" />

    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="Phase A 基线" :value="data.phaseA.correlation.toFixed(2)" :hint="`vs 目标 ${data.phaseA.target.toFixed(2)}`" :status="data.phaseA.status === 'passed' ? 'success' : 'warning'" icon="DataAnalysis" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="Phase B Beta" :value="data.phaseB.correlationLift.toFixed(2)" :hint="`vs 目标 ${data.phaseB.target.toFixed(2)}`" :status="data.phaseB.status === 'passed' ? 'success' : 'warning'" icon="TrendCharts" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="Phase C 持续" :value="data.phaseC.currentVersion" :hint="`本月调整 ${data.phaseC.weeklyAdjustments} 次`" status="info" icon="Refresh" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="评分系统" value="健康" hint="所有阶段达标" status="success" icon="CircleCheck" /></el-col>
    </el-row>

    <el-row :gutter="16" class="mt-16">
      <el-col :xs="24" :sm="24" :md="12" :lg="12">
        <el-card shadow="never">
          <template #header><h2 class="section-title">Phase A · 人工标注基线</h2></template>
          <el-descriptions :column="1" border size="default">
            <el-descriptions-item label="样本 SKU">{{ data.phaseA.samples }} 个真实 SKU（覆盖 4 类目）</el-descriptions-item>
            <el-descriptions-item label="人工评分">{{ data.phaseA.humanScored }} 个 × 5 位资深运营盲测</el-descriptions-item>
            <el-descriptions-item label="AI 评分">{{ data.phaseA.aiScored }} 个</el-descriptions-item>
            <el-descriptions-item label="相关性">
              <strong class="tnum text-success" style="font-size: 18px">{{ data.phaseA.correlation.toFixed(2) }}</strong>
              <span class="text-muted" style="font-size: 12px; margin-left: 6px">≥ {{ data.phaseA.target.toFixed(2) }} 才合格</span>
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusType(data.phaseA.status)" size="small">{{ data.phaseA.status === 'passed' ? '✓ 通过' : '未通过' }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="12" :lg="12">
        <el-card shadow="never">
          <template #header><h2 class="section-title">Phase B · CVR Lift 真实验证</h2></template>
          <el-descriptions :column="1" border size="default">
            <el-descriptions-item label="Beta SKU 数">{{ data.phaseB.skuCount }}</el-descriptions-item>
            <el-descriptions-item label="14 天 A/B 数据">{{ data.phaseB.withCvrData }} 个</el-descriptions-item>
            <el-descriptions-item label="评分提升 ↔ CVR 提升相关性">
              <strong class="tnum text-success" style="font-size: 18px">{{ data.phaseB.correlationLift.toFixed(2) }}</strong>
              <span class="text-muted" style="font-size: 12px; margin-left: 6px">≥ {{ data.phaseB.target.toFixed(2) }} 即合格</span>
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusType(data.phaseB.status)" size="small">{{ data.phaseB.status === 'passed' ? '✓ 通过' : '未通过' }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">5 维度准确度（人工 vs AI）</h2></template>
      <ResponsiveTable :data="data.dimensionAccuracy" :mobile-columns="mobileDimCols" stripe>
        <el-table-column prop="dim" label="维度" min-width="200" />
        <el-table-column label="人工平均分" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ row.humanAvg }}</span></template></el-table-column>
        <el-table-column label="AI 平均分" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ row.aiAvg }}</span></template></el-table-column>
        <el-table-column label="差距" align="right" width="120">
          <template #default="{ row }">
            <span class="tnum" :class="Math.abs(row.gap) <= 3 ? 'text-success' : 'text-warning'">{{ row.gap > 0 ? '+' : '' }}{{ row.gap }}</span>
          </template>
        </el-table-column>
      </ResponsiveTable>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 0; }
.kpi-row > .el-col { margin-bottom: 12px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
</style>
