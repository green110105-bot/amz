<script setup>
// 重点关键词（Campaign only）— 跟踪自定义 KW 集
// 管理标记：让用户加/删被跟踪的 keyword。存储用 localStorage（per entity id）+
// 未来后端 audit_logs 同步。
import { computed, ref, watchEffect, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { generateMockKeyKeywords } from './_mock-data.js';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });
const rows = ref([]);
const showManage = ref(false);
const newTerm = ref('');
const tracked = ref([]);  // user-managed kw texts

function lsKey() { return `keykw:${props.entity?.id || 'global'}`; }

function loadTracked() {
  try {
    const raw = localStorage.getItem(lsKey());
    tracked.value = raw ? JSON.parse(raw) : [];
  } catch { tracked.value = []; }
}
function saveTracked() {
  try { localStorage.setItem(lsKey(), JSON.stringify(tracked.value)); } catch {}
}

watchEffect(() => {
  if (!props.active || !props.entity?.id) return;
  loadTracked();
  const mock = generateMockKeyKeywords(props.entity);
  // Merge: show user-managed tracked terms (with mock metrics for visual) + the
  // default 5 if user hasn't customized
  if (tracked.value.length === 0) {
    rows.value = mock;
  } else {
    // Build rows from tracked terms; pull metrics from mock if matched, else generate fresh
    rows.value = tracked.value.map((term) => {
      const m = mock.find((x) => x.term === term);
      return m || { term, matchType: '精准', rank: null, impressions: 0, clicks: 0, ctr: 0, spend: 0, sales: 0, acos: 0 };
    });
  }
});

watch(tracked, saveTracked, { deep: true });

async function addTerm() {
  const t = (newTerm.value || '').trim();
  if (!t) return;
  if (tracked.value.includes(t)) {
    ElMessage.warning('关键词已存在');
    return;
  }
  tracked.value.push(t);
  saveTracked();
  newTerm.value = '';
  ElMessage.success(`已添加 "${t}" 到重点关键词`);
  // Refresh rows
  const mock = generateMockKeyKeywords(props.entity);
  rows.value = tracked.value.map((term) => {
    const m = mock.find((x) => x.term === term);
    return m || { term, matchType: '精准', rank: null, impressions: 0, clicks: 0, ctr: 0, spend: 0, sales: 0, acos: 0 };
  });
}

async function removeTerm(term) {
  try {
    await ElMessageBox.confirm(`从重点跟踪移除 "${term}" ？`, '移除', {
      confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning',
    });
  } catch { return; }
  tracked.value = tracked.value.filter((x) => x !== term);
  saveTracked();
  rows.value = rows.value.filter((x) => x.term !== term);
  ElMessage.success(`已移除 "${term}"`);
}
</script>

<template>
  <div class="tab-key-keywords">
    <div class="header">
      <p class="hint">跟踪你标记为"重点"的关键词。当前 {{ rows.length }} 个 · 已自定义 {{ tracked.length }} 个</p>
      <el-button size="small" type="primary" plain @click="showManage = !showManage">{{ showManage ? '收起管理' : '管理标记' }}</el-button>
    </div>

    <el-collapse-transition>
      <div v-if="showManage" class="manage-panel">
        <div class="add-row">
          <el-input v-model="newTerm" size="small" placeholder="新增关键词文本，回车添加" @keyup.enter="addTerm" style="width: 320px" />
          <el-button size="small" type="primary" @click="addTerm">+ 添加</el-button>
        </div>
        <div class="tag-row" v-if="tracked.length > 0">
          <span class="meta">已跟踪:</span>
          <el-tag v-for="t in tracked" :key="t" closable @close="removeTerm(t)" size="small">{{ t }}</el-tag>
        </div>
        <div v-else class="meta">还没有自定义跟踪 — 上面添加，或保持默认建议</div>
      </div>
    </el-collapse-transition>

    <el-table :data="rows" stripe border size="small" max-height="320" empty-text="尚未标记重点关键词">
      <el-table-column prop="term" label="关键词" min-width="200" />
      <el-table-column prop="matchType" label="匹配" width="80" />
      <el-table-column prop="rank" label="位置" align="right" width="90">
        <template #default="{ row }">{{ row.rank ? '#' + row.rank.toFixed(1) : '--' }}</template>
      </el-table-column>
      <el-table-column prop="impressions" label="曝光" align="right" sortable>
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="clicks" label="点击" align="right" sortable />
      <el-table-column label="CTR" align="right">
        <template #default="{ row }">{{ (row.ctr * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="花费" align="right" prop="spend">
        <template #default="{ row }">${{ row.spend.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="销售额" align="right">
        <template #default="{ row }">${{ row.sales.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" align="right">
        <template #default="{ row }">{{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.tab-key-keywords { padding: 8px 0; }
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.hint { font-size: 12px; color: var(--text-muted); margin: 0; }
.manage-panel {
  padding: 12px; background: #fafbfc; border: 1px solid #eef0f3;
  border-radius: 6px; margin-bottom: 12px;
}
.add-row { display: flex; gap: 8px; margin-bottom: 8px; }
.tag-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.tag-row .meta { font-size: 12px; color: var(--text-muted); }
:deep(.el-table) { font-size: 12px; }
</style>
