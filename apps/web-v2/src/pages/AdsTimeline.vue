<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import SuggestionCard from '../components/SuggestionCard.vue';
import ManualChangeCard from '../components/ManualChangeCard.vue';
import SuggestionDrawer from '../components/SuggestionDrawer.vue';
import EmptyState from '../components/EmptyState.vue';
import { useSuggestions, useManualChanges, useStrategies } from '../composables/useAdsState';
import { manualChangesApi, timelineApi } from '../api/ads-timeline';
import { useAudit } from '../composables/useAudit';
import { useViewport } from '../composables/useViewport';
import { formatCurrency } from '../utils/format';

const { isMobile } = useViewport();

// M3-P1-13: provider-mode honesty. The timeline never fabricates mock/hybrid data as
// 'real'. Missing sourceMeta defaults to 'mock'; a demo banner is shown unless real.
const providerMode = ref('mock');
const isReal = computed(() => providerMode.value === 'real');
async function loadProviderMode() {
  try {
    const res = await timelineApi.list().catch(() => ({}));
    providerMode.value = res.sourceMeta?.providerMode || res.providerMode || 'mock';
  } catch { providerMode.value = 'mock'; }
}

const route = useRoute();
const router = useRouter();
const { submit } = useAudit();

const { list: suggestions, fetch: fetchSuggestions, accept, reject: rejectSuggestion, revert } = useSuggestions();
const { list: manualChanges, fetch: fetchManual, applyAlternative: applyAlternativeApi, ignore: ignoreApi } = useManualChanges();
const { list: strategies, fetch: fetchStrategies } = useStrategies();

onMounted(async () => {
  await Promise.all([fetchSuggestions(), fetchManual(), fetchStrategies(), loadProviderMode()]);
});

// ===== 3 个 tab =====
const activeTab = ref(route.query.tab || 'pending');

watch(() => route.query.tab, (v) => { if (v) activeTab.value = v; });
function setTab(t) {
  activeTab.value = t;
  router.replace({ path: '/ads/timeline', query: { ...route.query, tab: t } });
}

// ===== 筛选 =====
const filterSku = ref(route.query.sku || 'all');
const filterStrategy = ref(route.query.strategy || 'all');

watch([filterSku, filterStrategy], ([sku, strat]) => {
  const query = { ...route.query };
  if (sku === 'all') delete query.sku; else query.sku = sku;
  if (strat === 'all') delete query.strategy; else query.strategy = strat;
  router.replace({ path: '/ads/timeline', query });
});

const skuOptions = computed(() => {
  const set = new Set();
  suggestions.value.forEach((s) => { if (s.entity?.sku) set.add(s.entity.sku); });
  return [...set];
});

const strategyOptions = computed(() => {
  const ids = new Set(suggestions.value.map((s) => s.sourceStrategyId).filter(Boolean));
  return strategies.value.filter((st) => ids.has(st.id)).map((st) => ({ id: st.id, name: st.name, emoji: st.categoryEmoji }));
});

// ===== 3 类内容 =====
function applyCommonFilters(arr) {
  return arr.filter((s) => {
    if (filterSku.value !== 'all' && s.entity?.sku !== filterSku.value) return false;
    if (filterStrategy.value !== 'all' && s.sourceStrategyId !== filterStrategy.value) return false;
    return true;
  });
}

const pendingItems = computed(() =>
  applyCommonFilters(suggestions.value.filter((s) => s.state === 'pending'))
);
const manualItems = computed(() =>
  manualChanges.value.filter((m) => m.state === 'pending')
);
const processedItems = computed(() => {
  const suggested = suggestions.value
    .filter((s) => ['observing', 'rejected'].includes(s.state))
    .map((s) => ({ kind: 'suggestion', time: s.acceptedAt || s.rejectedAt || s.timeBucket, item: s }));
  const manual = manualChanges.value
    .filter((m) => m.state === 'resolved')
    .map((m) => ({ kind: 'manual', time: m.resolvedAt || m.timestamp, item: m }));
  const all = [...suggested, ...manual];
  return all.sort((a, b) => new Date(b.time) - new Date(a.time));
});

// ===== KPI =====
const kpi = computed(() => {
  const pendingCount = pendingItems.value.length;
  const manualCount = manualItems.value.length;
  const processedCount = processedItems.value.length;
  const savings = pendingItems.value.reduce((sum, s) => sum + ((s.impact?.saveMonthly || 0) + (s.impact?.gainMonthly || 0)), 0);
  return { pendingCount, manualCount, processedCount, savings };
});

// ===== 抽屉 =====
const drawerOpen = ref(false);
const drawerSuggestion = ref(null);

function viewDetail(s) {
  drawerSuggestion.value = s;
  drawerOpen.value = true;
}

// ===== Actions =====
async function execute(s) {
  await submit({
    sourceModule: 'M3',
    actionType: 'TIMELINE_ACCEPT',
    target: { type: 'ad_suggestion', id: s.id, sku: s.entity?.sku, asin: s.entity?.asin },
    payload: { suggestionId: s.id, originalActionType: s.actionType?.label },
    description: `采纳 AI 建议：${s.title}`,
  });
  await accept(s);
  ElNotification({
    title: '已采纳',
    message: '已入队 · 待人工复盘',
    type: 'success',
    position: 'bottom-right',
    duration: 3000,
  });
}

async function reject(s) {
  await rejectSuggestion(s, { reason: '用户手动忽略' });
  ElMessage.info('已忽略');
}

function toggleAuto(s) {
  ElMessage.info('自动执行配置 (PoC mock)');
}

async function applyAlternative(c) {
  await submit({
    sourceModule: 'M3',
    actionType: 'ACCEPT_ALTERNATIVE_TO_MANUAL_CHANGE',
    target: { type: 'manual_change', id: c.id },
    payload: { originalChange: c.operation, alternative: c.suggestedAlternative },
    description: `采纳 AI 替代方案：${c.suggestedAlternative?.label}`,
  });
  await applyAlternativeApi(c, { alternative: c.suggestedAlternative });
  ElNotification({
    title: '已采纳替代方案',
    message: c.suggestedAlternative?.label,
    type: 'success',
    position: 'bottom-right',
  });
}

async function ignoreManual(c) {
  await ignoreApi(c);
  ElMessage.info(c.aiVerdict === 'reasonable' ? '已记录' : '已忽略 AI 建议');
}

// M3-P0-07: manual_change revert is gated on the backend endpoint. Until it is verified
// wired, the revert/restore control for manual_change entries is HIDDEN (canRevert below)
// so the frontend never (a) writes a TIMELINE_REVERT audit then (b) only flips local state
// — which would fork the audit log from the real data. Suggestion revert is delegated to
// the backend revert endpoint (which writes its own audit); the frontend does NOT
// double-write an audit here.
function canRevert(entry) {
  // Only suggestion entries have a backend revert path today. Manual-change revert stays
  // hidden until /manual-changes/:id/revert is confirmed live.
  return entry.kind === 'suggestion';
}

async function revertProcessed(entry) {
  if (!canRevert(entry)) return; // defensive: button is hidden, but never act on manual_change
  try {
    await ElMessageBox.confirm(
      `确定撤销采纳的建议"${entry.item.title}"？将由后端执行撤销。`,
      '撤销操作',
      { confirmButtonText: '撤销', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }

  // Backend revert writes its own audit + actually reverts. No frontend submit double-write.
  await revert(entry.item);
  ElMessage.success('已提交撤销 · 由后端处理');
}

// M3-P1-13: three-state machine, honestly degraded. There is no cron that advances
// observing → succeeded/failed (no automatic settlement / backflow / auto-rollback), so
// those states are dead branches and removed. Enum ⊆ {pending, observing, rejected}.
// 'observing' now reads "已入队/待人工复盘" — we never promise automatic settlement.
const stateText = (state) => ({
  pending: '待办',
  observing: '已入队 · 待人工复盘',
  rejected: '已忽略',
})[state] || '待办';

const stateType = (state) => ({
  pending: 'warning',
  observing: 'primary',
  rejected: 'info',
})[state] || 'info';
</script>

<template>
  <div class="timeline-page">
    <PageHeader
      title="广告时间线"
      subtitle="AI 建议 + 外部更改 · 统一时间流"
    >
      <template #extra>
        <el-button :icon="'Refresh'">刷新</el-button>
        <el-button :icon="'Setting'" @click="router.push('/ads/strategies')">规则与主权</el-button>
      </template>
    </PageHeader>

    <!-- M3-P1-13: demo banner shown whenever provider mode is not real (mock/hybrid) -->
    <div v-if="!isReal" class="demo-banner">
      <el-icon><Warning /></el-icon>
      <span>演示数据(provider mode: {{ providerMode }}) · 非真实广告回流,不代表线上实际效果</span>
    </div>

    <!-- 标准 tabs (用真 tab UI 代替 KPI-as-tab) -->
    <el-tabs :model-value="activeTab" @tab-change="setTab" class="tl-tabs">
      <el-tab-pane name="pending">
        <template #label>
          <span class="tab-label">
            <span class="tab-icon">⏳</span>
            我的待办
            <el-badge v-if="kpi.pendingCount" :value="kpi.pendingCount" type="warning" />
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane name="manual">
        <template #label>
          <span class="tab-label">
            <span class="tab-icon">👤</span>
            外部更改
            <el-badge v-if="kpi.manualCount" :value="kpi.manualCount" type="primary" />
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane name="processed">
        <template #label>
          <span class="tab-label">
            <span class="tab-icon">✓</span>
            已处理
            <el-badge v-if="kpi.processedCount" :value="kpi.processedCount" type="info" />
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- 当前 tab 的关键统计（在 tab 下方，作为内容引子）-->
    <div class="tab-stats" v-if="activeTab === 'pending'">
      <span>有 <strong>{{ kpi.pendingCount }}</strong> 条 AI 建议等你处理 · 待捕获影响</span>
      <strong style="color:#10b981">+{{ formatCurrency(kpi.savings, 'USD') }}</strong>
      <span>/月</span>
    </div>
    <div class="tab-stats" v-if="activeTab === 'manual'">
      <span>有 <strong>{{ kpi.manualCount }}</strong> 条非本工具修改 · AI 已对每条评价（合理 / 中性 / 反对）+ 给出替代建议</span>
    </div>
    <div class="tab-stats" v-if="activeTab === 'processed'">
      <span>共 <strong>{{ kpi.processedCount }}</strong> 条历史记录 · 含已采纳进入观察期、已忽略、外部更改已处置 · 可一键撤销</span>
    </div>

    <!-- 筛选条 (2 个) -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <span class="filter-label">SKU</span>
        <el-select v-model="filterSku" size="default" style="width: 160px">
          <el-option label="全部 SKU" value="all" />
          <el-option v-for="sku in skuOptions" :key="sku" :label="sku" :value="sku" />
        </el-select>
        <span class="filter-label" style="margin-left: 16px">来源策略</span>
        <el-select v-model="filterStrategy" size="default" style="width: 260px" clearable>
          <el-option label="全部策略" value="all" />
          <el-option v-for="st in strategyOptions" :key="st.id" :label="`${st.emoji} ${st.name}`" :value="st.id" />
        </el-select>
        <span class="spacer" />
        <span class="legend">
          <el-tag size="small" effect="dark" style="background: #ef4444; border-color: #ef4444">P0</el-tag>
          <el-tag size="small" effect="dark" style="background: #f59e0b; border-color: #f59e0b">P1</el-tag>
          <el-tag size="small" effect="dark" style="background: #3b82f6; border-color: #3b82f6">P2</el-tag>
        </span>
      </div>
    </el-card>

    <!-- ===== Tab 1: 我的待办 ===== -->
    <div v-if="activeTab === 'pending'" class="tab-body">
      <div v-if="!pendingItems.length">
        <EmptyState title="暂无待办 AI 建议" hint="多数小时数据稳定 · AI 仅在策略状态机触发时输出建议" />
      </div>
      <div v-else class="cards-list">
        <SuggestionCard
          v-for="s in pendingItems"
          :key="s.id"
          :suggestion="s"
          @execute="execute"
          @reject="reject"
          @auto-toggle="toggleAuto"
          @view-detail="viewDetail"
        />
      </div>
    </div>

    <!-- ===== Tab 2: 外部更改 ===== -->
    <div v-else-if="activeTab === 'manual'" class="tab-body">
      <div v-if="!manualItems.length">
        <EmptyState title="暂无待评价的外部更改" hint="本工具自动检测非本工具的写操作并由 AI 评价" />
      </div>
      <div v-else class="cards-list">
        <ManualChangeCard
          v-for="c in manualItems"
          :key="c.id"
          :change="c"
          @apply-alternative="applyAlternative"
          @ignore="ignoreManual"
        />
      </div>
    </div>

    <!-- ===== Tab 3: 已处理 (含撤销) ===== -->
    <div v-else class="tab-body">
      <div v-if="!processedItems.length">
        <EmptyState title="暂无已处理记录" hint="AI 建议被采纳/忽略后 · 或外部更改被处置后 · 进入这里" />
      </div>
      <div v-else class="processed-list">
        <div v-for="(entry, i) in processedItems" :key="i" class="proc-row">
          <span class="proc-time">{{ new Date(entry.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</span>

          <!-- AI 建议 -->
          <template v-if="entry.kind === 'suggestion'">
            <el-tag size="small" effect="dark" :style="{ background: entry.item.severity.color, borderColor: entry.item.severity.color }">{{ entry.item.severity.label }}</el-tag>
            <el-tag size="small" effect="plain">🤖 AI 建议</el-tag>
            <div class="proc-body">
              <strong>{{ entry.item.title }}</strong>
              <span class="proc-sub">
                <span v-if="entry.item.entity?.sku" class="entity">{{ entry.item.entity.sku }}</span>
                <span v-if="entry.item.entity?.keyword && entry.item.entity?.keyword !== '—'" class="kw">"{{ entry.item.entity.keyword }}"</span>
                <span v-if="entry.item.sourceStrategyName" class="source">· 来自 {{ entry.item.sourceStrategyName }}</span>
              </span>
            </div>
            <el-tag size="small" :type="stateType(entry.item.state)" effect="light">{{ stateText(entry.item.state) }}</el-tag>
            <el-button size="small" link @click="viewDetail(entry.item)">详情</el-button>
            <el-button v-if="entry.item.state !== 'rejected'" size="small" link type="warning" @click="revertProcessed(entry)">撤销</el-button>
            <el-button v-else size="small" link type="primary" @click="revertProcessed(entry)">恢复</el-button>
          </template>

          <!-- 外部更改 -->
          <template v-else>
            <el-tag size="small" effect="dark" :type="entry.item.aiVerdict === 'oppose' ? 'danger' : entry.item.aiVerdict === 'neutral' ? 'warning' : 'success'">
              AI {{ entry.item.aiVerdictText }}
            </el-tag>
            <el-tag size="small" effect="plain">👤 外部</el-tag>
            <div class="proc-body">
              <strong>{{ entry.item.operation?.entity }} · {{ entry.item.operation?.action }}</strong>
              <span class="proc-sub">{{ entry.item.operator?.name }} ({{ entry.item.operator?.source }}) · {{ entry.item.operation?.before }} → {{ entry.item.operation?.after }}</span>
            </div>
            <el-tag size="small" type="info" effect="light">已处置</el-tag>
            <el-button size="small" link>详情</el-button>
            <!-- M3-P0-07: manual_change revert hidden until backend /manual-changes/:id/revert
                 is confirmed live — never fork audit from data via a local-only flip. -->
            <el-button v-if="canRevert(entry)" size="small" link type="warning" @click="revertProcessed(entry)">撤销</el-button>
            <span v-else class="revert-tbd" title="撤销端点即将上线">撤销(即将上线)</span>
          </template>
        </div>
      </div>
    </div>

    <!-- 抽屉 -->
    <SuggestionDrawer
      v-model="drawerOpen"
      :suggestion="drawerSuggestion"
      @execute="execute"
      @reject="reject"
    />
  </div>
</template>

<style scoped>
.timeline-page { padding-bottom: 32px; }

/* 标准 tabs */
.tl-tabs {
  margin-bottom: 0;
}
.tl-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background-color: var(--line-soft); }
.tl-tabs :deep(.el-tabs__item) {
  padding: 0 24px !important;
  height: 48px !important;
  font-size: 14px;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.tab-icon { font-size: 16px; }
.tl-tabs :deep(.el-badge__content) { margin-left: 4px; }

.tab-stats {
  padding: 10px 16px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.tab-stats strong {
  font-family: ui-monospace, monospace;
}

/* 筛选条 */
.filter-card { margin-bottom: 14px; }
.filter-card :deep(.el-card__body) { padding: 12px 16px; }
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-label { font-size: 12px; color: var(--text-muted); }
.spacer { flex: 1; }
.legend { display: flex; gap: 4px; }

/* 内容区 */
.tab-body { min-height: 300px; }
.cards-list { display: flex; flex-direction: column; gap: 12px; }

/* 已处理 list */
.processed-list {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.proc-row {
  display: grid;
  grid-template-columns: 110px 56px 80px 1fr 90px 60px 60px;
  gap: 10px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line-soft);
  font-size: 12px;
}
@media (max-width: 767px) {
  .proc-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .filter-row { gap: 6px; }
  .filter-row .el-select { width: 100% !important; }
  .tl-tabs :deep(.el-tabs__item) { padding: 0 12px !important; font-size: 13px; }
  .cards-list { gap: 10px; }
}
.proc-row:last-child { border-bottom: none; }
.proc-row:hover { background: #fafbfc; }
.proc-time {
  font-family: ui-monospace, monospace;
  color: var(--text-muted);
  font-size: 11px;
}
.proc-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.proc-body strong {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proc-sub {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.entity {
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
}
.kw {
  color: var(--primary);
  font-style: italic;
}
.source {
  color: #6366f1;
}
</style>
