<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import WaterfallChart from '../components/WaterfallChart.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDrawer from '../components/ResponsiveDrawer.vue';
import { useViewport } from '../composables/useViewport';
import { useProfit } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'sku', label: 'SKU' },
  { prop: 'title', label: '标题' },
  { prop: 'netProfit', label: '净利', formatter: (v) => formatCurrency(v, 'USD') },
  { prop: 'margin', label: '利润率', formatter: (v) => formatPercent(v) },
];

const route = useRoute();
const router = useRouter();
const profit = useProfit();

const search = ref(route.query.search || '');
const lifecycleFilter = ref(route.query.lifecycle || 'all');
const range = ref(route.query.range || '30d');

const drawer = ref(false);
const selected = ref(null);
const waterfallItems = ref([]);
const waterfallLoading = ref(false);

async function load() {
  const params = { range: range.value };
  if (search.value) params.search = search.value;
  if (lifecycleFilter.value !== 'all') params.lifecycle = lifecycleFilter.value;
  await profit.fetchSkus(params);
}

watch([search, lifecycleFilter, range], () => {
  router.replace({
    query: {
      ...route.query,
      search: search.value || undefined,
      lifecycle: lifecycleFilter.value === 'all' ? undefined : lifecycleFilter.value,
      range: range.value,
    },
  });
  load();
});

onMounted(load);

const list = computed(() => profit.skus.value || []);
const loading = computed(() => profit.skusLoading.value);

async function openDetail(row) {
  selected.value = row;
  drawer.value = true;
  waterfallLoading.value = true;
  try {
    const wf = await profit.fetchWaterfall(row.sku, range.value);
    if (wf && Array.isArray(wf.items)) {
      waterfallItems.value = wf.items.map((it) => ({
        label: it.label,
        value: it.value,
        type: it.type || (it.value > 0 ? 'positive' : 'negative'),
      }));
    } else {
      // 兼容降级：用行字段构造
      const r = row;
      waterfallItems.value = [
        { label: '收入', value: r.revenue || r.price || 0, type: 'positive' },
        { label: 'COGS', value: -(r.cogs || 0), type: 'negative' },
        { label: 'Amazon 费用', value: -(r.fees || 0), type: 'negative' },
        { label: '广告分摊', value: -(r.adCost || r.ad || 0), type: 'negative' },
        { label: '退货预提', value: -(r.refund || 0), type: 'negative' },
        { label: '仓储费', value: -(r.storage || 0), type: 'negative' },
        { label: '净利润', value: r.netProfit || 0, type: 'total' },
      ];
    }
  } finally {
    waterfallLoading.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader title="单 SKU 利润" subtitle="按 SKU 看完整费用拆解 · 点行查看瀑布图">
      <template #extra>
        <el-input v-model="search" placeholder="SKU / ASIN / 标题" :prefix-icon="'Search'" size="default" style="width: 240px" clearable />
        <el-select v-model="lifecycleFilter" size="default" style="width: 140px">
          <el-option label="全部周期" value="all" />
          <el-option label="新品期" value="launch" />
          <el-option label="成长期" value="growth" />
          <el-option label="成熟期" value="mature" />
          <el-option label="衰退期" value="decline" />
        </el-select>
        <el-radio-group v-model="range" size="default">
          <el-radio-button value="7d">7d</el-radio-button>
          <el-radio-button value="30d">30d</el-radio-button>
          <el-radio-button value="90d">90d</el-radio-button>
        </el-radio-group>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <ResponsiveTable :data="list" :mobile-columns="mobileCols" row-clickable v-loading="loading" stripe @row-click="openDetail" highlight-current-row size="default" empty-text="无 SKU 数据">
        <el-table-column prop="sku" label="SKU" width="120" />
        <el-table-column prop="asin" label="ASIN" width="120" />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="周期" width="80">
          <template #default="{ row }">
            <el-tag size="small" effect="light">{{ ({ launch: '新品', growth: '成长', mature: '成熟', decline: '衰退' })[row.lifecycle] || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="单价" width="100" align="right"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.price, 'USD') }}</span></template></el-table-column>
        <el-table-column label="单件成本" width="120" align="right"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.totalCost ?? ((row.cogs || 0) + (row.fees || 0)), 'USD') }}</span></template></el-table-column>
        <el-table-column label="净利" width="120" align="right">
          <template #default="{ row }">
            <span class="tnum" :class="row.netProfit < 0 ? 'text-danger' : 'text-success'">{{ formatCurrency(row.netProfit, 'USD') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="利润率" width="100" align="right">
          <template #default="{ row }">
            <span class="tnum" :class="row.margin < 0 ? 'text-danger' : 'text-success'">{{ formatPercent(row.margin) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="库存天数" width="100" align="right">
          <template #default="{ row }">
            <span class="tnum" :class="row.daysCover < 7 ? 'text-danger' : row.daysCover > 90 ? 'text-warning' : ''">{{ row.daysCover ?? '-' }} 天</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click.stop="openDetail(row)">详情</el-button>
        </template>
      </ResponsiveTable>
      <EmptyState v-if="!loading && list.length === 0" title="无 SKU 数据" description="可能后端尚未就绪或当前筛选无匹配" />
    </el-card>

    <ResponsiveDrawer v-model="drawer" :title="selected ? `${selected.sku} 利润详情` : ''" size="640px">
      <div v-if="selected" class="detail">
        <div class="detail-head">
          <div>
            <h3 style="margin: 0">{{ selected.title }}</h3>
            <p class="text-muted" style="margin: 4px 0 0">{{ selected.asin }} · {{ selected.brand }} · {{ selected.category }}</p>
          </div>
          <el-tag :type="selected.netProfit < 0 ? 'danger' : 'success'" size="default">
            {{ selected.netProfit < 0 ? '亏损 SKU' : '盈利' }} · {{ formatPercent(selected.margin) }}
          </el-tag>
        </div>

        <h4 class="detail-title">单件利润瀑布</h4>
        <div v-loading="waterfallLoading">
          <WaterfallChart :items="waterfallItems" :height="240" />
        </div>

        <h4 class="detail-title">关联决策</h4>
        <el-button type="primary" plain :icon="'TrendCharts'" @click="router.push('/profit/leaks')">查看相关漏点</el-button>
        <el-button plain :icon="'Box'" @click="router.push('/inventory/reorder')">查看补货建议</el-button>
        <el-button plain :icon="'BellFilled'" @click="router.push('/workbench?filter=ad_suggestion')">查看广告建议</el-button>
      </div>
    </ResponsiveDrawer>
  </div>
</template>

<style scoped>
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.detail-title { font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 24px 0 12px; letter-spacing: 0.04em; text-transform: uppercase; }
</style>
