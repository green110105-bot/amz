<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import { mockSkus } from '../utils/mock-data';

const router = useRouter();
const search = ref('');
const scoreRange = ref('all');
const drawerSku = ref(null);

const filtered = computed(() => {
  return mockSkus.filter((s) => {
    if (search.value && !`${s.sku} ${s.asin} ${s.title}`.toLowerCase().includes(search.value.toLowerCase())) return false;
    if (scoreRange.value === 'low' && s.score >= 60) return false;
    if (scoreRange.value === 'mid' && (s.score < 60 || s.score >= 80)) return false;
    if (scoreRange.value === 'high' && s.score < 80) return false;
    return true;
  });
});

const summary = computed(() => ({
  total: mockSkus.length,
  low: mockSkus.filter((s) => s.score < 60).length,
  avgScore: Math.round(mockSkus.reduce((s, x) => s + x.score, 0) / mockSkus.length),
  highPotential: mockSkus.filter((s) => s.score < 70).length,
}));

function scoreClass(score) {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
}

function scoreType(score) {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

function openOptimize(sku) {
  router.push(`/listings/optimize?asin=${sku.asin}`);
}
</script>

<template>
  <div>
    <PageHeader title="商品列表" subtitle="所有 SKU · 5 维评分概览 · 改进潜力">
      <template #extra>
        <el-input v-model="search" placeholder="SKU / ASIN / 标题" :prefix-icon="'Search'" size="default" style="width: 240px" clearable />
        <el-select v-model="scoreRange" size="default" style="width: 140px">
          <el-option label="全部" value="all" />
          <el-option label="低分 (<60)" value="low" />
          <el-option label="中分 (60-80)" value="mid" />
          <el-option label="高分 (≥80)" value="high" />
        </el-select>
      </template>
    </PageHeader>

    <div class="kpi-row">
      <KpiCard label="总 SKU 数" :value="summary.total" status="default" icon="Goods" />
      <KpiCard label="低分 SKU" :value="summary.low" hint="评分 &lt; 60" status="danger" icon="Warning" />
      <KpiCard label="平均评分" :value="summary.avgScore" hint="百分制" :status="summary.avgScore >= 70 ? 'success' : 'warning'" icon="DataAnalysis" />
      <KpiCard label="高改进潜力" :value="summary.highPotential" hint="评分 &lt; 70" status="info" icon="MagicStick" />
    </div>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <h2 class="section-title">SKU 列表（按评分升序）</h2>
      </template>
      <el-table :data="filtered" stripe size="default">
        <el-table-column label="SKU" width="120">
          <template #default="{ row }"><strong>{{ row.sku }}</strong></template>
        </el-table-column>
        <el-table-column label="ASIN" width="120"><template #default="{ row }"><span class="tnum text-muted">{{ row.asin }}</span></template></el-table-column>
        <el-table-column label="标题" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.title }}</div>
            <div class="text-muted" style="font-size: 11px">{{ row.brand }} · {{ row.category }}</div>
          </template>
        </el-table-column>
        <el-table-column label="评分" width="120">
          <template #default="{ row }">
            <div class="score-cell">
              <strong :class="scoreClass(row.score)">{{ row.score }}</strong>
              <el-progress :percentage="row.score" :stroke-width="6" :status="scoreType(row.score) === 'success' ? 'success' : scoreType(row.score) === 'warning' ? 'warning' : 'exception'" :show-text="false" style="width: 60px" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="评论 / 评分" width="120">
          <template #default="{ row }">
            <div class="tnum">{{ row.reviewCount }}</div>
            <div class="text-muted" style="font-size: 12px">⭐ {{ row.rating }}</div>
          </template>
        </el-table-column>
        <el-table-column label="周期" width="80">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ ({ launch: '新品', growth: '成长', mature: '成熟', decline: '衰退' })[row.lifecycle] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.score < 60 ? 'danger' : row.score < 80 ? 'warning' : 'success'">
              {{ row.score < 60 ? '优先改' : row.score < 80 ? '可优化' : '健康' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" type="primary" :icon="'MagicStick'" @click="openOptimize(row)">进入优化室</el-button>
            <el-button size="small">A/B 历史</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.score-cell { display: flex; align-items: center; gap: 8px; }
.score-cell strong { font-size: 18px; min-width: 28px; }
@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
</style>
