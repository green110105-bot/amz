<script setup>
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useTargetFlow } from '../../composables/useM1State';

const props = defineProps({
  targetId: { type: String, required: true },
  latestVersion: { type: Object, default: null },
  workbench: { type: Object, default: null },
});

const flow = computed(() => useTargetFlow(props.targetId));
const styleShortLong = ref(0.5);
const styleRationalEmotional = ref(0.5);
const styleSeoNatural = ref(0.5);
const feedback = ref('');
const markedFields = ref([]);
const generating = ref(false);
const imageBusySlot = ref('');

const draft = ref({ title: '', bullets: ['', '', '', '', ''], description: '', backendSearchTerms: '' });

function syncDraft() {
  const copy = props.workbench?.copy || {};
  draft.value = {
    title: props.latestVersion?.title || copy.title || '',
    bullets: [1, 2, 3, 4, 5].map((n) => props.latestVersion?.[`bullet_${n}`] || copy.bullets?.[n - 1] || ''),
    description: props.latestVersion?.description || copy.description || '',
    backendSearchTerms: props.latestVersion?.backend_search_terms || copy.backendSearchTerms || '',
  };
}

watch(() => [props.latestVersion?.id, props.workbench?.sourceMeta?.generatedAt], syncDraft, { immediate: true });

const roundNo = computed(() => props.latestVersion?.round_no ?? props.latestVersion?.roundNo ?? 0);
const sourceMeta = computed(() => props.workbench?.sourceMeta || {});
const keywordRows = computed(() => props.workbench?.keywords?.rows || []);
const keywords = computed(() => keywordRows.value.map((r) => r.keyword));
const gallerySlots = computed(() => props.workbench?.gallerySlots || []);
const aPlus = computed(() => props.workbench?.aPlus || { modules: [], video: {}, view360: {} });
const coveragePercent = computed(() => props.workbench?.keywords?.summary?.percent || 0);

const copyFields = computed(() => [
  { key: 'title', label: 'Title', max: 200, min: 80, value: draft.value.title, help: '主词前置，保持自然可读，避免绝对化。' },
  ...draft.value.bullets.map((value, i) => ({ key: `bullet_${i + 1}`, label: `Bullet ${i + 1}`, max: 500, min: 80, value, help: '每条回答一个购买阻碍：场景、功能、证据、结果。' })),
  { key: 'description', label: 'Description', max: 2000, min: 200, value: draft.value.description, help: '补充品牌、使用、规格、FAQ 信息。' },
  { key: 'backend_search_terms', label: 'Backend Search Terms', max: 249, min: 80, value: draft.value.backendSearchTerms, help: '只放未自然覆盖的词，不重复标题。' },
]);

function fieldModel(fieldKey) {
  if (fieldKey === 'title') return draft.value.title;
  if (fieldKey === 'description') return draft.value.description;
  if (fieldKey === 'backend_search_terms') return draft.value.backendSearchTerms;
  const m = fieldKey.match(/bullet_(\d+)/);
  if (m) return draft.value.bullets[Number(m[1]) - 1] || '';
  return '';
}

function updateField(fieldKey, value) {
  if (fieldKey === 'title') draft.value.title = value;
  else if (fieldKey === 'description') draft.value.description = value;
  else if (fieldKey === 'backend_search_terms') draft.value.backendSearchTerms = value;
  else {
    const m = fieldKey.match(/bullet_(\d+)/);
    if (m) draft.value.bullets[Number(m[1]) - 1] = value;
  }
}

function metric(field) {
  const text = String(field.value || '');
  const lower = text.toLowerCase();
  const risky = ['best', 'guaranteed', 'cure', 'medical', 'permanent', 'lifetime', '100%'].filter((w) => lower.includes(w));
  const covered = keywords.value.filter((kw) => lower.includes(String(kw).toLowerCase())).length;
  return {
    length: text.length,
    percentage: Math.min(100, Math.round((text.length / field.max) * 100)),
    coverage: keywords.value.length ? Math.round((covered / keywords.value.length) * 100) : 0,
    risky,
    status: text.length > field.max ? 'danger' : text.length < field.min ? 'warning' : 'success',
  };
}

function badges(field) {
  const m = metric(field);
  return [
    { label: `${m.length}/${field.max}`, type: m.status },
    { label: `词覆盖 ${m.coverage}%`, type: m.coverage >= 30 ? 'success' : m.coverage >= 12 ? 'warning' : 'info' },
    { label: m.risky.length ? `风险 ${m.risky.join(', ')}` : '低风险', type: m.risky.length ? 'danger' : 'success' },
  ];
}

function toggleField(key) {
  const i = markedFields.value.indexOf(key);
  if (i >= 0) markedFields.value.splice(i, 1);
  else markedFields.value.push(key);
}

async function rewriteField(key) {
  if (key === 'backend_search_terms') {
    ElMessage.info('后台搜索词会在整轮生成时统一重排，避免重复和堆砌。');
    return;
  }
  const latestRun = flow.value.runs.value[0];
  if (!props.latestVersion || !latestRun) {
    ElMessage.warning('请先生成一轮版本，再进行单字段重写');
    return;
  }
  await flow.value.rewriteField(latestRun.id, key, feedback.value);
}

async function generateNext() {
  generating.value = true;
  try {
    await flow.value.createRun({
      feedbackText: feedback.value,
      markedFields: markedFields.value,
      localDraft: draft.value,
      styleToggles: {
        short_long: styleShortLong.value,
        rational_emotional: styleRationalEmotional.value,
        seo_natural: styleSeoNatural.value,
      },
    });
    feedback.value = '';
    markedFields.value = [];
  } catch {} finally {
    generating.value = false;
  }
}

function slotToApiSlot(slot) {
  if (slot === 'MAIN') return 'main';
  const m = String(slot).match(/PT(\d+)/);
  return m ? `pt${String(Number(m[1])).padStart(2, '0')}` : String(slot).toLowerCase();
}

async function generateImageForSlot(slot) {
  imageBusySlot.value = slot.slot;
  try {
    if (slot.imageId) {
      await flow.value.regenerateImage(slot.imageId, { prompt: slot.prompt, role: slot.role });
    } else {
      await flow.value.generateImage({
        versionId: props.latestVersion?.id,
        slot: slotToApiSlot(slot.slot),
        prompt: slot.prompt,
        role: slot.role,
        source: 'listing_workbench',
      });
    }
  } finally {
    imageBusySlot.value = '';
  }
}

async function copyDraft() {
  const text = [
    `TITLE: ${draft.value.title}`,
    ...draft.value.bullets.map((b, i) => `BULLET ${i + 1}: ${b}`),
    `DESCRIPTION: ${draft.value.description}`,
    `BACKEND SEARCH TERMS: ${draft.value.backendSearchTerms}`,
  ].join('\n');
  try {
    await navigator.clipboard?.writeText(text);
    ElMessage.success('已复制草稿');
  } catch {
    ElMessage.info('当前浏览器不支持自动复制，请手动选择文本复制');
  }
}
</script>

<template>
  <el-card shadow="never" class="gen-block" id="generation">
    <template #header>
      <div class="block-head">
        <div>
          <h2 class="section-title">文案编辑 + 素材生产</h2>
          <p class="head-sub">当前第 {{ roundNo }} 轮 · {{ sourceMeta.source || 'unknown' }} · confidence {{ Math.round((sourceMeta.confidence || 0) * 100) }}%</p>
        </div>
        <div class="head-actions">
          <el-button size="small" @click="copyDraft">复制草稿</el-button>
          <el-button size="small" type="primary" :loading="generating" @click="generateNext">生成下一轮</el-button>
        </div>
      </div>
    </template>

    <div class="copy-layout">
      <section class="copy-editor">
        <h3>Listing 文案</h3>
        <div v-for="field in copyFields" :key="field.key" class="field-row" :class="{ marked: markedFields.includes(field.key) }">
          <div class="field-head">
            <el-checkbox :model-value="markedFields.includes(field.key)" @change="toggleField(field.key)">
              <span class="field-label">{{ field.label }}</span>
            </el-checkbox>
            <div class="badge-row">
              <el-tag v-for="b in badges(field)" :key="b.label" size="small" :type="b.type" effect="plain">{{ b.label }}</el-tag>
              <el-button size="small" link type="primary" @click="rewriteField(field.key)">AI 重写</el-button>
            </div>
          </div>
          <p class="field-help">{{ field.help }}</p>
          <el-input
            :model-value="fieldModel(field.key)"
            :type="field.key === 'title' || field.key === 'backend_search_terms' ? 'text' : 'textarea'"
            :rows="field.key === 'description' ? 4 : 2"
            resize="vertical"
            @update:model-value="(value) => updateField(field.key, value)"
          />
        </div>
      </section>

      <aside class="copy-inspector">
        <h3>关键词检查</h3>
        <div class="coverage-ring" :style="{ '--p': coveragePercent }">
          <strong>{{ coveragePercent }}%</strong>
          <span>已覆盖关键词</span>
        </div>
        <div class="kw-mini-list">
          <div v-for="row in keywordRows.slice(0, 10)" :key="row.keyword" class="kw-mini">
            <span>{{ row.keyword }}</span>
            <el-tag size="small" :type="row.covered ? 'success' : 'warning'">{{ row.coverageText }}</el-tag>
          </div>
        </div>
        <h3>运营反馈</h3>
        <el-input v-model="feedback" type="textarea" :rows="4" placeholder="例如：标题更自然；Bullet 1 强调兼容型号；PT03 加入尺寸证据。" />
        <p class="hint" v-if="markedFields.length">已标记 {{ markedFields.length }} 个字段：{{ markedFields.join(', ') }}</p>
      </aside>
    </div>

    <section class="asset-section" id="assets">
      <div class="asset-head">
        <div>
          <h3>Amazon Gallery：MAIN + PT01-PT08</h3>
          <p>真实 Listing 不是只有主图；每个槽位都要承担一个转化任务。</p>
        </div>
        <el-tag effect="plain">{{ gallerySlots.filter((g) => g.url || g.status === 'ready').length }}/9 ready</el-tag>
      </div>
      <div class="gallery-grid">
        <article v-for="slot in gallerySlots" :key="slot.slot" class="gallery-cell" :class="{ main: slot.slot === 'MAIN', missing: !slot.url && slot.status !== 'ready' }">
          <div class="image-box">
            <img v-if="slot.url" :src="slot.url" :alt="slot.role" />
            <div v-else class="placeholder">{{ slot.slot }}</div>
          </div>
          <div class="slot-body">
            <div class="slot-title">
              <strong>{{ slot.slot }} · {{ slot.role }}</strong>
              <el-tag size="small" :type="slot.url || slot.status === 'ready' ? 'success' : slot.status === 'planned' ? 'warning' : 'info'">{{ slot.status }}</el-tag>
            </div>
            <p>{{ slot.intent }}</p>
            <small>{{ slot.requirement }}</small>
            <el-button size="small" plain :loading="imageBusySlot === slot.slot" @click="generateImageForSlot(slot)">
              {{ slot.imageId ? '重新生成' : '生成图片' }}
            </el-button>
          </div>
        </article>
      </div>
    </section>

    <section class="aplus-section">
      <div class="asset-head">
        <div>
          <h3>A+ / Video / 360</h3>
          <p>A+ 承接品牌信任、规格对比与 FAQ；视频和 360 是可选增强，不替代基础图片矩阵。</p>
        </div>
      </div>
      <div class="aplus-grid">
        <article v-for="m in aPlus.modules" :key="m.id" class="aplus-card">
          <el-tag size="small" effect="dark">{{ m.type }}</el-tag>
          <strong>{{ m.title }}</strong>
          <p>{{ m.brief }}</p>
          <span>{{ m.status }}</span>
        </article>
        <article class="aplus-card media">
          <el-tag size="small" type="warning" effect="plain">Video</el-tag>
          <strong>短视频脚本</strong>
          <p>{{ aPlus.video?.brief }}</p>
          <span>{{ aPlus.video?.status }}</span>
        </article>
        <article class="aplus-card media">
          <el-tag size="small" type="info" effect="plain">360</el-tag>
          <strong>360 展示</strong>
          <p>{{ aPlus.view360?.brief }}</p>
          <span>{{ aPlus.view360?.status }}</span>
        </article>
      </div>
    </section>

    <section class="control-block">
      <h3>AI 风格控制</h3>
      <div class="style-row">
        <div class="style-item"><label>短促 · 详细（{{ styleShortLong.toFixed(2) }}）</label><el-slider v-model="styleShortLong" :min="0" :max="1" :step="0.05" /></div>
        <div class="style-item"><label>理性 · 情绪（{{ styleRationalEmotional.toFixed(2) }}）</label><el-slider v-model="styleRationalEmotional" :min="0" :max="1" :step="0.05" /></div>
        <div class="style-item"><label>SEO · 自然（{{ styleSeoNatural.toFixed(2) }}）</label><el-slider v-model="styleSeoNatural" :min="0" :max="1" :step="0.05" /></div>
      </div>
    </section>
  </el-card>
</template>

<style scoped>
.gen-block { margin-bottom: 16px; scroll-margin-top: 80px; }
.block-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { font-size: 16px; font-weight: 700; margin: 0; color: #0f172a; }
.head-sub { margin: 4px 0 0; color: #64748b; font-size: 12px; }
.head-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
h3 { margin: 0 0 10px; font-size: 14px; color: #0f172a; }
.copy-layout { display: grid; grid-template-columns: minmax(0, 1.5fr) 330px; gap: 16px; }
.field-row { padding: 12px; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 10px; background: #fff; transition: all 0.16s; }
.field-row.marked { border-color: #f59e0b; background: #fffbeb; }
.field-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 6px; }
.field-label { font-size: 13px; font-weight: 700; color: #0f172a; }
.field-help { margin: 0 0 8px; color: #64748b; font-size: 12px; }
.badge-row { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.copy-inspector { padding: 14px; border: 1px solid #dbeafe; border-radius: 16px; background: #f8fafc; align-self: start; position: sticky; top: 60px; }
.coverage-ring { display: grid; place-items: center; width: 132px; height: 132px; border-radius: 50%; margin: 0 auto 12px; background: conic-gradient(#0f766e calc(var(--p, 65) * 1%), #e2e8f0 0); border: 10px solid #fff; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); }
.coverage-ring strong { display: block; font-size: 28px; color: #0f766e; }
.coverage-ring span { font-size: 11px; color: #64748b; }
.kw-mini-list { display: grid; gap: 6px; margin-bottom: 14px; }
.kw-mini { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 7px 8px; background: #fff; border-radius: 10px; font-size: 12px; }
.hint { color: #a16207; font-size: 12px; }
.asset-section, .aplus-section, .control-block { margin-top: 18px; padding-top: 16px; border-top: 1px dashed #e2e8f0; }
.asset-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; }
.asset-head p { margin: 2px 0 0; color: #64748b; font-size: 12px; }
.gallery-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.gallery-cell { overflow: hidden; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
.gallery-cell.main { border-color: #0f766e; box-shadow: 0 12px 28px rgba(15, 118, 110, 0.12); }
.gallery-cell.missing { border-style: dashed; }
.image-box { aspect-ratio: 1 / 1; background: linear-gradient(135deg, #f8fafc, #e0f2fe); display: grid; place-items: center; }
.image-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
.placeholder { width: 72px; height: 72px; display: grid; place-items: center; border-radius: 20px; background: rgba(15, 118, 110, 0.1); color: #0f766e; font-weight: 800; }
.slot-body { padding: 12px; display: grid; gap: 8px; }
.slot-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.slot-title strong { font-size: 13px; color: #0f172a; }
.slot-body p { margin: 0; color: #0f766e; font-size: 12px; font-weight: 700; }
.slot-body small { color: #64748b; line-height: 1.5; }
.aplus-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.aplus-card { display: grid; gap: 8px; padding: 14px; border-radius: 14px; border: 1px solid #e2e8f0; background: #fff; }
.aplus-card.media { background: #fff7ed; border-color: #fed7aa; }
.aplus-card strong { color: #0f172a; font-size: 14px; }
.aplus-card p { margin: 0; color: #64748b; font-size: 12px; line-height: 1.5; }
.aplus-card span { color: #0f766e; font-size: 12px; font-weight: 700; }
.style-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.style-item label { font-size: 12px; color: #64748b; }
@media (max-width: 980px) {
  .copy-layout { grid-template-columns: 1fr; }
  .copy-inspector { position: static; }
}
@media (max-width: 720px) {
  .block-head, .field-head, .asset-head { flex-direction: column; align-items: flex-start; }
  .gallery-grid { grid-template-columns: 1fr; }
  .badge-row { justify-content: flex-start; }
}
</style>
