<script setup>
import { computed, onMounted, ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  anomaliesApi,
  slaApi,
  hijackingApi,
  infringementApi,
  reviewsApi,
  appealsApi,
  recoveryApi,
  competitorsApi,
  imageDiffsApi,
  resolutionApi,
  postmortemsApi,
  amazonRiskApi,
} from '../api/m4';

const loading = ref(false);
const error = ref('');
const activeLane = ref('inbox');
const sourceFilter = ref('all');
const selected = ref(null);
const drawerOpen = ref(false);

// ===== Amazon 真实风险看板 (领星 productPerformance) =====
const amzLoading = ref(false);
const amzError = ref('');
const amzRiskFilter = ref('all');
const amzSelected = ref(null);
const amzDrawerOpen = ref(false);
const amzBoard = ref(null);

const RISK_TYPE_LABELS = {
  acos_high: 'ACOS 过高',
  ad_overspend: '广告超支',
  rating_low: '评分过低',
  return_high: '退货率高',
  stockout_risk: '断货风险',
  sales_drop: '销量骤降',
};

function fmtMetric(metric) {
  if (!metric) return '-';
  const v = num(metric.value);
  const th = metric.threshold;
  if (metric.unit === 'ratio') return `${(v * 100).toFixed(1)}% (阈值 ${(num(th) * 100).toFixed(0)}%)`;
  if (metric.unit === 'star') return `${v.toFixed(2)}★ (阈值 ${th}★)`;
  if (metric.unit === 'days') return `${v.toFixed(0)} 天 (阈值 ${th} 天)`;
  return `${money(v)} (阈值 ${money(th)})`;
}

async function loadAmazonRisk() {
  amzLoading.value = true;
  amzError.value = '';
  try {
    // 拉全量, 风险类型筛选在前端完成(severity=all 让后端返回完整看板)。
    amzBoard.value = await amazonRiskApi.board({ severity: 'all' });
  } catch (e) {
    amzError.value = e?.message || String(e);
    amzBoard.value = null;
  } finally {
    amzLoading.value = false;
  }
}

const amzKpis = computed(() => {
  const k = amzBoard.value?.kpi || {};
  return [
    { label: '真实风险总数', value: num(k.totalRisks), hint: `P0 ${num(k.p0)} / P1 ${num(k.p1)}`, status: num(k.p0) ? 'danger' : (num(k.totalRisks) ? 'warning' : 'success') },
    { label: '广告超支 ASIN', value: num(k.adOverspendCount), hint: `合计花费 ${money(k.adSpendTotal)}`, status: num(k.adOverspendCount) ? 'warning' : 'success' },
    { label: '断货风险 ASIN', value: num(k.stockoutCount), hint: k.minAvailableDays != null ? `最紧急 ${num(k.minAvailableDays)} 天` : '无', status: num(k.stockoutCount) ? 'danger' : 'success' },
    { label: '受影响销售额', value: money(k.impactedAmount), hint: k.currencyMixed ? '多币种合计(仅参考)' : 'P0+P1 ASIN 合计', status: num(k.impactedAmount) ? 'warning' : 'success' },
  ];
});

const amzFilteredRisks = computed(() => {
  const list = amzBoard.value?.risks || [];
  if (amzRiskFilter.value === 'all') return list;
  return list.filter((r) => r.riskType === amzRiskFilter.value);
});

function openAmzRisk(row) {
  amzSelected.value = row;
  amzDrawerOpen.value = true;
}

const state = ref({
  anomalies: [],
  anomalySummary: {},
  sla: null,
  hijacking: [],
  infringement: [],
  reviews: [],
  reviewSummary: {},
  clusters: [],
  trends: [],
  appeals: [],
  recovery: [],
  competitors: [],
  imageDiffs: [],
  cases: [],
  postmortems: [],
});

function listOf(payload, keys = ['items', 'list', 'data']) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value) {
  const n = num(value);
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function severityType(severity) {
  return ({ P0: 'danger', P1: 'warning', P2: 'info', critical: 'danger', high: 'warning', medium: 'info', low: 'success' })[severity] || 'info';
}

function statusText(status) {
  return ({
    open: '未处理',
    assigned: '已分派',
    investigating: '调查中',
    resolving: '处置中',
    resolved: '已解决',
    dismissed: '已忽略',
    escalated: '已升级',
    submitted: '已提交',
    draft: '草稿',
    pending_test_buy: '待 Test Buy',
    appeal_drafted: '申诉草稿',
    pending_legal_review: '法务确认',
  })[status] || status || '-';
}

async function settle(label, promise, fallback) {
  try {
    return await promise;
  } catch (e) {
    console.warn(`[m4-workbench] ${label} failed`, e);
    return fallback;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [
      anomalies,
      sla,
      hijacking,
      infringement,
      reviews,
      clusters,
      trends,
      appeals,
      recovery,
      competitors,
      imageDiffs,
      cases,
      postmortems,
    ] = await Promise.all([
      settle('anomalies', anomaliesApi.list({}), {}),
      settle('sla', slaApi.board('7d'), {}),
      settle('hijacking', hijackingApi.list({}), {}),
      settle('infringement', infringementApi.list({}), {}),
      settle('reviews', reviewsApi.list({}), {}),
      settle('review-clusters', reviewsApi.listClusters({}), {}),
      settle('review-trends', reviewsApi.trends.list({}), {}),
      settle('appeals', appealsApi.list({}), {}),
      settle('recovery', recoveryApi.list({}), {}),
      settle('competitors', competitorsApi.list({}), {}),
      settle('image-diffs', imageDiffsApi.list({}), {}),
      settle('cases', resolutionApi.list({}), {}),
      settle('postmortems', postmortemsApi.list({}), {}),
    ]);

    state.value = {
      anomalies: listOf(anomalies, ['items', 'anomalies']),
      anomalySummary: anomalies?.summary || {},
      sla,
      hijacking: listOf(hijacking, ['items', 'events']),
      infringement: listOf(infringement, ['items', 'events']),
      reviews: listOf(reviews, ['items', 'reviews']),
      reviewSummary: reviews?.summary || {},
      clusters: listOf(clusters, ['items', 'clusters']),
      trends: listOf(trends, ['items', 'trends']),
      appeals: listOf(appeals, ['items', 'appeals']),
      recovery: listOf(recovery, ['items', 'emails']),
      competitors: listOf(competitors, ['items', 'competitors']),
      imageDiffs: listOf(imageDiffs, ['items', 'diffs']),
      cases: listOf(cases, ['items', 'cases']),
      postmortems: listOf(postmortems, ['items', 'postmortems']),
    };
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => { load(); loadAmazonRisk(); });

const riskCards = computed(() => {
  const cards = [];
  for (const row of state.value.anomalies) {
    cards.push({
      id: `anomaly-${row.id}`,
      source: 'anomaly',
      severity: row.severity || 'P1',
      status: row.status || 'open',
      title: row.title || '运营异常待处理',
      object: row.sku || row.asin || row.category,
      assignee: row.assigneeLabel || row.assignee_user_id || '未分派',
      sla: row.slaMinutes || row.sla_minutes || '-',
      impact: row.expectedImpact?.change || row.impact || row.estimatedLoss || '',
      action: row.recommendedAction || row.recommended_action || '确认根因并按状态机处置',
      evidence: row.evidence || row,
      route: '/monitor/anomalies',
      sourceLabel: '异常监控',
      confidence: row.confidence,
    });
  }
  for (const row of state.value.hijacking) {
    cards.push({
      id: `hijack-${row.id || row.asin}`,
      source: 'hijacking',
      severity: 'P0',
      status: row.status || 'pending_test_buy',
      title: '疑似跟卖需要处置',
      object: row.asin || row.sku,
      assignee: row.assigneeLabel || '运营/法务',
      sla: row.durationMin ? `${row.durationMin}m` : 'P0',
      impact: row.estimatedLossPerHour ? `${money(row.estimatedLossPerHour)}/h` : '',
      action: '按 Test Buy -> 证据 -> 申诉 -> 恢复广告顺序处理',
      evidence: row,
      route: '/monitor/hijacking',
      sourceLabel: '跟卖',
      confidence: row.confidence,
    });
  }
  for (const row of state.value.infringement) {
    cards.push({
      id: `ip-${row.id || row.asin}`,
      source: 'infringement',
      severity: row.severity || 'P1',
      status: row.status || 'investigating',
      title: '侵权/仿品风险待确认',
      object: row.asin || row.type,
      assignee: row.reportedBy || '法务',
      sla: 'review',
      impact: row.estimatedLoss ? money(row.estimatedLoss) : '',
      action: row.recommendation || '先做法务确认，再起草投诉，避免误伤',
      evidence: row,
      route: '/monitor/infringement',
      sourceLabel: '侵权',
      confidence: row.confidence,
    });
  }
  for (const row of state.value.reviews.filter((r) => num(r.rating, 5) <= 3).slice(0, 8)) {
    cards.push({
      id: `review-${row.id}`,
      source: 'review',
      severity: num(row.rating, 5) <= 2 ? 'P1' : 'P2',
      status: row.appealStatus || row.status || 'open',
      title: `${row.rating || '-'}星 Review 需要判断申诉/挽回`,
      object: row.sku || row.asin || row.author,
      assignee: '客服/运营',
      sla: '<24h',
      impact: row.impact || '',
      action: row.appealable ? '优先进入申诉中心；同时评估是否推送 M1 改文案/图片' : '先聚类归因，再决定挽回或推 M1',
      evidence: row.body || row,
      route: '/reviews',
      sourceLabel: 'Review',
      confidence: row.confidence,
    });
  }
  for (const row of state.value.imageDiffs.slice(0, 8)) {
    cards.push({
      id: `image-${row.id || row.competitorAsin}`,
      source: 'competitor',
      severity: row.impact === 'high' ? 'P1' : 'P2',
      status: row.status || 'open',
      title: '竞品图片变化需要评估',
      object: row.competitorAsin || row.asin,
      assignee: 'Listing 运营',
      sla: '7d',
      impact: row.impactOnUs || row.impact || '',
      action: row.aiAnalysis || '检查是否需要推送 M1 图片矩阵优化',
      evidence: row,
      route: '/competitors/image-diff',
      sourceLabel: '竞品图片',
      confidence: row.confidence,
    });
  }
  return cards.sort((a, b) => {
    const rank = { P0: 0, P1: 1, P2: 2 };
    return (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3);
  });
});

const filteredCards = computed(() => {
  if (sourceFilter.value === 'all') return riskCards.value;
  return riskCards.value.filter((card) => card.source === sourceFilter.value);
});

const kpis = computed(() => {
  const p0 = riskCards.value.filter((c) => c.severity === 'P0').length;
  const p1 = riskCards.value.filter((c) => c.severity === 'P1').length;
  const open = riskCards.value.filter((c) => !['resolved', 'dismissed', 'closed'].includes(c.status)).length;
  const breached = state.value.anomalySummary?.breached || state.value.sla?.breached || 0;
  return [
    { label: '未闭环风险', value: open, hint: '异常 / Review / 跟卖 / 竞品', status: open ? 'warning' : 'success' },
    { label: 'P0 紧急', value: p0, hint: '应立即分派', status: p0 ? 'danger' : 'success' },
    { label: 'P1 重要', value: p1, hint: '今日处理', status: p1 ? 'warning' : 'success' },
    { label: 'SLA 超时', value: breached, hint: '需要升级', status: breached ? 'danger' : 'success' },
  ];
});

const reviewBlocks = computed(() => [
  { label: '负面 Review', value: state.value.reviews.filter((r) => num(r.rating, 5) <= 3).length, path: '/reviews' },
  { label: '差评聚类', value: state.value.clusters.length, path: '/reviews/clusters' },
  { label: '申诉任务', value: state.value.appeals.length, path: '/reviews/appeals' },
  { label: '挽回邮件', value: state.value.recovery.length, path: '/reviews/recovery' },
]);

const competitorBlocks = computed(() => [
  { label: '监控竞品', value: state.value.competitors.length, path: '/competitors' },
  { label: '图片变化', value: state.value.imageDiffs.length, path: '/competitors/image-diff' },
  { label: '趋势快照', value: state.value.trends.length, path: '/reviews/trends' },
]);

const learningBlocks = computed(() => [
  { label: '处置案例', value: state.value.cases.length, path: '/monitor/cases' },
  { label: '复盘报告', value: state.value.postmortems.length, path: '/monitor/postmortems' },
  { label: 'SLA 看板', value: state.value.sla?.team?.length || state.value.sla?.members?.length || 0, path: '/monitor/sla' },
]);

function openCard(card) {
  selected.value = card;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="m4-workbench">
    <PageHeader
      title="M4 运营风险工作台"
      subtitle="把异常、Review、竞品、跟卖、侵权收口为一个风险收件箱：先处置，再沉淀。"
    >
      <template #extra>
        <el-tag effect="plain" round>Detect -> Assign -> Resolve -> Learn</el-tag>
        <router-link to="/m4/reports/daily"><el-button :icon="'DataAnalysis'">每日监控日报</el-button></router-link>
        <el-button :icon="'Refresh'" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="hero">
      <div>
        <p class="eyebrow">M4 Ops Inbox</p>
        <h2>今天只回答一个问题：哪些运营风险会影响销售、评分或账号安全？</h2>
        <p>
          Review、竞品图片、跟卖、侵权和异常不再散落在不同菜单，统一进入事件收件箱，详情再分流到原深水页面。
        </p>
      </div>
      <div class="hero-loop">
        <span>Detect</span><i />
        <span>Assign</span><i />
        <span>Resolve</span><i />
        <span>Learn</span>
      </div>
    </section>

    <div class="kpi-grid" v-loading="loading">
      <div v-for="item in kpis" :key="item.label" class="kpi" :class="`is-${item.status}`">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </div>
    </div>

    <el-alert
      v-if="error"
      type="error"
      show-icon
      :closable="false"
      title="M4 数据加载失败"
      :description="error"
      class="mt-16"
    />

    <el-tabs v-model="activeLane" class="ops-tabs">
      <el-tab-pane label="风险收件箱" name="inbox">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-head">
              <div>
                <h3>P0/P1 优先事件</h3>
                <p>所有来源统一成任务卡，避免在异常、Review、竞品之间来回找。</p>
              </div>
              <el-radio-group v-model="sourceFilter" size="small">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="anomaly">异常</el-radio-button>
                <el-radio-button value="review">Review</el-radio-button>
                <el-radio-button value="hijacking">跟卖</el-radio-button>
                <el-radio-button value="infringement">侵权</el-radio-button>
                <el-radio-button value="competitor">竞品</el-radio-button>
              </el-radio-group>
            </div>
          </template>

          <div v-if="filteredCards.length" class="risk-list">
            <button v-for="card in filteredCards" :key="card.id" class="risk-card" @click="openCard(card)">
              <span class="card-top">
                <el-tag :type="severityType(card.severity)" size="small">{{ card.severity }}</el-tag>
                <span>{{ card.sourceLabel }}</span>
              </span>
              <strong>{{ card.title }}</strong>
              <small>{{ card.object || '-' }} · {{ statusText(card.status) }} · {{ card.assignee }}</small>
              <p>{{ card.action }}</p>
              <span class="sla">SLA {{ card.sla || '-' }}</span>
            </button>
          </div>
          <EmptyState v-else title="暂无风险任务" description="当前没有异常、Review、跟卖、侵权或竞品变化任务。" icon="CircleCheck" />
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="客户声音" name="voice">
        <div class="block-grid">
          <router-link v-for="item in reviewBlocks" :key="item.label" :to="item.path" class="block-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>进入详情</small>
          </router-link>
        </div>
      </el-tab-pane>

      <el-tab-pane label="竞品雷达" name="competitors">
        <div class="block-grid">
          <router-link v-for="item in competitorBlocks" :key="item.label" :to="item.path" class="block-card competitor">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>进入详情</small>
          </router-link>
        </div>
      </el-tab-pane>

      <el-tab-pane label="处置与复盘" name="learn">
        <div class="block-grid">
          <router-link v-for="item in learningBlocks" :key="item.label" :to="item.path" class="block-card learn">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>进入详情</small>
          </router-link>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Amazon 真实风险" name="amazon">
        <div v-loading="amzLoading">
          <!-- (B) 数据来源水印条: 诚实标注 真实/示例 -->
          <el-alert
            :type="amzBoard?.source?.mock ? 'warning' : 'success'"
            show-icon
            :closable="false"
            class="mt-16"
          >
            <template #title>
              <span v-if="amzBoard?.source?.mock">
                示例数据 (mock:true) · {{ amzBoard?.source?.reason || '领星未配置/拉取失败' }} — 凭证到位即自动切换真实拉取
              </span>
              <span v-else>
                真实数据 (mock:false) · 数据源 领星 productPerformance · 区间
                {{ amzBoard?.period?.startDate }} ~ {{ amzBoard?.period?.endDate }} ·
                {{ num(amzBoard?.source?.storeCount) }} 店 {{ num(amzBoard?.source?.asinCount) }} ASIN
              </span>
            </template>
            <template #default>
              <small>{{ amzBoard?.source?.disclaimer }}</small>
              <small v-if="amzBoard?.generatedAt"> · 生成于 {{ new Date(amzBoard.generatedAt).toLocaleString() }}</small>
            </template>
          </el-alert>

          <el-alert
            v-if="amzError"
            type="error"
            show-icon
            :closable="false"
            title="Amazon 风险看板加载失败"
            :description="amzError"
            class="mt-16"
          />

          <!-- (A) KPI 行 -->
          <div class="kpi-grid">
            <div v-for="item in amzKpis" :key="item.label" class="kpi" :class="`is-${item.status}`">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.hint }}</small>
            </div>
          </div>

          <!-- 结论摘要 -->
          <p v-if="amzBoard?.summary" class="amz-summary">{{ amzBoard.summary }}</p>

          <el-card shadow="never" class="panel mt-16">
            <template #header>
              <div class="panel-head">
                <div>
                  <h3>风险明细 (真实字段证据)</h3>
                  <p>点击行查看该 ASIN 全部真实指标 JSON。排名/评分为当期快照, 无历史趋势。</p>
                </div>
                <!-- (C) 风险类型筛选 -->
                <el-radio-group v-model="amzRiskFilter" size="small">
                  <el-radio-button value="all">全部</el-radio-button>
                  <el-radio-button value="ad_overspend">广告超支</el-radio-button>
                  <el-radio-button value="acos_high">ACOS高</el-radio-button>
                  <el-radio-button value="rating_low">评分低</el-radio-button>
                  <el-radio-button value="return_high">退货高</el-radio-button>
                  <el-radio-button value="stockout_risk">断货</el-radio-button>
                  <el-radio-button value="sales_drop">销量骤降</el-radio-button>
                </el-radio-group>
              </div>
            </template>

            <!-- (D) 风险明细表 -->
            <el-table v-if="amzFilteredRisks.length" :data="amzFilteredRisks" size="small" @row-click="openAmzRisk" class="amz-table">
              <el-table-column label="严重度" width="80">
                <template #default="{ row }"><el-tag :type="severityType(row.severity)" size="small">{{ row.severity }}</el-tag></template>
              </el-table-column>
              <el-table-column label="店铺" prop="storeName" min-width="120" show-overflow-tooltip />
              <el-table-column label="ASIN" prop="asin" width="120" />
              <el-table-column label="标题" prop="itemName" min-width="160" show-overflow-tooltip />
              <el-table-column label="风险类型" width="110">
                <template #default="{ row }">{{ RISK_TYPE_LABELS[row.riskType] || row.riskType }}</template>
              </el-table-column>
              <el-table-column label="关键指标(对比阈值)" min-width="180">
                <template #default="{ row }">{{ fmtMetric(row.metric) }}</template>
              </el-table-column>
              <el-table-column label="影响销售额" width="120">
                <template #default="{ row }">{{ money(row.impact?.impactedAmount) }}</template>
              </el-table-column>
              <el-table-column label="预估损失" width="110">
                <template #default="{ row }">{{ money(row.impact?.estimatedLoss) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="90">
                <template #default><el-button link type="primary" size="small">查看证据</el-button></template>
              </el-table-column>
            </el-table>
            <EmptyState
              v-else
              :title="amzBoard?.source?.mock ? '暂无真实风险数据' : '区间内未发现触发阈值的风险'"
              :description="amzBoard?.source?.mock ? '领星凭证未配置或拉取失败时无真实风险可展示。' : '当前区间所有 ASIN 指标均在阈值内。'"
              icon="CircleCheck"
            />
          </el-card>

          <!-- (E) 三个排行小卡 -->
          <div class="rank-grid mt-16">
            <el-card shadow="never" class="panel">
              <template #header><strong>广告烧钱榜 Top5</strong></template>
              <ol class="rank-list">
                <li v-for="r in (amzBoard?.rankings?.adBurn || [])" :key="r.asin">
                  <span>{{ r.asin }} · {{ r.storeName }}</span>
                  <em>{{ money(r.adSpend) }} · ACOS {{ (num(r.acos) * 100).toFixed(0) }}%</em>
                </li>
                <li v-if="!(amzBoard?.rankings?.adBurn || []).length" class="empty">无</li>
              </ol>
            </el-card>
            <el-card shadow="never" class="panel">
              <template #header><strong>断货倒计时榜 Top5</strong></template>
              <ol class="rank-list">
                <li v-for="r in (amzBoard?.rankings?.stockout || [])" :key="r.asin">
                  <span>{{ r.asin }} · {{ r.storeName }}</span>
                  <em>{{ num(r.availableDays).toFixed(0) }} 天 · 库存 {{ num(r.availableInventory) }}</em>
                </li>
                <li v-if="!(amzBoard?.rankings?.stockout || []).length" class="empty">无</li>
              </ol>
            </el-card>
            <el-card shadow="never" class="panel">
              <template #header><strong>店铺风险计分榜 Top5</strong></template>
              <ol class="rank-list">
                <li v-for="r in (amzBoard?.rankings?.storeScore || [])" :key="r.sid">
                  <span>{{ r.storeName }}</span>
                  <em>计分 {{ r.score }} · P0 {{ r.p0 }} / P1 {{ r.p1 }}</em>
                </li>
                <li v-if="!(amzBoard?.rankings?.storeScore || []).length" class="empty">无</li>
              </ol>
            </el-card>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="drawerOpen" size="440px" title="M4 风险证据">
      <div v-if="selected" class="drawer-body">
        <el-tag :type="severityType(selected.severity)">{{ selected.severity }}</el-tag>
        <h2>{{ selected.title }}</h2>
        <p>{{ selected.action }}</p>
        <dl>
          <dt>对象</dt><dd>{{ selected.object || '-' }}</dd>
          <dt>状态</dt><dd>{{ statusText(selected.status) }}</dd>
          <dt>负责人</dt><dd>{{ selected.assignee }}</dd>
          <dt>SLA</dt><dd>{{ selected.sla }}</dd>
          <dt>来源</dt><dd>{{ selected.sourceLabel }}</dd>
          <dt>置信度</dt><dd>{{ selected.confidence ?? '-' }}</dd>
        </dl>
        <pre>{{ JSON.stringify(selected.evidence, null, 2) }}</pre>
        <router-link :to="selected.route"><el-button type="primary" style="width: 100%">进入原深水页面</el-button></router-link>
      </div>
    </el-drawer>

    <el-drawer v-model="amzDrawerOpen" size="460px" title="Amazon 风险证据 (真实字段)">
      <div v-if="amzSelected" class="drawer-body">
        <el-tag :type="severityType(amzSelected.severity)">{{ amzSelected.severity }}</el-tag>
        <h2>{{ RISK_TYPE_LABELS[amzSelected.riskType] || amzSelected.riskType }}</h2>
        <dl>
          <dt>店铺</dt><dd>{{ amzSelected.storeName }}</dd>
          <dt>ASIN</dt><dd>{{ amzSelected.asin }}</dd>
          <dt>标题</dt><dd>{{ amzSelected.itemName || '-' }}</dd>
          <dt>关键指标</dt><dd>{{ fmtMetric(amzSelected.metric) }}</dd>
          <dt>影响销售额</dt><dd>{{ money(amzSelected.impact?.impactedAmount) }}</dd>
          <dt>预估损失</dt><dd>{{ money(amzSelected.impact?.estimatedLoss) }} ({{ amzSelected.impact?.basis }})</dd>
          <dt>币种</dt><dd>{{ amzSelected.currencyCode }}</dd>
        </dl>
        <pre>{{ JSON.stringify(amzSelected, null, 2) }}</pre>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.m4-workbench { max-width: 1440px; margin: 0 auto; }
.mt-16 { margin-top: 16px; }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 20px;
  padding: 26px;
  border-radius: 24px;
  border: 1px solid #e2d6ca;
  background:
    radial-gradient(circle at 85% 20%, rgba(190, 82, 45, .18), transparent 28%),
    linear-gradient(135deg, #fff8f1 0%, #f7efe7 46%, #edf4f5 100%);
}
.eyebrow { margin: 0 0 8px; color: #a94f2e; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.hero h2 { margin: 0; font-size: 26px; line-height: 1.25; color: #3f2d25; }
.hero p { max-width: 760px; color: #6a5a50; }
.hero-loop { display: grid; grid-template-columns: 1fr; align-content: center; gap: 6px; padding: 16px; background: rgba(255,255,255,.72); border: 1px solid rgba(63,45,37,.1); border-radius: 20px; }
.hero-loop span { text-align: center; font-weight: 800; color: #3f2d25; }
.hero-loop i { width: 1px; height: 14px; background: #cfa58f; justify-self: center; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 16px; }
.kpi { padding: 18px; border: 1px solid var(--line); border-radius: 18px; background: #fff; }
.kpi span { color: var(--text-muted); font-size: 13px; }
.kpi strong { display: block; margin: 8px 0; font-size: 28px; }
.kpi small { color: var(--text-muted); }
.kpi.is-danger { background: #fff5f4; border-color: #ffd2ca; }
.kpi.is-warning { background: #fffaf0; border-color: #f4dda8; }
.kpi.is-success { background: #f7fff8; border-color: #cdebd4; }
.ops-tabs { margin-top: 18px; }
.panel { border-radius: 18px; border: 1px solid var(--line); }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.panel-head h3 { margin: 0; }
.panel-head p { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }
.risk-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.risk-card { text-align: left; border: 1px solid var(--line); background: #fff; border-radius: 18px; padding: 16px; cursor: pointer; transition: .16s ease; }
.risk-card:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(63, 45, 37, .08); }
.card-top { display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); font-size: 12px; margin-bottom: 10px; }
.risk-card strong { display: block; font-size: 16px; color: var(--text); }
.risk-card small { display: block; margin-top: 4px; color: var(--text-muted); }
.risk-card p { min-height: 44px; color: #5c514b; line-height: 1.5; }
.sla { color: #b35b32; font-weight: 800; }
.block-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.block-card { padding: 20px; min-height: 130px; border: 1px solid var(--line); border-radius: 18px; background: #fffaf5; color: var(--text); text-decoration: none; }
.block-card.competitor { background: #f5fbff; }
.block-card.learn { background: #f8f8f8; }
.block-card span { color: var(--text-muted); }
.block-card strong { display: block; font-size: 34px; margin: 10px 0; }
.block-card small { color: var(--text-muted); }
.drawer-body h2 { margin: 12px 0; }
.drawer-body dl { display: grid; grid-template-columns: 80px 1fr; gap: 8px; }
.drawer-body dt { color: var(--text-muted); }
.drawer-body dd { margin: 0; font-weight: 600; }
.drawer-body pre { max-height: 260px; overflow: auto; padding: 12px; background: #111827; color: #ffe8d8; border-radius: 12px; font-size: 12px; }
.amz-summary { margin: 14px 0 0; padding: 12px 16px; border-radius: 14px; background: #fff8f1; border: 1px solid #e2d6ca; color: #5c514b; font-weight: 600; }
.amz-table { cursor: pointer; }
.rank-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.rank-list { margin: 0; padding: 0; list-style: none; }
.rank-list li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 13px; }
.rank-list li:last-child { border-bottom: none; }
.rank-list li span { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-list li em { color: #b35b32; font-style: normal; font-weight: 700; white-space: nowrap; }
.rank-list li.empty { color: var(--text-muted); justify-content: center; }
@media (max-width: 960px) {
  .hero { grid-template-columns: 1fr; }
  .kpi-grid, .risk-list, .block-grid, .rank-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .kpi-grid, .risk-list, .block-grid, .rank-grid { grid-template-columns: 1fr; }
  .panel-head { align-items: flex-start; flex-direction: column; }
}
</style>
