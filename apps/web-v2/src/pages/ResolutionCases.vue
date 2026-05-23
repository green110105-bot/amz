<script setup>
// ResolutionCases — 处置案例库（含 reusable 过滤 / 新建 case）
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { useViewport } from '../composables/useViewport';
import { useResolutionCases } from '../composables/useM4State';

const route = useRoute();
const router = useRouter();
const cases = useResolutionCases();
const { isMobile } = useViewport();

const search = ref(route.query.q || '');
const statusFilter = ref(route.query.status || 'all');
const reusableOnly = ref(route.query.reusable === '1');

watch([search, statusFilter, reusableOnly], ([q, s, r]) => {
  const obj = {};
  if (q) obj.q = q;
  if (s !== 'all') obj.status = s;
  if (r) obj.reusable = '1';
  router.replace({ query: obj });
}, { deep: false });

async function load() {
  const params = {};
  if (search.value) params.q = search.value;
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  if (reusableOnly.value) params.reusable = 1;
  await cases.fetch(params, true);
}
onMounted(load);
watch([statusFilter, reusableOnly], load);

const filtered = computed(() => {
  const list = cases.list.value || [];
  if (!search.value) return list;
  const q = search.value.toLowerCase();
  return list.filter((c) => `${c.anomalyCode || c.anomaly_code || ''} ${c.scenario || ''} ${c.actionPlan || c.action_plan || ''}`.toLowerCase().includes(q));
});

async function createCase() {
  try {
    const { value: scenario } = await ElMessageBox.prompt('场景描述', '新建案例', { confirmButtonText: '下一步' });
    if (!scenario) return;
    const { value: actionPlan } = await ElMessageBox.prompt('处置计划', '新建案例', { confirmButtonText: '创建' });
    if (!actionPlan) return;
    await cases.create({ scenario, actionPlan });
  } catch (_) {/* cancel */}
}
async function markReusable(item) {
  await cases.update(item.id, { reusable: 1 });
}
</script>

<template>
  <div>
    <PageHeader title="处置案例库" subtitle="历史成功处置案例 · AI 推荐相似案例 · 可复用沉淀">
      <template #extra>
        <div class="toolbar">
          <el-input v-model="search" placeholder="搜索类型/场景/动作" :prefix-icon="'Search'" size="default" class="tb-input" clearable />
          <el-select v-model="statusFilter" size="default" class="tb-select">
            <el-option label="全部状态" value="all" />
            <el-option label="进行中" value="in_progress" />
            <el-option label="成功" value="successful" />
            <el-option label="部分成功" value="partial" />
            <el-option label="失败" value="failed" />
            <el-option label="已归档" value="archived" />
          </el-select>
          <el-checkbox v-model="reusableOnly">仅可复用</el-checkbox>
          <el-button type="primary" :icon="'Plus'" @click="createCase">新建案例</el-button>
        </div>
      </template>
    </PageHeader>

    <div v-loading="cases.loading.value">
      <EmptyState v-if="!cases.loading.value && filtered.length === 0" title="暂无案例" description="尚未沉淀任何案例" icon="Document" />
      <el-row :gutter="16">
        <el-col v-for="c in filtered" :key="c.id" :xs="24" :sm="24" :md="12" :lg="12">
          <el-card shadow="never" class="case-card">
            <div class="case-head">
              <strong class="case-id">{{ c.id }}</strong>
              <el-tag size="small" effect="plain">{{ c.anomalyCode || c.anomaly_code || '-' }}</el-tag>
              <el-tag size="small" :type="c.status === 'successful' ? 'success' : c.status === 'failed' ? 'danger' : ''">{{ c.status }}</el-tag>
              <el-tag v-if="c.reusable" size="small" type="primary" effect="plain">可复用</el-tag>
              <span class="text-muted tnum">{{ (c.createdAt || c.created_at || '').slice(0, 10) }}</span>
            </div>

            <div class="case-block">
              <span class="block-label">场景</span>
              <p>{{ c.scenario }}</p>
            </div>
            <div class="case-block">
              <span class="block-label">处置</span>
              <p>{{ c.actionPlan || c.action_plan }}</p>
            </div>
            <div class="case-block">
              <span class="block-label">结果</span>
              <p class="text-success">{{ c.outcome || '-' }}</p>
            </div>
            <div class="case-foot">
              <el-button v-if="!c.reusable && c.status === 'successful'" size="small" plain @click="markReusable(c)">沉淀为可复用</el-button>
              <span class="text-muted" style="font-size: 11px">被引用 {{ c.referenceCount || 0 }} 次</span>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.case-card { margin-bottom: 16px; }
.case-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.case-id { font-family: ui-monospace, monospace; color: var(--primary); }
.case-block { margin-bottom: 8px; }
.block-label { display: block; font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 2px; }
.case-block p { margin: 0; font-size: 13px; }
.case-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line-soft); }
.text-success { color: var(--success); }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tb-input { width: 220px; }
.tb-select { width: 130px; }
@media (max-width: 767px) {
  .toolbar { width: 100%; }
  .tb-input, .tb-select { width: 100%; }
}
</style>
