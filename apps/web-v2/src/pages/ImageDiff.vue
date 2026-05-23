<script setup>
// ImageDiff — 竞品图像变化 + scan 按钮 + pushM1 真创 target
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { useViewport } from '../composables/useViewport';
import { useImageDiffs } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';

const route = useRoute();
const router = useRouter();
const im = useImageDiffs();
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
  if (asinFilter.value) params.competitorAsin = asinFilter.value;
  await im.fetch(params, true);
}
onMounted(load);

const list = computed(() => im.list.value || []);

async function scan() {
  await im.scan({});
}

async function pushToM1(d) {
  const r = await im.pushM1(d.id, {});
  bus.pushLocal({
    severity: 'P2',
    sourceModule: 'M4C',
    title: '图片差异已推 M1',
    body: d.changeType || d.change_type || '',
    link: r?.m1TargetId ? `/listings/optimize/${r.m1TargetId}` : '/listings/optimize',
  });
  if (r?.m1TargetId) {
    router.push({ path: `/listings/optimize/${r.m1TargetId}` });
  } else {
    router.push('/listings/optimize');
  }
}
</script>

<template>
  <div>
    <PageHeader title="竞品图像变化（多模态对比）" subtitle="pHash 检测 + Claude Vision 多模态分析 · 自动解读策略">
      <template #extra>
        <div class="toolbar">
          <el-select v-model="statusFilter" size="default" class="tb-select">
            <el-option label="全部状态" value="all" />
            <el-option label="新" value="new" />
            <el-option label="已审" value="reviewed" />
            <el-option label="已推 M1" value="pushed" />
            <el-option label="已忽略" value="dismissed" />
          </el-select>
          <el-input v-model="asinFilter" size="default" placeholder="竞品 ASIN" class="tb-input" clearable />
          <el-button :icon="'Refresh'" @click="scan" :loading="im.loading.value">扫描差异</el-button>
        </div>
      </template>
    </PageHeader>

    <div v-loading="im.loading.value">
      <EmptyState v-if="!im.loading.value && list.length === 0" title="暂无图片差异" description="点击扫描差异" icon="Picture" />
      <el-row :gutter="16">
        <el-col v-for="d in list" :key="d.id" :span="24">
          <el-card shadow="never" class="diff-card">
            <div class="diff-head">
              <div>
                <strong class="asin">{{ d.competitorAsin || d.competitor_asin }}</strong>
                <el-tag size="small" effect="plain">{{ d.imageRole || d.image_role }}</el-tag>
                <span class="text-muted">{{ (d.detectedAt || d.detected_at || '').slice(0, 16).replace('T', ' ') }}</span>
                <el-tag v-if="d.status === 'pushed'" type="success" size="small" effect="plain">已推 M1</el-tag>
              </div>
              <el-tag type="warning" effect="light">{{ d.changeType || d.change_type }}</el-tag>
            </div>

            <el-row :gutter="16" class="mt-12">
              <el-col :xs="10" :sm="6">
                <div class="img-placeholder old">
                  <el-icon :size="40" color="#cbd5e1"><Picture /></el-icon>
                  <small>旧图</small>
                </div>
              </el-col>
              <el-col :xs="4" :sm="2">
                <div class="arrow"><el-icon :size="24"><Right /></el-icon></div>
              </el-col>
              <el-col :xs="10" :sm="6">
                <div class="img-placeholder new">
                  <el-icon :size="40" color="#cbd5e1"><PictureFilled /></el-icon>
                  <small>新图（pHash {{ d.phashDistance || d.phash_distance || '-' }}）</small>
                </div>
              </el-col>
              <el-col :xs="24" :sm="10">
                <h4 class="block-label">🤖 AI 多模态分析</h4>
                <p class="ai-text">{{ d.aiAnalysis || d.ai_analysis || '-' }}</p>
                <h4 class="block-label">策略推断</h4>
                <p class="strategy">{{ d.strategyInferred || d.strategy_inferred || '-' }}</p>
                <h4 class="block-label">对我方影响</h4>
                <p class="impact">{{ d.impactOnUs || d.impact_on_us || '-' }}</p>
                <el-button size="small" type="primary" :disabled="d.status === 'pushed'" @click="pushToM1(d)">推 M1 改进</el-button>
              </el-col>
            </el-row>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.diff-card { margin-bottom: 16px; }
.diff-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.asin { font-family: ui-monospace, monospace; color: var(--primary); margin-right: 8px; }

.img-placeholder { aspect-ratio: 1; background: #f9fafb; border: 1px solid var(--line); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.img-placeholder.old { border-color: var(--text-soft); }
.img-placeholder.new { border-color: var(--primary); }
.img-placeholder small { color: var(--text-muted); margin-top: 6px; font-size: 11px; }
.arrow { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--primary); }

.block-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 4px; }
.ai-text, .strategy, .impact { margin: 0 0 12px; font-size: 13px; line-height: 1.6; padding: 8px 12px; background: #f9fafb; border-radius: 4px; }
.ai-text { border-left: 3px solid var(--primary); }
.strategy { border-left: 3px solid var(--warning); color: var(--text); }
.impact { border-left: 3px solid var(--success); color: var(--text); }
.mt-12 { margin-top: 12px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tb-select { width: 130px; }
.tb-input { width: 140px; }
@media (max-width: 767px) {
  .toolbar { width: 100%; }
  .tb-select, .tb-input { width: 100%; }
  .diff-head { gap: 6px; }
  .img-placeholder { padding: 8px 4px; }
}
</style>
