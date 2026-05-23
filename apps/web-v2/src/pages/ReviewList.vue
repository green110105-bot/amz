<script setup>
// ReviewList — Review 中心（真后端 + URL query + sync + filter）
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveDrawer from '../components/ResponsiveDrawer.vue';
import { useViewport } from '../composables/useViewport';
import { useReviews } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';

const route = useRoute();
const router = useRouter();
const reviews = useReviews();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

const sentimentFilter = ref(route.query.sentiment || 'all');
const ratingFilter = ref(route.query.rating || 'all');
const asinFilter = ref(route.query.asin || '');
const clusterFilter = ref(route.query.cluster || '');
const drawer = ref(false);
const current = ref(null);

watch([sentimentFilter, ratingFilter, asinFilter, clusterFilter], () => {
  const q = {};
  if (sentimentFilter.value !== 'all') q.sentiment = sentimentFilter.value;
  if (ratingFilter.value !== 'all') q.rating = ratingFilter.value;
  if (asinFilter.value) q.asin = asinFilter.value;
  if (clusterFilter.value) q.cluster = clusterFilter.value;
  router.replace({ query: q });
  load();
}, { deep: false });

async function load() {
  const params = {};
  if (sentimentFilter.value !== 'all') params.sentiment = sentimentFilter.value;
  if (ratingFilter.value === 'low') params.rating = '1-3';
  else if (ratingFilter.value === 'high') params.rating = '4-5';
  if (asinFilter.value) params.asin = asinFilter.value;
  if (clusterFilter.value) params.clusterId = clusterFilter.value;
  await reviews.fetch(params, true);
}
onMounted(load);

const filtered = computed(() => reviews.list.value || []);
const summary = computed(() => reviews.summary.value || {});

async function sync() {
  await reviews.sync({});
  bus.pushLocal({ severity: 'P2', sourceModule: 'M4B', title: '已同步评论', body: `已加载 ${(reviews.list.value || []).length} 条` });
}

function openDetail(r) {
  current.value = r;
  drawer.value = true;
}

async function draftAppeal(r) {
  // 草稿 localStorage 持久化
  const key = `m4_draft_appeal_${r.id}`;
  try {
    const existing = JSON.parse(localStorage.getItem(key) || 'null');
    if (existing) ElMessage.info('已有草稿，可在申诉中心继续编辑');
  } catch {}
  await reviews.markAppealable(r.id, { appealable: true, violationType: 'unrelated_to_product' });
  router.push({ path: '/appeals', query: { reviewId: r.id } });
}

async function draftRecovery(r) {
  const key = `m4_draft_recovery_${r.id}`;
  try {
    const existing = JSON.parse(localStorage.getItem(key) || 'null');
    if (existing) ElMessage.info('已有挽回邮件草稿，可在挽回中心继续编辑');
  } catch {}
  router.push({ path: '/recovery-emails', query: { reviewId: r.id } });
}

async function pushToM1(r) {
  await reviews.pushM1(r.id, { focus: r.clusterId || r.cluster });
  router.push({ path: '/listings/optimize', query: { asin: r.asin, focus: r.clusterId || r.cluster } });
}
</script>

<template>
  <div>
    <PageHeader title="Review 中心" subtitle="实时新评推送 · 1-3 星即时预警 · 申诉 / 挽回 / 推送 M1">
      <template #extra>
        <el-button :icon="'Refresh'" @click="sync" :loading="reviews.loading.value">同步评论</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="近期 Review" :value="summary.total || 0" hint="自家 SKU" status="default" icon="StarFilled" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="负面评价" :value="summary.negative || 0" hint="1-3 星" status="danger" icon="WarningFilled" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="可申诉" :value="summary.appealCandidates || 0" hint="AI 识别恶意评论" status="warning" icon="DocumentChecked" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="待挽回" :value="summary.recoveryPending || 0" hint="未发送邮件" status="info" icon="Message" /></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">Review 列表</h2>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <el-radio-group v-model="ratingFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="low">差评 1-3⭐</el-radio-button>
              <el-radio-button value="high">好评 4-5⭐</el-radio-button>
            </el-radio-group>
            <el-radio-group v-model="sentimentFilter" size="small">
              <el-radio-button value="all">情感</el-radio-button>
              <el-radio-button value="negative">负面</el-radio-button>
              <el-radio-button value="neutral">中性</el-radio-button>
              <el-radio-button value="positive">正面</el-radio-button>
            </el-radio-group>
            <el-input v-model="asinFilter" size="small" placeholder="ASIN" style="width: 130px" clearable />
            <el-input v-model="clusterFilter" size="small" placeholder="cluster id" style="width: 140px" clearable />
          </div>
        </div>
      </template>

      <div v-loading="reviews.loading.value">
        <EmptyState v-if="!reviews.loading.value && filtered.length === 0" title="暂无评论" description="点击同步评论拉取数据" icon="StarFilled" />
        <div v-for="r in filtered" :key="r.id" class="review-row" @click="openDetail(r)">
          <div class="review-left">
            <div class="rating-stars">
              <span v-for="i in 5" :key="i" :class="{ filled: i <= r.rating }">★</span>
            </div>
            <el-tag :type="r.sentiment === 'positive' ? 'success' : r.sentiment === 'negative' ? 'danger' : ''" size="small" effect="light" round>
              {{ ({ positive: '正面', neutral: '中性', negative: '负面' })[r.sentiment] || r.sentiment }}
            </el-tag>
            <el-tag v-if="r.appealEligible || r.appeal_eligible" type="warning" size="small" effect="light" round>可申诉</el-tag>
          </div>
          <div class="review-mid">
            <h4>{{ r.title }}</h4>
            <p class="review-body">{{ r.body }}</p>
            <div class="review-meta">
              <span>{{ r.reviewer }}</span>
              <span v-if="r.verified">✓ Verified</span>
              <span>{{ r.postedAt || r.posted_at }}</span>
              <span class="text-muted">· {{ r.sku }}</span>
              <el-tag v-if="r.clusterId || r.cluster_id" size="small" effect="plain">聚类: {{ r.clusterId || r.cluster_id }}</el-tag>
            </div>
          </div>
          <div class="review-actions">
            <el-button v-if="r.appealEligible || r.appeal_eligible" size="small" type="warning" plain @click.stop="draftAppeal(r)">起草申诉</el-button>
            <el-button v-else-if="r.sentiment === 'negative' && (r.recoveryStatus === 'pending' || r.recovery_status === 'pending' || !r.recoveryId)" size="small" type="primary" plain @click.stop="draftRecovery(r)">挽回邮件</el-button>
            <el-button size="small" link @click.stop="pushToM1(r)">推 M1</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <ResponsiveDrawer v-model="drawer" :title="current ? `Review · ${current.id}` : ''" size="540px">
      <div v-if="current">
        <div class="detail-rating">
          <span v-for="i in 5" :key="i" :class="['big-star', { filled: i <= current.rating }]">★</span>
        </div>
        <h3>{{ current.title }}</h3>
        <p class="detail-body">"{{ current.body }}"</p>
        <p class="text-muted">{{ current.reviewer }} · {{ current.postedAt || current.posted_at }} {{ current.verified ? '· ✓ Verified Purchase' : '' }}</p>
        <h4 class="detail-title">AI 分析</h4>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="情感倾向">{{ current.sentiment }}</el-descriptions-item>
          <el-descriptions-item label="差评聚类">{{ current.clusterId || current.cluster_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="可申诉">{{ (current.appealEligible || current.appeal_eligible) ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="挽回状态">{{ current.recoveryStatus || current.recovery_status || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="detail-title">操作</h4>
        <el-button v-if="current.appealEligible || current.appeal_eligible" type="warning" :icon="'DocumentChecked'" @click="draftAppeal(current)">起草申诉文案</el-button>
        <el-button v-else-if="current.sentiment === 'negative'" type="primary" :icon="'Message'" @click="draftRecovery(current)">起草挽回邮件</el-button>
        <el-button :icon="'Position'" @click="pushToM1(current)">推送到 M1 优化</el-button>
      </div>
    </ResponsiveDrawer>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 0; }
.kpi-row :deep(.el-col) { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }

.review-row {
  display: grid; grid-template-columns: 200px 1fr 200px; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--line-soft); cursor: pointer; transition: background 0.15s;
}
.review-row:hover { background: var(--bg); }
.review-left { display: flex; flex-direction: column; gap: 6px; }
.rating-stars span { color: #d1d5db; font-size: 16px; }
.rating-stars span.filled { color: #fbbf24; }
.review-mid h4 { margin: 0 0 4px; font-size: 14px; }
.review-body { margin: 0 0 6px; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.review-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--text-muted); align-items: center; }
.review-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }

.detail-rating { margin-bottom: 8px; }
.big-star { color: #d1d5db; font-size: 24px; }
.big-star.filled { color: #fbbf24; }
.detail-body { font-size: 15px; line-height: 1.65; padding: 14px; background: #f9fafb; border-left: 3px solid var(--text-muted); border-radius: 4px; margin: 12px 0; }
.detail-title { font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 24px 0 12px; letter-spacing: 0.04em; text-transform: uppercase; }
@media (max-width: 767px) {
  .review-row {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 14px 8px;
  }
  .review-left { flex-direction: row; flex-wrap: wrap; align-items: center; }
  .review-actions { flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
  .review-meta { font-size: 11px; }
}
</style>
