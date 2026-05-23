<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import DecisionCard from '../components/DecisionCard.vue';
import EmptyState from '../components/EmptyState.vue';
import StageTransitionAlert from '../components/StageTransitionAlert.vue';
import { dashboardApi } from '../api/dashboard';
import { formatCurrency, formatPercent, formatNumber } from '../utils/format';

const loading = ref(true);
const error = ref('');
const data = ref(null);
const filterType = ref('all'); // all | anomaly | profit_leak | ad_suggestion | inventory

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await dashboardApi.fetch();
  } catch (e) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const kpis = computed(() => {
  const ov = data.value?.overview;
  if (!ov) return [];
  const margin = Number(ov.profitMargin || 0);
  const profitTrendType = ov.netProfit > 0 ? 'up' : ov.netProfit < 0 ? 'down' : 'neutral';
  return [
    {
      label: '当期收入',
      value: formatCurrency(ov.revenue),
      hint: `${formatNumber(ov.orders)} 个订单`,
      icon: 'Money',
      status: 'default',
    },
    {
      label: '净利润',
      value: formatCurrency(ov.netProfit),
      trend: formatPercent(margin),
      trendType: profitTrendType,
      hint: '利润率',
      icon: 'TrendCharts',
      status: ov.netProfit < 0 ? 'danger' : 'success',
    },
    {
      label: '总成本',
      value: formatCurrency(ov.totalCosts),
      hint: '14 项费用归集',
      icon: 'Tickets',
      status: 'info',
    },
    {
      label: '数据置信度',
      value: formatPercent(ov.confidence || 0, 0),
      hint: ov.confidence < 0.7 ? '待补真实成本数据' : '数据充足',
      icon: 'CircleCheck',
      status: ov.confidence < 0.7 ? 'warning' : 'success',
    },
  ];
});

const cardSummary = computed(() => {
  const cards = data.value?.actionCards || [];
  return {
    total: cards.length,
    p0: cards.filter((c) => c.priority === 'P0' || c.priority === 'high' || c.priority === 'critical').length,
    p1: cards.filter((c) => c.priority === 'P1' || c.priority === 'medium').length,
    p2: cards.filter((c) => c.priority === 'P2' || c.priority === 'low').length,
  };
});

const TYPE_LABELS = {
  anomaly: '异常',
  profit_leak: '利润漏点',
  ad_suggestion: '广告建议',
  inventory: '库存决策',
};

const filteredCards = computed(() => {
  const cards = data.value?.actionCards || [];
  if (filterType.value === 'all') return cards;
  return cards.filter((c) => c.type === filterType.value);
});

const groupCounts = computed(() => {
  const cards = data.value?.actionCards || [];
  return {
    anomaly: cards.filter((c) => c.type === 'anomaly').length,
    profit_leak: cards.filter((c) => c.type === 'profit_leak').length,
    ad_suggestion: cards.filter((c) => c.type === 'ad_suggestion').length,
    inventory: cards.filter((c) => c.type === 'inventory').length,
  };
});

function lastUpdated() {
  if (!data.value?.generatedAt) return '';
  return new Date(data.value.generatedAt).toLocaleString('zh-CN');
}

function refresh() {
  load();
  ElMessage.success('已刷新');
}
</script>

<template>
  <div class="workbench">
    <PageHeader title="今日工作台" :subtitle="lastUpdated() ? `数据更新于 ${lastUpdated()}` : '加载中...'">
      <template #extra>
        <el-button :icon="'Refresh'" @click="refresh" :loading="loading">刷新</el-button>
        <el-button type="primary" :icon="'Promotion'" @click="$router.push('/audit')">审计中心</el-button>
      </template>
    </PageHeader>

    <!-- 阶段切换提醒（紧凑版） -->
    <StageTransitionAlert :compact="false" />

    <!-- KPI 行 -->
    <div v-loading="loading" class="kpi-row">
      <KpiCard v-for="(kpi, i) in kpis" :key="i" v-bind="kpi" />
      <div v-if="!loading && !kpis.length" class="kpi-empty">
        <EmptyState title="数据加载失败" :description="error" />
      </div>
    </div>

    <!-- 待处理摘要 + 决策筛选 -->
    <div class="content-grid">
      <div class="content-main">
        <el-card shadow="never" class="action-card">
          <template #header>
            <div class="card-header">
              <div>
                <h2 class="section-title">今日待处理</h2>
                <p class="section-desc">
                  共 {{ cardSummary.total }} 条决策建议
                  <el-tag v-if="cardSummary.p0 > 0" type="danger" size="small" effect="plain" round>
                    紧急 {{ cardSummary.p0 }}
                  </el-tag>
                  <el-tag v-if="cardSummary.p1 > 0" type="warning" size="small" effect="plain" round>
                    重要 {{ cardSummary.p1 }}
                  </el-tag>
                  <el-tag v-if="cardSummary.p2 > 0" size="small" effect="plain" round>
                    关注 {{ cardSummary.p2 }}
                  </el-tag>
                </p>
              </div>
              <el-radio-group v-model="filterType" size="small">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="anomaly">异常 {{ groupCounts.anomaly }}</el-radio-button>
                <el-radio-button value="profit_leak">漏点 {{ groupCounts.profit_leak }}</el-radio-button>
                <el-radio-button value="ad_suggestion">广告 {{ groupCounts.ad_suggestion }}</el-radio-button>
                <el-radio-button value="inventory">库存 {{ groupCounts.inventory }}</el-radio-button>
              </el-radio-group>
            </div>
          </template>

          <div v-loading="loading" class="decision-list">
            <DecisionCard
              v-for="card in filteredCards"
              :key="card.payload?.id || card.title"
              :card="card.payload"
            />
            <EmptyState
              v-if="!loading && filteredCards.length === 0"
              :title="filterType === 'all' ? '今日无待处理项' : `无 ${TYPE_LABELS[filterType]} 类决策`"
              description="所有事项都已处理完成"
              icon="CircleCheck"
            />
          </div>
        </el-card>
      </div>

      <aside class="content-side">
        <el-card shadow="never" class="side-card">
          <template #header>
            <div class="card-header">
              <h2 class="section-title small">使用提示</h2>
            </div>
          </template>
          <ol class="step-list">
            <li><span>1</span><div><b>先看红色（紧急）</b><p>账户健康 / Buy Box 丢失这类直接影响销售的</p></div></li>
            <li><span>2</span><div><b>再看漏点</b><p>每条带"修复后预计可省"的金额</p></div></li>
            <li><span>3</span><div><b>查看推理链</b><p>每条决策右下角"为什么这么建议"</p></div></li>
            <li><span>4</span><div><b>一键执行</b><p>会先进审计中心审批，不直接改店铺</p></div></li>
          </ol>
        </el-card>

        <el-card shadow="never" class="side-card">
          <template #header>
            <div class="card-header">
              <h2 class="section-title small">系统状态</h2>
            </div>
          </template>
          <ul class="status-list">
            <li>
              <span class="status-dot" :class="{ ok: !error }" />
              <span class="flex-1">API 连接</span>
              <span class="text-muted">{{ error ? '异常' : '正常' }}</span>
            </li>
            <li>
              <span class="status-dot warn" />
              <span class="flex-1">真实写入</span>
              <span class="text-muted">已关闭</span>
            </li>
            <li>
              <span class="status-dot ok" />
              <span class="flex-1">审计中心</span>
              <span class="text-muted">已启用</span>
            </li>
            <li>
              <span class="status-dot ok" />
              <span class="flex-1">数据来源</span>
              <span class="text-muted">{{ data?.sourceMode || 'mock' }}</span>
            </li>
          </ul>
        </el-card>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.workbench {
  max-width: 1440px;
  margin: 0 auto;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
.kpi-empty {
  grid-column: 1 / -1;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
}

.action-card {
  border: 1px solid var(--line);
}
.action-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line-soft);
}
.action-card :deep(.el-card__body) {
  padding: 16px 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text);
}
.section-title.small {
  font-size: 13px;
  margin: 0;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  text-transform: uppercase;
}
.section-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.decision-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.side-card {
  border: 1px solid var(--line);
  margin-bottom: 16px;
}
.side-card :deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line-soft);
}
.side-card :deep(.el-card__body) {
  padding: 12px 16px;
}

.step-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 13px;
}
.step-list li {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--line-soft);
}
.step-list li:last-child {
  border-bottom: none;
}
.step-list li > span {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 12px;
  flex-shrink: 0;
}
.step-list li > div b {
  display: block;
  margin-bottom: 2px;
}
.step-list li > div p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.status-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 13px;
}
.status-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--line-soft);
}
.status-list li:last-child {
  border-bottom: none;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-soft);
}
.status-dot.ok { background: var(--success); }
.status-dot.warn { background: var(--warning); }
.status-dot.bad { background: var(--danger); }

@media (max-width: 1100px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .content-grid { grid-template-columns: 1fr; }
}
</style>
