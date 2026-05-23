<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { useProfit } from '../composables/useM2State';
import { formatCurrency } from '../utils/format';

const { isMobile } = useViewport();
const mobileEventCols = [
  { prop: 'event_date', label: '日期', formatter: (v, r) => v || r.date },
  { prop: 'label', label: '事件' },
  { prop: 'inflow', label: '入账', formatter: (v) => v > 0 ? formatCurrency(v) : '-' },
  { prop: 'outflow', label: '出账', formatter: (v) => v > 0 ? `-${formatCurrency(v)}` : '-' },
  { prop: 'balance', label: '结余', formatter: (v) => formatCurrency(v) },
];

const route = useRoute();
const router = useRouter();
const profit = useProfit();

const range = ref(Number(route.query.days) || 90);

// 新建事件 dialog
const dialog = ref(false);
const draftKey = 'm2:draft:cashflow_event';
const draft = ref({
  event_date: '',
  label: '',
  inflow: 0,
  outflow: 0,
  source: 'manual',
});

function loadDraft() {
  try {
    const v = localStorage.getItem(draftKey);
    if (v) draft.value = { ...draft.value, ...JSON.parse(v) };
  } catch {}
}
function saveDraft() {
  try {
    localStorage.setItem(draftKey, JSON.stringify(draft.value));
  } catch {}
}
function clearDraft() {
  try { localStorage.removeItem(draftKey); } catch {}
}

async function load() {
  await profit.fetchCashflow(range.value);
}

watch(range, (v) => {
  router.replace({ query: { ...route.query, days: String(v) } });
  load();
});

watch(draft, saveDraft, { deep: true });

onMounted(() => {
  loadDraft();
  load();
});

const data = computed(() => profit.cashflow.value);
const loading = computed(() => profit.cashflowLoading.value);
const points = computed(() => data.value?.points || []);
const events = computed(() => points.value.filter((p) => p.label));
const summary = computed(() => data.value?.summary || {});
const alerts = computed(() => data.value?.alerts || []);

const minBalance = computed(() => {
  const arr = points.value.map((p) => p.balance).filter((v) => Number.isFinite(v));
  return arr.length ? Math.min(...arr) : 0;
});
const maxBalance = computed(() => {
  const arr = points.value.map((p) => p.balance).filter((v) => Number.isFinite(v));
  return arr.length ? Math.max(...arr) : 0;
});
const today = computed(() => summary.value?.today ?? points.value[0]?.balance ?? 0);
const future30 = computed(() => summary.value?.future30 ?? points.value[Math.min(29, points.value.length - 1)]?.balance ?? 0);
const future90 = computed(() => summary.value?.future90 ?? points.value[points.value.length - 1]?.balance ?? 0);
const lowestPoint = computed(() =>
  points.value.find((p) => p.balance === (summary.value?.minBalance ?? minBalance.value)),
);

const chartData = computed(() => {
  const w = 800;
  const h = 220;
  const pts = points.value;
  if (pts.length === 0) return { w, h, path: '', areaPath: '', eventDots: [] };
  const min = minBalance.value;
  const max = maxBalance.value;
  const r = max - min || 1;
  const stepX = w / (pts.length - 1 || 1);
  const path = pts
    .map((p, i) => {
      const x = i * stepX;
      const y = h - ((p.balance - min) / r) * (h - 16) - 8;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `${path} L ${(pts.length - 1) * stepX} ${h} L 0 ${h} Z`;
  const eventDots = pts
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.label)
    .map((p) => ({
      x: p.i * stepX,
      y: h - ((p.balance - min) / r) * (h - 16) - 8,
      label: p.label,
      date: p.event_date || p.date,
      balance: p.balance,
    }));
  return { w, h, path, areaPath, eventDots };
});

async function submitEvent() {
  if (!draft.value.event_date || !draft.value.label) {
    ElMessage.warning('请填写日期与标签');
    return;
  }
  try {
    await profit.createCashflowEvent(draft.value);
    dialog.value = false;
    clearDraft();
    draft.value = { event_date: '', label: '', inflow: 0, outflow: 0, source: 'manual' };
    await load();
  } catch {}
}
</script>

<template>
  <div>
    <PageHeader title="现金流时序" subtitle="未来 90 天应收 / 应付 / 在途 / 可用，识别现金缺口">
      <template #extra>
        <el-radio-group v-model="range" size="default">
          <el-radio-button :value="30">30 天</el-radio-button>
          <el-radio-button :value="60">60 天</el-radio-button>
          <el-radio-button :value="90">90 天</el-radio-button>
        </el-radio-group>
        <el-button type="primary" plain :icon="'Plus'" @click="dialog = true">新增事件</el-button>
      </template>
    </PageHeader>

    <el-row v-loading="loading" :gutter="16" class="kpi-row">
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="当前可用现金" :value="formatCurrency(today)" status="success" icon="Wallet" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="30 天后预计" :value="formatCurrency(future30)" :trend="(future30 - today >= 0 ? '+' : '') + formatCurrency(future30 - today)" :trendType="future30 >= today ? 'up' : 'down'" hint="预测" status="default" icon="TrendCharts" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="90 天后预计" :value="formatCurrency(future90)" hint="预测" status="info" icon="DataAnalysis" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="期间最低点" :value="formatCurrency(summary?.minBalance ?? minBalance)" :hint="summary?.minBalanceDate || lowestPoint?.event_date || lowestPoint?.date || '-'" :status="(summary?.minBalance ?? minBalance) < 200000 ? 'warning' : 'success'" icon="Bottom" /></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">现金流走势</h2>
          <span class="text-muted">含双周 Amazon 结算 · PingPong 提现 · 采购付款</span>
        </div>
      </template>
      <div class="chart-wrap" v-loading="loading">
        <svg :viewBox="`0 0 ${chartData.w} ${chartData.h}`" preserveAspectRatio="none" class="cashflow-svg">
          <defs>
            <linearGradient id="cfgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2563eb" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#2563eb" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path :d="chartData.areaPath" fill="url(#cfgrad)" />
          <path :d="chartData.path" stroke="#2563eb" stroke-width="2" fill="none" />
          <g v-for="(dot, i) in chartData.eventDots" :key="i">
            <circle :cx="dot.x" :cy="dot.y" r="4" fill="#fff" stroke="#2563eb" stroke-width="2" />
            <text :x="dot.x" :y="Math.max(dot.y - 10, 12)" font-size="10" fill="#6b7280" text-anchor="middle">{{ dot.label }}</text>
          </g>
        </svg>
      </div>
    </el-card>

    <el-row :gutter="16" class="mt-16">
      <el-col :xs="24" :sm="24" :md="14" :lg="14">
        <el-card shadow="never" style="margin-bottom: 16px">
          <template #header>
            <h2 class="section-title">关键事件</h2>
          </template>
          <ResponsiveTable :data="events" :mobile-columns="mobileEventCols" size="default" stripe empty-text="暂无事件">
            <el-table-column label="日期" width="120">
              <template #default="{ row }">{{ row.event_date || row.date }}</template>
            </el-table-column>
            <el-table-column prop="label" label="事件" width="180" />
            <el-table-column label="入账" align="right" width="120">
              <template #default="{ row }"><span class="tnum text-success">{{ row.inflow > 0 ? formatCurrency(row.inflow) : '-' }}</span></template>
            </el-table-column>
            <el-table-column label="出账" align="right" width="120">
              <template #default="{ row }"><span class="tnum text-danger">{{ row.outflow > 0 ? `-${formatCurrency(row.outflow)}` : '-' }}</span></template>
            </el-table-column>
            <el-table-column label="结余" align="right">
              <template #default="{ row }"><span class="tnum">{{ formatCurrency(row.balance) }}</span></template>
            </el-table-column>
          </ResponsiveTable>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="10" :lg="10">
        <el-card shadow="never">
          <template #header>
            <h2 class="section-title">AI 现金流提醒</h2>
          </template>
          <ul v-if="alerts.length" class="alert-list">
            <li v-for="(a, i) in alerts" :key="i">
              <el-icon class="alert-icon" :class="a.level === 'warn' ? 'warn' : a.level === 'info' ? 'info' : 'ok'">
                <WarningFilled v-if="a.level === 'warn'" />
                <CircleCheckFilled v-else-if="a.level === 'ok'" />
                <InfoFilled v-else />
              </el-icon>
              <div>
                <b>{{ a.title }}</b>
                <p>{{ a.detail }}</p>
              </div>
            </li>
          </ul>
          <p v-else class="text-muted">暂无提醒</p>
        </el-card>
      </el-col>
    </el-row>

    <ResponsiveDialog v-model="dialog" title="新增现金流事件" width="480px">
      <el-form :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'left'">
        <el-form-item label="日期">
          <el-date-picker v-model="draft.event_date" type="date" value-format="YYYY-MM-DD" placeholder="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="draft.label" placeholder="如：PO-020 定金" />
        </el-form-item>
        <el-form-item label="入账">
          <el-input-number v-model="draft.inflow" :min="0" :step="1000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="出账">
          <el-input-number v-model="draft.outflow" :min="0" :step="1000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="draft.source" style="width: 100%">
            <el-option label="手工" value="manual" />
            <el-option label="Amazon 结算" value="amazon_settle" />
            <el-option label="PingPong 提现" value="pingpong_withdraw" />
            <el-option label="PO 定金" value="po_deposit" />
            <el-option label="PO 尾款" value="po_balance" />
            <el-option label="预测" value="forecast" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submitEvent">提交</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.kpi-row .el-col { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.chart-wrap { width: 100%; height: 240px; }
.cashflow-svg { width: 100%; height: 100%; }
.alert-list { list-style: none; padding: 0; margin: 0; }
.alert-list li { display: flex; gap: 10px; padding: 12px 0; border-bottom: 1px dashed var(--line-soft); }
.alert-list li:last-child { border-bottom: none; }
.alert-icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
.alert-icon.warn { color: var(--warning); }
.alert-icon.ok { color: var(--success); }
.alert-icon.info { color: var(--info); }
.alert-list b { display: block; margin-bottom: 2px; font-size: 13px; }
.alert-list p { margin: 0; color: var(--text-muted); font-size: 12px; }
</style>
