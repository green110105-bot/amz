<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import ImagePromptEditor from './ImagePromptEditor.vue';
import { useTargetFlow } from '../../composables/useM1State';

const props = defineProps({
  targetId: { type: String, required: true },
  latestVersion: { type: Object, default: null },
});

const flow = computed(() => useTargetFlow(props.targetId));
const images = computed(() => flow.value.images.value);

const styleShortLong = ref(0.5);
const styleRationalEmotional = ref(0.5);
const styleSeoNatural = ref(0.5);

const feedback = ref('');
const markedFields = ref([]);
const generating = ref(false);

const fields = [
  { key: 'title', label: '标题' },
  { key: 'bullet_1', label: '5 点 #1' },
  { key: 'bullet_2', label: '5 点 #2' },
  { key: 'bullet_3', label: '5 点 #3' },
  { key: 'bullet_4', label: '5 点 #4' },
  { key: 'bullet_5', label: '5 点 #5' },
  { key: 'description', label: '描述' },
];

function fieldValue(key) {
  const v = props.latestVersion;
  if (!v) return '';
  return v[key] || v[toCamel(key)] || '';
}

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function toggleField(key) {
  const i = markedFields.value.indexOf(key);
  if (i >= 0) markedFields.value.splice(i, 1);
  else markedFields.value.push(key);
}

async function rewriteField(key) {
  const v = props.latestVersion;
  if (!v) {
    ElMessage.warning('尚无版本可重写');
    return;
  }
  // 找到该字段所属的 run（最新一个）
  const latestRun = flow.value.runs.value[0];
  if (!latestRun) {
    ElMessage.warning('尚无 run 记录');
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

async function regenerateImage(img, body) {
  await flow.value.regenerateImage(img.id, body);
}

const mainImage = computed(() => images.value.find((i) => i.slot === 'main'));
const sideImages = computed(() =>
  images.value.filter((i) => /^side_/.test(i.slot)).sort((a, b) => a.slot.localeCompare(b.slot)),
);
const aPlusImages = computed(() =>
  images.value.filter((i) => /^a_plus_/.test(i.slot)).sort((a, b) => a.slot.localeCompare(b.slot)),
);

const roundNo = computed(() => {
  const v = props.latestVersion;
  return v?.round_no ?? v?.roundNo ?? 0;
});
</script>

<template>
  <el-card shadow="never" class="gen-block" id="generation">
    <template #header>
      <div class="block-head">
        <h2 class="section-title">✨ 多轮生成 · 当前第 {{ roundNo }} 轮</h2>
        <el-button size="small" type="primary" :loading="generating" @click="generateNext">
          🚀 生成下一轮
        </el-button>
      </div>
    </template>

    <!-- 字段编辑 -->
    <div class="fields-block">
      <h3 class="sub-head">📝 文本字段</h3>
      <div v-if="!latestVersion" class="empty">尚无版本 · 请先触发第 1 轮生成</div>
      <div v-else>
        <div v-for="f in fields" :key="f.key" class="field-row" :class="{ marked: markedFields.includes(f.key) }">
          <div class="field-head">
            <el-checkbox :model-value="markedFields.includes(f.key)" @change="toggleField(f.key)">
              <span class="field-label">{{ f.label }}</span>
            </el-checkbox>
            <el-button size="small" link type="primary" @click="rewriteField(f.key)">重写</el-button>
          </div>
          <p class="field-value">{{ fieldValue(f.key) || '—' }}</p>
        </div>
      </div>
    </div>

    <!-- 图片网格 -->
    <div class="images-block">
      <h3 class="sub-head">🖼️ 图片（{{ images.length }} 张）</h3>
      <div v-if="!images.length" class="empty">尚无图片</div>
      <div v-else class="img-grid">
        <div class="img-cell-wrap main-cell" v-if="mainImage">
          <span class="cell-tag">主图</span>
          <ImagePromptEditor :image-object="mainImage" :target-id="targetId" @regenerate="(b) => regenerateImage(mainImage, b)" />
        </div>
        <div class="img-cell-wrap" v-for="img in sideImages" :key="img.id">
          <ImagePromptEditor :image-object="img" :target-id="targetId" @regenerate="(b) => regenerateImage(img, b)" />
        </div>
        <div class="img-cell-wrap aplus-cell" v-for="img in aPlusImages" :key="img.id">
          <ImagePromptEditor :image-object="img" :target-id="targetId" @regenerate="(b) => regenerateImage(img, b)" />
        </div>
      </div>
    </div>

    <!-- 风格 toggle + 反馈 -->
    <div class="control-block">
      <h3 class="sub-head">🎛️ 风格 toggle</h3>
      <div class="style-row">
        <div class="style-item">
          <label>短 ←→ 长 ({{ styleShortLong.toFixed(2) }})</label>
          <el-slider v-model="styleShortLong" :min="0" :max="1" :step="0.05" />
        </div>
        <div class="style-item">
          <label>理性 ←→ 感性 ({{ styleRationalEmotional.toFixed(2) }})</label>
          <el-slider v-model="styleRationalEmotional" :min="0" :max="1" :step="0.05" />
        </div>
        <div class="style-item">
          <label>SEO ←→ 自然 ({{ styleSeoNatural.toFixed(2) }})</label>
          <el-slider v-model="styleSeoNatural" :min="0" :max="1" :step="0.05" />
        </div>
      </div>

      <h3 class="sub-head" style="margin-top: 16px">💬 运营反馈</h3>
      <el-input
        v-model="feedback"
        type="textarea"
        :rows="3"
        placeholder="第 2 轮起仅重写勾选字段；如未勾选则按反馈全字段调整。例：标题去掉品牌词，5 点 #1 突出环保。"
      />
      <p class="hint" v-if="markedFields.length">
        已标记 {{ markedFields.length }} 个字段：{{ markedFields.join(', ') }} · 下一轮只重写这些
      </p>
    </div>
  </el-card>
</template>

<style scoped>
.gen-block { margin-bottom: 16px; scroll-margin-top: 80px; }
.block-head { display: flex; justify-content: space-between; align-items: center; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.sub-head { font-size: 13px; font-weight: 600; margin: 0 0 10px; color: var(--text); }

.fields-block { padding: 12px 0; border-bottom: 1px dashed var(--line-soft); }
.field-row {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  margin-bottom: 8px;
  transition: all 0.15s;
}
.field-row.marked { border-color: #f59e0b; background: #fffbeb; }
.field-head { display: flex; justify-content: space-between; align-items: center; }
.field-label { font-size: 13px; font-weight: 500; }
.field-value {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
  white-space: pre-wrap;
}

.images-block { padding: 16px 0; border-bottom: 1px dashed var(--line-soft); }
.img-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.img-cell-wrap { position: relative; }
.cell-tag {
  position: absolute;
  top: -10px;
  left: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  z-index: 2;
}
.main-cell { grid-column: span 1; }

.control-block { padding-top: 16px; }
.style-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.style-item label { font-size: 12px; color: var(--text-muted); }
.hint { font-size: 11px; color: #f59e0b; margin: 6px 0 0; }
.empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
</style>
