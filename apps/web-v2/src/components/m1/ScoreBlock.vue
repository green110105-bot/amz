<script setup>
import { computed, ref } from 'vue';
import RadarChart from '../RadarChart.vue';
import { useTargetFlow } from '../../composables/useM1State';

const props = defineProps({
  targetId: { type: String, required: true },
  workbench: { type: Object, default: null },
});

const flow = computed(() => useTargetFlow(props.targetId));
const score = computed(() => flow.value.score.value);
const target = computed(() => flow.value.target.value);
const triggering = ref(false);
const isNewListing = computed(() => target.value?.mode === 'new_listing' && !score.value);

function parseJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function makeDimension(s, key, label, fallback) {
  const detail = parseJson(s?.[`${key}_detail`] ?? s?.[`${toCamel(key)}Detail`]) || {};
  const scoreValue = s?.[`${key}_score`] ?? s?.[`${toCamel(key)}Score`] ?? fallback;
  return {
    key,
    label,
    score: Number(scoreValue) || 0,
    rationale: detail.rationale || detail.reason || fallbackReason(key),
    subItems: Array.isArray(detail.sub) ? detail.sub : Array.isArray(detail.subItems) ? detail.subItems : [],
  };
}

function fallbackReason(key) {
  return ({
    title: '标题需同时满足主词前置、可读性和合规表达。',
    bullets: '五点应覆盖购买阻碍、功能证据和场景结果。',
    main_image: 'Gallery 完整度决定点击和理解效率，不能只依赖主图。',
    a_plus: 'A+ 应承担品牌信任、对比和 FAQ，而不是重复五点。',
    reviews: 'VOC 闭环需要把差评/好评语言同步到文案和素材。',
  })[key];
}

const fallbackScores = computed(() => {
  const wb = props.workbench || {};
  const keyword = wb.keywords?.summary?.percent || 0;
  const galleryReady = (wb.gallerySlots || []).filter((g) => g.url || g.status === 'ready').length;
  const aplusReady = wb.aPlus?.modules?.length || 0;
  const preflight = wb.preflight || [];
  return {
    title: Math.min(92, 58 + Math.round((wb.copyMetrics?.title?.coverage || keyword) * 0.35)),
    bullets: Math.min(90, 60 + Math.round(keyword * 0.25)),
    main_image: Math.min(88, 46 + galleryReady * 6),
    a_plus: Math.min(86, 50 + aplusReady * 9),
    reviews: Math.min(84, 56 + preflight.filter((x) => x.passed).length * 4),
  };
});

const dimensions = computed(() => {
  const s = score.value;
  const fb = fallbackScores.value;
  return [
    makeDimension(s, 'title', '标题', fb.title),
    makeDimension(s, 'bullets', '五点', fb.bullets),
    makeDimension(s, 'main_image', '图片/Gallery', fb.main_image),
    makeDimension(s, 'a_plus', 'A+ / 视频', fb.a_plus),
    makeDimension(s, 'reviews', '评论 VOC', fb.reviews),
  ];
});

const radarItems = computed(() => dimensions.value.map((d) => ({ label: d.label, value: d.score })));
const totalScore = computed(() => score.value?.total_score ?? score.value?.totalScore ?? Math.round(dimensions.value.reduce((sum, d) => sum + d.score, 0) / Math.max(1, dimensions.value.length)));

const improvements = computed(() => {
  const raw = score.value?.improvement_ranking ?? score.value?.improvementRanking;
  const parsed = parseJson(raw);
  if (Array.isArray(parsed) && parsed.length) return parsed;
  return [
    { field: 'main_image', dimension: '图片矩阵', suggestion: '补齐 MAIN + PT01-PT08，让每张图承担不同转化任务。', expected_lift: 8 },
    { field: 'backend_search_terms', dimension: '关键词', suggestion: '把 P1/P2 缺口词补入五点、FAQ 或后台搜索词，避免堆砌。', expected_lift: 5 },
    { field: 'compliance', dimension: '合规', suggestion: '移除绝对化、医疗、认证、保修类高风险表达。', expected_lift: 4 },
  ];
});

async function triggerScore() {
  triggering.value = true;
  try { await flow.value.triggerScore(); } catch {} finally { triggering.value = false; }
}
</script>

<template>
  <el-card shadow="never" class="score-block" id="score">
    <template #header>
      <div class="block-head">
        <div>
          <h2 class="section-title">Listing 质量评分</h2>
          <p class="head-sub">把运营经验拆成标题、五点、图片、A+、VOC 五个可改进维度。</p>
        </div>
        <div class="head-actions">
          <el-tag size="small" :type="score ? 'success' : 'info'" effect="plain">{{ score ? 'API score' : 'Mock estimate' }}</el-tag>
          <el-button v-if="!isNewListing" size="small" :loading="triggering" @click="triggerScore">
            {{ score ? '重新评分' : '开始评分' }}
          </el-button>
        </div>
      </div>
    </template>

    <div class="top-row">
      <div class="total">
        <div class="total-label">综合分</div>
        <div class="total-num">{{ totalScore }}</div>
        <div class="total-sub">满分 100 · {{ score ? '真实记录' : '估算' }}</div>
      </div>
      <div class="radar"><RadarChart :items="radarItems" :size="240" /></div>
      <div class="quick-gaps">
        <div v-for="imp in improvements.slice(0, 3)" :key="imp.field" class="gap-chip">
          <span>{{ imp.dimension || imp.field }}</span>
          <strong>+{{ imp.expected_lift ?? imp.expectedLift ?? '?' }}</strong>
        </div>
      </div>
    </div>

    <div class="dim-grid">
      <div v-for="d in dimensions" :key="d.key" class="dim-card">
        <div class="dim-head">
          <strong>{{ d.label }}</strong>
          <span>{{ d.score }}</span>
        </div>
        <el-progress :percentage="d.score" :stroke-width="8" :show-text="false" />
        <p>{{ d.rationale }}</p>
      </div>
    </div>

    <div class="improvements">
      <h3>优先改进项</h3>
      <ol>
        <li v-for="(imp, i) in improvements" :key="`${imp.field}-${i}`">
          <span>#{{ i + 1 }}</span>
          <div>
            <strong>{{ imp.dimension || imp.field || imp.label }}</strong>
            <p>{{ imp.suggestion || imp.action || imp.detail }}</p>
          </div>
          <el-tag size="small" type="success" effect="plain">预估 +{{ imp.expected_lift ?? imp.expectedLift ?? '?' }}</el-tag>
        </li>
      </ol>
    </div>
  </el-card>
</template>

<style scoped>
.score-block { margin-bottom: 16px; scroll-margin-top: 80px; }
.block-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { font-size: 16px; font-weight: 700; margin: 0; color: #0f172a; }
.head-sub { margin: 4px 0 0; color: #64748b; font-size: 12px; }
.head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.top-row { display: grid; grid-template-columns: 180px 1fr 220px; gap: 20px; align-items: center; padding-bottom: 16px; border-bottom: 1px dashed #e2e8f0; }
.total { text-align: center; padding: 16px; background: #f0fdfa; border-radius: 16px; border: 1px solid #ccfbf1; }
.total-label { font-size: 12px; color: #64748b; }
.total-num { font-size: 58px; font-weight: 800; color: #0f766e; line-height: 1; }
.total-sub { font-size: 11px; color: #64748b; margin-top: 6px; }
.radar { display: flex; justify-content: center; }
.quick-gaps { display: grid; gap: 8px; }
.gap-chip { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; font-size: 12px; }
.gap-chip strong { color: #ea580c; }
.dim-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 16px; }
.dim-card { padding: 12px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
.dim-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.dim-head strong { font-size: 13px; color: #0f172a; }
.dim-head span { font-size: 18px; font-weight: 800; color: #0f766e; }
.dim-card p { margin: 8px 0 0; color: #64748b; font-size: 12px; line-height: 1.55; }
.improvements { margin-top: 16px; padding-top: 14px; border-top: 1px dashed #e2e8f0; }
.improvements h3 { margin: 0 0 10px; font-size: 14px; color: #0f172a; }
.improvements ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.improvements li { display: grid; grid-template-columns: 42px 1fr 86px; gap: 10px; align-items: center; padding: 10px; border: 1px solid #e2e8f0; border-radius: 12px; }
.improvements li > span { color: #0f766e; font-weight: 800; }
.improvements strong { font-size: 13px; color: #0f172a; }
.improvements p { margin: 3px 0 0; color: #64748b; font-size: 12px; }
@media (max-width: 860px) {
  .top-row { grid-template-columns: 1fr; }
  .quick-gaps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .block-head { flex-direction: column; align-items: flex-start; }
  .quick-gaps { grid-template-columns: 1fr; }
  .improvements li { grid-template-columns: 32px 1fr; }
  .improvements li .el-tag { justify-self: start; grid-column: 2; }
}
</style>
