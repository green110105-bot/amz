<script setup>
// ReviewTrends — 评分趋势（最新快照 + 30 日序列 + snapshot 按钮）
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { useViewport } from '../composables/useViewport';
import { useReviewTrends } from '../composables/useM4State';

const route = useRoute();
const router = useRouter();
const tr = useReviewTrends();
const { isMobile } = useViewport();

const asinFilter = ref(route.query.asin || '');

watch(asinFilter, () => {
  router.replace({ query: asinFilter.value ? { asin: asinFilter.value } : {} });
  load();
});

async function load() {
  const params = {};
  if (asinFilter.value) params.asin = asinFilter.value;
  await tr.fetch(params, true);
}
onMounted(load);

const data = computed(() => tr.list.value || []);

async function snapshot() {
  await tr.snapshot({});
}

function trendBadge(t) {
  return { stable: 'success', declining: 'warning', declining_strong: 'danger', rising: 'success', rising_strong: 'success' }[t] || '';
}
function trendLabel(t) {
  return { stable: '稳定', declining: '下滑', declining_strong: '强下滑', rising: '上升', rising_strong: '强上升' }[t] || t;
}

function rDist(r, star) {
  const dist = r.ratingDistribution || r.distribution || {};
  return Number(dist[star] || dist[String(star)] || 0);
}
</script>

<template>
  <div>
    <PageHeader title="评分趋势" subtitle="单 SKU 评分时序 · 7d / 30d 滚动 · 评分分布">
      <template #extra>
        <el-input v-model="asinFilter" size="default" placeholder="ASIN" style="width: 140px" clearable />
        <el-button :icon="'Refresh'" @click="snapshot" :loading="tr.loading.value">触发快照</el-button>
      </template>
    </PageHeader>

    <div v-loading="tr.loading.value">
      <EmptyState v-if="!tr.loading.value && data.length === 0" title="暂无快照" description="点击触发快照" icon="DataAnalysis" />
      <el-row :gutter="16">
        <el-col v-for="r in data" :key="r.asin + (r.snapshotDate || '')" :span="24">
          <el-card shadow="never" class="trend-card">
            <div class="trend-head">
              <div>
                <h3>{{ r.sku || r.asin }} <span class="text-muted" style="font-weight: normal; font-size: 13px">({{ r.asin }})</span></h3>
                <div class="big-rating">
                  <strong class="tnum">{{ r.avgRating || r.avg_rating }}</strong>
                  <span style="color: #fbbf24; font-size: 18px">★★★★★</span>
                  <span class="text-muted">{{ r.totalReviews || r.total_reviews || 0 }} 评论</span>
                </div>
              </div>
              <el-tag :type="trendBadge(r.trend)" size="default">
                {{ trendLabel(r.trend) }}
                <span v-if="(r.trendDelta || r.trend_delta) !== 0" class="tnum" style="margin-left: 4px">
                  {{ (r.trendDelta || r.trend_delta) > 0 ? '+' : '' }}{{ r.trendDelta || r.trend_delta }}
                </span>
              </el-tag>
            </div>

            <el-row :gutter="12" class="mt-12">
              <el-col :xs="12" :sm="6"><div class="m-cell"><span>7 日新增</span><strong class="tnum">{{ r.added7d || r.added_7d || (r.last7d && r.last7d.added) || 0 }}</strong></div></el-col>
              <el-col :xs="12" :sm="6"><div class="m-cell"><span>7 日均分</span><strong class="tnum">{{ r.avg7d || r.avg_7d || (r.last7d && r.last7d.avg) || '-' }}</strong></div></el-col>
              <el-col :xs="12" :sm="6"><div class="m-cell"><span>30 日新增</span><strong class="tnum">{{ r.added30d || r.added_30d || (r.last30d && r.last30d.added) || 0 }}</strong></div></el-col>
              <el-col :xs="12" :sm="6"><div class="m-cell"><span>30 日均分</span><strong class="tnum">{{ r.avg30d || r.avg_30d || (r.last30d && r.last30d.avg) || '-' }}</strong></div></el-col>
            </el-row>

            <h4 class="block-label">评分分布</h4>
            <div class="dist">
              <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="dist-row">
                <span class="star-label">{{ star }} ★</span>
                <div class="bar-wrap">
                  <div class="bar-fill" :style="{ width: ((rDist(r, star) / Math.max(r.totalReviews || r.total_reviews || 1, 1)) * 100) + '%', background: star >= 4 ? 'var(--success)' : star === 3 ? 'var(--warning)' : 'var(--danger)' }" />
                </div>
                <span class="tnum count">{{ rDist(r, star) }} ({{ Math.round((rDist(r, star) / Math.max(r.totalReviews || r.total_reviews || 1, 1)) * 100) }}%)</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.trend-card { margin-bottom: 16px; }
.trend-head { display: flex; justify-content: space-between; align-items: flex-start; }
.trend-head h3 { font-size: 16px; margin: 0 0 4px; }
.big-rating { display: flex; gap: 8px; align-items: center; }
.big-rating strong { font-size: 32px; }
.m-cell { padding: 12px 8px; background: #f9fafb; border-radius: 6px; text-align: center; }
.m-cell span { font-size: 11px; color: var(--text-muted); display: block; }
.m-cell strong { font-size: 18px; margin-top: 2px; display: block; }
.block-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin: 16px 0 8px; }
.dist-row { display: grid; grid-template-columns: 50px 1fr 120px; gap: 12px; align-items: center; padding: 4px 0; font-size: 13px; }
.star-label { color: var(--text-muted); }
.bar-wrap { background: #f3f4f6; height: 14px; border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.count { color: var(--text-muted); font-size: 12px; text-align: right; }
.mt-12 { margin-top: 12px; }
@media (max-width: 767px) {
  .trend-head { flex-direction: column; align-items: flex-start; gap: 8px; }
  .big-rating strong { font-size: 24px; }
  .dist-row { grid-template-columns: 40px 1fr 90px; gap: 8px; font-size: 12px; }
  .m-cell { margin-bottom: 8px; }
}
</style>
