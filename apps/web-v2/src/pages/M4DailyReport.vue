<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { useLocalStore } from '../composables/useLocalStore';
import { dailyReportsApi, amazonDailyApi } from '../api/m4';
import { formatCurrency, formatNumber } from '../utils/format';

const localStore = useLocalStore();

const loading = ref(false);
const error = ref('');
const report = ref(null);
const selectedDate = ref(new Date().toISOString().slice(0, 10));
const fixedTime = ref('09:30');
const selectedStoreId = ref('all');
const selectedLinkId = ref('all');
const dimension = ref('store');
const lastRefreshAt = ref('');

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function money(value, currency = 'USD') {
  return value === null || value === undefined ? '-' : formatCurrency(num(value), currency, 0);
}
function pct(value) {
  return value === null || value === undefined ? '-' : `${(num(value) * 100).toFixed(1)}%`;
}
function deltaLabel(value, suffix = '%') {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) < 0.01) return '持平/无对比';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}${suffix}`;
}
function deltaClass(value, reverse = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) < 0.01) return 'flat';
  const good = reverse ? n < 0 : n > 0;
  return good ? 'up' : 'down';
}
function rankText(value) {
  const n = num(value);
  return n > 0 ? `#${formatNumber(n)}` : '-';
}
function regionEmoji(region) {
  return { US: 'US', UK: 'UK', DE: 'DE', CA: 'CA', JP: 'JP', FR: 'FR' }[region] || 'GL';
}

const availableStores = computed(() =>
  report.value?.availableStores?.length ? report.value.availableStores : (localStore.stores || []),
);
const availableLinks = computed(() => {
  const links = report.value?.availableLinks || [];
  return selectedStoreId.value === 'all' ? links : links.filter((link) => link.storeId === selectedStoreId.value);
});
const sourceMeta = computed(() => report.value?.sourceMeta || {});
const realDataOnly = computed(() => report.value?.filters?.realDataOnly === true);
function sourceMode(meta = {}) {
  if (meta.mock === false) return 'real';
  if (meta.mock === true) return 'mock/hybrid';
  return 'unknown';
}
const summary = computed(() => report.value?.summary || {
  stores: 0,
  unitsSold: 0,
  gmv: 0,
  adSpend: 0,
  acos: 0,
  avgRating: 0,
  alerts: 0,
});
// B-5: 已挽回口径 estimated vs realized 双字段 + 模拟/预估 水印, 对外不混淆。
const recovered = computed(() => report.value?.summary?.recovered || {
  estimated: 0,
  realized: 0,
  estimatedCount: 0,
  realizedCount: 0,
  currency: 'USD',
  simulated: true,
  watermark: '模拟/预估',
  disclaimer: '',
});
// B-6: 定时推送文案 — 时间选择器现在可用, 由其驱动 '每日 {time} 自动生成(需开启调度)'。
const schedulePushText = computed(() => `每日 ${fixedTime.value} 自动生成（需开启调度）`);
const rows = computed(() => {
  const source = dimension.value === 'link' ? (report.value?.links || []) : (report.value?.stores || []);
  return source.map((row) => ({
    ...row,
    displayName: dimension.value === 'link' ? (row.linkTitle || row.title || row.asin || row.sku || '未命名链接') : row.name,
    subName: dimension.value === 'link'
      ? `${row.storeName || row.name || ''} · ${row.asin || '-'} · ${row.sku || '-'}`
      : `${row.region || '-'} · ${row.currency || 'USD'}`,
  }));
});
const trendSeries = computed(() => report.value?.trends || []);
const maxTrend = computed(() => Math.max(1, ...trendSeries.value.map((r) => Math.max(num(r.gmv), num(r.adSpend) * 8))));
const watchItems = computed(() => report.value?.actions || []);
const noData = computed(() => !loading.value && !error.value && rows.value.length === 0);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (!localStore.hydrated) await localStore.hydrate?.();
    report.value = await dailyReportsApi.get({
      date: selectedDate.value,
      storeIds: selectedStoreId.value,
      linkId: selectedLinkId.value,
      snapshot: 'latest',
      fixedTime: fixedTime.value,
      timezone: 'Asia/Shanghai',
    });
    if (selectedLinkId.value !== 'all' && !availableLinks.value.some((link) => link.id === selectedLinkId.value)) {
      selectedLinkId.value = 'all';
    }
    lastRefreshAt.value = new Date().toLocaleString('zh-CN', { hour12: false });
  } catch (e) {
    report.value = null;
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

watch([selectedStoreId, selectedLinkId, selectedDate, fixedTime], () => load());
watch(selectedStoreId, () => {
  selectedLinkId.value = 'all';
});

// ===== Amazon 真实数据区 (领星 productPerformance) =====
const azLoading = ref(false);
const azError = ref('');
const azReport = ref(null);
const azDimension = ref('store');

const azConfigured = computed(() => azReport.value?.configured === true);
const azRealDataOnly = computed(() => azReport.value?.filters?.realDataOnly === true);
const azSummary = computed(() => azReport.value?.summary || {});
const azDelta = computed(() => azReport.value?.summary?.delta || {});
const azStores = computed(() => azReport.value?.stores || []);
const azAsins = computed(() => azReport.value?.asins || []);
const azSeries = computed(() => azReport.value?.dailySeries || []);
const azInsights = computed(() => azReport.value?.insights || {});
const azRisks = computed(() => azReport.value?.insights?.risks || []);
const azRankings = computed(() => azReport.value?.insights?.rankings || {});
const azSourceMeta = computed(() => azReport.value?.sourceMeta || {});
const azCurrency = computed(() => (azSummary.value.currency || 'USD').replace('*', ''));
const azMixedCurrency = computed(() => String(azSummary.value.currency || '').includes('*'));
const azMaxTrend = computed(() => Math.max(1, ...azSeries.value.map((p) => Math.max(num(p.gmv), num(p.adSpend) * 8))));

async function loadAmazon() {
  azLoading.value = true;
  azError.value = '';
  try {
    azReport.value = await amazonDailyApi.get({
      sids: selectedStoreId.value === 'all' ? 'all' : selectedStoreId.value,
      date: selectedDate.value,
      dimension: azDimension.value,
    });
  } catch (e) {
    azReport.value = null;
    azError.value = e?.message || String(e);
  } finally {
    azLoading.value = false;
  }
}

watch([selectedDate, azDimension], () => loadAmazon());

onMounted(() => { load(); loadAmazon(); });
</script>

<template>
  <div class="m4-daily-report">
    <PageHeader
      title="M4 每日监控日报"
      subtitle="Source-aware daily report: store/listing sales, GMV, ad spend, rating, rank, alerts and trends with real/mock/hybrid provenance; no external writes."
    >
      <template #extra>
        <el-button :icon="'Refresh'" type="primary" :loading="loading" @click="load">随时刷新</el-button>
      </template>
    </PageHeader>

    <section class="daily-hero">
      <div>
        <p class="eyebrow">Daily Operating Pulse · Real DB Only</p>
        <h2>每天 {{ fixedTime }} 固定复盘，也可以随时打开看当前真实同步结果。</h2>
        <p>
          服务器只读取当前数据库里的 M2 订单、M3 广告、M4 Review/竞品/告警数据。
          如果某个指标还没有真实同步，就显示 0 或缺数据，让运营知道该补哪条数据链。
        </p>
      </div>
      <div class="snapshot-card">
        <span>日报日期</span>
        <strong>{{ report?.reportDate || selectedDate }}</strong>
        <small>最后刷新：{{ lastRefreshAt || '等待加载' }}</small>
      </div>
    </section>

    <el-card shadow="never" class="report-card mt-16 filter-card">
      <div class="filters">
        <label>
          <span>查看日期</span>
          <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" style="width: 150px" />
        </label>
        <label>
          <span>定时推送时间</span>
          <el-select v-model="fixedTime" :disabled="false" style="width: 120px" data-test="schedule-time-select">
            <el-option label="09:30" value="09:30" />
            <el-option label="14:00" value="14:00" />
            <el-option label="20:30" value="20:30" />
          </el-select>
          <small class="schedule-hint" data-test="schedule-push-hint">{{ schedulePushText }}</small>
        </label>
        <label>
          <span>店铺维度</span>
          <el-select v-model="selectedStoreId" filterable style="width: 220px">
            <el-option label="全部店铺" value="all" />
            <el-option v-for="store in availableStores" :key="store.id" :label="`${store.name} · ${store.region || ''}`" :value="store.id" />
          </el-select>
        </label>
        <label>
          <span>链接维度</span>
          <el-select v-model="selectedLinkId" filterable style="width: 280px">
            <el-option label="全部链接" value="all" />
            <el-option
              v-for="link in availableLinks"
              :key="link.id"
              :label="`${link.title || link.asin || link.sku} · ${link.asin || '-'} · ${link.sku || '-'}`"
              :value="link.id"
            />
          </el-select>
        </label>
        <el-segmented v-model="dimension" :options="[{ label: '按店铺看', value: 'store' }, { label: '按链接看', value: 'link' }]" />
      </div>
    </el-card>

    <el-alert
      v-if="error"
      class="mt-16"
      type="error"
      show-icon
      :closable="false"
      title="日报真实数据加载失败"
      :description="error"
    />

    <!-- ===================== Amazon 真实数据区 (领星 productPerformance) ===================== -->
    <el-card shadow="never" class="report-card mt-16 az-section" data-test="amazon-daily-section">
      <template #header>
        <div class="card-head">
          <div>
            <h3>Amazon 真实数据看板（领星 productPerformance）</h3>
            <p>多店逐日销量 / GMV / 广告 / ACOS / 毛利 / 评分 / 退款 / 流量 + 环比，全部来自基座真实拉取。</p>
          </div>
          <div class="az-head-tags">
            <el-tag :type="azConfigured ? 'success' : 'warning'" effect="plain" data-test="amazon-configured">
              {{ azConfigured ? '真实数据' : '示例/未配置' }}
            </el-tag>
            <el-tag :type="azRealDataOnly ? 'success' : 'info'" effect="plain">realDataOnly={{ azRealDataOnly }}</el-tag>
            <el-segmented v-model="azDimension" :options="[{ label: '按店铺', value: 'store' }, { label: '按 ASIN', value: 'asin' }]" size="small" />
            <el-button :icon="'Refresh'" size="small" :loading="azLoading" @click="loadAmazon">刷新</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="!azConfigured"
        type="warning"
        show-icon
        :closable="false"
        class="mb-12"
        title="领星 Amazon 真实数据未接入"
        :description="`原因：${azReport?.error || 'lingxing_not_configured'}。配置领星凭证后此区自动切换为真实数据（已实现真实通路），当前不展示伪造数字。`"
        data-test="amazon-not-configured"
      />
      <el-alert
        v-else-if="azError"
        type="error"
        show-icon
        :closable="false"
        class="mb-12"
        title="Amazon 真实数据加载失败"
        :description="azError"
      />
      <el-alert
        v-else-if="azMixedCurrency"
        type="info"
        show-icon
        :closable="false"
        class="mb-12"
        title="跨店混币"
        description="多店币种不一致，汇总按主币种展示并标注，不伪造统一 USD 总额。"
      />

      <!-- 摘要 headline -->
      <p v-if="azInsights.headline" class="az-headline" data-test="amazon-headline">{{ azInsights.headline }}</p>

      <!-- KPI 汇总卡 (真实字段) -->
      <div class="az-kpi-grid" v-loading="azLoading">
        <div class="summary-card">
          <span>销量</span>
          <strong>{{ formatNumber(azSummary.volume || 0) }}</strong>
          <small :class="['delta', deltaClass(azDelta.unitsDeltaPct)]">{{ deltaLabel(azDelta.unitsDeltaPct) }}</small>
        </div>
        <div class="summary-card">
          <span>GMV {{ azMixedCurrency ? '(混币)' : '' }}</span>
          <strong>{{ money(azSummary.gmv, azCurrency) }}</strong>
          <small :class="['delta', deltaClass(azDelta.gmvDeltaPct)]">{{ deltaLabel(azDelta.gmvDeltaPct) }}</small>
        </div>
        <div class="summary-card">
          <span>净销售额</span>
          <strong>{{ money(azSummary.netAmount, azCurrency) }}</strong>
          <small>{{ azSummary.asinCount || 0 }} ASIN</small>
        </div>
        <div class="summary-card">
          <span>广告花费</span>
          <strong>{{ money(azSummary.adSpend, azCurrency) }}</strong>
          <small :class="['delta', deltaClass(azDelta.adSpendDeltaPct, true)]">{{ deltaLabel(azDelta.adSpendDeltaPct) }}</small>
        </div>
        <div class="summary-card">
          <span>ACOS</span>
          <strong :class="{ warning: azSummary.acos > 0.35 }">{{ pct(azSummary.acos) }}</strong>
          <small :class="['delta', deltaClass(azDelta.acosDelta, true)]">{{ deltaLabel(azDelta.acosDelta, 'pp') }}</small>
        </div>
        <div class="summary-card">
          <span>毛利率</span>
          <strong :class="{ warning: azSummary.grossMargin < 0.05 }">{{ pct(azSummary.grossMargin) }}</strong>
          <small>毛利 {{ money(azSummary.grossProfit, azCurrency) }}</small>
        </div>
        <div class="summary-card">
          <span>评分</span>
          <strong>{{ num(azSummary.avgStar).toFixed(2) }}</strong>
          <small :class="['delta', deltaClass(azDelta.ratingDelta)]">{{ azDelta.ratingDelta > 0 ? '+' : '' }}{{ num(azDelta.ratingDelta).toFixed(2) }}</small>
        </div>
        <div class="summary-card">
          <span>退款率</span>
          <strong :class="{ warning: azSummary.returnRate > 0.05 }">{{ pct(azSummary.returnRate) }}</strong>
          <small :class="['delta', deltaClass(azDelta.returnRateDelta, true)]">{{ deltaLabel(azDelta.returnRateDelta, 'pp') }}</small>
        </div>
        <div class="summary-card">
          <span>Sessions</span>
          <strong>{{ formatNumber(azSummary.sessions || 0) }}</strong>
          <small>CVR {{ pct(azSummary.cvr) }}</small>
        </div>
      </div>

      <!-- store 维度主表 -->
      <el-table v-if="azDimension === 'store'" :data="azStores" border class="store-table mt-16" data-test="amazon-store-table">
        <el-table-column label="店铺" min-width="180" fixed>
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <small class="muted-inline">{{ row.region || '-' }} · {{ row.currency || 'USD' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="销量" align="right" width="110">
          <template #default="{ row }">
            <strong class="tnum">{{ formatNumber(row.volume || 0) }}</strong>
            <span :class="['delta', deltaClass(row.unitsDeltaPct)]">{{ deltaLabel(row.unitsDeltaPct) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="GMV" align="right" width="130">
          <template #default="{ row }">
            <strong class="tnum">{{ money(row.gmv, row.currency) }}</strong>
            <span :class="['delta', deltaClass(row.gmvDeltaPct)]">{{ deltaLabel(row.gmvDeltaPct) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="净销售额" align="right" width="120">
          <template #default="{ row }">{{ money(row.netAmount, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="广告花费" align="right" width="130">
          <template #default="{ row }">
            <strong class="tnum">{{ money(row.adSpend, row.currency) }}</strong>
            <span :class="['delta', deltaClass(row.adSpendDeltaPct, true)]">{{ deltaLabel(row.adSpendDeltaPct) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="ACOS" align="right" width="90">
          <template #default="{ row }"><span class="tnum" :class="{ warning: row.acos > 0.35 }">{{ pct(row.acos) }}</span></template>
        </el-table-column>
        <el-table-column label="毛利(率)" align="right" width="130">
          <template #default="{ row }">
            <strong class="tnum">{{ money(row.grossProfit, row.currency) }}</strong>
            <span class="delta" :class="{ warning: row.grossMargin < 0.05 }">{{ pct(row.grossMargin) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="评分" align="right" width="80">
          <template #default="{ row }">{{ num(row.avgStar).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="退款率" align="right" width="90">
          <template #default="{ row }"><span :class="{ warning: row.returnRate > 0.05 }">{{ pct(row.returnRate) }}</span></template>
        </el-table-column>
        <el-table-column label="Sessions" align="right" width="100">
          <template #default="{ row }">{{ formatNumber(row.sessions || 0) }}</template>
        </el-table-column>
        <el-table-column label="CVR" align="right" width="80">
          <template #default="{ row }">{{ pct(row.cvr) }}</template>
        </el-table-column>
      </el-table>

      <!-- ASIN 维度下钻表 -->
      <el-table v-else :data="azAsins" border class="store-table mt-16" data-test="amazon-asin-table">
        <el-table-column label="ASIN / 标题" min-width="220" fixed>
          <template #default="{ row }">
            <strong>{{ row.asin || '-' }}</strong>
            <small class="muted-inline">{{ row.itemName || '' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="店铺" width="120" prop="storeName" />
        <el-table-column label="销量" align="right" width="90"><template #default="{ row }">{{ formatNumber(row.volume || 0) }}</template></el-table-column>
        <el-table-column label="GMV" align="right" width="110"><template #default="{ row }">{{ money(row.amount, row.currencyCode) }}</template></el-table-column>
        <el-table-column label="广告" align="right" width="100"><template #default="{ row }">{{ money(row.adSpend, row.currencyCode) }}</template></el-table-column>
        <el-table-column label="ACOS" align="right" width="80"><template #default="{ row }"><span :class="{ warning: row.acos > 0.35 }">{{ pct(row.acos) }}</span></template></el-table-column>
        <el-table-column label="TACOS" align="right" width="80"><template #default="{ row }">{{ pct(row.tacos) }}</template></el-table-column>
        <el-table-column label="毛利" align="right" width="100"><template #default="{ row }">{{ money(row.grossProfit, row.currencyCode) }}</template></el-table-column>
        <el-table-column label="CTR" align="right" width="70"><template #default="{ row }">{{ pct(row.ctr) }}</template></el-table-column>
        <el-table-column label="CVR" align="right" width="70"><template #default="{ row }">{{ pct(row.cvr) }}</template></el-table-column>
        <el-table-column label="BuyBox%" align="right" width="90"><template #default="{ row }">{{ pct(row.buyBoxPercentage) }}</template></el-table-column>
        <el-table-column label="大类/小类" align="right" width="120"><template #default="{ row }">{{ rankText(row.cateRank) }} / {{ rankText(row.smallCateRank) }}</template></el-table-column>
        <el-table-column label="可售天数" align="right" width="90"><template #default="{ row }"><span :class="{ warning: row.availableDays > 0 && row.availableDays < 14 }">{{ row.availableDays || '-' }}</span></template></el-table-column>
        <el-table-column label="环比(量/额)" align="right" width="120"><template #default="{ row }">{{ deltaLabel(num(row.volumeChainRatio) * 100) }} / {{ deltaLabel(num(row.amountChainRatio) * 100) }}</template></el-table-column>
      </el-table>

      <!-- 趋势 + 排行/风险 -->
      <el-row :gutter="16" class="mt-16">
        <el-col :xs="24" :sm="24" :md="14" :lg="15">
          <div class="trend-board" v-if="azSeries.length">
            <div v-for="point in azSeries" :key="point.date" class="trend-col">
              <div class="bar-stack">
                <span class="bar gmv" :style="{ height: `${(num(point.gmv) / azMaxTrend) * 150 + 16}px` }" />
                <span class="bar spend" :style="{ height: `${((num(point.adSpend) * 8) / azMaxTrend) * 150 + 12}px` }" />
              </div>
              <strong>{{ point.date?.slice(5) }}</strong>
              <small>{{ formatNumber(point.volume || 0) }} 单 · ★{{ num(point.avgStar).toFixed(2) }}</small>
            </div>
          </div>
          <EmptyState v-else title="暂无逐日趋势" description="区间内未拉到真实逐日数据。" icon="DataLine" />
        </el-col>
        <el-col :xs="24" :sm="24" :md="10" :lg="9">
          <div class="az-risks" data-test="amazon-risks">
            <h4>今日必须看（真实风险）</h4>
            <div v-if="azRisks.length" class="watch-list">
              <div v-for="(r, i) in azRisks" :key="i" class="watch-item">
                <el-tag :type="r.level === 'P1' ? 'danger' : 'warning'" size="small">{{ r.level }}</el-tag>
                <div><strong>{{ r.message }}</strong><small>{{ r.scope }} · {{ r.metric }}={{ r.value }}</small></div>
              </div>
            </div>
            <EmptyState v-else title="无真实风险项" description="真实数据未发现 ACOS/毛利/退款/评分/断货风险。" icon="CircleCheck" />
            <h4 class="mt-16">真实排行 · GMV Top</h4>
            <ol class="az-rank">
              <li v-for="(r, i) in (azRankings.gmvTop || [])" :key="i"><span>{{ r.name }}</span><b>{{ money(r.value, azCurrency) }}</b></li>
            </ol>
          </div>
        </el-col>
      </el-row>

      <!-- sourceMeta: 真实区 mock:false / 基座拿不到的 mock:true -->
      <div class="source-grid mt-16">
        <div v-for="(meta, key) in azSourceMeta" :key="key" class="source-item">
          <strong>{{ key }}</strong>
          <span>provider: {{ meta.provider }} · mode={{ sourceMode(meta) }} · mock={{ meta.mock === true }}<template v-if="meta.reason"> · {{ meta.reason }}</template></span>
        </div>
      </div>
    </el-card>

    <h3 class="local-section-title mt-16">本地派生（模拟 / 预估）— 与上方真实区隔离</h3>

    <section class="summary-grid" v-loading="loading">
      <div class="summary-card">
        <span>销量</span>
        <strong>{{ formatNumber(summary.unitsSold || 0) }}</strong>
        <small>来自 M2 orders 实际行</small>
      </div>
      <div class="summary-card">
        <span>GMV</span>
        <strong>{{ money(summary.gmv, 'USD') }}</strong>
        <small>无订单则不估算</small>
      </div>
      <div class="summary-card">
        <span>广告花费</span>
        <strong>{{ money(summary.adSpend, 'USD') }}</strong>
        <small>ACOS {{ pct(summary.acos) }}</small>
      </div>
      <div class="summary-card">
        <span>评分</span>
        <strong>{{ num(summary.avgRating).toFixed(2) }}</strong>
        <small>Review/trend 实际快照</small>
      </div>
      <div class="summary-card danger">
        <span>告警</span>
        <strong>{{ summary.alerts || 0 }}</strong>
        <small>未闭环风险项</small>
      </div>
      <div class="summary-card recovered" data-test="recovered-card">
        <span>
          已挽回
          <el-tag size="small" type="warning" effect="plain" class="watermark" data-test="recovered-watermark">{{ recovered.watermark || '模拟/预估' }}</el-tag>
        </span>
        <strong data-test="recovered-realized">实际 {{ money(recovered.realized, recovered.currency) }}</strong>
        <small data-test="recovered-estimated">预估 {{ money(recovered.estimated, recovered.currency) }} · realized {{ recovered.realizedCount || 0 }} / estimated {{ recovered.estimatedCount || 0 }}</small>
      </div>
    </section>

    <el-row :gutter="16" class="mt-16">
      <el-col :xs="24" :sm="24" :md="16" :lg="17">
        <el-card shadow="never" class="report-card">
          <template #header>
            <div class="card-head">
              <div>
                <h3>{{ dimension === 'link' ? '链接日报' : '分店铺日报' }}</h3>
                <p>当前筛选：{{ selectedStoreId === 'all' ? '全部店铺' : '单店铺' }} / {{ selectedLinkId === 'all' ? '全部链接' : '单链接' }}</p>
              </div>
              <el-tag :type="realDataOnly ? 'success' : 'warning'" effect="plain">realDataOnly={{ realDataOnly }}</el-tag>
            </div>
          </template>

          <EmptyState v-if="noData" title="没有可展示的真实日报数据" description="当前店铺/链接/日期没有同步到订单、广告、评分或告警数据；系统不会用 mock 补齐。" icon="DataLine" />

          <el-table v-else :data="rows" border class="store-table">
            <el-table-column :label="dimension === 'link' ? '链接' : '店铺'" min-width="240" fixed>
              <template #default="{ row }">
                <div class="store-name">
                  <span class="badge">{{ dimension === 'link' ? 'LINK' : regionEmoji(row.region) }}</span>
                  <div>
                    <strong>{{ row.displayName }}</strong>
                    <small>{{ row.subName }}</small>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="销量" align="right" width="110">
              <template #default="{ row }">
                <strong class="tnum">{{ formatNumber(row.unitsSold || 0) }}</strong>
                <span :class="['delta', deltaClass(row.unitsDeltaPct)]">{{ deltaLabel(row.unitsDeltaPct) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="GMV" align="right" width="130">
              <template #default="{ row }">
                <strong class="tnum">{{ money(row.gmv, row.currency) }}</strong>
                <span :class="['delta', deltaClass(row.gmvDeltaPct)]">{{ deltaLabel(row.gmvDeltaPct) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="广告花费" align="right" width="130">
              <template #default="{ row }">
                <strong class="tnum">{{ money(row.adSpend, 'USD') }}</strong>
                <span :class="['delta', deltaClass(row.adSpendDeltaPct, true)]">{{ deltaLabel(row.adSpendDeltaPct) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="ACOS" align="right" width="90">
              <template #default="{ row }">
                <span class="tnum" :class="{ warning: row.acos > 0.35 }">{{ pct(row.acos) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="评分" align="right" width="110">
              <template #default="{ row }">
                <strong class="tnum">{{ num(row.avgRating).toFixed(2) }}</strong>
                <span :class="['delta', deltaClass(row.ratingDelta)]">{{ row.ratingDelta > 0 ? '+' : '' }}{{ num(row.ratingDelta).toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="竞品 BSR(示意)" align="right" width="140">
              <template #default="{ row }">
                <strong class="tnum">{{ rankText(row.competitorBsr ?? row.categoryRank) }}</strong>
                <span :class="['delta', deltaClass(row.competitorBsrDelta ?? row.rankDelta, true)]">{{ (row.competitorBsrDelta ?? row.rankDelta) > 0 ? '↓' : (row.competitorBsrDelta ?? row.rankDelta) < 0 ? '↑' : '-' }}{{ (row.competitorBsrDelta ?? row.rankDelta) ? Math.abs(row.competitorBsrDelta ?? row.rankDelta) : '' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="告警" align="center" width="90">
              <template #default="{ row }">
                <el-tag :type="row.alerts >= 3 ? 'danger' : row.alerts ? 'warning' : 'success'" size="small">{{ row.alerts || 0 }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="今日动作" min-width="260" prop="action" />
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="8" :lg="7">
        <el-card shadow="never" class="report-card watch-card">
          <template #header><h3>今日必须看</h3></template>
          <div v-if="watchItems.length" class="watch-list">
            <router-link v-for="item in watchItems" :key="item.id" :to="item.path" class="watch-item">
              <el-tag :type="item.severity === 'P1' ? 'danger' : 'warning'" size="small">{{ item.severity }}</el-tag>
              <div>
                <strong>{{ item.title }}</strong>
                <small>{{ item.storeName }}</small>
                <p>{{ item.body }}</p>
              </div>
            </router-link>
          </div>
          <EmptyState v-else title="没有必须处理项" description="当前真实数据未发现需要立即处理的广告、评分或告警问题。" icon="CircleCheck" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mt-16">
      <el-col :xs="24" :sm="24" :md="15" :lg="16">
        <el-card shadow="never" class="report-card">
          <template #header>
            <div class="card-head">
              <h3>7 日真实数据趋势</h3>
              <span class="muted">GMV / 广告花费 / 销量 / 评分</span>
            </div>
          </template>
          <div class="trend-board">
            <div v-for="point in trendSeries" :key="point.date" class="trend-col">
              <div class="bar-stack">
                <span class="bar gmv" :style="{ height: `${(num(point.gmv) / maxTrend) * 150 + 16}px` }" />
                <span class="bar spend" :style="{ height: `${((num(point.adSpend) * 8) / maxTrend) * 150 + 12}px` }" />
              </div>
              <strong>{{ point.date?.slice(5) }}</strong>
              <small>{{ formatNumber(point.unitsSold || 0) }} 单 · ★{{ num(point.avgRating).toFixed(2) }}</small>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="9" :lg="8">
        <el-card shadow="never" class="report-card">
          <template #header><h3>数据来源与限制</h3></template>
          <div class="routine-list">
            <div>
              <strong>只读真实库</strong>
              <p>日报只读本地数据库中的真实同步结果，不再引入前端示例数据，也不按公式补数。</p>
            </div>
            <div>
              <strong>店铺 / 链接筛选</strong>
              <p>店铺来自用户店铺表，链接来自产品主数据；选择单链接后，订单、Review、竞品和告警会尽量按 ASIN/SKU/ProductId 过滤。</p>
            </div>
            <div>
              <strong>缺数据可见</strong>
              <p>如果 Ads/BSR/Review 尚未真实同步，指标会显示 0 或 -，用于提醒补同步链路，而不是造假。</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="report-card mt-16">
      <template #header>
        <div class="card-head">
          <h3>sourceMeta 与深链</h3>
          <span class="muted">真实 Amazon 接入后替换 adapter，不改变日报契约</span>
        </div>
      </template>
      <div class="source-grid">
        <div v-for="(meta, key) in sourceMeta" :key="key" class="source-item">
          <strong>{{ key }}</strong>
          <p>{{ meta.source }}</p>
          <span>freshness: {{ meta.freshness }} · confidence {{ Math.round((meta.confidence || 0) * 100) }}% · mode={{ sourceMode(meta) }} - mock={{ meta.mock === true }}</span>
        </div>
      </div>
      <div class="deep-links">
        <router-link :to="report?.deepLinks?.ads || '/ads/reports'">广告报表</router-link>
        <router-link :to="report?.deepLinks?.reviews || '/reviews/trends'">评分趋势</router-link>
        <router-link :to="report?.deepLinks?.anomalies || '/monitor/anomalies'">异常列表</router-link>
        <router-link :to="report?.deepLinks?.competitors || '/competitors/image-diff'">竞品图像变化</router-link>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.m4-daily-report {
  max-width: 1480px;
  margin: 0 auto;
  --daily-ink: #253126;
  --daily-green: #315f45;
  --daily-amber: #c77a31;
  --daily-red: #c94b3f;
}
.mt-16 { margin-top: 16px; }
.daily-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 18px;
  padding: 28px;
  border-radius: 26px;
  border: 1px solid rgba(58, 79, 63, .16);
  background:
    radial-gradient(circle at 88% 12%, rgba(199, 122, 49, .22), transparent 30%),
    linear-gradient(135deg, #fbf6ea 0%, #edf4e9 54%, #e5eef2 100%);
}
.eyebrow { margin: 0 0 8px; color: var(--daily-green); font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.daily-hero h2 { margin: 0; color: var(--daily-ink); font-size: 28px; line-height: 1.2; letter-spacing: -0.03em; }
.daily-hero p { max-width: 860px; margin: 12px 0 0; color: #5f6b61; line-height: 1.75; }
.snapshot-card { display: flex; flex-direction: column; justify-content: center; padding: 18px; border-radius: 20px; border: 1px solid rgba(49, 95, 69, .16); background: rgba(255, 255, 255, .72); }
.snapshot-card span, .snapshot-card small { color: var(--text-muted); }
.snapshot-card strong { display: block; margin: 10px 0; color: var(--daily-ink); font-size: 24px; }
.filter-card { border-radius: 18px; }
.filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.filters label { display: grid; gap: 6px; color: var(--text-muted); font-size: 12px; }
.summary-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
.summary-card.recovered { background: #fffaf0; border-color: #f3dcae; }
.summary-card.recovered .watermark { margin-left: 6px; vertical-align: middle; }
.schedule-hint { color: var(--daily-amber, #c77a31); font-weight: 700; }
.summary-card { padding: 18px; border: 1px solid rgba(49, 95, 69, .13); border-radius: 20px; background: #fff; }
.summary-card span, .summary-card small { display: block; color: var(--text-muted); }
.summary-card strong { display: block; margin: 8px 0; color: var(--daily-ink); font-size: 28px; letter-spacing: -0.03em; }
.summary-card.danger { background: #fff7f2; border-color: #ffd6c5; }
.report-card { border-radius: 20px; border-color: rgba(37, 49, 38, .12); }
.report-card :deep(.el-card__header) { border-bottom-color: rgba(37, 49, 38, .08); }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.card-head h3, .watch-card h3 { margin: 0; font-size: 16px; }
.card-head p { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }
.muted { color: var(--text-muted); font-size: 12px; }
.store-table { width: 100%; }
.store-name { display: flex; gap: 10px; align-items: center; }
.badge { min-width: 36px; text-align: center; padding: 2px 6px; border-radius: 999px; color: var(--daily-green); background: #eef5ea; font-weight: 800; font-size: 11px; }
.store-name strong, .store-name small { display: block; }
.store-name small { color: var(--text-muted); margin-top: 2px; }
.delta { display: block; margin-top: 2px; font-size: 11px; }
.delta.up { color: var(--daily-green); }
.delta.down, .warning { color: var(--daily-red); }
.delta.flat { color: var(--text-muted); }
.watch-list { display: grid; gap: 10px; }
.watch-item { display: grid; grid-template-columns: auto 1fr; gap: 10px; padding: 12px; border: 1px solid rgba(37, 49, 38, .1); border-radius: 14px; color: var(--text); text-decoration: none; background: #fffdf8; }
.watch-item strong, .watch-item small { display: block; }
.watch-item small { color: var(--text-muted); margin-top: 2px; }
.watch-item p { margin: 8px 0 0; color: #5e645f; line-height: 1.55; font-size: 13px; }
.trend-board { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 12px; min-height: 230px; }
.trend-col { display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; text-align: center; }
.bar-stack { height: 180px; display: flex; justify-content: center; align-items: flex-end; gap: 6px; padding: 8px; border-radius: 16px; background: #f8faf7; }
.bar { width: 18px; border-radius: 999px 999px 5px 5px; }
.bar.gmv { background: linear-gradient(180deg, #315f45, #9fbe8f); }
.bar.spend { background: linear-gradient(180deg, #c77a31, #efd39d); }
.trend-col strong { color: var(--daily-ink); }
.trend-col small { color: var(--text-muted); font-size: 11px; }
.routine-list { display: grid; gap: 12px; }
.routine-list div { padding: 14px; border: 1px solid rgba(37, 49, 38, .1); border-radius: 14px; background: #fbfbf7; }
.routine-list strong { display: block; color: var(--daily-ink); }
.routine-list p { margin: 6px 0 0; color: var(--text-muted); line-height: 1.65; }
.source-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.source-item { padding: 14px; border-radius: 14px; border: 1px solid rgba(37, 49, 38, .1); background: #fff; }
.source-item strong { color: var(--daily-green); }
.source-item p { margin: 8px 0; color: var(--daily-ink); }
.source-item span { color: var(--text-muted); font-size: 12px; }
.deep-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.deep-links a { padding: 8px 12px; border-radius: 999px; background: #eef5ea; color: var(--daily-green); text-decoration: none; font-weight: 700; font-size: 13px; }
.mb-12 { margin-bottom: 12px; }
.az-section { border-color: rgba(49, 95, 69, .22); }
.az-head-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.az-headline { margin: 0 0 14px; padding: 12px 14px; border-radius: 12px; background: #f4f8f1; color: var(--daily-ink); font-weight: 700; line-height: 1.6; }
.az-kpi-grid { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 10px; }
.az-kpi-grid .summary-card { padding: 12px; }
.az-kpi-grid .summary-card strong { font-size: 20px; margin: 6px 0; }
.muted-inline { display: block; color: var(--text-muted); font-size: 11px; margin-top: 2px; }
.az-risks h4 { margin: 0 0 10px; font-size: 14px; color: var(--daily-ink); }
.az-rank { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 6px; }
.az-rank li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.local-section-title { margin: 24px 0 0; color: var(--daily-amber); font-size: 15px; }
@media (max-width: 1280px) { .az-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1100px) { .summary-grid, .source-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 767px) {
  .daily-hero { grid-template-columns: 1fr; padding: 20px; }
  .daily-hero h2 { font-size: 22px; }
  .summary-grid, .source-grid { grid-template-columns: 1fr; }
  .az-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .card-head { align-items: flex-start; flex-direction: column; }
  .trend-board { grid-template-columns: repeat(7, 86px); overflow-x: auto; padding-bottom: 8px; }
}
</style>
