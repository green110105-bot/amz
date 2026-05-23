<script setup>
// ReviewClusters — 差评聚类 + 改进路径推送 M1
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { useViewport } from '../composables/useViewport';
import { useReviewClusters } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';

const route = useRoute();
const router = useRouter();
const cl = useReviewClusters();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

const statusFilter = ref(route.query.status || 'all');
const asinFilter = ref(route.query.asin || '');

watch([statusFilter, asinFilter], () => {
  const q = {};
  if (statusFilter.value !== 'all') q.status = statusFilter.value;
  if (asinFilter.value) q.asin = asinFilter.value;
  router.replace({ query: q });
  load();
}, { deep: false });

async function load() {
  const params = {};
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  if (asinFilter.value) params.asin = asinFilter.value;
  await cl.fetch(params, true);
}
onMounted(load);

const clusters = computed(() => cl.list.value || []);

function rootCauseLabel(rc) {
  return { product_quality: '产品质量', listing_issue: 'Listing 问题', packaging: '包装', expectation_mgmt: '预期管理', documentation: '说明文档', highlight: '好评亮点' }[rc] || rc;
}
function rootCauseType(rc) {
  return { product_quality: 'danger', listing_issue: 'warning', packaging: 'primary', expectation_mgmt: 'info', documentation: 'info', highlight: 'success' }[rc] || '';
}
function statusLabel(s) {
  return { new: '新', fixing: '修复中', pushed: '已推送', resolved: '已解决', archived: '已归档' }[s] || s;
}
function statusType(s) {
  return { new: '', fixing: 'warning', pushed: 'primary', resolved: 'success' }[s] || '';
}

async function recompute() {
  await cl.recompute({});
}

async function pushImprovement(cluster, layer) {
  const r = await cl.pushClusterM1(cluster.id, { layer });
  bus.pushLocal({ severity: 'P2', sourceModule: 'M4B', title: `聚类 "${cluster.name}" 已推送 M1`, body: `Layer: ${layer}`, link: r?.m1TargetId ? `/listings/optimize/${r.m1TargetId}` : '/listings/optimize' });
  if (layer === 'listing' || layer === 'documentation') {
    setTimeout(() => router.push({ path: '/listings/optimize', query: { asin: cluster.asin || cluster.sku, focus: cluster.name, layer } }), 600);
  } else if (layer === 'manufacturer' || layer === 'packaging') {
    ElMessage.info('已推送到供应链待办（手动跟进）');
  }
}

function viewReviews(cluster) {
  router.push({ path: '/reviews/list', query: { cluster: cluster.id } });
}
</script>

<template>
  <div>
    <PageHeader title="差评聚类分析" subtitle="按 产品 / Listing / 包装 / 预期 4 类归因 · AI 改进路径 · 一键推送 M1">
      <template #extra>
        <div class="toolbar">
          <el-select v-model="statusFilter" size="small" class="tb-select">
            <el-option label="全部状态" value="all" />
            <el-option label="新" value="new" />
            <el-option label="修复中" value="fixing" />
            <el-option label="已推送" value="pushed" />
            <el-option label="已解决" value="resolved" />
          </el-select>
          <el-input v-model="asinFilter" size="small" placeholder="ASIN" class="tb-input" clearable />
          <el-button :icon="'Refresh'" @click="recompute" :loading="cl.loading.value">重算聚类</el-button>
        </div>
      </template>
    </PageHeader>

    <div v-loading="cl.loading.value">
      <EmptyState v-if="!cl.loading.value && clusters.length === 0" title="暂无聚类" description="点击重算聚类" icon="DataAnalysis" />
      <el-row :gutter="16">
        <el-col v-for="cluster in clusters" :key="cluster.id" :xs="24" :sm="24" :md="12" :lg="12">
          <el-card shadow="never" class="cluster-card" :class="{ negative: cluster.sentiment === 'negative', positive: cluster.sentiment === 'positive' }">
            <div class="cluster-head">
              <div>
                <h3>{{ cluster.name }}</h3>
                <div class="cluster-meta">
                  <el-tag :type="rootCauseType(cluster.rootCause || cluster.root_cause)" size="small" effect="light">{{ rootCauseLabel(cluster.rootCause || cluster.root_cause) }}</el-tag>
                  <el-tag :type="statusType(cluster.status)" size="small" effect="plain">{{ statusLabel(cluster.status) }}</el-tag>
                  <span class="text-muted">ASIN: {{ cluster.asin || cluster.sku }}</span>
                  <el-button size="small" link @click="viewReviews(cluster)">查看评论</el-button>
                </div>
              </div>
              <div class="cluster-stat">
                <strong class="big tnum">{{ cluster.count }}</strong>
                <span class="text-muted">条评论 · {{ Math.round((cluster.percent || 0) * 100) }}%</span>
              </div>
            </div>

            <div class="samples">
              <span class="block-label">代表评论</span>
              <ul>
                <li v-for="(s, i) in (cluster.samples || [])" :key="i">"{{ s }}"</li>
              </ul>
            </div>

            <div class="improvements">
              <span class="block-label">改进路径</span>
              <div v-for="(imp, i) in (cluster.improvements || [])" :key="i" class="improvement-item">
                <div>
                  <el-tag size="small" effect="plain" type="primary">{{ ({ manufacturer: '工厂', listing: 'Listing', packaging: '包装', documentation: '文档' })[imp.layer] || imp.layer }}</el-tag>
                  <span style="margin-left: 6px; font-size: 13px">{{ imp.action }}</span>
                </div>
                <el-button size="small" type="primary" plain :disabled="cluster.status === 'pushed'" @click="pushImprovement(cluster, imp.layer)">推送</el-button>
              </div>
            </div>

            <div class="cluster-foot">
              <span class="text-muted" style="font-size: 12px">
                <el-icon><Aim /></el-icon>
                估算评分提升 +{{ (cluster.estimatedRatingLift || cluster.estimated_rating_lift || 0).toFixed(2) }} · 置信度 {{ Math.round((cluster.confidence || 0) * 100) }}%
              </span>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.cluster-card { margin-bottom: 16px; border-left: 4px solid var(--line); }
.cluster-card.negative { border-left-color: var(--danger); }
.cluster-card.positive { border-left-color: var(--success); }

.cluster-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.cluster-head h3 { margin: 0 0 6px; font-size: 16px; }
.cluster-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; }
.cluster-stat { text-align: right; }
.big { font-size: 24px; font-weight: 700; display: block; }

.block-label { display: block; font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 6px; }
.samples ul { margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-muted); }
.samples li { margin-bottom: 4px; }
.improvements { margin-top: 14px; }
.improvement-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #f9fafb; border-radius: 6px; margin-bottom: 6px; gap: 8px; }
.cluster-foot { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line-soft); }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tb-select { width: 130px; }
.tb-input { width: 130px; }
@media (max-width: 767px) {
  .toolbar { width: 100%; }
  .tb-select, .tb-input { width: 100%; }
  .cluster-head { flex-direction: column; align-items: flex-start; gap: 8px; }
  .cluster-stat { text-align: left; }
  .improvement-item { flex-direction: column; align-items: stretch; }
}
</style>
