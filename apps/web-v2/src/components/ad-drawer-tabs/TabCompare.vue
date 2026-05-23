<script setup>
// 对比分析 — 双时段并列对比
import { computed, ref, watchEffect } from 'vue';
import { generateMockDailyRows } from './_mock-data.js';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const rangeA = ref([daysAgo(13), daysAgo(7)]); // last week
const rangeB = ref([daysAgo(6), today()]);     // this week

const rowsA = ref([]);
const rowsB = ref([]);

watchEffect(() => {
  if (!props.active || !props.entity?.id) return;
  rowsA.value = generateMockDailyRows(props.entity, rangeA.value, 'A');
  rowsB.value = generateMockDailyRows(props.entity, rangeB.value, 'B');
});

function totals(rows, label) {
  const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const impressions = sum('impressions');
  const clicks = sum('clicks');
  const spend = sum('spend');
  const sales = sum('sales');
  const orders = sum('orders');
  return {
    date: label,
    impressions, clicks, spend, sales, orders,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    acos: sales > 0 ? spend / sales : 0,
  };
}
const tA = computed(() => totals(rowsA.value, '时段一总计'));
const tB = computed(() => totals(rowsB.value, '时段二总计'));
const delta = computed(() => ({
  date: '环比变化',
  impressions: tA.value.impressions > 0 ? (tB.value.impressions - tA.value.impressions) / tA.value.impressions : 0,
  clicks: tA.value.clicks > 0 ? (tB.value.clicks - tA.value.clicks) / tA.value.clicks : 0,
  spend: tA.value.spend > 0 ? (tB.value.spend - tA.value.spend) / tA.value.spend : 0,
  sales: tA.value.sales > 0 ? (tB.value.sales - tA.value.sales) / tA.value.sales : 0,
  orders: tA.value.orders > 0 ? (tB.value.orders - tA.value.orders) / tA.value.orders : 0,
}));

function fmtDelta(v) {
  if (!Number.isFinite(v) || Math.abs(v) < 0.001) return '—';
  return (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}
</script>

<template>
  <div class="tab-compare">
    <div class="range-row">
      <div class="range-pick">
        <label>时段一</label>
        <el-date-picker v-model="rangeA" type="daterange" size="small" value-format="YYYY-MM-DD" style="width: 280px" />
      </div>
      <div class="range-pick">
        <label>时段二</label>
        <el-date-picker v-model="rangeB" type="daterange" size="small" value-format="YYYY-MM-DD" style="width: 280px" />
      </div>
    </div>

    <div class="compare-summary">
      <table>
        <thead>
          <tr>
            <th>指标</th><th>时段一</th><th>时段二</th><th>变化</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>曝光量</td>
            <td>{{ tA.impressions.toLocaleString() }}</td>
            <td>{{ tB.impressions.toLocaleString() }}</td>
            <td :class="{ up: delta.impressions > 0, down: delta.impressions < 0 }">{{ fmtDelta(delta.impressions) }}</td>
          </tr>
          <tr><td>点击</td>
            <td>{{ tA.clicks }}</td><td>{{ tB.clicks }}</td>
            <td :class="{ up: delta.clicks > 0, down: delta.clicks < 0 }">{{ fmtDelta(delta.clicks) }}</td>
          </tr>
          <tr><td>花费</td>
            <td>${{ tA.spend.toFixed(2) }}</td><td>${{ tB.spend.toFixed(2) }}</td>
            <td :class="{ up: delta.spend > 0, down: delta.spend < 0 }">{{ fmtDelta(delta.spend) }}</td>
          </tr>
          <tr><td>订单</td>
            <td>{{ tA.orders }}</td><td>{{ tB.orders }}</td>
            <td :class="{ up: delta.orders > 0, down: delta.orders < 0 }">{{ fmtDelta(delta.orders) }}</td>
          </tr>
          <tr><td>销售额</td>
            <td>${{ tA.sales.toFixed(2) }}</td><td>${{ tB.sales.toFixed(2) }}</td>
            <td :class="{ up: delta.sales > 0, down: delta.sales < 0 }">{{ fmtDelta(delta.sales) }}</td>
          </tr>
          <tr><td>ACoS</td>
            <td>{{ (tA.acos * 100).toFixed(2) }}%</td>
            <td>{{ (tB.acos * 100).toFixed(2) }}%</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.tab-compare { padding: 8px 0; }
.range-row { display: flex; gap: 24px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.range-pick label { font-size: 13px; color: var(--text-muted); margin-right: 8px; }

.compare-summary table { width: 100%; border-collapse: collapse; font-size: 13px; }
.compare-summary th, .compare-summary td {
  padding: 8px 12px; text-align: right; border-bottom: 1px solid #eef0f3;
}
.compare-summary th:first-child, .compare-summary td:first-child { text-align: left; }
.compare-summary thead th { background: #fafbfc; color: #6b7280; font-weight: 500; }
.up { color: #10b981; font-weight: 600; }
.down { color: #ef4444; font-weight: 600; }
</style>
