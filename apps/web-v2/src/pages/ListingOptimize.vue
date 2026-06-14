<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ListingWorkbenchPanel from '../components/m1/ListingWorkbenchPanel.vue';
import ResearchBlock from '../components/m1/ResearchBlock.vue';
import ScoreBlock from '../components/m1/ScoreBlock.vue';
import GenerationBlock from '../components/m1/GenerationBlock.vue';
import VersionBlock from '../components/m1/VersionBlock.vue';
import { useViewport } from '../composables/useViewport';
import { useTargetFlow } from '../composables/useM1State';

const { isMobile } = useViewport();
const route = useRoute();
const router = useRouter();

const targetId = computed(() => String(route.params.id || ''));
const flow = computed(() => (targetId.value ? useTargetFlow(targetId.value) : null));
const target = computed(() => flow.value?.target.value || null);
const versions = computed(() => flow.value?.versions.value || []);
const latestVersion = computed(() => versions.value[0] || null);
const workbench = computed(() => flow.value?.workbench.value || null);
const loading = computed(() => !!flow.value?.loading.value);
const focus = ref(route.query.focus || '');
const checking = ref(false);

const navItems = [
  { key: 'workbench', label: '作战室' },
  { key: 'research', label: '调研' },
  { key: 'score', label: '评分' },
  { key: 'generation', label: '文案/素材' },
  { key: 'assets', label: '图片矩阵' },
  { key: 'compliance', label: '合规' },
  { key: 'preflight', label: '发布前检查' },
  { key: 'versions', label: '版本' },
];

function scrollToAnchor(name) {
  // M1-016: blocks may mount slightly after the anchor-bar (workbench still loading).
  // Try on nextTick, and if the element is not yet in the DOM, retry once after a
  // short delay so a click during late mount does not silently no-op.
  nextTick(() => {
    const el = document.getElementById(name);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setTimeout(() => {
      const retryEl = document.getElementById(name);
      if (retryEl) retryEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  });
}

function setFocus(name) {
  // While the workbench is still loading the target blocks are not rendered yet, so
  // anchor navigation would land on nothing. Guard the click in that window.
  if (loading.value || !workbench.value) return;
  focus.value = name;
  router.replace({ query: { ...route.query, focus: name } });
  scrollToAnchor(name);
}

watch(() => route.query.focus, (v) => {
  focus.value = v || '';
  if (v) scrollToAnchor(v);
});

onMounted(async () => {
  if (!targetId.value) {
    ElMessage.warning('请先选择一个 Listing 优化目标');
    router.replace('/listings/select');
    return;
  }
  await flow.value.fetch();
  if (focus.value) scrollToAnchor(focus.value);
});

watch(targetId, async (v) => {
  if (v && flow.value) await flow.value.fetch(true);
});

const modeLabel = computed(() => ({
  existing: '已有 Listing',
  asin_input: 'ASIN 识别',
  new_listing: '新建 Listing',
})[target.value?.mode || workbench.value?.productProfile?.mode] || 'Listing');

const targetTitle = computed(() => {
  const p = workbench.value?.productProfile;
  if (p?.sku || p?.asin) return p.sku || p.asin;
  const t = target.value;
  if (!t) return '加载中...';
  return t.product_id || t.asin || t.new_category || `Target ${String(t.id || '').slice(0, 8)}`;
});

const subtitle = computed(() => {
  const p = workbench.value?.productProfile || {};
  return `${modeLabel.value} · ${p.category || target.value?.new_category || target.value?.asin || ''} · ${p.status || target.value?.status || 'draft'}`;
});

async function runPreflight() {
  if (!flow.value) return;
  checking.value = true;
  try {
    const versionId = latestVersion.value?.id || latestVersion.value?.versionId || null;
    await flow.value.checkReadiness(versionId);
  } finally {
    checking.value = false;
  }
}
</script>

<template>
  <div class="opt-room" v-loading="loading">
    <PageHeader title="Listing 作战室" :subtitle="`${targetTitle} · ${subtitle}`">
      <template #extra>
        <el-button :size="isMobile ? 'small' : 'default'" @click="$router.push('/listings/select')">返回目标</el-button>
        <el-button :size="isMobile ? 'small' : 'default'" :loading="checking" @click="runPreflight">发布前检查</el-button>
        <el-button type="primary" :size="isMobile ? 'small' : 'default'" @click="setFocus('generation')">改文案/素材</el-button>
      </template>
    </PageHeader>

    <div class="anchor-bar">
      <button
        v-for="item in navItems"
        :key="item.key"
        type="button"
        :class="{ active: focus === item.key }"
        :disabled="loading || !workbench"
        :title="(loading || !workbench) ? '作战室加载中，稍候即可跳转' : ''"
        @click="setFocus(item.key)"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="!targetId">
      <EmptyState title="未指定优化目标" description="请先选择一个店铺 Listing、ASIN，或创建新的 Listing 简报。">
        <el-button type="primary" @click="$router.push('/listings/select')">去选择目标</el-button>
      </EmptyState>
    </div>

    <template v-else-if="workbench">
      <ListingWorkbenchPanel :workbench="workbench" />
      <ResearchBlock id="research" :target-id="targetId" :workbench="workbench" />
      <ScoreBlock :target-id="targetId" :workbench="workbench" />
      <GenerationBlock :target-id="targetId" :latest-version="latestVersion" :workbench="workbench" />
      <VersionBlock :target-id="targetId" />
    </template>
  </div>
</template>

<style scoped>
.opt-room { padding-bottom: 32px; }
.anchor-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 10px 0 14px;
  margin-bottom: 4px;
  background: linear-gradient(180deg, var(--bg, #f7f8fb) 70%, rgba(247, 248, 251, 0));
}
.anchor-bar button {
  border: 1px solid #dbe4ee;
  background: #fff;
  color: #334155;
  border-radius: 999px;
  padding: 8px 13px;
  white-space: nowrap;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.16s ease;
}
.anchor-bar button:hover,
.anchor-bar button.active {
  border-color: #0f766e;
  color: #0f766e;
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.12);
}
.anchor-bar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
  border-color: #dbe4ee;
  color: #94a3b8;
}
@media (max-width: 640px) {
  .anchor-bar { margin-left: -4px; margin-right: -4px; padding-left: 4px; padding-right: 4px; }
  .anchor-bar button { padding: 7px 10px; }
}
</style>
