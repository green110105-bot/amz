<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useTargetFlow } from '../../composables/useM1State';

const props = defineProps({
  targetId: { type: String, required: true },
});

const flow = computed(() => useTargetFlow(props.targetId));
const research = computed(() => flow.value.research.value);
const triggering = ref(false);

function parseJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

// 5 张卡：title_pattern / bullet_structure / main_image_visual / a_plus_structure / review_keywords
const cards = computed(() => {
  const r = research.value;
  if (!r) return [];
  const labels = [
    { key: 'title_pattern', icon: '📝', title: '标题模式' },
    { key: 'bullet_structure', icon: '📋', title: '5 点描述结构' },
    { key: 'main_image_visual', icon: '🖼️', title: '主图视觉' },
    { key: 'a_plus_structure', icon: '📄', title: 'A+ 结构' },
    { key: 'review_keywords', icon: '💬', title: '评论关键词' },
  ];
  return labels.map((l) => {
    const raw = r[l.key] ?? r[toCamel(l.key)];
    const parsed = parseJson(raw) || { theme: '—', evidence: '—', action: '—' };
    return {
      ...l,
      theme: parsed.theme || '—',
      evidence: parsed.evidence || '—',
      action: parsed.action || '—',
    };
  });
});

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

async function trigger() {
  triggering.value = true;
  try {
    await flow.value.triggerResearch();
  } finally {
    triggering.value = false;
  }
}

async function refresh() {
  await flow.value.clearResearchCache();
  await trigger();
}

onMounted(() => {
  if (!research.value) {
    // 不强制 trigger，由用户主动调起；先尝试拉一次缓存
  }
});

watch(
  () => props.targetId,
  () => {},
);
</script>

<template>
  <el-card shadow="never" class="research-block">
    <template #header>
      <div class="block-head">
        <h2 class="section-title">🔍 5 维度调研结论</h2>
        <div class="head-actions">
          <el-tag v-if="research?.cached_until || research?.cachedUntil" size="small" type="info" effect="plain">
            缓存有效至 {{ (research.cached_until || research.cachedUntil)?.slice(0, 10) }}
          </el-tag>
          <el-button size="small" :loading="triggering" @click="trigger" v-if="!research">触发调研</el-button>
          <el-button size="small" :loading="triggering" @click="refresh" v-else>强制刷新</el-button>
        </div>
      </div>
    </template>

    <div v-if="!research" class="empty">
      <p class="text-muted">尚未调研。点击"触发调研"将分析同类目竞品 + 评论 + 主图特征，缓存 7 天。</p>
    </div>

    <div v-else class="cards-grid">
      <div v-for="c in cards" :key="c.key" class="research-card">
        <div class="card-title">
          <span class="card-icon">{{ c.icon }}</span>
          <strong>{{ c.title }}</strong>
        </div>
        <div class="card-section">
          <span class="sec-label">📌 主题</span>
          <p>{{ c.theme }}</p>
        </div>
        <div class="card-section">
          <span class="sec-label">📊 数据支撑</span>
          <p>{{ c.evidence }}</p>
        </div>
        <div class="card-section">
          <span class="sec-label">⚡ 行动建议</span>
          <p>{{ c.action }}</p>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.research-block { margin-bottom: 16px; }
.block-head { display: flex; justify-content: space-between; align-items: center; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.head-actions { display: flex; gap: 8px; align-items: center; }
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.research-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
}
.card-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 14px; }
.card-icon { font-size: 18px; }
.card-section { margin-bottom: 8px; }
.card-section:last-child { margin-bottom: 0; }
.sec-label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 2px;
  letter-spacing: 0.02em;
}
.card-section p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text); }
.empty { padding: 24px; text-align: center; color: var(--text-muted); }
</style>
