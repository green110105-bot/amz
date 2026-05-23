<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import { useSuggestions, useManualChanges, useStrategies } from '../composables/useAdsState';
import { usePortfolios } from '../composables/useLxState';
import { campaignReportApi, searchTermsReportApi } from '../api/ads-reports';
import { ref } from 'vue';
import { useViewport } from '../composables/useViewport';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();

const STRATEGY_CATEGORIES = [
  { id: 'lifecycle', label: 'A · 生命周期', emoji: '🌱', color: '#10b981' },
  { id: 'category', label: 'B · 类目', emoji: '🏷', color: '#3b82f6' },
  { id: 'bidding', label: 'C · 出价', emoji: '💰', color: '#f59e0b' },
  { id: 'budget', label: 'D · 预算', emoji: '📊', color: '#8b5cf6' },
  { id: 'keyword', label: 'E · 关键词', emoji: '🔍', color: '#06b6d4' },
  { id: 'competitor', label: 'F · 竞品攻防', emoji: '⚔', color: '#ef4444' },
  { id: 'structure', label: 'G · 广告结构', emoji: '🏗', color: '#a855f7' },
  { id: 'cross-module', label: 'H · 跨模块联动', emoji: '🔗', color: '#ec4899' },
  { id: 'anomaly', label: 'I · 异常护栏', emoji: '🛡', color: '#dc2626' },
];

const router = useRouter();

const { list: suggestions, fetch: fetchSuggestions } = useSuggestions();
const { list: manualChanges, fetch: fetchManual } = useManualChanges();
const { list: strategies, kpi: stratKpi, fetch: fetchStrategies } = useStrategies();
const { list: portfolios, fetch: fetchPortfolios } = usePortfolios();

const campaignReport = ref([]);
const searchTermsReport = ref([]);

async function loadReports() {
  try {
    const [cr, st] = await Promise.all([
      campaignReportApi.list().catch(() => []),
      searchTermsReportApi.list().catch(() => []),
    ]);
    campaignReport.value = Array.isArray(cr) ? cr : [];
    searchTermsReport.value = Array.isArray(st) ? st : [];
  } catch {}
}

onMounted(async () => {
  await Promise.all([
    fetchSuggestions(),
    fetchManual(),
    fetchStrategies(),
    fetchPortfolios(),
    loadReports(),
  ]);
});

const kpi = computed(() => {
  const totalSpend = campaignReport.value.reduce((s, r) => s + (r.spend || 0), 0);
  const totalSales = campaignReport.value.reduce((s, r) => s + (r.sales || 0), 0);
  const activeCmp = campaignReport.value.filter((c) => c.state === '启用').length;
  return {
    spend: totalSpend,
    sales: totalSales,
    acos: totalSales > 0 ? totalSpend / totalSales : 0,
    roas: totalSpend > 0 ? totalSales / totalSpend : 0,
    activeCmp,
    portfolios: portfolios.value.length,
  };
});

const pendingSugs = computed(() => suggestions.value.filter((s) => s.state === 'pending'));
const pendingManual = computed(() => manualChanges.value.filter((m) => m.state === 'pending'));

const wasteCount = computed(() => searchTermsReport.value.filter((s) => s.signal === 'waste').length);
const harvestCount = computed(() => searchTermsReport.value.filter((s) => s.signal === 'harvest').length);
const wasteSpend = computed(() => searchTermsReport.value.filter((s) => s.signal === 'waste').reduce((s, r) => s + (r.spend || 0), 0));

const topPending = computed(() => pendingSugs.value.slice(0, 4));

const topCategoryStats = computed(() => {
  return STRATEGY_CATEGORIES.map((c) => ({
    ...c,
    enabled: strategies.value.filter((s) => s.category === c.id && s.enabled).length,
    total: strategies.value.filter((s) => s.category === c.id).length,
    triggered: strategies.value.filter((s) => s.category === c.id).reduce((sum, s) => sum + (s.triggerCount || 0), 0),
  }));
});

function go(r) { router.push(r); }
</script>

<template>
  <div class="ads-hub">
    <PageHeader
      title="广告 (M3) 总览"
      subtitle="AI 时间线 + 策略库 + 领星等价 三体合一 · 所有写操作收口审计中心"
    >
      <template #extra>
        <el-tag size="default" type="success" effect="dark">SP-API · 已同步 14:00</el-tag>
        <el-tag size="default" type="info" effect="plain">Ads-API · 已同步</el-tag>
      </template>
    </PageHeader>

    <!-- 顶部 6 KPI -->
    <div class="kpi-strip">
      <div class="kpi-cell">
        <span class="kl">7d 总花费</span>
        <strong class="kv">{{ formatCurrency(kpi.spend, 'USD') }}</strong>
      </div>
      <div class="kpi-cell">
        <span class="kl">7d 总销售</span>
        <strong class="kv success">{{ formatCurrency(kpi.sales, 'USD') }}</strong>
      </div>
      <div class="kpi-cell">
        <span class="kl">加权 ACOS</span>
        <strong class="kv" :class="kpi.acos > 0.4 ? 'warn' : 'success'">{{ formatPercent(kpi.acos) }}</strong>
      </div>
      <div class="kpi-cell">
        <span class="kl">加权 ROAS</span>
        <strong class="kv success">{{ kpi.roas.toFixed(2) }}</strong>
      </div>
      <div class="kpi-cell">
        <span class="kl">启用 Campaign</span>
        <strong class="kv">{{ kpi.activeCmp }}/{{ campaignReport.length }}</strong>
      </div>
      <div class="kpi-cell">
        <span class="kl">Portfolio</span>
        <strong class="kv">{{ kpi.portfolios }}</strong>
      </div>
    </div>

    <!-- 三体并列 -->
    <el-row :gutter="16" class="trinity">
      <!-- 1. AI 时间线 -->
      <el-col :xs="24" :sm="24" :md="8">
        <el-card shadow="hover" class="t-card timeline-card" @click="go('/ads/timeline')">
          <template #header>
            <div class="t-head">
              <el-icon class="t-icon" :size="20"><Clock /></el-icon>
              <strong>AI 时间线</strong>
              <span class="t-sub">差异化层</span>
              <span class="spacer" />
              <el-icon><Right /></el-icon>
            </div>
          </template>
          <div class="t-body">
            <div class="t-metric">
              <strong class="t-big">{{ pendingSugs.length }}</strong>
              <span class="t-mt">待处理 AI 建议</span>
            </div>
            <div class="t-metric">
              <strong class="t-big">{{ pendingManual.length }}</strong>
              <span class="t-mt">外部更改待评价</span>
            </div>
            <ul class="t-list">
              <li v-for="s in topPending.slice(0, 3)" :key="s.id">
                <span class="sev" :style="{ background: s.severity?.color || '#94a3b8' }">{{ s.severity?.label }}</span>
                <span class="li-title">{{ (s.title || '').replace('建议：', '') }}</span>
              </li>
            </ul>
          </div>
        </el-card>
      </el-col>

      <!-- 2. 策略库 -->
      <el-col :xs="24" :sm="24" :md="8">
        <el-card shadow="hover" class="t-card strategy-card" @click="go('/ads/strategies')">
          <template #header>
            <div class="t-head">
              <el-icon class="t-icon" :size="20"><MagicStick /></el-icon>
              <strong>策略库</strong>
              <span class="t-sub">总控</span>
              <span class="spacer" />
              <el-icon><Right /></el-icon>
            </div>
          </template>
          <div class="t-body">
            <div class="t-metric">
              <strong class="t-big">{{ stratKpi.enabled }}/{{ stratKpi.total }}</strong>
              <span class="t-mt">启用 / 总数</span>
            </div>
            <div class="t-metric">
              <strong class="t-big success">{{ stratKpi.totalTriggered }}</strong>
              <span class="t-mt">累计触发 · 成功率 {{ (stratKpi.avgSuccessRate * 100).toFixed(0) }}%</span>
            </div>
            <div class="cat-mini">
              <div
                v-for="c in topCategoryStats"
                :key="c.id"
                class="cat-mini-item"
                :style="{ borderLeftColor: c.color }"
              >
                <span class="cm-emoji">{{ c.emoji }}</span>
                <span class="cm-count">{{ c.enabled }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 3. 领星等价 -->
      <el-col :xs="24" :sm="24" :md="8">
        <el-card shadow="hover" class="t-card lx-card" @click="go('/ads/lx/portfolios')">
          <template #header>
            <div class="t-head">
              <el-icon class="t-icon" :size="20"><OfficeBuilding /></el-icon>
              <strong>广告组合 (领星等价)</strong>
              <span class="t-sub">操作面</span>
              <span class="spacer" />
              <el-icon><Right /></el-icon>
            </div>
          </template>
          <div class="t-body">
            <div class="t-metric">
              <strong class="t-big">{{ kpi.portfolios }}</strong>
              <span class="t-mt">Portfolio · {{ campaignReport.length }} Campaign</span>
            </div>
            <div class="t-metric">
              <strong class="t-big">22 列</strong>
              <span class="t-mt">完整指标 + 11 子 tab</span>
            </div>
            <ul class="t-list">
              <li v-for="p in portfolios.slice(0, 3)" :key="p.id">
                <span class="li-bar" />
                <span class="li-title">{{ p.name }}</span>
                <span class="li-stat">{{ formatCurrency(p.spend || 0, 'USD') }}</span>
              </li>
            </ul>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 信号警报 -->
    <h3 class="sec-title">今天值得看的</h3>
    <el-row :gutter="12" class="signals">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="signal waste" @click="go('/ads/reports/search-terms')">
          <span class="sig-emoji">💸</span>
          <div>
            <strong>{{ wasteCount }} 个浪费搜索词</strong>
            <span class="sig-sub">已浪费 {{ formatCurrency(wasteSpend, 'USD') }} · 一键加否定</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="signal harvest" @click="go('/ads/reports/search-terms')">
          <span class="sig-emoji">⭐</span>
          <div>
            <strong>{{ harvestCount }} 个可升手动</strong>
            <span class="sig-sub">符合 GROWTH-1 收割条件</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="signal review" @click="go('/ads/timeline')">
          <span class="sig-emoji">⚠</span>
          <div>
            <strong>1 个外部高风险更改</strong>
            <span class="sig-sub">admin 在 Amazon 后台提预算 +100%</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="signal cross" @click="go('/ads/timeline')">
          <span class="sig-emoji">🔗</span>
          <div>
            <strong>1 条跨模块建议</strong>
            <span class="sig-sub">广告问题真因在 listing</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 待处理建议预览（仅前 4 条）-->
    <h3 class="sec-title">🤖 今日 AI 建议预览（前 4 条）</h3>
    <div class="prev-list">
      <div
        v-for="s in topPending"
        :key="s.id"
        class="prev-row"
        @click="go('/ads/timeline')"
      >
        <el-tag size="small" effect="dark" :style="{ background: s.severity?.color, borderColor: s.severity?.color }">{{ s.severity?.label }}</el-tag>
        <el-tag size="small" effect="plain">{{ s.actionType?.label }}</el-tag>
        <el-tag v-if="s.crossModule" size="small" type="warning" effect="dark">🔗 跨 {{ s.crossModule }}</el-tag>
        <div class="prev-body">
          <strong>{{ s.title }}</strong>
          <span class="prev-sub">{{ s.summary }}</span>
        </div>
        <span class="prev-impact">{{ s.impact?.label }}</span>
        <span class="prev-source">来源 · {{ s.sourceStrategyName }}</span>
      </div>
      <el-button link type="primary" @click="go('/ads/timeline')" style="margin-top: 8px">
        查看全部 {{ pendingSugs.length }} 条 →
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.ads-hub { padding-bottom: 24px; }

.kpi-strip {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1px;
  background: #e5e7eb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 20px;
}
@media (max-width: 767px) {
  .kpi-strip { grid-template-columns: repeat(2, 1fr); }
  .prev-row { grid-template-columns: 1fr !important; gap: 4px !important; }
  .prev-impact, .prev-source { text-align: left !important; }
}
.kpi-cell {
  background: #fff;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kl { font-size: 11px; color: var(--text-muted); }
.kv { font-size: 22px; font-weight: 700; font-family: ui-monospace, monospace; }
.kv.success { color: #10b981; }
.kv.warn { color: #f59e0b; }

.trinity { margin-bottom: 20px; }
.t-card { cursor: pointer; transition: all 0.15s; height: 100%; }
.t-card:hover { transform: translateY(-2px); border-color: var(--primary); }
.t-card :deep(.el-card__header) { padding: 14px 16px; }
.t-card :deep(.el-card__body) { padding: 14px 16px; }
.t-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.t-icon { color: var(--primary); }
.t-head strong { font-size: 14px; }
.t-sub {
  font-size: 11px;
  color: var(--text-muted);
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 3px;
}
.spacer { flex: 1; }

.timeline-card { border-left: 3px solid #8b5cf6; }
.strategy-card { border-left: 3px solid #10b981; }
.lx-card { border-left: 3px solid #3b82f6; }

.t-body { display: flex; flex-direction: column; gap: 12px; }
.t-metric { display: flex; flex-direction: column; gap: 2px; }
.t-big { font-size: 26px; font-weight: 700; font-family: ui-monospace, monospace; line-height: 1.1; }
.t-big.success { color: #10b981; }
.t-mt { font-size: 11px; color: var(--text-muted); }

.t-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.t-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 0;
  border-top: 1px dashed var(--line-soft);
}
.t-list li:first-child { padding-top: 8px; }
.sev {
  font-size: 9px;
  color: #fff;
  padding: 1px 5px;
  border-radius: 2px;
  font-weight: 600;
}
.li-bar { width: 3px; height: 16px; background: #3b82f6; border-radius: 2px; }
.li-title { flex: 1; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.li-stat { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-muted); }

.cat-mini {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px 0 0;
  border-top: 1px dashed var(--line-soft);
}
.cat-mini-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 8px;
  background: #fafbfc;
  border-left: 3px solid;
  border-radius: 3px;
}
.cm-emoji { font-size: 14px; }
.cm-count {
  font-size: 11px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  color: var(--text);
}

.sec-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin: 0 0 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.signals { margin-bottom: 24px; }
.signal {
  cursor: pointer;
  transition: all 0.15s;
  border-left: 4px solid var(--line);
}
.signal :deep(.el-card__body) {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.signal.waste { border-left-color: #ef4444; }
.signal.harvest { border-left-color: #10b981; }
.signal.review { border-left-color: #f59e0b; }
.signal.cross { border-left-color: #8b5cf6; }
.signal:hover { transform: translateY(-2px); }
.sig-emoji { font-size: 32px; }
.signal strong { display: block; font-size: 15px; }
.sig-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; display: block; }

.prev-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.prev-row {
  display: grid;
  grid-template-columns: 50px 90px auto 1fr 140px 200px;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.1s;
}
.prev-row:hover { background: #f9fafb; }
.prev-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.prev-body strong { font-size: 13px; line-height: 1.4; }
.prev-sub { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prev-impact {
  font-size: 12px;
  color: #10b981;
  font-weight: 600;
  text-align: right;
}
.prev-source {
  font-size: 11px;
  color: #6366f1;
  text-align: right;
  background: #ede9fe;
  padding: 2px 8px;
  border-radius: 10px;
}
</style>
