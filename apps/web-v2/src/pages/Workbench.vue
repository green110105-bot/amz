<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import DecisionCard from '../components/DecisionCard.vue';
import EmptyState from '../components/EmptyState.vue';
import StageTransitionAlert from '../components/StageTransitionAlert.vue';
import { dashboardApi } from '../api/dashboard';
import { amazonIntegrationsApi } from '../api/integrations';
import { useNotificationsBus } from '../composables/useNotificationsBus';
import { useAppStore } from '../stores/app';
import { formatCurrency, formatPercent, formatNumber, normalizeCard } from '../utils/format';

const bus = useNotificationsBus();
const appStore = useAppStore();
const route = useRoute();
const loading = ref(true);
const error = ref('');
const data = ref(null);
const syncing = ref(false);
// W16: 接受 /workbench?filter=ad_suggestion 深链（AdsActions 孤儿页并入后唯一入口）。
const VALID_FILTERS = ['all', 'anomaly', 'profit_leak', 'ad_suggestion', 'inventory'];
const initialFilter = VALID_FILTERS.includes(route.query.filter) ? route.query.filter : 'all';
const filterType = ref(initialFilter); // all | anomaly | profit_leak | ad_suggestion | inventory
// B-2 / N6-w11: dismissedIds 仅用于落库成功后从当前列表移除卡片。
// 持久化由 DecisionCard.reject -> POST /api/v1/audit/dismiss 完成（@reject 只在
// 落库成功后才触发），下次 load() 由后端列表决定是否仍出现。
const dismissedIds = ref(new Set());

function cardKey(card) {
  // W2: cards are normalized to a flat schema (id at top level).
  return card?.id || card?.payload?.id || card?.title;
}

// B-2 / N6-w11: 仅在 DecisionCard 落库成功后 emit('reject') 时触发，移除卡片。
function handleReject(card) {
  const key = cardKey(card);
  if (key) dismissedIds.value = new Set([...dismissedIds.value, key]);
  // W17: reject 后两处计数同步刷新（决策卡 Inbox 摘要 + 顶栏角标同源）。
  bus.refresh();
}

// W17: execute 后两处计数同步刷新 —— 重新拉取卡片列表并刷新同源摘要，
// 使 NotificationBell.unreadCount 与 Workbench cardSummary.total 同步变化。
async function handleExecute() {
  await Promise.all([load(), bus.refresh()]);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await dashboardApi.fetch();
    // W5: write the backend真值 into the appStore single-truth-source so the
    // top-bar / status card render honestly (sourceMode + realWritesEnabled).
    appStore.setSourceMeta({
      source: data.value?.sourceMeta?.source ?? data.value?.source ?? 'unknown',
      mock: data.value?.sourceMeta?.mock ?? (data.value?.sourceMode === 'db' ? false : null),
      realWritesEnabled:
        data.value?.realWritesEnabled === true || data.value?.sourceMeta?.realWritesEnabled === true,
      sourceMode: data.value?.sourceMode ?? data.value?.sourceMeta?.sourceMode ?? 'mock',
    });
  } catch (e) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  // W17: 确保 cardSummary 同源摘要在工作台独立进入时也已拉取（单例 bus）。
  bus.refresh();
});

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

// W17: 待办权威源统一 —— cardSummary 与顶栏 NotificationBell 同源（bus 轮询
// GET /api/v1/dashboard/summary）。bus 未就绪时回退到本地已载入卡片，保证
// 首屏不空白；一旦轮询/手动刷新到达，二者计数永远一致。
const cardSummary = computed(() => {
  const bs = bus.cardSummary.value;
  if (bs && bs.total != null && (bus.loaded.value || bs.total > 0)) return bs;
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

// W2: normalize every card into the single DecisionCard schema (works for both
// dashboard mock cards and DB cards), then dismiss/filter on the normalized form.
const filteredCards = computed(() => {
  const cards = (data.value?.actionCards || [])
    .map((c) => normalizeCard(c))
    .filter((c) => !dismissedIds.value.has(c.id || c.title));
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

// W9: 三态分流 ——
//   error 非空        -> 'error'   「加载失败」带重试
//   200 但无 overview/未绑店 -> 'onboarding' 「引导接店铺·同步」带 CTA
//   确无卡            -> 'empty'   「今日无待处理」
const viewState = computed(() => {
  if (loading.value) return 'loading';
  if (error.value) return 'error';
  // 成功响应但既无经营概览又无任何卡片 -> 视为未绑店/未同步，引导接店铺。
  const hasOverview = !!data.value?.overview;
  const hasCards = (data.value?.actionCards || []).length > 0;
  if (!hasOverview && !hasCards) return 'onboarding';
  return 'ready';
});

// W9: 空态接同步 CTA —— 调 integrations.syncAll 启动接店铺/同步闭环。
async function startSync() {
  if (syncing.value) return;
  syncing.value = true;
  try {
    await amazonIntegrationsApi.syncAll();
    ElMessage.success('已发起同步，稍后刷新查看');
    await load();
    bus.refresh();
  } catch (e) {
    ElMessage.error(`同步失败：${e.message || e}`);
  } finally {
    syncing.value = false;
  }
}

// W9: refresh 改 await load() 后按 error 分别弹 success/error，不再无条件 false-positive。
async function refresh() {
  await load();
  bus.refresh();
  if (error.value) {
    ElMessage.error(`刷新失败：${error.value}`);
  } else {
    ElMessage.success('已刷新');
  }
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

    <!-- KPI 行 — W9: 仅 error 态显示「加载失败」+ 重试；onboarding 态引导接店铺。 -->
    <div v-loading="loading" class="kpi-row">
      <KpiCard v-for="(kpi, i) in kpis" :key="i" v-bind="kpi" />
      <div v-if="viewState === 'error'" class="kpi-empty">
        <EmptyState title="加载失败" :description="error" icon="WarningFilled">
          <el-button type="primary" size="small" @click="refresh">重试</el-button>
        </EmptyState>
      </div>
      <div v-else-if="viewState === 'onboarding'" class="kpi-empty">
        <EmptyState
          title="还没有接入店铺数据"
          description="连接 Amazon 店铺并同步后，这里会显示经营概览与今日决策建议。"
          icon="Connection"
        >
          <el-button type="primary" size="small" :loading="syncing" @click="startSync">引导接店铺 · 同步</el-button>
          <el-button size="small" @click="$router.push('/settings/amazon-auth')">前往授权中心</el-button>
        </EmptyState>
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
              :key="card.id || card.title"
              :card="card"
              @reject="handleReject"
              @execute="handleExecute"
            />
            <!-- W9: onboarding 态引导接店铺；ready 态确无卡才显示「今日无待处理」。 -->
            <EmptyState
              v-if="viewState === 'onboarding'"
              title="还没有可处理的决策"
              description="连接 Amazon 店铺并同步后，今日决策建议会出现在这里。"
              icon="Connection"
            >
              <el-button type="primary" size="small" :loading="syncing" @click="startSync">引导接店铺 · 同步</el-button>
            </EmptyState>
            <EmptyState
              v-else-if="viewState === 'error'"
              title="加载失败"
              :description="error"
              icon="WarningFilled"
            >
              <el-button type="primary" size="small" @click="refresh">重试</el-button>
            </EmptyState>
            <EmptyState
              v-else-if="!loading && filteredCards.length === 0"
              :title="filterType === 'all' ? '今日无待处理项' : `无 ${TYPE_LABELS[filterType]} 类决策`"
              :description="filterType === 'all' ? '今日待办均已处理' : '切换筛选查看其它类型'"
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
            <!-- N7-w6 / W6 (终态): copy is ALWAYS driven by appStore.realWritesEnabled
                 真值 (derived from sourceMeta). realWritesEnabled===true is a HIGH-RISK
                 state -> red dot + danger copy that影响真实店铺; otherwise the honest
                 演示·沙箱 copy. Switches automatically with the store truth source. -->
            <li>
              <span class="status-dot" :class="appStore.realWritesEnabled ? 'bad' : 'warn'" />
              <span class="flex-1">真实写入</span>
              <span :class="appStore.realWritesEnabled ? 'text-danger' : 'text-muted'">
                {{ appStore.realWritesEnabled ? '已开启 · 将影响真实店铺' : '演示·沙箱 · 决策进入审计队列' }}
              </span>
            </li>
            <li>
              <span class="status-dot ok" />
              <span class="flex-1">审计中心</span>
              <span class="text-muted">已启用</span>
            </li>
            <li>
              <span class="status-dot ok" />
              <span class="flex-1">数据来源</span>
              <span class="text-muted">{{ appStore.sourceMeta.sourceMode || data?.sourceMode || 'unknown' }}</span>
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
