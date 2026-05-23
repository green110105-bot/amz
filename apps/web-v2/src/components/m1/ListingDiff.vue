<script setup>
import { ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { versionsApi } from '../../api/m1';

const props = defineProps({
  versionAId: { type: String, required: true },
  versionBId: { type: String, required: true },
});

const loading = ref(false);
const error = ref(null);
const diffResult = ref(null);
const versionA = ref(null);
const versionB = ref(null);

const fields = [
  { key: 'title', label: '标题' },
  { key: 'bullet_1', label: '5 点 #1' },
  { key: 'bullet_2', label: '5 点 #2' },
  { key: 'bullet_3', label: '5 点 #3' },
  { key: 'bullet_4', label: '5 点 #4' },
  { key: 'bullet_5', label: '5 点 #5' },
  { key: 'description', label: '描述' },
];

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function val(version, key) {
  if (!version) return '';
  return version[key] ?? version[toCamel(key)] ?? '';
}

const rows = computed(() => {
  return fields.map((f) => {
    const a = val(versionA.value, f.key);
    const b = val(versionB.value, f.key);
    return {
      ...f,
      a,
      b,
      changed: a !== b,
    };
  });
});

async function load() {
  if (!props.versionAId || !props.versionBId) return;
  loading.value = true;
  error.value = null;
  try {
    // 走 diff endpoint + 双端 get
    const [diff, a, b] = await Promise.all([
      versionsApi.diff(props.versionAId, props.versionBId).catch(() => null),
      versionsApi.get(props.versionAId).catch(() => null),
      versionsApi.get(props.versionBId).catch(() => null),
    ]);
    diffResult.value = diff;
    versionA.value = a;
    versionB.value = b;
  } catch (e) {
    error.value = e;
    ElMessage.error(`加载 diff 失败：${e.message || e}`);
  } finally {
    loading.value = false;
  }
}

watch(() => [props.versionAId, props.versionBId], load, { immediate: true });
</script>

<template>
  <div class="diff-wrap" v-loading="loading">
    <div class="diff-head">
      <div class="diff-col">
        <strong>版本 A · {{ versionA?.round_no ?? versionA?.roundNo ?? '?' }}</strong>
        <span class="text-muted">{{ versionA?.source || '—' }}</span>
      </div>
      <div class="diff-col">
        <strong>版本 B · {{ versionB?.round_no ?? versionB?.roundNo ?? '?' }}</strong>
        <span class="text-muted">{{ versionB?.source || '—' }}</span>
      </div>
    </div>

    <div v-if="error" class="empty">加载失败</div>
    <div v-else-if="!versionA && !versionB && !loading" class="empty">无数据</div>

    <div v-else class="diff-body">
      <div v-for="row in rows" :key="row.key" class="diff-row" :class="{ 'diff-changed': row.changed }">
        <div class="diff-field-label">{{ row.label }}</div>
        <div class="diff-cells">
          <div class="diff-cell" :class="{ 'cell-changed': row.changed }">
            {{ row.a || '—' }}
          </div>
          <div class="diff-cell" :class="{ 'cell-changed': row.changed }">
            {{ row.b || '—' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-wrap { display: flex; flex-direction: column; }
.diff-head {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 12px;
}
.diff-col { display: flex; flex-direction: column; gap: 2px; padding-left: 140px; }
.diff-col strong { font-size: 14px; }
.diff-col .text-muted { font-size: 11px; }

.diff-body { display: flex; flex-direction: column; gap: 8px; }
.diff-row { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.diff-row.diff-changed { border-color: #f59e0b; }
.diff-field-label {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  background: #f9fafb;
  color: var(--text-muted);
  border-bottom: 1px solid var(--line-soft);
}
.diff-cells { display: grid; grid-template-columns: 1fr 1fr; }
.diff-cell {
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  border-right: 1px solid var(--line-soft);
}
.diff-cell:last-child { border-right: none; }
.diff-cell.cell-changed { background: #fff7ed; color: #9a3412; }
.diff-row.diff-changed .diff-cell.cell-changed:last-child { background: #ecfdf5; color: #065f46; }
.empty { padding: 32px; text-align: center; color: var(--text-muted); }
</style>
