<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { tiktokDailyApi } from '../api/m4';
import { useViewport } from '../composables/useViewport';
import { formatCurrency, formatNumber } from '../utils/format';

const { isMobile } = useViewport();

const loading = ref(false);
const data = ref(null);
const range = ref([]); // [startDate, endDate] YYYY-MM-DD
const mode = ref('real'); // 'real' = 真实销售(剔样品) | 'salestat' = saleStat 汇总

const sourceMeta = computed(() => data.value?.sourceMeta || {});
const isMock = computed(() => sourceMeta.value.mock === true);
const days = computed(() => data.value?.days || []);
const hasData = computed(() => days.value.some((d) => (d.stores || []).length > 0));

// 透视表: 行=日期, 列=各店铺(放到列头)。先取区间内出现过的全部店铺作为列。
const storeColumns = computed(() => {
  const seen = new Map(); // storeId -> storeName, 保持首次出现顺序
  for (const d of days.value) {
    for (const s of (d.stores || [])) {
      if (!seen.has(s.storeId)) seen.set(s.storeId, s.storeName);
    }
  }
  return [...seen.entries()].map(([storeId, storeName]) => ({ storeId, storeName }));
});

// 每行 = 一天; 行内每个店铺一对 {rev_<id>, vol_<id>}; 末尾合计。
const rows = computed(() => {
  return days.value.map((d) => {
    const row = { date: d.date, _totalRev: d.totalRevenue, _totalVol: d.totalVolume };
    const byId = {};
    for (const s of (d.stores || [])) byId[s.storeId] = s;
    for (const col of storeColumns.value) {
      const s = byId[col.storeId];
      row[`rev_${col.storeId}`] = s ? s.revenue : 0;
      row[`vol_${col.storeId}`] = s ? s.volume : 0;
    }
    return row;
  });
});

function money(v) { return formatCurrency(Number(v) || 0, data.value?.currency || 'USD', 2); }
function n(v) { return formatNumber(Number(v) || 0); }

// 默认: 最近 7 天 (LA 时区, 含昨天)
function defaultRange() {
  const end = new Date(Date.now() - 8 * 3600e3 - 24 * 3600e3);
  const start = new Date(end.getTime() - 6 * 86400e3);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

const rangeSampleOrders = computed(() => data.value?.rangeSampleOrders || 0);

async function load() {
  loading.value = true;
  try {
    const [startDate, endDate] = range.value?.length === 2 ? range.value : defaultRange();
    data.value = mode.value === 'real'
      ? await tiktokDailyApi.realSales({ startDate, endDate })
      : await tiktokDailyApi.range({ startDate, endDate });
  } catch (e) {
    ElMessage.error(`TikTok 日报加载失败：${e?.message || e}`);
  } finally {
    loading.value = false;
  }
}
function switchMode(m) { mode.value = m; load(); }

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
      :subtitle="mode === 'real'
        ? '真实销售口径：按领星订单明细，剔除「样品订单」(送达人/联盟，$0)与零价赠品后重算 · 洛杉矶日界'
        : 'saleStat 汇总口径：领星 platformStatisticsV2/saleStat（含样品订单，数字偏高）· 洛杉矶日界'"
    >
      <template #extra>
        <el-radio-group v-model="mode" size="default" @change="(m) => switchMode(m)">
          <el-radio-button label="real">真实销售（剔样品）</el-radio-button>
          <el-radio-button label="salestat">saleStat 汇总</el-radio-button>
        </el-radio-group>
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
      <el-col :xs="12" :sm="6"><KpiCard label="区间总销售额" :value="money(data?.rangeRevenue)" :hint="mode === 'real' ? '真实成交' : 'GMV'" icon="Money" status="success" /></el-col>
      <el-col :xs="12" :sm="6"><KpiCard label="区间总销量" :value="n(data?.rangeVolume)" hint="件数" icon="Goods" status="default" /></el-col>
      <el-col :xs="12" :sm="6"><KpiCard label="日均销售额" :value="money((data?.rangeRevenue || 0) / Math.max(1, data?.dayCount || 1))" hint="均值" icon="TrendCharts" status="default" /></el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard v-if="mode === 'real'" label="已剔除样品单" :value="n(rangeSampleOrders)" hint="送达人/联盟 $0" icon="Present" status="warning" />
        <KpiCard v-else label="区间天数" :value="data?.dayCount ?? 0" hint="LA 日界" icon="Calendar" status="info" />
      </el-col>
    </el-row>

    <EmptyState v-if="!hasData && !loading" title="该区间无有效销售数据" description="所选时间区间内没有任何店铺产生销量/销售额。" icon="DataLine" />

    <!-- 桌面: 透视表 (行=日期, 列=各店铺) -->
    <el-card v-if="!isMobile && hasData" shadow="never" class="table-card" v-loading="loading">
      <el-table :data="rows" size="small" border>
        <el-table-column prop="date" label="日期" fixed min-width="110" />
        <el-table-column v-for="col in storeColumns" :key="col.storeId" :label="col.storeName" align="center">
          <el-table-column :label="'销售额'" align="right" min-width="120">
            <template #default="{ row }">
              <span :style="{ color: row[`rev_${col.storeId}`] ? '#10b981' : '#cbd5e1' }">{{ money(row[`rev_${col.storeId}`]) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="'销量'" align="right" min-width="80">
            <template #default="{ row }">
              <span :style="{ color: row[`vol_${col.storeId}`] ? '#334155' : '#cbd5e1' }">{{ n(row[`vol_${col.storeId}`]) }}</span>
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="当日合计" align="center" class-name="total-col">
          <el-table-column label="销售额" align="right" min-width="120">
            <template #default="{ row }"><strong style="color:#0ea5e9">{{ money(row._totalRev) }}</strong></template>
          </el-table-column>
          <el-table-column label="销量" align="right" min-width="80">
            <template #default="{ row }"><strong>{{ n(row._totalVol) }}</strong></template>
          </el-table-column>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 移动: 逐日卡片 (每天一张, 内含各店铺) -->
    <div v-else-if="isMobile && hasData" v-loading="loading" class="mobile-days">
      <el-card v-for="day in days" :key="day.date" shadow="never" class="m-day-card" v-show="(day.stores || []).length > 0">
        <div class="m-day-head">
          <span class="m-day-date">📅 {{ day.date }}</span>
          <span class="m-day-tot">
            <strong style="color:#0ea5e9">{{ money(day.totalRevenue) }}</strong>
            <span class="m-vol">{{ n(day.totalVolume) }} 件</span>
          </span>
        </div>
        <div v-for="s in day.stores" :key="s.storeId" class="m-store-row">
          <span class="m-store-name">{{ s.storeName }}</span>
          <span class="m-store-val">
            <strong style="color:#10b981">{{ money(s.revenue) }}</strong>
            <span class="m-store-vol">{{ n(s.volume) }} 件<em v-if="s.sampleOrders"> · 剔{{ s.sampleOrders }}样</em></span>
          </span>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.tiktok-report { padding: 4px; }
.kpi-row { margin-bottom: 16px; }
.kpi-row .el-col { margin-bottom: 12px; }
.table-card { border-radius: 10px; }
:deep(.total-col) { background: #f0f9ff; }
:deep(.el-table th.el-table__cell) { background: #f8fafc; }

/* 移动逐日卡片 */
.mobile-days { display: flex; flex-direction: column; gap: 10px; }
.m-day-card { border-radius: 10px; }
.m-day-card :deep(.el-card__body) { padding: 12px; }
.m-day-head { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 8px; border-bottom: 1px solid #eef2f7; margin-bottom: 8px; }
.m-day-date { font-weight: 600; font-size: 14px; }
.m-day-tot { text-align: right; }
.m-day-tot strong { font-size: 15px; }
.m-vol { display: block; font-size: 11px; color: #94a3b8; }
.m-store-row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; }
.m-store-name { font-size: 13px; color: #334155; }
.m-store-val { text-align: right; }
.m-store-vol { display: block; font-size: 11px; color: #94a3b8; }
.m-store-vol em { color: #f59e0b; font-style: normal; }

/* 移动端: 顶部控件换行不挤 */
@media (max-width: 767px) {
  :deep(.page-header-extra), .tiktok-report :deep(.el-date-editor) { width: 100% !important; }
  .tiktok-report :deep(.el-radio-group) { width: 100%; display: flex; }
  .tiktok-report :deep(.el-radio-button) { flex: 1; }
  .tiktok-report :deep(.el-radio-button__inner) { width: 100%; }
}
</style>
