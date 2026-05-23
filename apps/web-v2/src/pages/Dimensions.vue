<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useDimensions } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const dimensions = useDimensions();

const by = ref(route.query.by || 'brand');
const items = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const state = await dimensions.fetch(by.value, true);
    items.value = state.items.value || [];
  } finally {
    loading.value = false;
  }
}

watch(by, () => {
  router.replace({ query: { ...route.query, by: by.value } });
  load();
});

onMounted(load);

const labels = { brand: '品牌', team: '团队', owner: '运营', project: '项目' };
const mobileCols = computed(() => [
  { prop: 'name', label: labels[by.value] },
  { prop: 'metrics.gmv', label: 'GMV', formatter: (v, r) => formatCurrency(v ?? r.gmv) },
  { prop: 'metrics.profit', label: '利润', formatter: (v, r) => formatCurrency(v ?? r.profit) },
  { prop: 'metrics.margin', label: '利润率', formatter: (v, r) => formatPercent(v ?? r.margin) },
]);
</script>

<template>
  <div>
    <PageHeader title="多维度归集" subtitle="按 品牌 / 项目 / 团队 / 运营人员 看利润分布" />

    <el-card shadow="never">
      <el-tabs v-model="by">
        <el-tab-pane label="按品牌" name="brand" />
        <el-tab-pane label="按团队" name="team" />
        <el-tab-pane label="按运营" name="owner" />
        <el-tab-pane label="按项目" name="project" />
      </el-tabs>

      <ResponsiveTable :data="items" :mobile-columns="mobileCols" v-loading="loading" stripe empty-text="无维度数据">
        <el-table-column :label="labels[by]" min-width="160">
          <template #default="{ row }"><strong>{{ row.name }}</strong></template>
        </el-table-column>
        <el-table-column v-if="by === 'team'" label="成员" align="right" width="100">
          <template #default="{ row }"><span class="tnum">{{ row.members || 0 }}</span></template>
        </el-table-column>
        <el-table-column label="SKU 数" align="right" width="100">
          <template #default="{ row }"><span class="tnum">{{ row.metrics?.skus ?? row.skus ?? 0 }}</span></template>
        </el-table-column>
        <el-table-column label="GMV" align="right" width="140">
          <template #default="{ row }"><span class="tnum">{{ formatCurrency(row.metrics?.gmv ?? row.gmv) }}</span></template>
        </el-table-column>
        <el-table-column label="利润" align="right" width="140">
          <template #default="{ row }"><span class="tnum text-success">{{ formatCurrency(row.metrics?.profit ?? row.profit) }}</span></template>
        </el-table-column>
        <el-table-column label="利润率" align="right" width="100">
          <template #default="{ row }"><span class="tnum">{{ formatPercent(row.metrics?.margin ?? row.margin) }}</span></template>
        </el-table-column>
      </ResponsiveTable>
      <EmptyState v-if="!loading && !items.length" title="暂无维度数据" description="后端尚未生成维度归集快照" />
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
</style>
