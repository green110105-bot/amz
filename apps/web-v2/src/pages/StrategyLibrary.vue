<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import StrategyCard from '../components/StrategyCard.vue';
import StrategyDetailDrawer from '../components/StrategyDetailDrawer.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useStrategies } from '../composables/useAdsState';
import { useViewport } from '../composables/useViewport';
import { actionQueueApi } from '../api/ads-timeline';
import { confirmAuditAction } from '../composables/useLiveActionGate';
import { ElMessage } from 'element-plus';

const { isMobile } = useViewport();

// M3-P2-19: strategy source label. Strategies carry a source (rule / seed / model); show
// it explicitly so users know whether a strategy is hand-written, seeded demo data, or
// model-generated. Never mislabel seed/mock data as a real model output.
function sourceLabel(source) {
  switch (source) {
    case 'rule': return '来源:规则';
    case 'seed': return '来源:种子数据';
    case 'model': return '来源:模型';
    default: return '来源:未知';
  }
}

const STRATEGY_CATEGORIES = [
  { id: 'lifecycle', label: 'A · 生命周期', emoji: '🌱', color: '#10b981', desc: '按 SKU 阶段触发不同行为' },
  { id: 'category', label: 'B · 类目', emoji: '🏷', color: '#3b82f6', desc: '类目档案 + 季节性 + ACOS 容忍度' },
  { id: 'bidding', label: 'C · 出价', emoji: '💰', color: '#f59e0b', desc: '自动调价 + 分时 + 位置' },
  { id: 'budget', label: 'D · 预算', emoji: '📊', color: '#8b5cf6', desc: '预算分配 / 耗尽 / 上限保护' },
  { id: 'keyword', label: 'E · 关键词', emoji: '🔍', color: '#06b6d4', desc: '收割 / 否定 / 品牌词防御' },
  { id: 'competitor', label: 'F · 竞品攻防', emoji: '⚔', color: '#ef4444', desc: 'ASIN 攻击 / 防御 / 监控' },
  { id: 'structure', label: 'G · 广告结构', emoji: '🏗', color: '#a855f7', desc: '结构创建 / 监测 / 演化 (重点)' },
  { id: 'cross-module', label: 'H · 跨模块联动', emoji: '🔗', color: '#ec4899', desc: '库存 / 促销 / Listing / Review' },
  { id: 'anomaly', label: 'I · 异常护栏', emoji: '🛡', color: '#dc2626', desc: '熔断 / 上限 / 紧急刹车' },
];

const route = useRoute();
const router = useRouter();

const { list: allStrategies, kpi, fetch, toggle } = useStrategies();

onMounted(() => { fetch(); });

// URL query 同步
const selectedCat = ref(route.query.cat || 'all');
const searchTerm = ref(route.query.q || '');
const filterSov = ref(route.query.sov || 'all');
const filterStatus = ref(route.query.status || 'all');
const filterScope = ref(route.query.scope || 'all');
const filterCross = ref(route.query.cross === '1');

watch([selectedCat, searchTerm, filterSov, filterStatus, filterScope, filterCross], ([cat, q, sov, status, scope, cross]) => {
  const query = { ...route.query };
  if (cat !== 'all') query.cat = cat; else delete query.cat;
  if (q) query.q = q; else delete query.q;
  if (sov !== 'all') query.sov = sov; else delete query.sov;
  if (status !== 'all') query.status = status; else delete query.status;
  if (scope !== 'all') query.scope = scope; else delete query.scope;
  if (cross) query.cross = '1'; else delete query.cross;
  router.replace({ path: '/ads/strategies', query });
});

const drawerOpen = ref(false);
const selectedStrategy = ref(null);

// 路由 ?focus= 自动打开抽屉
watch([allStrategies, () => route.query.focus], ([list, focus]) => {
  if (focus && list?.length) {
    const found = list.find((s) => s.id === focus);
    if (found) { selectedStrategy.value = found; drawerOpen.value = true; }
  }
}, { immediate: true });

const categoriesWithCount = computed(() => {
  return STRATEGY_CATEGORIES.map((c) => ({
    ...c,
    count: allStrategies.value.filter((s) => s.category === c.id).length,
    enabled: allStrategies.value.filter((s) => s.category === c.id && s.enabled).length,
  }));
});

const filteredStrategies = computed(() => {
  let list = allStrategies.value;
  if (selectedCat.value !== 'all' && selectedCat.value !== 'my' && selectedCat.value !== 'templates') {
    list = list.filter((s) => s.category === selectedCat.value);
  }
  if (filterStatus.value === 'enabled') {
    list = list.filter((s) => s.enabled);
  } else if (filterStatus.value === 'disabled') {
    list = list.filter((s) => !s.enabled);
  }
  if (filterSov.value !== 'all') {
    list = list.filter((s) => s.sovereignty === filterSov.value);
  }
  if (filterScope.value !== 'all') {
    list = list.filter((s) => s.scope === filterScope.value);
  }
  if (filterCross.value) {
    list = list.filter((s) => s.crossModule);
  }
  if (searchTerm.value) {
    const k = searchTerm.value.toLowerCase();
    list = list.filter((s) =>
      (s.name || '').toLowerCase().includes(k) ||
      (s.description || '').toLowerCase().includes(k) ||
      ((s.trigger && s.trigger.condition) || '').toLowerCase().includes(k)
    );
  }
  return list;
});

function viewDetail(s) {
  selectedStrategy.value = s;
  drawerOpen.value = true;
}

async function toggleStrategy(s) {
  await toggle(s);
}

function selectCat(catId) {
  selectedCat.value = catId;
}

// ----- M3-P2-20: sort / view handlers (no more dead buttons) -----
const sortKey = ref('triggerCount');
function cycleSort() {
  const order = ['triggerCount', 'successRate', 'name'];
  const i = order.indexOf(sortKey.value);
  sortKey.value = order[(i + 1) % order.length];
  ElMessage.info(`已按 ${({ triggerCount: '触发次数', successRate: '成功率', name: '名称' })[sortKey.value]} 排序`);
}
const viewMode = ref('grid');
function toggleView() {
  viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid';
}

// ----- M3-P1-14 / strategy-apply-dryrun: apply a strategy via a dryRun preview -----
// Applying a strategy NEVER writes directly. It first shows a dryRun preview (affected
// entities + expected change), and only on confirmation enqueues into ad_action_queue
// (dryRun=1, needs_review, auditRequired). Real store writes are never requested here.
const dryRunPreview = ref(null); // { strategy, affectedEntities, expectedChange }

async function applyStrategy(s) {
  // Build a dryRun preview from the strategy's binding/impact metadata (no write).
  const affectedEntities = s.boundCampaignCount ?? (s.bindings?.length || 0);
  const expectedChange = s.expectedChange || s.impact?.label || '预计影响待 dryRun 评估';
  dryRunPreview.value = { strategy: s, affectedEntities, expectedChange };
}

function cancelPreview() {
  dryRunPreview.value = null;
}

// triggerAdsAction: the single enqueue path for a strategy apply (gated boundary).
async function triggerAdsAction(strategy) {
  return actionQueueApi.enqueue({
    sourceStrategyName: strategy.name,
    entity: { kind: 'strategy', id: strategy.id, name: strategy.name },
    typedAction: {
      actionPrimitive: 'APPLY_STRATEGY',
      sourceSurface: 'strategy-library',
      entityKind: 'strategy',
      currentValue: { enabled: strategy.enabled },
      recommendedValue: { applied: true },
      dryRun: true,
      auditRequired: true,
      requiresRealStoreWrite: false,
    },
    guardrail: { status: 'needs_review', reasons: ['strategy_apply_requires_action_queue'] },
  });
}

async function confirmApply() {
  if (!dryRunPreview.value) return;
  const s = dryRunPreview.value.strategy;
  if (!confirmAuditAction('应用策略', dryRunPreview.value.affectedEntities)) return;
  try {
    const res = await triggerAdsAction(s);
    if (res?.queued) ElMessage.success('已加入执行篮(ad_action_queue · needs_review)待批准生效');
  } catch (e) {
    ElMessage.error('入队失败：' + (e?.message || e));
  } finally {
    dryRunPreview.value = null;
  }
}
</script>

<template>
  <MobileFallback
    v-if="isMobile"
    page-name="策略库 · AI 建议总控"
    reason="72 条策略 / 9 大类 / 策略详情含多 tab 与图表，建议在桌面端配置。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <p style="margin: 0">9 大类 — 生命周期 / 类目 / 出价 / 预算 / 关键词 / 竞品 / 广告结构 / 跨模块 / 异常护栏。</p>
        <el-button type="primary" style="margin-top: 16px; width: 100%" @click="$router.push('/workbench')">返回工作台</el-button>
      </el-card>
    </template>
  </MobileFallback>
  <div v-else class="strategy-library">
    <PageHeader
      title="策略库 · AI 建议总控"
      subtitle="72 条策略 · 9 大类 · 每条策略是 AI 建议的'水龙头' · 启用即生效"
    >
      <template #extra>
        <el-button :icon="'Connection'" disabled title="即将上线">模板库</el-button>
        <el-button :icon="'Upload'" disabled title="即将上线">导入</el-button>
        <el-button type="primary" :icon="'Plus'" disabled title="即将上线">新建策略</el-button>
      </template>
    </PageHeader>

    <!-- 顶部 KPI -->
    <el-row :gutter="12" class="kpi-row">
      <el-col :xs="12" :sm="8" :md="5">
        <KpiCard label="启用策略" :value="kpi.enabled" :hint="`共 ${kpi.total} 条`" status="success" icon="VideoPlay" />
      </el-col>
      <el-col :xs="12" :sm="8" :md="5">
        <KpiCard label="暂停" :value="kpi.paused" hint="可启用" icon="VideoPause" />
      </el-col>
      <el-col :xs="12" :sm="8" :md="5">
        <KpiCard label="累计触发" :value="kpi.totalTriggered" hint="过去 30 天" icon="TrendCharts" />
      </el-col>
      <el-col :xs="12" :sm="12" :md="5">
        <KpiCard label="平均成功率" :value="(kpi.avgSuccessRate * 100).toFixed(1) + '%'" status="success" icon="CircleCheck" />
      </el-col>
      <el-col :xs="24" :sm="12" :md="4">
        <KpiCard label="跨模块策略" :value="kpi.crossModuleCount" hint="联动 M1/M2/M4" status="warning" icon="Connection" />
      </el-col>
    </el-row>

    <!-- 筛选条 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input v-model="searchTerm" :prefix-icon="'Search'" placeholder="搜索策略名 / 描述 / 触发条件" style="width: 280px" clearable />

        <el-radio-group v-model="filterStatus" size="default">
          <el-radio-button value="all">全部状态</el-radio-button>
          <el-radio-button value="enabled">启用</el-radio-button>
          <el-radio-button value="disabled">暂停</el-radio-button>
        </el-radio-group>

        <el-select v-model="filterSov" placeholder="主权" style="width: 120px" size="default">
          <el-option label="全部主权" value="all" />
          <el-option label="手动" value="manual" />
          <el-option label="半自动" value="semi" />
          <el-option label="全自动" value="auto" />
        </el-select>

        <el-select v-model="filterScope" placeholder="层级" style="width: 130px" size="default">
          <el-option label="全部层级" value="all" />
          <el-option label="账号级" value="account" />
          <el-option label="Portfolio 级" value="portfolio" />
          <el-option label="Campaign 级" value="campaign" />
        </el-select>

        <el-checkbox v-model="filterCross">仅跨模块</el-checkbox>
      </div>
    </el-card>

    <!-- 主体：左目录 + 右网格 -->
    <div class="main">
      <!-- 左侧类目 -->
      <aside class="catalog">
        <div
          class="cat-item"
          :class="{ active: selectedCat === 'all' }"
          @click="selectCat('all')"
        >
          <span class="cat-emoji">📚</span>
          <span class="cat-label">全部</span>
          <span class="cat-count">{{ allStrategies.length }}</span>
        </div>
        <div class="cat-divider" />
        <div
          v-for="c in categoriesWithCount"
          :key="c.id"
          class="cat-item"
          :class="{ active: selectedCat === c.id }"
          @click="selectCat(c.id)"
        >
          <span class="cat-emoji">{{ c.emoji }}</span>
          <div class="cat-meta">
            <span class="cat-label">{{ c.label }}</span>
            <span class="cat-desc">{{ c.desc }}</span>
          </div>
          <div class="cat-stats">
            <span class="cat-count" :style="{ background: c.color + '15', color: c.color }">{{ c.count }}</span>
            <span class="cat-on">● {{ c.enabled }}</span>
          </div>
        </div>
        <div class="cat-divider" />
        <!-- M3-P2-20: 未实现入口置灰 + tooltip(不再伪造可点) -->
        <div class="cat-item disabled" title="即将上线">
          <span class="cat-emoji">👤</span>
          <span class="cat-label">我创建的</span>
          <span class="cat-count">—</span>
        </div>
        <div class="cat-item disabled" title="即将上线">
          <span class="cat-emoji">📦</span>
          <span class="cat-label">模板库</span>
          <span class="cat-count">—</span>
        </div>
      </aside>

      <!-- 右侧网格 -->
      <main class="grid-area">
        <div class="grid-head">
          <h3 class="grid-title">
            <span v-if="selectedCat === 'all'">全部策略</span>
            <span v-else>{{ categoriesWithCount.find(c => c.id === selectedCat)?.label || '—' }}</span>
            <span class="grid-count">· {{ filteredStrategies.length }} 条</span>
          </h3>
          <div class="grid-actions">
            <el-button :icon="'Sort'" size="small" @click="cycleSort">排序</el-button>
            <el-button :icon="'Operation'" size="small" @click="toggleView">视图</el-button>
          </div>
        </div>

        <!-- M3-P1-14 / strategy-apply-dryrun: dryRun preview before any enqueue -->
        <div v-if="dryRunPreview" class="dryrun-preview">
          <div class="dp-head">
            <strong>应用策略预览(dryRun)· {{ dryRunPreview.strategy.name }}</strong>
          </div>
          <div class="dp-body">
            <p>影响实体数(affectedEntities):<strong>{{ dryRunPreview.affectedEntities }}</strong></p>
            <p>预期变化(expectedChange):<strong>{{ dryRunPreview.expectedChange }}</strong></p>
            <p class="dp-note">
              确认后将进入 ad_action_queue 审计工单(guardrail status: needs_review,
              auditRequired),dryRun 默认开启,不会立即真实生效。
            </p>
          </div>
          <div class="dp-actions">
            <el-button size="small" @click="cancelPreview">取消</el-button>
            <el-button size="small" type="primary" @click="confirmApply">确认入队(dryRun)</el-button>
          </div>
        </div>

        <div v-if="!filteredStrategies.length" class="empty">
          <el-icon :size="40"><Search /></el-icon>
          <p>没有匹配的策略</p>
          <el-button type="primary" link size="small" @click="searchTerm = ''; filterStatus = 'all'; filterSov = 'all'; filterScope = 'all'; filterCross = false">清除筛选</el-button>
        </div>

        <div class="grid" v-else :class="viewMode === 'list' ? 'grid--list' : ''">
          <div v-for="s in filteredStrategies" :key="s.id" class="strategy-cell">
            <!-- M3-P2-19: per-strategy source label (rule / seed / model) -->
            <span class="source-label">{{ sourceLabel(s.source) }}</span>
            <StrategyCard
              :strategy="s"
              @view-detail="viewDetail"
              @toggle="toggleStrategy"
              @apply="applyStrategy(s)"
            />
          </div>
        </div>
      </main>
    </div>

    <!-- 详情抽屉 -->
    <StrategyDetailDrawer
      v-model="drawerOpen"
      :strategy="selectedStrategy"
      @toggle="toggleStrategy"
    />
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 12px; }

.filter-card { margin-bottom: 16px; }
.filter-card :deep(.el-card__body) { padding: 14px 16px; }
.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.main {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
}

/* 左目录 */
.catalog {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 0;
  height: fit-content;
  position: sticky;
  top: 0;
}
.cat-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.1s;
  border-left: 3px solid transparent;
}
.cat-item:hover {
  background: #f9fafb;
}
.cat-item.active {
  background: #eef2ff;
  border-left-color: var(--primary);
}
.cat-emoji { font-size: 16px; line-height: 1.4; flex-shrink: 0; }
.cat-meta { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.cat-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.cat-desc {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
}
.cat-stats { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.cat-count {
  background: #f3f4f6;
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
.cat-on {
  font-size: 9px;
  color: #10b981;
}
.cat-divider {
  height: 1px;
  background: var(--line-soft);
  margin: 6px 14px;
}

/* 右网格 */
.grid-area { min-width: 0; }
.grid-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.grid-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.grid-count {
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 6px;
}
.grid-actions { display: flex; gap: 6px; }

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (max-width: 1400px) { .grid { grid-template-columns: 1fr; } }

@media (max-width: 767px) {
  .main { grid-template-columns: 1fr; }
  .catalog { position: static; }
  .filter-row .el-input,
  .filter-row .el-select { width: 100% !important; }
  .grid { grid-template-columns: 1fr; }
}

.empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted);
}
.empty p { margin: 14px 0; font-size: 14px; }
</style>
