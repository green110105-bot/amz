<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import DecisionCard from '../components/DecisionCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { useViewport } from '../composables/useViewport';
import { adsApi } from '../api/ads';

const { isMobile } = useViewport();

const loading = ref(true);
const data = ref(null);
const priorityFilter = ref('all');

async function load() {
  loading.value = true;
  try {
    data.value = await adsApi.suggestions();
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const audits = computed(() => data.value?.audits || []);

const summary = computed(() => {
  const arr = audits.value;
  return {
    total: arr.length,
    high: arr.filter((a) => a.expectedImpact?.priority === 'high' || a.target?.priority === 'high').length,
    blocked: arr.filter((a) => a.status?.includes('blocked')).length,
  };
});

// audits 是 audit-action 形态，payload 在外层
const cards = computed(() => {
  let list = audits.value.map((a) => ({
    id: a.id,
    title: a.actionType,
    actionType: a.actionType,
    severity: a.risk?.severity,
    sku: a.target?.sku,
    asin: a.target?.asin,
    campaignId: a.target?.id,
    keyword: a.payload?.keyword,
    evidence: a.payload?.evidence || [],
    expectedImpact: a.expectedImpact,
    confidence: a.payload?.confidence,
    auditRequired: a.risk?.requiresApproval,
    sourceMode: 'mock',
  }));
  if (priorityFilter.value !== 'all') {
    list = list.filter((c) => c.severity === priorityFilter.value);
  }
  return list;
});
</script>

<template>
  <div>
    <PageHeader title="广告操作清单" subtitle="按生命周期 + 利润口径 ROAS 给出的每日建议（已审计中心收口）">
      <template #extra>
        <el-button :icon="'Refresh'" @click="load" :loading="loading">刷新</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16" class="summary">
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="summary-card">
          <span class="summary-label">待处理建议</span>
          <strong class="tnum">{{ summary.total }}</strong>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8">
        <el-card shadow="never" class="summary-card warn">
          <span class="summary-label">高严重度</span>
          <strong class="tnum">{{ summary.high }}</strong>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8">
        <el-card shadow="never" class="summary-card info">
          <span class="summary-label">需审批</span>
          <strong class="tnum">{{ summary.blocked }}</strong>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">建议列表</h2>
          <el-radio-group v-model="priorityFilter" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="high">高</el-radio-button>
            <el-radio-button value="medium">中</el-radio-button>
            <el-radio-button value="low">低</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <div v-loading="loading">
        <DecisionCard v-for="card in cards" :key="card.id" :card="card" source-module="M3" />
        <EmptyState v-if="!loading && cards.length === 0" title="无待处理建议" description="所有建议都已处理或无满足条件的项" />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.summary {
  margin-bottom: 16px;
}
.summary-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
}
.summary-card :deep(.el-card__body) {
  padding: 16px 18px;
}
.summary-label {
  font-size: 12px;
  color: var(--text-muted);
}
.summary-card strong {
  display: block;
  font-size: 28px;
  font-weight: 700;
  margin-top: 4px;
  color: var(--text);
  line-height: 1.1;
}
.summary-card.warn strong { color: var(--warning); }
.summary-card.info strong { color: var(--info); }

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
</style>
