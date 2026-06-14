<script setup>
// SLABoard — 团队 SLA 看板 · today/7d/30d range · 真后端
// T1 移动一等公民：KPI 响应式栅格 + ResponsiveTable + 进度条卡片移动栅格
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useSLABoard } from '../composables/useM4State';

const route = useRoute();
const router = useRouter();
const sla = useSLABoard();
// M4-P2-03: default range aligned to backend default '7d' (was 'today').
const range = ref(route.query.range || '7d');

watch(range, (r) => {
  router.replace({ query: r === '7d' ? {} : { range: r } });
  sla.fetch(r, true);
});

onMounted(() => sla.fetch(range.value, true));

// rangeStats is the canonical range-scoped block; todayStats is a back-compat alias.
const ts = computed(() => sla.board.value?.rangeStats || sla.board.value?.todayStats || {});
const team = computed(() => sla.board.value?.team || []);
const rangeLabel = computed(() => ({ today: '今日', '7d': '近 7 天', '30d': '近 30 天' }[range.value] || range.value));

const mobileCols = [
  { prop: 'user', label: '成员' },
  { prop: 'anomaliesAssigned', label: '异常分配' },
  { prop: 'avgResponseMin', label: '均响应(min)' },
  { prop: 'slaRate', label: 'SLA 达成率', formatter: (v) => `${Math.round((v || 0) * 100)}%` },
];
</script>

<template>
  <div>
    <PageHeader title="SLA 看板" subtitle="团队异常响应时长 · 升级率 · 个人绩效">
      <template #extra>
        <el-radio-group v-model="range" size="small">
          <el-radio-button value="today">今日</el-radio-button>
          <el-radio-button value="7d">7 天</el-radio-button>
          <el-radio-button value="30d">30 天</el-radio-button>
        </el-radio-group>
      </template>
    </PageHeader>

    <div v-loading="sla.loading.value">
      <el-row :gutter="16" class="kpi-row">
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <KpiCard
            :label="`P0 异常（${rangeLabel}）`" :value="ts.p0Total || 0"
            :hint="`平均 ${ts.p0Avg || 0} min / SLA ${ts.p0Sla || 0} min`"
            :status="(ts.p0Avg ?? 0) <= (ts.p0Sla ?? 1) ? 'success' : 'danger'" icon="WarningFilled" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <KpiCard
            :label="`P1 异常（${rangeLabel}）`" :value="ts.p1Total || 0"
            :hint="`平均 ${ts.p1Avg || 0} min / SLA ${ts.p1Sla || 0} min`"
            :status="(ts.p1Avg ?? 0) <= (ts.p1Sla ?? 1) ? 'success' : 'warning'" icon="Warning" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <KpiCard label="升级次数" :value="ts.escalations || 0" hint="超 SLA 自动升级" status="warning" icon="ArrowUp" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <KpiCard label="平均响应" :value="`${Math.round(((ts.p0Avg || 0) + (ts.p1Avg || 0)) / 2)} min`" status="default" icon="Clock" />
        </el-col>
      </el-row>

      <el-card shadow="never" class="mt-16">
        <template #header><h2 class="section-title">团队成员绩效（{{ range }}）</h2></template>
        <EmptyState v-if="!sla.loading.value && team.length === 0" title="暂无数据" description="后端尚未返回 SLA 看板" icon="DataAnalysis" />
        <ResponsiveTable v-else :data="team" :mobile-columns="mobileCols" stripe>
          <el-table-column prop="user" label="成员" width="160" />
          <el-table-column label="异常分配" align="right" width="140"><template #default="{ row }"><span class="tnum">{{ row.anomaliesAssigned }}</span></template></el-table-column>
          <el-table-column label="平均响应时长" align="right" width="140"><template #default="{ row }"><span class="tnum">{{ row.avgResponseMin }} min</span></template></el-table-column>
          <el-table-column label="SLA 内" align="right" width="140"><template #default="{ row }"><span class="tnum text-success">{{ row.withinSla }} / {{ row.anomaliesAssigned }}</span></template></el-table-column>
          <el-table-column label="已升级" align="right" width="120">
            <template #default="{ row }"><span class="tnum" :class="row.escalated > 0 ? 'text-warning' : ''">{{ row.escalated }}</span></template>
          </el-table-column>
          <el-table-column label="SLA 达成率">
            <template #default="{ row }">
              <el-progress :percentage="Math.round((row.slaRate || 0) * 100)" :stroke-width="8" :status="(row.slaRate || 0) >= 0.95 ? 'success' : (row.slaRate || 0) >= 0.85 ? '' : 'exception'" />
            </template>
          </el-table-column>

          <template #mobile-slaRate="{ row }">
            <el-progress :percentage="Math.round((row.slaRate || 0) * 100)" :stroke-width="8" :status="(row.slaRate || 0) >= 0.95 ? 'success' : (row.slaRate || 0) >= 0.85 ? '' : 'exception'" />
          </template>
        </ResponsiveTable>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 0; }
.kpi-row :deep(.el-col) { margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.mt-16 { margin-top: 16px; }
</style>
