<script setup>
import { computed, ref } from 'vue';
import RadarChart from '../RadarChart.vue';
import { useTargetFlow } from '../../composables/useM1State';

const props = defineProps({
  targetId: { type: String, required: true },
});

const flow = computed(() => useTargetFlow(props.targetId));
const score = computed(() => flow.value.score.value);
const target = computed(() => flow.value.target.value);
const triggering = ref(false);

const isNewListing = computed(() => target.value?.mode === 'new_listing');

function parseJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

const dimensions = computed(() => {
  const s = score.value;
  if (!s) return [];
  const make = (key, label) => {
    const detail = parseJson(s[`${key}_detail`] ?? s[`${toCamel(key)}Detail`]) || {};
    return {
      key,
      label,
      score: s[`${key}_score`] ?? s[`${toCamel(key)}Score`] ?? 0,
      rationale: detail.rationale || detail.reason || '—',
      subItems: Array.isArray(detail.sub) ? detail.sub : Array.isArray(detail.subItems) ? detail.subItems : [],
    };
  };
  return [
    make('title', '标题'),
    make('bullets', '5 点描述'),
    make('main_image', '主图'),
    make('a_plus', 'A+ 内容'),
    make('reviews', '评论'),
  ];
});

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

const radarItems = computed(() =>
  dimensions.value.map((d) => ({ label: d.label, value: Number(d.score) || 0 })),
);

const totalScore = computed(() => score.value?.total_score ?? score.value?.totalScore ?? 0);

const improvements = computed(() => {
  const raw = score.value?.improvement_ranking ?? score.value?.improvementRanking;
  return parseJson(raw) || [];
});

async function triggerScore() {
  triggering.value = true;
  try {
    await flow.value.triggerScore();
  } catch {} finally {
    triggering.value = false;
  }
}
</script>

<template>
  <el-card shadow="never" class="score-block" id="score">
    <template #header>
      <div class="block-head">
        <h2 class="section-title">📊 5 维度打分</h2>
        <el-button v-if="!isNewListing" size="small" :loading="triggering" @click="triggerScore">
          {{ score ? '重新打分' : '触发打分' }}
        </el-button>
      </div>
    </template>

    <div v-if="isNewListing" class="empty">
      <el-empty description="Mode 3（全新 Listing）暂不支持打分 — 因尚无任何已有内容做对照">
        <template #image>
          <span style="font-size: 56px">🆕</span>
        </template>
      </el-empty>
    </div>

    <div v-else-if="!score" class="empty">
      <p class="text-muted">尚未打分。点击"触发打分"将给出 5 维度评分 + 改进项排序。</p>
    </div>

    <div v-else>
      <div class="top-row">
        <div class="total">
          <div class="total-label">综合得分</div>
          <div class="total-num">{{ totalScore }}</div>
          <div class="total-sub">百分制</div>
        </div>
        <div class="radar">
          <RadarChart :items="radarItems" :size="240" />
        </div>
      </div>

      <el-collapse class="dims">
        <el-collapse-item v-for="d in dimensions" :key="d.key" :name="d.key">
          <template #title>
            <div class="dim-row">
              <strong>{{ d.label }}</strong>
              <span class="tnum dim-score">{{ d.score }}</span>
              <el-progress
                :percentage="Number(d.score) || 0"
                :stroke-width="6"
                :show-text="false"
                style="flex: 1; margin: 0 12px; max-width: 240px"
              />
            </div>
          </template>
          <p class="rationale">{{ d.rationale }}</p>
          <ul v-if="d.subItems.length" class="sub-list">
            <li v-for="(s, i) in d.subItems" :key="i">
              <span class="sub-label">{{ s.label || s.name || `子项 ${i + 1}` }}</span>
              <el-progress
                :percentage="Number(s.score) || 0"
                :stroke-width="4"
                :show-text="false"
                style="flex: 1; margin: 0 10px"
              />
              <span class="tnum">{{ s.score }}</span>
            </li>
          </ul>
        </el-collapse-item>
      </el-collapse>

      <div v-if="improvements.length" class="improvements">
        <h3 class="imp-title">⭐ 改进项排序</h3>
        <ol class="imp-list">
          <li v-for="(imp, i) in improvements" :key="i" class="imp-row">
            <span class="imp-rank">#{{ i + 1 }}</span>
            <div class="imp-body">
              <strong>{{ imp.field || imp.dimension || imp.label }}</strong>
              <p>{{ imp.suggestion || imp.action || imp.detail || '' }}</p>
            </div>
            <span class="imp-lift">
              <el-tag size="small" type="success" effect="plain">+{{ imp.expected_lift ?? imp.expectedLift ?? '?' }} 分</el-tag>
            </span>
          </li>
        </ol>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.score-block { margin-bottom: 16px; scroll-margin-top: 80px; }
.block-head { display: flex; justify-content: space-between; align-items: center; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.top-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 24px;
  align-items: center;
  padding: 12px 0 16px;
  border-bottom: 1px dashed var(--line-soft);
}
.total { text-align: center; }
.total-label { font-size: 12px; color: var(--text-muted); }
.total-num { font-size: 64px; font-weight: 700; line-height: 1.1; color: var(--primary); }
.total-sub { font-size: 11px; color: var(--text-soft); }
.radar { display: flex; justify-content: center; }
.dims { margin-top: 12px; }
.dim-row { display: flex; align-items: center; gap: 8px; flex: 1; font-size: 13px; }
.dim-score { font-size: 16px; font-weight: 700; color: var(--primary); min-width: 32px; }
.rationale { margin: 8px 0 12px; font-size: 12px; color: var(--text-muted); line-height: 1.6; }
.sub-list { list-style: none; padding: 0; margin: 0; }
.sub-list li { display: flex; align-items: center; padding: 4px 0; font-size: 12px; color: var(--text-muted); }
.sub-label { width: 140px; }
.improvements { margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--line-soft); }
.imp-title { font-size: 14px; font-weight: 600; margin: 0 0 10px; }
.imp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.imp-row {
  display: grid;
  grid-template-columns: 36px 1fr 80px;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  align-items: center;
}
.imp-rank { font-size: 16px; font-weight: 700; color: var(--primary); text-align: center; }
.imp-body strong { font-size: 13px; }
.imp-body p { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
.imp-lift { text-align: right; }
.empty { padding: 32px; text-align: center; }
</style>
