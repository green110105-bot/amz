<script setup>
import { computed, ref } from 'vue';
import { useTargetFlow } from '../../composables/useM1State';

const props = defineProps({
  targetId: { type: String, required: true },
  workbench: { type: Object, default: null },
});

const flow = computed(() => useTargetFlow(props.targetId));
const research = computed(() => flow.value.research.value);
const triggering = ref(false);

function parseJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

const cards = computed(() => {
  const r = research.value || {};
  const labels = [
    { key: 'title_pattern', title: '标题结构', lane: 'SEO' },
    { key: 'bullet_structure', title: '五点骨架', lane: 'CVR' },
    { key: 'main_image_visual', title: '主图视觉', lane: 'CTR' },
    { key: 'a_plus_structure', title: 'A+ 结构', lane: 'Brand' },
    { key: 'review_keywords', title: 'VOC 与差评', lane: 'VOC' },
  ];
  // The ONLY authoritative real/mock signal is the backend is_mock field.
  // Defaults to mock when the field is absent (honest fallback).
  const isMock = r.is_mock ?? r.isMock ?? true;
  return labels.map((item) => {
    const raw = r[item.key] ?? r[toCamel(item.key)];
    const parsed = parseJson(raw) || {};
    const evidence = parsed.evidence || fallbackEvidence(item.key);
    return {
      ...item,
      theme: parsed.theme || fallbackTheme(item.key),
      evidence: isMock ? `[示例数据] ${evidence}` : evidence,
      action: parsed.action || fallbackAction(item.key),
      source: isMock ? 'mock' : 'api',
    };
  });
});

// Authoritative mock flag: trust backend is_mock; when no report yet, treat as mock.
const researchIsMock = computed(() => {
  const r = research.value;
  if (!r) return true;
  return r.is_mock ?? r.isMock ?? true;
});

const sourceAsins = computed(() => {
  const raw = research.value?.source_asins || research.value?.sourceAsins || props.workbench?.productProfile?.competitorPool || [];
  return Array.isArray(raw) ? raw : [];
});

function fallbackTheme(key) {
  return ({
    title_pattern: '品牌 + 核心词 + 关键利益点 + 适配/规格',
    bullet_structure: '场景痛点 -> 功能 -> 证据 -> 结果 -> 服务承诺',
    main_image_visual: '白底主图负责点击，副图负责解释与打消顾虑',
    a_plus_structure: '品牌故事、核心利益、规格对比、FAQ 四段式',
    review_keywords: '从评论里提炼正向亮点和高频疑虑，反哺五点与 FAQ',
  })[key];
}

function fallbackEvidence(key) {
  return ({
    title_pattern: 'Workbench 根据现有标题、竞品池和目标关键词生成可替换建议。',
    bullet_structure: '真实运营需要每条五点都能回答一个购买阻碍，而不是堆参数。',
    main_image_visual: 'Amazon Gallery 不只有主图，PT01-PT08 应承担不同转化任务。',
    a_plus_structure: 'A+ 不是装饰，应承接图片未说完的证据、对比和品牌信任。',
    review_keywords: '真实评论数据接入后用于发现退货原因、误购原因和购买语言。',
  })[key];
}

function fallbackAction(key) {
  return ({
    title_pattern: '把 P0 主词放在前半段，同时保留自然可读性。',
    bullet_structure: '按 5 个购买阻碍重排五点：兼容、保护、材质、场景、服务。',
    main_image_visual: '补齐 PT01-PT04：卖点、场景、功能拆解、尺寸兼容。',
    a_plus_structure: '至少准备 3 个模块，并和 Gallery 避免重复。',
    review_keywords: '把 VOC 语言转成 FAQ、五点证据和图片 callout。',
  })[key];
}

async function trigger() {
  triggering.value = true;
  try { await flow.value.triggerResearch(); } finally { triggering.value = false; }
}

async function refresh() {
  triggering.value = true;
  try {
    await flow.value.clearResearchCache();
    await flow.value.triggerResearch();
  } finally {
    triggering.value = false;
  }
}
</script>

<template>
  <el-card shadow="never" class="research-block">
    <template #header>
      <div class="block-head">
        <div>
          <h2 class="section-title">调研与竞品证据</h2>
          <p class="head-sub">把竞品、评论、关键词和图片结构转成可执行的 Listing brief。</p>
        </div>
        <div class="head-actions">
          <el-tag size="small" :type="researchIsMock ? 'info' : 'success'" effect="plain">
            {{ researchIsMock ? '示例数据 (mock)' : 'API research' }}
          </el-tag>
          <el-button size="small" :loading="triggering" @click="research ? refresh() : trigger()">
            {{ research ? '重新调研' : '生成调研' }}
          </el-button>
        </div>
      </div>
    </template>

    <div class="research-meta">
      <span>类目：{{ research?.category || workbench?.productProfile?.category || '待识别' }}</span>
      <span>价格带：{{ research?.price_band || research?.priceBand || workbench?.productProfile?.priceBand || '-' }}</span>
      <span>竞品：{{ sourceAsins.join(' / ') || 'mock sample' }}</span>
      <span v-if="research?.cached_until || research?.cachedUntil">缓存至：{{ (research.cached_until || research.cachedUntil).slice(0, 10) }}</span>
    </div>

    <div class="cards-grid">
      <div v-for="c in cards" :key="c.key" class="research-card" :class="c.source">
        <div class="card-title">
          <el-tag size="small" effect="dark" :type="c.source === 'api' ? 'primary' : 'info'">{{ c.lane }}</el-tag>
          <strong>{{ c.title }}</strong>
        </div>
        <div class="card-section">
          <span>主题</span>
          <p>{{ c.theme }}</p>
        </div>
        <div class="card-section">
          <span>证据</span>
          <p>{{ c.evidence }}</p>
        </div>
        <div class="card-section action">
          <span>动作</span>
          <p>{{ c.action }}</p>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.research-block { margin-bottom: 16px; scroll-margin-top: 80px; }
.block-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { font-size: 16px; font-weight: 700; margin: 0; color: #0f172a; }
.head-sub { margin: 4px 0 0; color: #64748b; font-size: 12px; }
.head-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.research-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; color: #64748b; font-size: 12px; }
.research-meta span { padding: 6px 9px; background: #f8fafc; border-radius: 999px; border: 1px solid #e2e8f0; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
.research-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; }
.research-card.mock { border-style: dashed; background: #f8fafc; }
.card-title { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.card-title strong { font-size: 14px; color: #0f172a; }
.card-section { margin-bottom: 10px; }
.card-section:last-child { margin-bottom: 0; }
.card-section span { display: block; font-size: 11px; color: #94a3b8; margin-bottom: 3px; letter-spacing: 0.04em; }
.card-section p { margin: 0; font-size: 12px; line-height: 1.6; color: #334155; }
.card-section.action p { color: #0f766e; font-weight: 600; }
@media (max-width: 640px) {
  .block-head { align-items: flex-start; flex-direction: column; }
  .head-actions { width: 100%; justify-content: space-between; }
}
</style>
