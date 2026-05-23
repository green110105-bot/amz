<script setup>
import { computed, ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import ListingDiff from './ListingDiff.vue';
import { useVersions } from '../../composables/useM1State';

const props = defineProps({
  targetId: { type: String, required: true },
});

const v = computed(() => useVersions(props.targetId));
const versions = computed(() => v.value.list.value);

const selected = ref([]); // 选中 2 版 → diff
const diffOpen = ref(false);
const fieldPickerOpen = ref(false);
const fieldPicks = ref({}); // {title: versionId, bullet_1: versionId, ...}

const fieldsForPick = [
  { key: 'title', label: '标题' },
  { key: 'bullet_1', label: '5 点 #1' },
  { key: 'bullet_2', label: '5 点 #2' },
  { key: 'bullet_3', label: '5 点 #3' },
  { key: 'bullet_4', label: '5 点 #4' },
  { key: 'bullet_5', label: '5 点 #5' },
  { key: 'description', label: '描述' },
];

// 最近 5 版
const recent = computed(() => versions.value.slice(0, 5));

function sourceLabel(s) {
  return ({
    initial_import: '初始',
    ai_iteration: 'AI 迭代',
    manual_edit: '手动编辑',
    combined_pick: '组合挑选',
  })[s] || s;
}

function sourceType(s) {
  return ({
    initial_import: 'info',
    ai_iteration: 'primary',
    manual_edit: 'warning',
    combined_pick: 'success',
  })[s] || 'info';
}

function toggleSelect(id) {
  const i = selected.value.indexOf(id);
  if (i >= 0) selected.value.splice(i, 1);
  else if (selected.value.length < 2) selected.value.push(id);
  else ElMessage.info('最多选 2 个版本对比');
}

function startDiff() {
  if (selected.value.length !== 2) {
    ElMessage.warning('请选 2 个版本对比');
    return;
  }
  diffOpen.value = true;
}

async function togglePin(ver) {
  await v.value.pin(ver.id, !(ver.is_pinned ?? ver.isPinned));
}

async function removeVer(ver) {
  try {
    await ElMessageBox.confirm(`确认删除版本 ${ver.id.slice(0, 8)}（轮次 ${ver.round_no ?? ver.roundNo}）？`, '删除版本', { type: 'warning' });
    await v.value.remove(ver.id);
  } catch {}
}

function openFieldPicker() {
  fieldPicks.value = {};
  fieldPickerOpen.value = true;
}

async function commitCombinedPick() {
  const picks = fieldPicks.value;
  if (!Object.keys(picks).length) {
    ElMessage.warning('请至少为一个字段选一个版本');
    return;
  }
  await v.value.combinedPick(picks);
  fieldPickerOpen.value = false;
}

function val(ver, key) {
  if (!ver) return '';
  return ver[key] ?? ver[toCamel(key)] ?? '';
}
function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

onMounted(() => {
  v.value.fetch();
});
</script>

<template>
  <el-card shadow="never" class="vb" id="versions">
    <template #header>
      <div class="block-head">
        <h2 class="section-title">📚 版本管理（最近 5 版）</h2>
        <div class="head-actions">
          <el-button size="small" :disabled="selected.length !== 2" @click="startDiff">对比 diff</el-button>
          <el-button size="small" type="primary" plain @click="openFieldPicker">组合挑选最佳字段</el-button>
        </div>
      </div>
    </template>

    <div v-if="!recent.length" class="empty">尚无版本</div>

    <div v-else class="ver-grid">
      <div
        v-for="ver in recent"
        :key="ver.id"
        class="ver-card"
        :class="{ selected: selected.includes(ver.id), pinned: ver.is_pinned || ver.isPinned }"
        @click="toggleSelect(ver.id)"
      >
        <div class="ver-head">
          <strong>轮次 {{ ver.round_no ?? ver.roundNo }}</strong>
          <el-tag size="small" :type="sourceType(ver.source)" effect="plain">{{ sourceLabel(ver.source) }}</el-tag>
        </div>
        <div class="ver-id">{{ ver.id?.slice(0, 12) }}</div>
        <p class="ver-title">{{ val(ver, 'title') || '—' }}</p>
        <div class="ver-meta">
          <span>{{ (ver.created_at || ver.createdAt || '').slice(0, 16) }}</span>
        </div>
        <div class="ver-actions" @click.stop>
          <el-button size="small" link :type="(ver.is_pinned || ver.isPinned) ? 'warning' : 'default'" @click="togglePin(ver)">
            {{ (ver.is_pinned || ver.isPinned) ? '★ 已置顶' : '☆ 置顶' }}
          </el-button>
          <el-button
            size="small"
            link
            type="danger"
            :disabled="(ver.round_no ?? ver.roundNo) === 1"
            @click="removeVer(ver)"
          >
            删除
          </el-button>
        </div>
      </div>
    </div>

    <p v-if="recent.length" class="hint">
      点击卡片选中（最多 2 个）→ 对比 diff · 组合挑选可从多版本拼一个最佳组合
    </p>

    <!-- Diff Dialog -->
    <el-dialog v-model="diffOpen" title="版本对比" width="90%" top="5vh">
      <ListingDiff v-if="selected.length === 2" :version-a-id="selected[0]" :version-b-id="selected[1]" />
    </el-dialog>

    <!-- 组合挑选 Dialog -->
    <el-dialog v-model="fieldPickerOpen" title="组合挑选最佳字段" width="800px">
      <p class="text-muted" style="font-size: 13px; margin-bottom: 12px">
        为每个字段选一个版本，提交后生成一个新的 source='combined_pick' 版本
      </p>
      <el-table :data="fieldsForPick" stripe>
        <el-table-column prop="label" label="字段" width="120" />
        <el-table-column label="选版本">
          <template #default="{ row }">
            <el-select v-model="fieldPicks[row.key]" placeholder="选版本" style="width: 100%" clearable>
              <el-option
                v-for="ver in versions"
                :key="ver.id"
                :label="`R${ver.round_no ?? ver.roundNo} · ${sourceLabel(ver.source)} · ${(val(ver, row.key) || '').slice(0, 40)}`"
                :value="ver.id"
              />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="fieldPickerOpen = false">取消</el-button>
        <el-button type="primary" @click="commitCombinedPick">生成组合版本</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.vb { margin-bottom: 16px; scroll-margin-top: 80px; }
.block-head { display: flex; justify-content: space-between; align-items: center; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.head-actions { display: flex; gap: 8px; }

.ver-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.ver-card {
  border: 2px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;
}
.ver-card:hover { border-color: var(--primary); }
.ver-card.selected { border-color: var(--primary); background: var(--primary-soft); }
.ver-card.pinned { border-color: #f59e0b; }
.ver-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.ver-id { font-family: ui-monospace, monospace; font-size: 10px; color: var(--text-muted); }
.ver-title {
  margin: 6px 0;
  font-size: 12px;
  color: var(--text);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.ver-meta { font-size: 10px; color: var(--text-muted); margin-bottom: 8px; }
.ver-actions { display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px dashed var(--line-soft); }
.hint { font-size: 11px; color: var(--text-muted); margin: 8px 0 0; }
.empty { padding: 32px; text-align: center; color: var(--text-muted); }
</style>
