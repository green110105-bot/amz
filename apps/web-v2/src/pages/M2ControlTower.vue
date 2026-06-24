<script setup>
import { computed, onMounted, ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  profitApi,
  leaksApi,
  reorderApi,
  slowMovingApi,
  poApi,
  suppliersApi,
  repricingApi,
  fxApi,
  taxApi,
  ltvApi,
  alertsApi,
  transfersApi,
  amazonProfitApi,
} from '../api/m2';

const loading = ref(false);
const error = ref('');
const activeLane = ref('actions');
const selected = ref(null);
const drawerOpen = ref(false);
const filter = ref('all');

const state = ref({
  overview: null,
  skus: [],
  leaks: [],
  reorders: [],
  slowMoving: [],
  repricing: [],
  cashflow: null,
  cashAlerts: [],
  purchaseOrders: [],
  suppliers: [],
  transfers: [],
  fx: null,
  tax: null,
  ltv: [],
  alertEvents: [],
  amazonProfit: null,
});

// Amazon 真实利润看板状态(独立加载, 不阻塞主队列)
const amzRange = ref('30d');
const amzAsinFilter = ref('all'); // all | loss
const amzStoreFilter = ref('');   // sid 下钻
const amzLoading = ref(false);

async function loadAmazonProfit() {
  amzLoading.value = true;
  try {
    state.value.amazonProfit = await amazonProfitApi.profit({ range: amzRange.value });
  } catch (e) {
    console.warn('[m2-control] amazon-profit failed', e);
    state.value.amazonProfit = null;
  } finally {
    amzLoading.value = false;
  }
}

const amz = computed(() => state.value.amazonProfit || null);
const amzMock = computed(() => amz.value?.sourceMeta?.mock === true);
const amzSummary = computed(() => amz.value?.summary || {});
const amzCurrencySymbol = computed(() => ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥' })[amzSummary.value.currencyCode] || (amzSummary.value.currencyCode ? amzSummary.value.currencyCode + ' ' : '$'));

const amzKpis = computed(() => {
  const s = amzSummary.value;
  return [
    { label: '净销售额', value: money(s.netAmount, amzCurrencySymbol.value), hint: `销售额 ${money(s.amount, amzCurrencySymbol.value)}`, status: 'info' },
    { label: '毛利', value: money(s.grossProfit, amzCurrencySymbol.value), hint: `${s.storeCount || 0} 店 / ${s.asinCount || 0} ASIN`, status: num(s.grossProfit) < 0 ? 'danger' : 'success' },
    { label: '毛利率', value: pct(s.grossMargin), hint: `ROI ${num(s.roi).toFixed(2)}`, status: num(s.grossMargin) < 0.1 ? 'warning' : 'success' },
    { label: 'TACOS', value: pct(s.tacos), hint: `ACOS ${pct(s.acos)}`, status: num(s.tacos) > 0.3 ? 'warning' : 'info' },
    { label: 'ACOS', value: pct(s.acos), hint: '广告花费/广告销售', status: 'info' },
    { label: '亏损 ASIN', value: num(s.lossAsinCount), hint: money(s.lossAmount, amzCurrencySymbol.value), status: num(s.lossAsinCount) > 0 ? 'danger' : 'success' },
  ];
});

const amzStores = computed(() => amz.value?.stores || []);
const amzAsinsAll = computed(() => amz.value?.asins || []);
const amzAsins = computed(() => {
  let rows = amzAsinsAll.value;
  if (amzStoreFilter.value) rows = rows.filter((r) => String(r.sid) === String(amzStoreFilter.value));
  if (amzAsinFilter.value === 'loss') rows = rows.filter((r) => (r.risks || []).includes('loss'));
  return rows.slice(0, 50);
});
const amzInsights = computed(() => amz.value?.insights || {});

function healthType(h) {
  return ({ healthy: 'success', watch: 'warning', loss: 'danger' })[h] || 'info';
}
function healthLabel(h) {
  return ({ healthy: '健康', watch: '观察', loss: '亏损' })[h] || h || '-';
}
function riskLabel(r) {
  return ({ loss: '亏损', ad_eats_profit: '广告吞利', high_tacos: '高TACOS' })[r] || r;
}
function riskType(r) {
  return ({ loss: 'danger', ad_eats_profit: 'warning', high_tacos: 'warning' })[r] || 'info';
}
function drillStore(row) {
  amzStoreFilter.value = amzStoreFilter.value === row.sid ? '' : row.sid;
}

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

function money(value, currency = '$') {
  const n = num(value);
  return `${currency}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function pct(value) {
  const n = num(value);
  return `${(n * 100).toFixed(1)}%`;
}

function severityType(severity) {
  return ({ P0: 'danger', P1: 'warning', P2: 'info', critical: 'danger', high: 'warning', medium: 'info', low: 'success' })[severity] || 'info';
}

function firstNumber(obj, keys, fallback = 0) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null) return num(obj[key], fallback);
  }
  return fallback;
}

async function settle(label, promise, fallback) {
  try {
    return await promise;
  } catch (e) {
    console.warn(`[m2-control] ${label} failed`, e);
    return fallback;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [
      overview,
      skus,
      leaks,
      reorders,
      slowMoving,
      repricing,
      cashflow,
      cashAlerts,
      purchaseOrders,
      suppliers,
      transfers,
      fx,
      tax,
      ltv,
      alertEvents,
    ] = await Promise.all([
      settle('overview', profitApi.overview('30d'), {}),
      settle('skus', profitApi.skus({ range: '30d' }), {}),
      settle('leaks', leaksApi.list({ status: 'pending' }), {}),
      settle('reorder', reorderApi.list({ status: 'pending' }), {}),
      settle('slow-moving', slowMovingApi.list({ status: 'pending' }), {}),
      settle('repricing', repricingApi.list({ status: 'pending' }), {}),
      settle('cashflow', profitApi.cashflow(90), {}),
      settle('cash-alerts', profitApi.cashflowAlerts(), {}),
      settle('purchase-orders', poApi.list({}), {}),
      settle('suppliers', suppliersApi.list({}), {}),
      settle('transfers', transfersApi.list({ status: 'pending' }), {}),
      settle('fx', fxApi.sensitivity(), {}),
      settle('tax', taxApi.summary(), {}),
      settle('ltv', ltvApi.list({}), {}),
      settle('alert-events', alertsApi.events.list({ status: 'open' }), {}),
    ]);

    state.value = {
      overview,
      skus: listOf(skus, ['skus', 'items']),
      leaks: listOf(leaks, ['leaks', 'items']),
      reorders: listOf(reorders, ['decisions', 'items']),
      slowMoving: listOf(slowMoving, ['items', 'decisions']),
      repricing: listOf(repricing, ['items', 'recommendations']),
      cashflow,
      cashAlerts: listOf(cashAlerts, ['alerts', 'items']),
      purchaseOrders: listOf(purchaseOrders, ['pos', 'items']),
      suppliers: listOf(suppliers, ['suppliers', 'items']),
      transfers: listOf(transfers, ['transfers', 'items']),
      fx,
      tax,
      ltv: listOf(ltv, ['items', 'skus']),
      alertEvents: listOf(alertEvents, ['items', 'events']),
    };
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => { load(); loadAmazonProfit(); });

const overview = computed(() => state.value.overview?.overview || state.value.overview || {});

const kpis = computed(() => {
  const ov = overview.value;
  const netProfit = firstNumber(ov, ['netProfit', 'net_profit', 'profit']);
  const revenue = firstNumber(ov, ['revenue', 'sales', 'grossRevenue']);
  const margin = firstNumber(ov, ['profitMargin', 'profit_margin', 'margin']);
  const cashAlerts = state.value.cashAlerts.length;
  return [
    { label: '30天净利润', value: money(netProfit), hint: `利润率 ${pct(margin)}`, status: netProfit < 0 ? 'danger' : 'success' },
    { label: '收入规模', value: money(revenue), hint: `${num(ov.orders || ov.orderCount)} 个订单`, status: 'info' },
    { label: '待处理决策', value: actionCards.value.length, hint: '补货 / 清仓 / 调价 / 漏点', status: actionCards.value.length ? 'warning' : 'success' },
    { label: '现金预警', value: cashAlerts, hint: '未来90天资金风险', status: cashAlerts ? 'warning' : 'success' },
  ];
});

const actionCards = computed(() => {
  const cards = [];
  for (const leak of state.value.leaks) {
    cards.push({
      id: `leak-${leak.id}`,
      lane: 'profit',
      severity: leak.severity || 'P1',
      title: leak.title || '利润漏点待修复',
      object: leak.sku || leak.asin || '店铺',
      impact: money(leak.monthlyImpact ?? leak.monthly_impact ?? leak.impact),
      action: leak.recommendation || '先确认费用归因，再进入修复流程',
      evidence: leak.evidence || leak.detail || [],
      route: '/profit/leaks',
      source: leak.source || 'm2_leaks',
      confidence: leak.confidence,
    });
  }
  for (const row of state.value.reorders) {
    const reorder = row.reorder || row;
    cards.push({
      id: `reorder-${row.id || row.productId || row.sku}`,
      lane: 'inventory',
      severity: reorder.urgency === 'critical' ? 'P0' : reorder.urgency === 'high' ? 'P1' : 'P2',
      title: '补货决策待确认',
      object: row.sku || row.productId || row.asin,
      impact: money(reorder.capitalRequired || row.capitalRequired),
      action: `建议补货 ${reorder.recommendedQty ?? row.recommendedQty ?? '-'} 件，预计可售 ${reorder.daysRemaining ?? row.daysRemaining ?? '-'} 天`,
      evidence: reorder,
      route: '/inventory/reorder',
      source: 'm2_reorder_recommendations',
      confidence: row.confidence,
    });
  }
  for (const row of state.value.slowMoving) {
    cards.push({
      id: `slow-${row.id || row.sku || row.asin}`,
      lane: 'inventory',
      severity: 'P1',
      title: '滞销库存需要处理',
      object: row.sku || row.asin || row.productId,
      impact: money(row.capitalLocked || row.capital_locked || row.inventoryValue),
      action: row.recommendation || '比较继续售卖、降价清仓、移除库存的利润差',
      evidence: row.options || row,
      route: '/inventory/slow-moving',
      source: 'm2_slow_moving_decisions',
      confidence: row.confidence,
    });
  }
  for (const row of state.value.repricing) {
    cards.push({
      id: `repricing-${row.id || row.sku}`,
      lane: 'pricing',
      severity: row.risk === 'high' ? 'P1' : 'P2',
      title: '跟价 / 调价建议',
      object: row.sku || row.asin,
      impact: money(row.deltaProfit || row.expectedProfitLift || row.monthlyImpact),
      action: row.recommendation || `建议价格 ${row.recommendedPrice ?? row.nextPrice ?? '-'}`,
      evidence: row,
      route: '/repricing',
      source: 'm2_repricing_recommendations',
      confidence: row.confidence,
    });
  }
  for (const alert of state.value.cashAlerts) {
    cards.push({
      id: `cash-${alert.id || alert.title}`,
      lane: 'cash',
      severity: alert.severity || 'P1',
      title: alert.title || '现金流预警',
      object: alert.refId || alert.sku || '现金流',
      impact: money(alert.amount || alert.gap || alert.impact),
      action: alert.recommendation || alert.message || '检查 PO、回款和广告预算占用',
      evidence: alert,
      route: '/profit/cashflow',
      source: 'm2_cashflow_alerts',
      confidence: alert.confidence,
    });
  }
  return cards;
});

const filteredCards = computed(() => {
  if (filter.value === 'all') return actionCards.value;
  return actionCards.value.filter((card) => card.lane === filter.value);
});

const skuRows = computed(() => state.value.skus.slice(0, 10));
const openPOs = computed(() => state.value.purchaseOrders.filter((po) => !['closed', 'cancelled', 'received'].includes(po.status)).slice(0, 6));

const toolGroups = [
  { title: '利润深挖', desc: 'SKU、订单瀑布、漏点、情景模拟', links: [
    ['SKU 利润', '/profit/skus'], ['订单瀑布', '/profit/orders/sample'], ['漏点中心', '/profit/leaks'], ['情景模拟器', '/profit/scenario'],
  ] },
  { title: '库存采购', desc: '补货、滞销、PO、供应商、跨仓', links: [
    ['补货建议', '/inventory/reorder'], ['滞销决策', '/inventory/slow-moving'], ['采购单', '/inventory/po'], ['供应商', '/inventory/suppliers'], ['跨仓调拨', '/inventory/transfers'],
  ] },
  { title: '高级财务', desc: '多店铺、维度、汇率、支付、税务、LTV', links: [
    ['多店铺合并', '/profit/multi-store'], ['多维归集', '/profit/dimensions'], ['汇率管理', '/profit/fx'], ['支付通道', '/costs/payment-channels'], ['税务', '/tax'], ['LTV', '/profit/ltv'], ['自定义报警', '/alerts/custom'],
  ] },
];

function openCard(card) {
  selected.value = card;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="m2-control">
    <PageHeader
      title="M2 利润与库存驾驶舱"
      subtitle="把 19 个财务/库存页面收口为一个人类运营入口：先看钱，再处理 SKU 决策。"
    >
      <template #extra>
        <el-tag effect="plain" round>mock/source 保留</el-tag>
        <el-button :icon="'Refresh'" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="hero">
      <div>
        <p class="eyebrow">M2 Control Tower</p>
        <h2>今天只回答一个问题：哪些 SKU 正在亏钱、压钱、断货、该调价？</h2>
        <p class="hero-copy">
          旧功能不删除，统一藏到深水入口；日常运营默认只处理利润漏点、补货、滞销、跟价和现金流风险。
        </p>
      </div>
      <div class="hero-proof">
        <span>保留能力</span>
        <strong>19 -> 1</strong>
        <small>主导航收口，详情仍可跳转</small>
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
      title="M2 数据加载失败"
      :description="error"
      class="mt-16"
    />

    <el-tabs v-model="activeLane" class="ops-tabs">
      <el-tab-pane label="今日必须处理" name="actions">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-head">
              <div>
                <h3>决策队列</h3>
                <p>AI 只做排序和证据归因，真实执行仍进审计中心。</p>
              </div>
              <el-radio-group v-model="filter" size="small">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="profit">利润</el-radio-button>
                <el-radio-button value="inventory">库存</el-radio-button>
                <el-radio-button value="pricing">调价</el-radio-button>
                <el-radio-button value="cash">现金</el-radio-button>
              </el-radio-group>
            </div>
          </template>

          <div v-if="filteredCards.length" class="action-list">
            <button v-for="card in filteredCards" :key="card.id" class="action-card" @click="openCard(card)">
              <span class="card-top">
                <el-tag :type="severityType(card.severity)" size="small">{{ card.severity }}</el-tag>
                <span class="source">{{ card.source }}</span>
              </span>
              <strong>{{ card.title }}</strong>
              <small>{{ card.object || '-' }}</small>
              <p>{{ card.action }}</p>
              <span class="impact">影响 {{ card.impact }}</span>
            </button>
          </div>
          <EmptyState v-else title="暂无必须处理的 M2 决策" description="当前没有触发利润、库存、调价或现金流风险。" icon="CircleCheck" />
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="利润雷达" name="profit">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-head">
              <div>
                <h3>SKU 利润雷达</h3>
                <p>默认只保留运营要用的字段，完整瀑布图进入深水页面。</p>
              </div>
              <router-link to="/profit/skus"><el-button text type="primary">打开完整 SKU 利润</el-button></router-link>
            </div>
          </template>
          <el-table :data="skuRows" stripe>
            <el-table-column label="SKU" min-width="160">
              <template #default="{ row }"><strong>{{ row.sku || row.asin || '-' }}</strong></template>
            </el-table-column>
            <el-table-column label="净利" width="120" align="right">
              <template #default="{ row }">{{ money(row.netProfit ?? row.net_profit) }}</template>
            </el-table-column>
            <el-table-column label="利润率" width="100" align="right">
              <template #default="{ row }">{{ pct(row.margin ?? row.profitMargin ?? row.profit_margin) }}</template>
            </el-table-column>
            <el-table-column label="库存天数" width="100" align="right">
              <template #default="{ row }">{{ row.daysCover ?? row.days_cover ?? row.daysRemaining ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="生命周期" width="120">
              <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.lifecycle || '-' }}</el-tag></template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="资金与采购" name="cash">
        <div class="two-col">
          <el-card shadow="never" class="panel">
            <template #header><div class="panel-head"><h3>未闭环 PO</h3><router-link to="/inventory/po"><el-button text type="primary">完整采购单</el-button></router-link></div></template>
            <div class="mini-list">
              <div v-for="po in openPOs" :key="po.id" class="mini-row">
                <strong>{{ po.poNumber || po.id }}</strong>
                <span>{{ po.status || '-' }}</span>
                <em>{{ money(po.totalAmount || po.amount || po.capitalRequired) }}</em>
              </div>
              <EmptyState v-if="!openPOs.length" title="暂无未闭环 PO" description="采购链路当前没有明显阻塞。" />
            </div>
          </el-card>
          <el-card shadow="never" class="panel">
            <template #header><div class="panel-head"><h3>资金/供应链摘要</h3><router-link to="/profit/cashflow"><el-button text type="primary">现金流</el-button></router-link></div></template>
            <div class="supply-grid">
              <div><span>供应商</span><strong>{{ state.suppliers.length }}</strong></div>
              <div><span>待调拨</span><strong>{{ state.transfers.length }}</strong></div>
              <div><span>税务记录</span><strong>{{ state.tax?.records?.length || state.tax?.total || 0 }}</strong></div>
              <div><span>LTV 样本</span><strong>{{ state.ltv.length }}</strong></div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Amazon 真实利润" name="amazon">
        <el-card shadow="never" class="panel" v-loading="amzLoading">
          <template #header>
            <div class="panel-head">
              <div>
                <h3>Amazon 真实利润
                  <el-tag v-if="amzMock" type="warning" size="small" effect="dark" round>示例数据</el-tag>
                  <el-tag v-else type="success" size="small" effect="plain" round>领星真实</el-tag>
                </h3>
                <p>
                  来源: 领星 productPerformance(ASIN 维度) · 店铺级 ACOS/TACOS/ROI/毛利率由汇总额重算 ·
                  跨币种按 currencyBreakdown 分组不直接相加
                  <span v-if="amz?.partial" class="warn-inline"> · 部分店铺拉取失败({{ amz.errors.length }})</span>
                </p>
              </div>
              <div class="amz-controls">
                <el-radio-group v-model="amzRange" size="small" @change="loadAmazonProfit">
                  <el-radio-button value="7d">7天</el-radio-button>
                  <el-radio-button value="30d">30天</el-radio-button>
                  <el-radio-button value="90d">90天</el-radio-button>
                </el-radio-group>
                <el-button :icon="'Refresh'" size="small" :loading="amzLoading" @click="loadAmazonProfit">刷新</el-button>
              </div>
            </div>
          </template>

          <el-alert v-if="amzMock" type="warning" :closable="false" show-icon class="mb-12"
            title="当前为示例数据(未配置领星凭证或拉取失败)"
            :description="amz?.sourceMeta?.reason || amz?.sourceMeta?.error || '配置 LINGXING_APP_ID/SECRET 后将展示真实 Amazon 利润'" />

          <div class="kpi-grid amz-kpi">
            <div v-for="item in amzKpis" :key="item.label" class="kpi" :class="`is-${item.status}`">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.hint }}</small>
            </div>
          </div>

          <el-alert v-if="amzSummary.lossAsinCount" type="info" :closable="false" class="mb-12 summary-alert"
            :title="`${amzSummary.lossAsinCount} 个 ASIN 亏损共 ${money(amzSummary.lossAmount, amzCurrencySymbol)}; 全局 TACOS ${pct(amzSummary.tacos)}; 最赚钱店铺 ${amzSummary.topStore?.name || '-'}; 最大拖累 ${amzSummary.worstAsin?.asin || '-'}`" />

          <h4 class="amz-h4">店铺利润排行(毛利降序，点击行下钻该店 ASIN)</h4>
          <el-table :data="amzStores" stripe size="small" @row-click="drillStore" class="clickable">
            <el-table-column label="店铺" min-width="140">
              <template #default="{ row }">
                <strong>{{ row.name }}</strong>
                <el-tag v-if="amzStoreFilter === row.sid" size="small" type="primary" class="ml-6">下钻中</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="销售额" width="110" align="right"><template #default="{ row }">{{ money(row.amount, ({USD:'$',EUR:'€',GBP:'£'}[row.currencyCode] || '$')) }}</template></el-table-column>
            <el-table-column label="净销售" width="110" align="right"><template #default="{ row }">{{ money(row.netAmount, ({USD:'$',EUR:'€',GBP:'£'}[row.currencyCode] || '$')) }}</template></el-table-column>
            <el-table-column label="毛利" width="100" align="right"><template #default="{ row }"><span :class="row.grossProfit < 0 ? 'neg' : 'pos'">{{ money(row.grossProfit, ({USD:'$',EUR:'€',GBP:'£'}[row.currencyCode] || '$')) }}</span></template></el-table-column>
            <el-table-column label="毛利率" width="84" align="right"><template #default="{ row }">{{ pct(row.grossMargin) }}</template></el-table-column>
            <el-table-column label="ACOS" width="80" align="right"><template #default="{ row }">{{ pct(row.acos) }}</template></el-table-column>
            <el-table-column label="TACOS" width="80" align="right"><template #default="{ row }">{{ pct(row.tacos) }}</template></el-table-column>
            <el-table-column label="ROI" width="70" align="right"><template #default="{ row }">{{ num(row.roi).toFixed(2) }}</template></el-table-column>
            <el-table-column label="健康" width="80"><template #default="{ row }"><el-tag :type="healthType(row.health)" size="small">{{ healthLabel(row.health) }}</el-tag></template></el-table-column>
          </el-table>

          <div class="amz-h4-row">
            <h4 class="amz-h4">ASIN 利润排行(毛利降序)</h4>
            <div class="amz-controls">
              <el-radio-group v-model="amzAsinFilter" size="small">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="loss">仅亏损</el-radio-button>
              </el-radio-group>
              <el-button v-if="amzStoreFilter" text type="primary" size="small" @click="amzStoreFilter = ''">清除店铺下钻</el-button>
            </div>
          </div>
          <el-table :data="amzAsins" stripe size="small">
            <el-table-column label="ASIN / 标题" min-width="180">
              <template #default="{ row }">
                <strong>{{ row.asin }}</strong>
                <small class="asin-name">{{ row.storeName }} · {{ row.itemName }}</small>
              </template>
            </el-table-column>
            <el-table-column label="销售额" width="100" align="right"><template #default="{ row }">{{ money(row.amount, ({USD:'$',EUR:'€',GBP:'£'}[row.currencyCode] || '$')) }}</template></el-table-column>
            <el-table-column label="毛利" width="100" align="right"><template #default="{ row }"><span :class="row.grossProfit < 0 ? 'neg' : 'pos'">{{ money(row.grossProfit, ({USD:'$',EUR:'€',GBP:'£'}[row.currencyCode] || '$')) }}</span></template></el-table-column>
            <el-table-column label="毛利率" width="80" align="right"><template #default="{ row }">{{ pct(row.grossMargin) }}</template></el-table-column>
            <el-table-column label="ROI" width="64" align="right"><template #default="{ row }">{{ num(row.roi).toFixed(2) }}</template></el-table-column>
            <el-table-column label="ACOS" width="76" align="right"><template #default="{ row }">{{ pct(row.acos) }}</template></el-table-column>
            <el-table-column label="广告占比" width="84" align="right"><template #default="{ row }">{{ pct(row.adShare) }}</template></el-table-column>
            <el-table-column label="环比" width="76" align="right"><template #default="{ row }"><span :class="row.amountChainRatio < 0 ? 'neg' : 'pos'">{{ pct(row.amountChainRatio) }}</span></template></el-table-column>
            <el-table-column label="库存天数" width="84" align="right"><template #default="{ row }">{{ row.availableDays || '-' }}</template></el-table-column>
            <el-table-column label="风险" min-width="120">
              <template #default="{ row }">
                <el-tag v-for="r in row.risks" :key="r" :type="riskType(r)" size="small" class="mr-4">{{ riskLabel(r) }}</el-tag>
                <span v-if="!row.risks?.length">-</span>
              </template>
            </el-table-column>
          </el-table>

          <el-collapse class="mt-16">
            <el-collapse-item :title="`风险清单(亏损 ${amzInsights.lossAsins?.length || 0} · 广告吞利 ${amzInsights.adEatsProfit?.length || 0} · 高TACOS ${amzInsights.highTacos?.length || 0})`" name="risks">
              <div class="risk-cols">
                <div>
                  <h5>亏损 ASIN</h5>
                  <div v-for="r in (amzInsights.lossAsins || []).slice(0, 8)" :key="'l'+r.asin" class="risk-row">
                    <strong>{{ r.asin }}</strong><em class="neg">{{ money(r.grossProfit, amzCurrencySymbol) }}</em>
                  </div>
                  <EmptyState v-if="!amzInsights.lossAsins?.length" title="无亏损 ASIN" />
                </div>
                <div>
                  <h5>广告吞利</h5>
                  <div v-for="r in (amzInsights.adEatsProfit || []).slice(0, 8)" :key="'a'+r.asin" class="risk-row">
                    <strong>{{ r.asin }}</strong><span>ACOS {{ pct(r.acos) }} &gt; 毛利率 {{ pct(r.grossMargin) }}</span>
                  </div>
                  <EmptyState v-if="!amzInsights.adEatsProfit?.length" title="无广告吞利" />
                </div>
                <div>
                  <h5>高 TACOS</h5>
                  <div v-for="r in (amzInsights.highTacos || []).slice(0, 8)" :key="'t'+r.asin" class="risk-row">
                    <strong>{{ r.asin }}</strong><em class="neg">TACOS {{ pct(r.tacos) }}</em>
                  </div>
                  <EmptyState v-if="!amzInsights.highTacos?.length" title="无高 TACOS" />
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="高级工具" name="tools">
        <div class="tool-grid">
          <el-card v-for="group in toolGroups" :key="group.title" shadow="never" class="tool-card">
            <h3>{{ group.title }}</h3>
            <p>{{ group.desc }}</p>
            <div class="tool-links">
              <router-link v-for="link in group.links" :key="link[1]" :to="link[1]">{{ link[0] }}</router-link>
            </div>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="drawerOpen" size="420px" title="M2 决策证据">
      <div v-if="selected" class="drawer-body">
        <el-tag :type="severityType(selected.severity)">{{ selected.severity }}</el-tag>
        <h2>{{ selected.title }}</h2>
        <p>{{ selected.action }}</p>
        <dl>
          <dt>对象</dt><dd>{{ selected.object || '-' }}</dd>
          <dt>影响</dt><dd>{{ selected.impact }}</dd>
          <dt>来源</dt><dd>{{ selected.source }}</dd>
          <dt>置信度</dt><dd>{{ selected.confidence ?? '-' }}</dd>
        </dl>
        <pre>{{ JSON.stringify(selected.evidence, null, 2) }}</pre>
        <router-link :to="selected.route"><el-button type="primary" style="width: 100%">进入原深水页面</el-button></router-link>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.m2-control { max-width: 1440px; margin: 0 auto; }
.mt-16 { margin-top: 16px; }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 20px;
  padding: 26px;
  border: 1px solid #d7e4dc;
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 15%, rgba(64, 141, 104, 0.18), transparent 26%),
    linear-gradient(135deg, #f5fbf7 0%, #eef7f1 48%, #f8f2df 100%);
}
.eyebrow { margin: 0 0 8px; color: #38724f; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.hero h2 { margin: 0; font-size: 26px; line-height: 1.25; color: #1f3b2b; }
.hero-copy { max-width: 760px; margin: 10px 0 0; color: #526357; }
.hero-proof { display: flex; flex-direction: column; justify-content: center; align-items: center; border-radius: 20px; background: rgba(255,255,255,.78); border: 1px solid rgba(31,59,43,.12); }
.hero-proof span, .hero-proof small { color: #617066; }
.hero-proof strong { font-size: 42px; color: #1f3b2b; line-height: 1; margin: 8px 0; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 16px; }
.kpi { padding: 18px; border: 1px solid var(--line); border-radius: 18px; background: #fff; }
.kpi span { display: block; color: var(--text-muted); font-size: 13px; }
.kpi strong { display: block; margin: 8px 0; font-size: 26px; color: var(--text); }
.kpi small { color: var(--text-muted); }
.kpi.is-danger { border-color: #ffd0d0; background: #fff8f8; }
.kpi.is-warning { border-color: #f5dfaa; background: #fffaf0; }
.kpi.is-success { border-color: #cdebd4; background: #f7fff8; }
.ops-tabs { margin-top: 18px; }
.panel { border: 1px solid var(--line); border-radius: 18px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.panel-head h3 { margin: 0; font-size: 17px; }
.panel-head p { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }
.action-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.action-card { text-align: left; border: 1px solid var(--line); background: #fff; border-radius: 18px; padding: 16px; cursor: pointer; transition: .16s ease; }
.action-card:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(31, 59, 43, .08); }
.card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.source { color: var(--text-muted); font-size: 12px; }
.action-card strong { display: block; font-size: 16px; color: var(--text); }
.action-card small { display: block; margin-top: 4px; color: var(--text-muted); }
.action-card p { min-height: 42px; color: #4f5f55; line-height: 1.5; }
.impact { font-weight: 700; color: #2f7d4d; }
.two-col { display: grid; grid-template-columns: 1.2fr .8fr; gap: 16px; }
.mini-list { display: grid; gap: 10px; }
.mini-row { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 12px; background: #fafafa; border-radius: 12px; }
.mini-row span { color: var(--text-muted); }
.mini-row em { font-style: normal; font-weight: 700; color: #2f7d4d; }
.supply-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.supply-grid div { padding: 16px; border-radius: 16px; background: #f7f9f7; }
.supply-grid span { display: block; color: var(--text-muted); }
.supply-grid strong { font-size: 26px; }
.tool-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.tool-card { border-radius: 18px; }
.tool-card h3 { margin: 0; }
.tool-card p { color: var(--text-muted); }
.tool-links { display: flex; flex-wrap: wrap; gap: 8px; }
.tool-links a { padding: 7px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--text); text-decoration: none; background: #fff; }
.drawer-body h2 { margin: 12px 0; }
.drawer-body dl { display: grid; grid-template-columns: 80px 1fr; gap: 8px; }
.drawer-body dt { color: var(--text-muted); }
.drawer-body dd { margin: 0; font-weight: 600; }
.drawer-body pre { max-height: 260px; overflow: auto; padding: 12px; background: #111827; color: #d1fae5; border-radius: 12px; font-size: 12px; }
.amz-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.amz-kpi { grid-template-columns: repeat(6, 1fr); }
.amz-h4 { margin: 18px 0 8px; font-size: 15px; color: var(--text); }
.amz-h4-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.mb-12 { margin-bottom: 12px; }
.ml-6 { margin-left: 6px; }
.mr-4 { margin-right: 4px; }
.warn-inline { color: #c97a00; font-weight: 600; }
.summary-alert :deep(.el-alert__title) { font-size: 13px; line-height: 1.5; }
.clickable :deep(.el-table__row) { cursor: pointer; }
.pos { color: #2f7d4d; }
.neg { color: #d14343; font-weight: 600; }
.asin-name { display: block; color: var(--text-muted); font-size: 12px; }
.risk-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.risk-cols h5 { margin: 0 0 8px; color: var(--text); }
.risk-row { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.risk-row em { font-style: normal; }
@media (max-width: 960px) {
  .amz-kpi { grid-template-columns: repeat(3, 1fr); }
  .risk-cols { grid-template-columns: 1fr; }
  .hero, .two-col, .tool-grid { grid-template-columns: 1fr; }
  .kpi-grid, .action-list { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .kpi-grid, .action-list { grid-template-columns: 1fr; }
  .amz-kpi { grid-template-columns: repeat(2, 1fr); }
  .panel-head { align-items: flex-start; flex-direction: column; }
}
</style>
