<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePortfolios, useCampaigns } from '../../composables/useLxState';
import { realWritesEnabled, confirmAuditAction } from '../../composables/useLiveActionGate.js';
import { actionQueueApi } from '../../api/ads-timeline';
import AiActivityBanner from '../../components/AiActivityBanner.vue';
import BulkCsvDialog from '../../components/BulkCsvDialog.vue';
import ResponsiveTable from '../../components/ResponsiveTable.vue';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { useAudit } from '../../composables/useAudit';
import { useViewport } from '../../composables/useViewport';

const { isMobile } = useViewport();
const mobileCampaignCols = [
  { prop: 'name', label: '广告活动' },
  { prop: 'type', label: '类型' },
  { prop: 'dailyBudget', label: '预算', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v ? (v * 100).toFixed(2) + '%' : '--' },
];

const { submit } = useAudit();
const csvDialogOpen = ref(false);
const selectedRows = ref([]);

const route = useRoute();
const router = useRouter();

const portfolioId = computed(() => route.params.id);

const { list: portfolios, fetch: fetchPortfolios, getById: getPortfolio } = usePortfolios();
const { list: campaigns, fetch: fetchCampaigns, toggle: toggleCampaign, setBudget } = useCampaigns(portfolioId.value);

onMounted(async () => {
  await fetchPortfolios();
  await fetchCampaigns();
});

watch(portfolioId, async (id) => {
  if (id) {
    const { fetch } = useCampaigns(id);
    await fetch();
  }
});

const portfolio = computed(() => getPortfolio(portfolioId.value) || portfolios.value.find((p) => p.id === portfolioId.value));
const rows = computed(() => campaigns.value);

function onSelectionChange(rows) {
  selectedRows.value = rows;
}

async function bulkCopy() {
  if (!selectedRows.value.length) return ElMessage.warning('请先选择行');
  try {
    await ElMessageBox.confirm(
      `确定复制选中的 ${selectedRows.value.length} 个 Campaign？复制后将出现在本组合下，名字带 -copy 后缀。`,
      '批量复制',
      { confirmButtonText: '复制', cancelButtonText: '取消', type: 'warning' }
    );
  } catch { return; }
  for (const r of selectedRows.value) {
    await submit({
      sourceModule: 'M3',
      actionType: 'COPY_CAMPAIGN',
      target: { type: 'campaign', id: r.id },
      payload: { source: r.name, copyName: `${r.name}-copy` },
      description: `批量复制 Campaign：${r.name} → ${r.name}-copy`,
    });
  }
  ElMessage.success(`已复制 ${selectedRows.value.length} 个 Campaign · 已进审计中心`);
  selectedRows.value = [];
}

// m3-button-level / lx-portfolio-action / M3-P1-17: pause is a real Ads write — it must
// confirm via the shared audit gate and funnel through ad_action_queue (dryRun +
// needs_review + auditRequired). It MUST NOT call the direct toggle write path.
const realWrites = computed(() => realWritesEnabled());
const pauseHint = computed(() =>
  realWrites.value
    ? '暂停将进入 ad_action_queue 审计工单(needs_review),dryRun 默认开启'
    : '当前为 dryRun(演示)模式,暂停仅入队审计,不会真实生效'
);

async function enqueuePause(r) {
  return actionQueueApi.enqueue({
    sourceStrategyName: 'LxPortfolioDetail manual pause',
    entity: { kind: 'campaign', id: r.id, name: r.name },
    typedAction: {
      actionPrimitive: 'PAUSE_CAMPAIGN',
      sourceSurface: 'lx',
      entityKind: 'campaign',
      currentValue: { enabled: true },
      recommendedValue: { enabled: false },
      dryRun: true,
      auditRequired: true,
      requiresRealStoreWrite: false,
    },
    guardrail: { status: 'needs_review', reasons: ['manual_lx_write_requires_action_queue'] },
  });
}

async function bulkPause() {
  const targets = selectedRows.value.filter((r) => r.enabled);
  if (!targets.length) { ElMessage.info('请选择启用中的广告活动'); return; }
  if (!confirmAuditAction('暂停广告活动', targets.length)) return;
  let ok = 0, fail = 0;
  for (const r of targets) {
    try {
      const res = await enqueuePause(r);
      if (res && res.duplicate !== true && res.queued === false) fail++; else ok++;
    } catch { fail++; }
  }
  ElMessage.success(`已加入执行篮待批准生效:成功 ${ok} 项,失败 ${fail} 项`);
  selectedRows.value = [];
}

async function pauseOne(r) {
  if (!r.enabled) { ElMessage.info('该广告活动已暂停'); return; }
  if (!confirmAuditAction('暂停广告活动', 1)) return;
  try {
    const res = await enqueuePause(r);
    if (res?.queued) ElMessage.success('已加入执行篮待批准生效');
  } catch (e) {
    ElMessage.error('入队失败：' + (e?.message || e));
  }
}

const bulkBudgetDialogOpen = ref(false);
const bulkBudgetAction = ref({ mode: 'pct', value: 10 });

function openBulkBudget() {
  if (!selectedRows.value.length) return ElMessage.warning('请先选择行');
  bulkBudgetDialogOpen.value = true;
}

async function applyBulkBudget() {
  for (const r of selectedRows.value) {
    let next;
    if (bulkBudgetAction.value.mode === 'pct') {
      next = Math.round((r.dailyBudget || 0) * (1 + bulkBudgetAction.value.value / 100));
    } else {
      next = bulkBudgetAction.value.value;
    }
    await setBudget(r, next);
  }
  await submit({
    sourceModule: 'M3',
    actionType: 'BULK_CHANGE_BUDGET',
    target: { type: 'campaign', count: selectedRows.value.length },
    payload: { mode: bulkBudgetAction.value.mode, value: bulkBudgetAction.value.value },
    description: `批量改预算 ${selectedRows.value.length} 个 Campaign · ${bulkBudgetAction.value.mode === 'pct' ? `× ${1 + bulkBudgetAction.value.value / 100}` : `= $${bulkBudgetAction.value.value}`}`,
  });
  ElMessage.success(`已改 ${selectedRows.value.length} 个预算`);
  bulkBudgetDialogOpen.value = false;
  selectedRows.value = [];
}

const filterDateRange = ref([new Date('2026-05-13'), new Date('2026-05-13')]);
const filterAdType = ref('all');
const filterMsku = ref('all');
const filterState = ref('all');
const filterName = ref('');

const showCompare = ref(false);
const hideChart = ref(false);

function gotoCampaign(row) {
  router.push(`/ads/lx/campaigns/${row.id}?g=ad-groups`);
}

async function onCampaignSwitch(row, value) {
  await toggleCampaign(row, value);
}

async function onBudgetChange(row, value, oldValue) {
  await setBudget(row, value, oldValue);
}

const totals = computed(() => {
  if (!portfolio.value) return null;
  return {
    clicks: portfolio.value.clicks ?? 0,
    spend: portfolio.value.spend ?? 0,
    sales: portfolio.value.sales ?? 0,
    acos: portfolio.value.acos ?? 0,
  };
});

// 简化 SVG 趋势图（双轴）
function makeTrend() {
  const days = 7;
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    data.push({
      d: i,
      spend: 8 + Math.random() * 18,
      acos: 0.2 + Math.random() * 0.3,
    });
  }
  return data;
}
const trendData = makeTrend();

const trendPath = computed(() => {
  const max = Math.max(...trendData.map((x) => x.spend));
  const points = trendData.map((p, i) => {
    const x = (i / (trendData.length - 1)) * 900 + 30;
    const y = 180 - (p.spend / max) * 140 + 10;
    return `${x},${y}`;
  });
  return 'M ' + points.join(' L ');
});
const trendAcosPath = computed(() => {
  const points = trendData.map((p, i) => {
    const x = (i / (trendData.length - 1)) * 900 + 30;
    const y = 180 - p.acos * 280 + 10;
    return `${x},${y}`;
  });
  return 'M ' + points.join(' L ');
});
</script>

<template>
  <div v-if="portfolio" class="lx2-page">
    <!-- 顶部面包屑 + 标题 -->
    <div class="lx2-header">
      <span class="crumb">广告组合 -</span>
      <strong class="title">{{ portfolio.name }}</strong>
    </div>

    <!-- m3-button-level / lx-portfolio-action: dryRun banner when real writes not enabled -->
    <div v-if="!realWrites" class="dryrun-banner">
      <span>dryRun(演示)模式 · 暂停仅进入 ad_action_queue 审计(needs_review),不会真实生效</span>
    </div>

    <!-- 筛选条 -->
    <div class="filter-bar">
      <el-date-picker
        v-model="filterDateRange"
        type="daterange"
        range-separator="-"
        size="default"
        style="width: 240px"
      />
      <el-select v-model="filterAdType" size="default" style="width: 140px">
        <el-option label="全部广告类型" value="all" />
        <el-option label="SP" value="SP" />
        <el-option label="SB" value="SB" />
        <el-option label="SD" value="SD" />
      </el-select>
      <el-select v-model="filterMsku" size="default" style="width: 140px">
        <el-option label="全部MSKU" value="all" />
      </el-select>
      <el-select v-model="filterState" size="default" style="width: 140px">
        <el-option label="全部状态" value="all" />
        <el-option label="启用" value="enabled" />
        <el-option label="已暂停" value="paused" />
      </el-select>
      <el-input v-model="filterName" placeholder="请输入广告活动" size="default" style="width: 200px" clearable />
      <el-button type="primary">查询</el-button>
      <el-button plain>重置</el-button>
    </div>

    <!-- AI 活动 banner -->
    <AiActivityBanner :sku="portfolio.sku" scope="portfolio" />

    <!-- 状态行 -->
    <div class="state-row">
      <span class="state-label">状态:</span>
      <span class="state-value serving">正在投放</span>
      <span class="state-label" style="margin-left: 16px">{{ portfolio.budgetCap ? '日预算上限 $' + portfolio.budgetCap : '无预算上限' }}</span>
      <span class="spacer" />
      <a class="link">广告组合设置</a>
    </div>

    <!-- 4 KPI 卡 + 添加指标 -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-bar gray" />
        <div>
          <span class="kpi-label">点击 (总和)</span>
          <strong class="kpi-value">{{ totals.clicks }}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <span class="kpi-bar blue" />
        <div>
          <span class="kpi-label">花费 (总和)</span>
          <strong class="kpi-value">${{ totals.spend.toFixed(2) }}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <span class="kpi-bar gray" />
        <div>
          <span class="kpi-label">广告销售额 (总和)</span>
          <strong class="kpi-value">${{ totals.sales.toFixed(2) }}</strong>
        </div>
      </div>
      <div class="kpi-card">
        <span class="kpi-bar yellow" />
        <div>
          <span class="kpi-label">ACoS (平均)</span>
          <strong class="kpi-value">{{ ((totals.acos ?? 0) * 100).toFixed(2) }}%</strong>
        </div>
      </div>
      <div class="kpi-add">
        + 添加指标
      </div>
    </div>

    <!-- 趋势图 -->
    <div v-if="!hideChart" class="chart-wrap">
      <svg viewBox="0 0 960 200" class="chart">
        <g class="axis-y-left">
          <text x="0" y="20" class="ax">200</text>
          <text x="0" y="60" class="ax">150</text>
          <text x="0" y="100" class="ax">100</text>
          <text x="0" y="140" class="ax">50</text>
          <text x="0" y="190" class="ax">0</text>
        </g>
        <g class="axis-y-right">
          <text x="938" y="20" class="ax">40</text>
          <text x="938" y="60" class="ax">30</text>
          <text x="938" y="100" class="ax">20</text>
          <text x="938" y="140" class="ax">10</text>
          <text x="938" y="190" class="ax">0</text>
        </g>
        <g class="grid">
          <line x1="30" y1="20" x2="930" y2="20" />
          <line x1="30" y1="60" x2="930" y2="60" />
          <line x1="30" y1="100" x2="930" y2="100" />
          <line x1="30" y1="140" x2="930" y2="140" />
          <line x1="30" y1="180" x2="930" y2="180" />
        </g>
        <path :d="trendPath" fill="none" stroke="#3b82f6" stroke-width="2" />
        <circle v-for="(p, i) in trendData" :key="'b' + i" :cx="(i / (trendData.length - 1)) * 900 + 30" :cy="180 - (p.spend / Math.max(...trendData.map(x => x.spend))) * 140 + 10" r="4" fill="#3b82f6" />
        <path :d="trendAcosPath" fill="none" stroke="#f59e0b" stroke-width="2" />
        <circle v-for="(p, i) in trendData" :key="'o' + i" :cx="(i / (trendData.length - 1)) * 900 + 30" :cy="180 - p.acos * 280 + 10" r="4" fill="#f59e0b" />
        <text x="450" y="198" class="ax" text-anchor="middle">05-13</text>
      </svg>
      <div class="chart-legend">
        <span class="lg blue">● 花费</span>
        <span class="lg yellow">● ACoS</span>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar2">
      <el-button type="primary" :icon="'Plus'">添加广告活动 ▾</el-button>
      <el-button :icon="'Files'" @click="csvDialogOpen = true">CSV 批量 ⭐</el-button>
      <span class="spacer" />
      <el-checkbox v-model="showCompare" size="small">环比</el-checkbox>
      <el-button :icon="'Bell'" size="small">对比预警</el-button>
      <el-button size="small" @click="hideChart = !hideChart">{{ hideChart ? '显示图表 ↓' : '隐藏图表 ↑' }}</el-button>
      <el-button :icon="'Operation'" size="small">列配置 ▾</el-button>
      <el-button :icon="'Reading'" size="small" link />
      <el-button :icon="'Download'" size="small" link />
    </div>

    <!-- 批量操作栏（滑入式） -->
    <transition name="bulk-fade">
      <div v-if="selectedRows.length > 0" class="bulk-bar">
        <span class="bulk-info">
          <el-icon><CircleCheckFilled /></el-icon>
          已选 <strong>{{ selectedRows.length }}</strong> 个 Campaign
        </span>
        <span class="spacer" />
        <el-button type="primary" size="small" :icon="'CopyDocument'" @click="bulkCopy">批量复制</el-button>
        <el-button size="small" :icon="'Money'" @click="openBulkBudget">批量改预算</el-button>
        <el-button size="small" :icon="'VideoPause'" type="warning" :title="pauseHint" @click="bulkPause">批量暂停(审计)</el-button>
        <el-button size="small" link type="info" @click="selectedRows = []">取消选择</el-button>
      </div>
    </transition>

    <!-- 广告活动表 (该组合下) -->
    <div class="lx-table-wrap">
      <ResponsiveTable
        :data="rows"
        :mobile-columns="mobileCampaignCols"
        row-clickable
        @row-click="gotoCampaign"
        stripe
        border
        :row-class-name="() => 'clickable'"
        size="small"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="40" fixed />
        <el-table-column label="有效" width="60" fixed>
          <template #default="{ row }">
            <el-switch v-model="row.enabled" size="small" @click.stop @change="(v) => onCampaignSwitch(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="广告类型" width="80" fixed>
          <template #default="{ row }">
            <div class="ad-type">
              <strong>{{ row.type }}</strong>
              <small>[{{ row.targetingType }}]</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="广告活动" prop="name" min-width="220" fixed>
          <template #default="{ row }">
            <a class="link" @click.stop="gotoCampaign(row)">{{ row.name }}</a>
            <div class="cmp-meta">{{ row.startedAt ? row.startedAt.slice(5).replace('-', ':') : '' }} {{ (row.serviceState || '').includes('超预算') ? '超预算' : '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="预算($)" width="100">
          <template #default="{ row }">
            <el-input-number v-model="row.dailyBudget" :precision="2" size="small" :controls="false" style="width: 80px" @click.stop @change="(v, old) => onBudgetChange(row, v, old)" />
          </template>
        </el-table-column>
        <el-table-column label="服务状态" width="120">
          <template #default="{ row }">
            <span :style="{ color: row.serviceStateColor, fontSize: '12px' }">●</span>
            <span style="margin-left: 4px; font-size: 12px">{{ row.serviceState }}</span>
          </template>
        </el-table-column>
        <el-table-column label="曝光量" prop="impressions" width="90" sortable align="right">
          <template #default="{ row }"><span class="num">{{ (row.impressions ?? 0).toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column label="IS" width="60" align="right">
          <template #default>--</template>
        </el-table-column>
        <el-table-column label="点击" prop="clicks" width="70" sortable align="right" />
        <el-table-column label="点击%" prop="clickPct" width="80" sortable align="right">
          <template #default="{ row }">{{ row.clickPct }}%</template>
        </el-table-column>
        <el-table-column label="CTR" prop="ctr" width="70" sortable align="right">
          <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="CPC" prop="cpc" width="70" sortable align="right">
          <template #default="{ row }">${{ (row.cpc ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="花费" prop="spend" width="90" sortable align="right">
          <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="花费%" prop="spendPct" width="80" sortable align="right">
          <template #default="{ row }">{{ row.spendPct }}%</template>
        </el-table-column>
        <el-table-column label="广告销售额" prop="sales" width="110" sortable align="right">
          <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="广告销售额%" prop="salesPct" width="110" sortable align="right">
          <template #default="{ row }">{{ row.salesPct }}%</template>
        </el-table-column>
        <el-table-column label="直接销售额" prop="directSales" width="100" sortable align="right">
          <template #default="{ row }">${{ (row.directSales ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="ACoS" prop="acos" width="80" sortable align="right">
          <template #default="{ row }">
            <span :class="row.acos > 0.5 ? 'danger' : row.acos < 0.3 && row.acos > 0 ? 'good' : ''">
              {{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="广告订单" prop="orders" width="90" sortable align="right" />
        <el-table-column label="直接订单" prop="directOrders" width="90" sortable align="right" />
        <el-table-column label="CPA" prop="cpa" width="80" sortable align="right">
          <template #default="{ row }">{{ row.cpa ? '$' + row.cpa.toFixed(2) : '--' }}</template>
        </el-table-column>
        <el-table-column label="CVR" prop="cvr" width="80" sortable align="right">
          <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="广告笔单价" prop="adUnitPrice" width="100" sortable align="right">
          <template #default="{ row }">${{ (row.adUnitPrice ?? 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="广告销量" prop="adUnits" width="90" sortable align="right" />
        <el-table-column label="标签" width="100">
          <template #default="{ row }">
            <el-tag v-for="t in (row.tags || [])" :key="t" size="small" effect="plain" style="margin: 1px">{{ t }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分析" width="90" fixed="right">
          <template #default>
            <el-icon class="tool-icon"><Histogram /></el-icon>
            <el-icon class="tool-icon"><DataAnalysis /></el-icon>
            <el-icon class="tool-icon"><CopyDocument /></el-icon>
            <el-icon class="tool-icon"><Clock /></el-icon>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click.stop="gotoCampaign(row)">进入详情</el-button>
          <el-button size="small" @click.stop="onCampaignSwitch(row)">{{ row.enabled ? '暂停' : '启用' }}</el-button>
        </template>
      </ResponsiveTable>
    </div>
    <!-- CSV 批量对话框 -->
    <BulkCsvDialog v-model="csvDialogOpen" default-entity="campaign" />

    <!-- 批量改预算对话框 -->
    <ResponsiveDialog v-model="bulkBudgetDialogOpen" title="批量改预算" width="440px">
      <el-form label-width="100px">
        <el-form-item label="修改方式">
          <el-radio-group v-model="bulkBudgetAction.mode">
            <el-radio value="pct">按百分比</el-radio>
            <el-radio value="set">设为固定值</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="bulkBudgetAction.mode === 'pct' ? '变化 %' : '日预算 $'">
          <el-input-number v-model="bulkBudgetAction.value" :step="bulkBudgetAction.mode === 'pct' ? 5 : 10" :precision="bulkBudgetAction.mode === 'pct' ? 0 : 2" />
          <span style="margin-left: 8px; font-size: 12px; color: var(--text-muted)">
            将影响 {{ selectedRows.length }} 个 Campaign · 进审计中心可回滚
          </span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bulkBudgetDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="applyBulkBudget">应用</el-button>
      </template>
    </ResponsiveDialog>
  </div>
  <div v-else style="padding: 40px; color: #9ca3af">广告组合不存在</div>
</template>

<style scoped>
.lx2-page {
  background: #fff;
  border-radius: 4px;
  padding: 12px 14px;
}

.lx2-header {
  padding: 4px 0 12px;
  border-bottom: 1px solid #f3f4f6;
}
.crumb { color: var(--text-muted); font-size: 13px; }
.title { font-size: 15px; font-weight: 600; margin-left: 4px; }

.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
}

.state-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  font-size: 13px;
}
.state-label { color: var(--text-muted); }
.state-value.serving { color: #10b981; font-weight: 600; }
.spacer { flex: 1; }
.link { color: var(--primary); cursor: pointer; font-size: 13px; }
.link:hover { text-decoration: underline; }

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin: 12px 0;
}
@media (max-width: 991px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 767px) {
  .kpi-grid { grid-template-columns: 1fr; gap: 8px; }
  .filter-bar .el-select,
  .filter-bar .el-input,
  .filter-bar .el-date-editor { width: 100% !important; }
  .toolbar2 { flex-wrap: wrap; gap: 6px; }
  .bulk-bar { flex-wrap: wrap; }
  .chart { height: 160px; }
  .lx2-page { padding: 8px; }
}
.kpi-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 12px 14px;
  display: flex;
  gap: 10px;
  align-items: center;
}
.kpi-bar {
  width: 3px;
  height: 36px;
  border-radius: 2px;
}
.kpi-bar.blue { background: #3b82f6; }
.kpi-bar.yellow { background: #f59e0b; }
.kpi-bar.gray { background: #d1d5db; }
.kpi-label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 2px; }
.kpi-value { font-size: 22px; font-weight: 700; font-family: ui-monospace, monospace; }
.kpi-add {
  border: 1px dashed #d1d5db;
  border-radius: 4px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}
.kpi-add:hover { border-color: var(--primary); color: var(--primary); }

.chart-wrap {
  background: #fff;
  padding: 8px 0;
  position: relative;
}
.chart { width: 100%; height: 220px; }
.chart .ax { font-size: 10px; fill: #9ca3af; }
.chart .grid line { stroke: #f3f4f6; stroke-width: 1; }
.chart-legend {
  display: flex;
  justify-content: center;
  gap: 14px;
  font-size: 12px;
  padding-top: 6px;
}
.lg.blue { color: #3b82f6; }
.lg.yellow { color: #f59e0b; }

.toolbar2 {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px dashed #f3f4f6;
  margin-top: 8px;
  flex-wrap: wrap;
}

.bulk-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #eef2ff 0%, #ede9fe 100%);
  border: 1px solid #c7d2fe;
  border-radius: 4px;
  margin-bottom: 10px;
}
.bulk-info { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.bulk-info strong { color: var(--primary); font-size: 15px; }
.bulk-fade-enter-active, .bulk-fade-leave-active { transition: all 0.2s; }
.bulk-fade-enter-from, .bulk-fade-leave-to { opacity: 0; transform: translateY(-4px); }

.lx-table-wrap { overflow-x: auto; }
.lx-table-wrap :deep(.el-table) { font-size: 12px; }
.lx-table-wrap :deep(.el-table th) {
  background: #fafbfc !important;
  color: #6b7280;
  font-weight: 500;
}
.lx-table-wrap :deep(.clickable) { cursor: pointer; }
.lx-table-wrap :deep(.clickable:hover td) { background: #f0f7ff !important; }

.ad-type {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 11px;
}
.ad-type strong { font-size: 12px; }
.ad-type small { color: var(--text-muted); }
.cmp-meta { font-size: 11px; color: #ef4444; margin-top: 2px; }
.link { color: var(--primary); cursor: pointer; }
.num { font-family: ui-monospace, monospace; }
.danger { color: #ef4444; }
.good { color: #10b981; }
.tool-icon {
  margin: 0 2px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
}
.tool-icon:hover { color: var(--primary); }
</style>
