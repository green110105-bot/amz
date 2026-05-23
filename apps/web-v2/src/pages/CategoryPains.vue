<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockCategoryPains } from '../utils/mock-data-extras';
import { useAudit } from '../composables/useAudit';
const { submit } = useAudit();
const { isMobile } = useViewport();

const categoryFilter = ref('all');

const filtered = computed(() => mockCategoryPains.filter((p) => categoryFilter.value === 'all' || p.category === categoryFilter.value));

function severityColor(s) {
  return { critical: 'danger', high: 'danger', medium: 'warning', low: 'info' }[s] || '';
}
const mobileCols = [
  { prop: 'category', label: '类目' },
  { prop: 'painPoint', label: '痛点' },
  { prop: 'frequency', label: '频率', formatter: (v) => `${Math.round((v || 0) * 100)}%` },
  { prop: 'severity', label: '严重度' },
  { prop: 'preemptiveStrategy', label: '预防策略' },
];

async function pushToM1(p) {
  await submit({
    sourceModule: 'M4',
    actionType: 'PUSH_M1_IMPROVEMENT',
    target: { type: 'category', id: p.category },
    payload: { painPoint: p.painPoint, strategy: p.preemptiveStrategy },
    description: `推送类目痛点 "${p.painPoint}" 到 M1`,
  });
}
</script>

<template>
  <div>
    <PageHeader title="类目共性痛点" subtitle="同类目竞品差评聚类 · 你应该预防性地在 Listing 中提及">
      <template #extra>
        <el-select v-model="categoryFilter" :size="isMobile ? 'small' : 'default'" :style="isMobile ? 'width:100%' : 'width:180px'">
          <el-option label="全部类目" value="all" />
          <el-option label="电子配件" value="electronics_accessories" />
          <el-option label="家居" value="home_kitchen" />
          <el-option label="母婴" value="baby_products" />
          <el-option label="服装" value="apparel" />
        </el-select>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <ResponsiveTable :data="filtered" :mobile-columns="mobileCols" stripe>
        <el-table-column label="类目" width="160">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.category }}</el-tag></template>
        </el-table-column>
        <el-table-column label="痛点" min-width="200">
          <template #default="{ row }"><strong>{{ row.painPoint }}</strong></template>
        </el-table-column>
        <el-table-column label="频率" width="100" align="right">
          <template #default="{ row }">
            <span class="tnum">{{ Math.round(row.frequency * 100) }}%</span>
            <el-progress :percentage="Math.round(row.frequency * 100)" :stroke-width="3" :show-text="false" />
          </template>
        </el-table-column>
        <el-table-column label="严重度" width="100">
          <template #default="{ row }"><el-tag :type="severityColor(row.severity)" size="small">{{ row.severity }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="preemptiveStrategy" label="预防性策略" min-width="280" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="pushToM1(row)">推 M1</el-button></template>
        </el-table-column>
        <template #mobile-severity="{ row, value }">
          <el-tag :type="severityColor(row.severity)" size="small">{{ value }}</el-tag>
        </template>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click.stop="pushToM1(row)">推 M1</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">这是什么</h2></template>
      <p class="explain">
        系统对同类目 Top 20 竞品的差评做聚类，识别出"全行业共性痛点"。<strong>即使你的 SKU 还没收到这类差评，也应在 Listing 中预防性地提及解决方案</strong>，比同行先一步消除买家顾虑。
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.explain { font-size: 13px; line-height: 1.7; color: var(--text-muted); margin: 0; }
.explain strong { color: var(--text); }
</style>
