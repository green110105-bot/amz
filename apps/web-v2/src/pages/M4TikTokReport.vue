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
const date = ref(''); // 空 = 后端取洛杉矶昨天

const sourceMeta = computed(() => data.value?.sourceMeta || {});
const isMock = computed(() => sourceMeta.value.mock === true);
const stores = computed(() => data.value?.stores || []);
const hasData = computed(() => stores.value.length > 0);

function money(v) { return formatCurrency(Number(v) || 0, data.value?.currency || 'USD', 2); }
function n(v) { return formatNumber(Number(v) || 0); }

async function load(refresh = false) {
  loading.value = true;
  try {
    const params = {};
    if (date.value) params.date = date.value;
    if (refresh) params.refresh = 1;
    data.value = await tiktokDailyApi.get(params);
  } catch (e) {
    ElMessage.error(`TikTok 日报加载失败：${e?.message || e}`);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
</script>

<template>
  <div class="tiktok-report">
    <PageHeader
      title="🎵 TikTok 销售日报"
      subtitle="数据来自领星 OpenAPI（platformStatisticsV2/saleStat）· 洛杉矶日界 · 销量 + 销售额，按店铺聚合"
    >
      <template #extra>
        <el-date-picker
          v-model="date" type="date" value-format="YYYY-MM-DD"
          placeholder="默认昨天(LA)" size="default" style="width: 160px"
          @change="() => load()"
        />
        <el-button :icon="'Refresh'" :loading="loading" @click="load(true)">刷新真实数据</el-button>
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
      :title="`真实数据 · 领星 TikTok · ${sourceMeta.platform || 'TikTok'}`"
      :description="sourceMeta.stale ? `注意：实时拉取失败，展示的是已缓存快照（${sourceMeta.error || ''}）。` : `抓取时间：${sourceMeta.fetchedAt || '-'}`"
      style="margin-bottom: 16px"
    />

    <!-- 全站汇总 -->
    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="6"><KpiCard label="日期(洛杉矶)" :value="data?.date || '-'" hint="LA 日界" icon="Calendar" status="info" /></el-col>
      <el-col :xs="12" :sm="6"><KpiCard label="统计店铺数" :value="data?.storeCount ?? 0" hint="有销量的店铺" icon="Shop" status="default" /></el-col>
      <el-col :xs="12" :sm="6"><KpiCard label="全站销售额" :value="money(data?.totalRevenue)" hint="GMV" icon="Money" status="success" /></el-col>
      <el-col :xs="12" :sm="6"><KpiCard label="全站销量" :value="n(data?.totalVolume)" hint="单数" icon="Goods" status="default" /></el-col>
    </el-row>

    <!-- 分店铺 -->
    <el-card shadow="never" class="store-card" v-loading="loading">
      <template #header><span class="card-title">🏪 分店铺销售</span></template>
      <el-table v-if="hasData" :data="stores" stripe>
        <el-table-column prop="storeName" label="店铺" min-width="160" />
        <el-table-column label="销售额" min-width="140" align="right">
          <template #default="{ row }"><strong style="color:#10b981">{{ money(row.revenue) }}</strong></template>
        </el-table-column>
        <el-table-column label="销量" min-width="100" align="right">
          <template #default="{ row }">{{ n(row.volume) }}</template>
        </el-table-column>
        <el-table-column prop="storeId" label="店铺 ID" min-width="180" class-name="muted-col" />
      </el-table>
      <EmptyState v-else title="今日无有效销售数据" description="该日期下没有任何店铺产生销量/销售额。" icon="DataLine" />
    </el-card>
  </div>
</template>

<style scoped>
.tiktok-report { padding: 4px; }
.kpi-row { margin-bottom: 16px; }
.kpi-row .el-col { margin-bottom: 12px; }
.store-card { border-radius: 10px; }
.card-title { font-weight: 600; }
:deep(.muted-col) { color: #9ca3af; font-size: 12px; }
</style>
