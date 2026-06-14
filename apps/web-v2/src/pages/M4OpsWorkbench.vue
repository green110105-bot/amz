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
} from '../api/m4';

const loading = ref(false);
const error = ref('');
const activeLane = ref('inbox');
const sourceFilter = ref('all');
const selected = ref(null);
const drawerOpen = ref(false);

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

onMounted(load);

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
@media (max-width: 960px) {
  .hero { grid-template-columns: 1fr; }
  .kpi-grid, .risk-list, .block-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .kpi-grid, .risk-list, .block-grid { grid-template-columns: 1fr; }
  .panel-head { align-items: flex-start; flex-direction: column; }
}
</style>
