<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import DecisionCard from '../components/DecisionCard.vue';
import { useViewport } from '../composables/useViewport';
import { useLeaks } from '../composables/useM2State';
import { formatCurrency } from '../utils/format';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const leaks = useLeaks();

const sevFilter = ref(route.query.severity || 'all');
const statusFilter = ref(route.query.status || 'all');

async function load() {
  const params = {};
  if (sevFilter.value !== 'all') params.severity = sevFilter.value;
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  await leaks.fetch(params);
}

watch([sevFilter, statusFilter], () => {
  router.replace({
    query: {
      ...route.query,
      severity: sevFilter.value === 'all' ? undefined : sevFilter.value,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
    },
  });
  load();
});

onMounted(load);

const filtered = computed(() => leaks.list.value || []);
const counts = computed(() => leaks.counts.value || {});
const totalImpact = computed(() =>
  (leaks.list.value || []).reduce((s, l) => s + Number(l.monthlyImpact || l.monthly_impact || 0), 0),
);

async function execute(_card, leak) {
  // DecisionCard 内已经走 useAudit；这里再调 startFix 流转 status
  if (leak?.id && leak.status === 'pending') {
    try { await leaks.startFix(leak.id); } catch {}
  }
}
</script>

<template>
  <div>
    <PageHeader title="漏点中心" subtitle="AI 主动检测的利润漏点 + 修复建议 + 跟踪">
      <template #extra>
        <el-button :icon="'Download'">导出本月</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="月可挽回总额" :value="formatCurrency(totalImpact)" hint="按当前漏点估算" status="success" icon="Money" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="待处理漏点" :value="counts.total ?? filtered.length" :hint="`P0 ${counts.p0 ?? 0} · P1 ${counts.p1 ?? 0}`" status="warning" icon="Warning" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="修复中" :value="counts.fixing ?? 0" hint="跟踪中" status="info" icon="Refresh" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="本月已修复" :value="counts.fixed ?? 0" hint="实际节省 (跟踪)" status="success" icon="CircleCheck" /></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">漏点列表（按月度可挽回金额排序）</h2>
          <div>
            <el-radio-group v-model="sevFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="P0">P0</el-radio-button>
              <el-radio-button value="P1">P1</el-radio-button>
              <el-radio-button value="P2">P2</el-radio-button>
            </el-radio-group>
            <el-select v-model="statusFilter" size="small" style="width: 130px; margin-left: 12px">
              <el-option label="全部状态" value="all" />
              <el-option label="待处理" value="pending" />
              <el-option label="修复中" value="fixing" />
              <el-option label="已修复" value="fixed" />
              <el-option label="已忽略" value="ignored" />
            </el-select>
          </div>
        </div>
      </template>
      <div v-loading="leaks.loading.value">
        <DecisionCard
          v-for="leak in filtered"
          :key="leak.id"
          source-module="M2"
          :card="{
            title: leak.title,
            severity: leak.severity,
            sku: leak.sku,
            asin: leak.asin,
            actionType: leak.type,
            recommendation: leak.recommendation,
            evidence: leak.evidence,
            expectedImpact: leak.monthlyImpact || leak.monthly_impact,
            confidence: leak.confidence || 0.78,
          }"
          @execute="(card) => execute(card, leak)"
        />
        <el-empty v-if="!filtered.length" description="暂无漏点" />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row .el-col { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
</style>
