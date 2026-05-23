<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResearchBlock from '../components/m1/ResearchBlock.vue';
import ScoreBlock from '../components/m1/ScoreBlock.vue';
import GenerationBlock from '../components/m1/GenerationBlock.vue';
import VersionBlock from '../components/m1/VersionBlock.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { useTargetFlow } from '../composables/useM1State';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();

const targetId = computed(() => String(route.params.id || ''));
const flow = computed(() => (targetId.value ? useTargetFlow(targetId.value) : null));
const target = computed(() => flow.value?.target.value);
const versions = computed(() => flow.value?.versions.value || []);
const latestVersion = computed(() => versions.value[0] || null);

const loading = computed(() => flow.value?.loading.value);

const focus = ref(route.query.focus || '');

watch(() => route.query.focus, (v) => {
  focus.value = v || '';
  if (v) scrollToAnchor(v);
});

function scrollToAnchor(name) {
  nextTick(() => {
    const el = document.getElementById(name);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function setFocus(name) {
  focus.value = name;
  router.replace({ query: { ...route.query, focus: name } });
  scrollToAnchor(name);
}

onMounted(async () => {
  if (!targetId.value) {
    ElMessage.warning('未指定 target，请先在选择页选定');
    router.replace('/listings/select');
    return;
  }
  await flow.value.fetch();
  if (focus.value) scrollToAnchor(focus.value);
});

watch(targetId, async (v) => {
  if (v && flow.value) await flow.value.fetch();
});

const modeLabel = computed(() => ({
  existing: '本店已有',
  asin_input: 'ASIN 输入',
  new_listing: '全新 listing',
})[target.value?.mode] || '—');

const targetTitle = computed(() => {
  const t = target.value;
  if (!t) return '加载中…';
  return t.product_id || t.asin || t.new_category || `Target ${t.id?.slice(0, 8)}`;
});
</script>

<template>
  <div class="opt-room" v-loading="loading">
    <PageHeader title="Listing 优化室 ⭐" :subtitle="`${targetTitle} · Mode: ${modeLabel} · ${target?.new_category || target?.asin || ''}`">
      <template #extra>
        <el-button :size="isMobile ? 'small' : 'default'" @click="$router.push('/listings/select')">返回</el-button>
        <el-button v-if="!isMobile" @click="setFocus('score')">跳到打分</el-button>
        <el-button v-if="!isMobile" @click="setFocus('generation')">跳到生成</el-button>
        <el-button v-if="!isMobile" @click="setFocus('versions')">跳到版本</el-button>
      </template>
    </PageHeader>

    <div v-if="!targetId">
      <EmptyState title="未指定优化目标" description="请先在'优化目标选择'页选定 listing">
        <el-button type="primary" @click="$router.push('/listings/select')">前往选择</el-button>
      </EmptyState>
    </div>

    <template v-else>
      <MobileFallback
        v-if="isMobile"
        page-name="Listing 优化室"
        reason="此页面包含调研 / 打分 / 生成 / 版本多 block 编辑，建议在桌面端使用。下方提供评分概览只读视图。"
      >
        <template #readonly>
          <ScoreBlock :target-id="targetId" />
          <div style="margin-top: 16px; text-align: center;">
            <el-button type="primary" @click="$router.push('/listings/ab')">前往 A/B 中心</el-button>
          </div>
        </template>
      </MobileFallback>
      <template v-else>
        <ResearchBlock :target-id="targetId" />
        <ScoreBlock :target-id="targetId" />
        <GenerationBlock :target-id="targetId" :latest-version="latestVersion" />
        <VersionBlock :target-id="targetId" />
      </template>
    </template>
  </div>
</template>

<style scoped>
.opt-room { padding-bottom: 32px; }
</style>
