<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { tiktokDailyApi } from '../api/m4';
import { formatCurrency, formatNumber } from '../utils/format';

const loading = ref(false);
const data = ref(null);
const range = ref([]); // [startDate, endDate] YYYY-MM-DD

const sourceMeta = computed(() => data.value?.sourceMeta || {});
const isMock = computed(() => sourceMeta.value.mock === true);
const days = computed(() => data.value?.days || []);
const hasData = computed(() => days.value.some((d) => (d.stores || []).length > 0));

// 把逐日 × 店铺拍平成单表行; 每天末尾加一行"当日小计"。日期单元格按天合并。
const rows = computed(() => {
  const out = [];
  for (const d of days.value) {
    const stores = (d.stores || []);
    if (!stores.length) continue;
    stores.forEach((s, i) => {
      out.push({ date: d.date, span: i === 0 ? stores.length + 1 : 0, storeName: s.storeName, revenue: s.revenue, volume: s.volume, kind: 'store' });
    });
    out.push({ date: d.date, span: 0, storeName: '小计', revenue: d.totalRevenue, volume: d.totalVolume, kind: 'subtotal' });
  }
  return out;
});

// 合并日期列: 同一天的所有行共用一个日期单元格
function spanMethod({ row, columnIndex }) {
  if (columnIndex === 0) return row.span > 0 ? { rowspan: row.span, colspan: 1 } : { rowspan: 0, colspan: 0 };
  return { rowspan: 1, colspan: 1 };
}
function rowClass({ row }) { return row.kind === 'subtotal' ? 'subtotal-row' : ''; }

function money(v) { return formatCurrency(Number(v) || 0, data.value?.currency || 'USD', 2); }
function n(v) { return formatNumber(Number(v) || 0); }

// 默认: 最近 7 天 (LA 时区, 含昨天)
function defaultRange() {
  const end = new Date(Date.now() - 8 * 3600e3 - 24 * 3600e3);
  const start = new Date(end.getTime() - 6 * 86400e3);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

async function load() {
  loading.value = true;
  try {
    const [startDate, endDate] = range.value?.length === 2 ? range.value : defaultRange();
    data.value = await tiktokDailyApi.range({ startDate, endDate });
  } catch (e) {
    ElMessage.error(`TikTok 日报加载失败：${e?.message || e}`);
  } finally {
    loading.value = false;
  }
}

// 快捷区间
const shortcuts = [
  { text: '最近 7 天', value: () => shiftRange(6) },
  { text: '最近 14 天', value: () => shiftRange(13) },
  { text: '最近 30 天', value: () => shiftRange(29) },
];
function shiftRange(daysBack) {
  const end = new Date(Date.now() - 8 * 3600e3 - 24 * 3600e3);
  const start = new Date(end.getTime() - daysBack * 86400e3);
  return [start, end];
}

onMounted(() => { range.value = defaultRange(); load(); });
</script>

<template>
  <div class="tiktok-report">
    <PageHeader
      title="🎵 TikTok 销售日报"
      subtitle="数据来自领星 OpenAPI（platformStatisticsV2/saleStat）· 洛杉矶日界 · 按时间区间逐日展示销量 + 销售额"
    >
      <template #extra>
        <el-date-picker
          v-model="range" type="daterange" value-format="YYYY-MM-DD" unlink-panels
          range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
          :shortcuts="shortcuts" size="default" style="width: 280px"
          @change="load"
        />
        <el-button :icon="'Refresh'" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 真实/示例 来源横幅 (诚实标注, 不伪装 real) -->
    <el-alert
      v-if="isMock"
      type="warning" :closable="false" show-icon
      title="示例数据（领星凭证未配置 / 拉取失败）"
      :description="`当前展示的是与真实结构一致的示例数据，并非真实 TikTok 销量。原因：${sourceMeta.reason || sourceMeta.error || '未接入领星凭证'}。配置 LINGXING_APP_ID/SECRET 后将自动切换为真实数据。`"
      style="margin-bottom: 16px"
    />
    <el-alert
      v-else
      type="success" :closable="false" show-icon
      :title="`真实数据 · 领星 TikTok · ${data?.startDate || ''} ~ ${data?.endDate || ''}`"
      :description="`抓取时间：${sourceMeta.fetchedAt || '-'}`"
      style="margin-bottom: 16px"
    />

    <!-- 区间汇总 -->
    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="6"><KpiCard label="区间天数" :value="data?.dayCount ?? 0" hint="LA 日界" icon="Calendar" status="info" /></el-col>
      <el-col :xs="12" :sm="6"><KpiCard label="区间总销售额" :value="money(data?.rangeRevenue)" hint="GMV" icon="Money" status="success" /></el-col>
      <el-col :xs="12" :sm="6"><KpiCard label="区间总销量" :value="n(data?.rangeVolume)" hint="单数" icon="Goods" status="default" /></el-col>
      <el-col :xs="12" :sm="6"><KpiCard label="日均销售额" :value="money((data?.rangeRevenue || 0) / Math.max(1, data?.dayCount || 1))" hint="均值" icon="TrendCharts" status="default" /></el-col>
    </el-row>

    <!-- 逐日明细 (单表; 日期按天合并, 每天末尾小计) -->
    <el-card shadow="never" class="table-card" v-loading="loading">
      <EmptyState v-if="!hasData && !loading" title="该区间无有效销售数据" description="所选时间区间内没有任何店铺产生销量/销售额。" icon="DataLine" />
      <el-table
        v-else :data="rows" size="small" border
        :span-method="spanMethod" :row-class-name="rowClass"
      >
        <el-table-column prop="date" label="日期" min-width="120" />
        <el-table-column prop="storeName" label="店铺" min-width="160">
          <template #default="{ row }">
            <span :class="{ 'subtotal-label': row.kind === 'subtotal' }">{{ row.storeName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="销售额" min-width="130" align="right">
          <template #default="{ row }">
            <strong :style="{ color: row.kind === 'subtotal' ? '#0ea5e9' : '#10b981' }">{{ money(row.revenue) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="销量" min-width="90" align="right">
          <template #default="{ row }">{{ n(row.volume) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.tiktok-report { padding: 4px; }
.kpi-row { margin-bottom: 16px; }
.kpi-row .el-col { margin-bottom: 12px; }
.table-card { border-radius: 10px; }
:deep(.subtotal-row) { background: #f0f9ff !important; font-weight: 600; }
.subtotal-label { color: #0ea5e9; font-weight: 600; }
</style>
