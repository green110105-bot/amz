<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps({
  imageObject: { type: Object, required: true },
  // 当 imageObject 是空（生成前）时，需要 targetId + slot
  targetId: { type: String, default: '' },
});

const emit = defineEmits(['regenerate', 'update:prompt']);

const draftKey = computed(() => `m1_draft_prompt_${props.imageObject?.id || 'new'}`);

const prompt = ref('');
const refImageUrl = ref('');
const styleRefAsin = ref('');
const regenerating = ref(false);

function loadDraft() {
  try {
    const draft = localStorage.getItem(draftKey.value);
    if (draft) return draft;
  } catch {}
  return null;
}

function persist() {
  try {
    if (prompt.value) localStorage.setItem(draftKey.value, prompt.value);
    else localStorage.removeItem(draftKey.value);
  } catch {}
}

function syncFromProp() {
  const saved = loadDraft();
  prompt.value = saved ?? (props.imageObject?.prompt || '');
  refImageUrl.value = props.imageObject?.ref_image_url || props.imageObject?.refImageUrl || '';
  styleRefAsin.value = props.imageObject?.style_ref_asin || props.imageObject?.styleRefAsin || '';
}

onMounted(syncFromProp);
watch(() => props.imageObject?.id, syncFromProp);

watch(prompt, () => {
  persist();
  emit('update:prompt', prompt.value);
});

const slotLabel = computed(() => {
  const s = props.imageObject?.slot || '';
  if (s === 'main') return '主图';
  if (s.startsWith('side_')) return `副图 ${s.slice(5)}`;
  if (s.startsWith('a_plus_')) return `A+ ${s.slice(7)}`;
  return s || '未知';
});

const statusType = computed(() => {
  const s = props.imageObject?.status;
  return { pending: 'warning', generating: 'warning', completed: 'success', failed: 'danger' }[s] || 'info';
});

async function regenerate() {
  if (!prompt.value.trim()) {
    ElMessage.warning('请填写 prompt');
    return;
  }
  regenerating.value = true;
  try {
    await emit('regenerate', {
      prompt: prompt.value,
      refImageUrl: refImageUrl.value || undefined,
      styleRefAsin: styleRefAsin.value || undefined,
    });
    try { localStorage.removeItem(draftKey.value); } catch {}
  } finally {
    regenerating.value = false;
  }
}

function onUpload(file) {
  // 简单转 DataURL，作为 mock 上传
  const reader = new FileReader();
  reader.onload = (e) => {
    refImageUrl.value = String(e.target?.result || '');
    ElMessage.success('参考图已附加');
  };
  reader.readAsDataURL(file.raw || file);
  return false; // 阻止默认上传
}
</script>

<template>
  <div class="ipe">
    <div class="ipe-head">
      <el-tag size="small" effect="plain">{{ slotLabel }}</el-tag>
      <el-tag size="small" :type="statusType" effect="dark">{{ imageObject?.status || 'pending' }}</el-tag>
    </div>

    <div class="thumb">
      <img v-if="imageObject?.generated_url || imageObject?.generatedUrl" :src="imageObject.generated_url || imageObject.generatedUrl" :alt="slotLabel" />
      <div v-else class="thumb-placeholder">
        <el-icon :size="32"><Picture /></el-icon>
        <span>未生成</span>
      </div>
    </div>

    <el-input v-model="prompt" type="textarea" :rows="3" placeholder="描述这张图的画面、布局、颜色、卖点元素…" />

    <div class="meta-row">
      <el-upload :show-file-list="false" :before-upload="onUpload" :auto-upload="false">
        <el-button size="small">📎 参考图</el-button>
      </el-upload>
      <el-input v-model="styleRefAsin" size="small" placeholder="styleRefAsin (可选)" style="max-width: 180px" />
      <el-button size="small" type="primary" :loading="regenerating" @click="regenerate">重新生成</el-button>
    </div>

    <div v-if="refImageUrl" class="ref-img-tag">
      已附加参考图（点保存按钮以应用）
    </div>
  </div>
</template>

<style scoped>
.ipe {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ipe-head { display: flex; gap: 6px; justify-content: space-between; }
.thumb {
  width: 100%;
  aspect-ratio: 1;
  background: #f9fafb;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb-placeholder { display: flex; flex-direction: column; gap: 4px; color: var(--text-muted); font-size: 12px; align-items: center; }
.meta-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.ref-img-tag { font-size: 11px; color: var(--primary); }
</style>
