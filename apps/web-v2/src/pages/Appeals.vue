<script setup>
// Appeals — 申诉中心（状态机：draft → submitted → under_review → accepted | rejected → retry）
// 草稿 localStorage 持久化：m4_draft_appeal_<reviewId>
// 显式渲染状态机当前状态 + 允许动作
// T3 桌面优先：列表移动可用（ResponsiveTable），新建/编辑表单移动用 MobileFallback
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import ResponsiveDrawer from '../components/ResponsiveDrawer.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { useAppeals, allowedAppealActions, canAppealTransition } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';

const route = useRoute();
const router = useRouter();
const ap = useAppeals();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

const tab = ref(route.query.tab || 'all');
const detailDrawer = ref(false);
const current = ref(null);
const draftDialog = ref(false);
const draftForm = ref({ reviewId: '', violationType: 'unrelated_to_product', payload: { body: '' } });

watch(tab, (v) => {
  router.replace({ query: { ...route.query, tab: v === 'all' ? undefined : v } });
});

async function load() {
  await ap.fetch({}, true);
}
onMounted(async () => {
  await load();
  // 从 ReviewList 跳来时自动打开草稿对话框
  if (route.query.reviewId) {
    draftForm.value.reviewId = String(route.query.reviewId);
    loadDraftFromLocal(draftForm.value.reviewId);
    draftDialog.value = true;
  }
});

const filtered = computed(() => {
  const list = ap.list.value || [];
  if (tab.value === 'all') return list;
  return list.filter((a) => a.status === tab.value);
});

const summary = computed(() => ap.summary.value || {});

function statusType(s) {
  return { draft: '', submitted: 'warning', under_review: '', accepted: 'success', rejected: 'danger', withdrawn: 'info' }[s] || '';
}
function statusLabel(s) {
  return { draft: '草稿', submitted: '已提交', under_review: '审核中', accepted: '已接受 ✓', rejected: '已拒绝', withdrawn: '已撤回' }[s] || s;
}
function violationLabel(v) {
  return { unrelated_to_product: '与产品无关', conflict_of_interest: '利益冲突', logistics_unrelated: '物流问题（非产品）', duplicate: '重复评论', hateful: '不当语言', hijacking_counterfeit: '跟卖假货' }[v] || v;
}

// ---- 草稿 localStorage 持久化 ----
function draftKey(reviewId) { return `m4_draft_appeal_${reviewId}`; }
function loadDraftFromLocal(reviewId) {
  if (!reviewId) return;
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(reviewId)) || 'null');
    if (saved) {
      draftForm.value.violationType = saved.violationType || 'unrelated_to_product';
      draftForm.value.payload = saved.payload || { body: '' };
    }
  } catch {}
}
watch(() => draftForm.value, (val) => {
  if (val.reviewId) {
    try { localStorage.setItem(draftKey(val.reviewId), JSON.stringify({ violationType: val.violationType, payload: val.payload })); } catch {}
  }
}, { deep: true });

async function onDraft() {
  if (!draftForm.value.reviewId) {
    ElMessage.warning('请输入 reviewId');
    return;
  }
  const created = await ap.draft({ ...draftForm.value });
  if (created) {
    try { localStorage.removeItem(draftKey(draftForm.value.reviewId)); } catch {}
    draftDialog.value = false;
    bus.pushLocal({ severity: 'P2', sourceModule: 'M4B', title: `申诉草稿已生成`, body: `Review ${draftForm.value.reviewId}` });
  }
}

async function submit(a) {
  if (!canAppealTransition(a.status, 'submitted')) {
    ElMessage.warning(`非法状态跳转：${a.status} → submitted`);
    return;
  }
  const updated = await ap.submit(a.id);
  if (updated) {
    bus.pushLocal({ severity: 'P1', sourceModule: 'M4B', title: `申诉已提交`, body: `Case ${updated.amazonCaseId || updated.amazon_case_id}` });
  }
}
async function reviewAppeal(a, outcome) {
  await ap.review(a.id, { outcome });
}
async function retry(a) {
  if (a.status !== 'rejected') {
    ElMessage.warning('仅 rejected 可重提');
    return;
  }
  const created = await ap.retry(a.id, {});
  if (created) bus.pushLocal({ severity: 'P2', sourceModule: 'M4B', title: '已创建重提草稿', body: created.id });
}

function viewDetail(a) {
  current.value = a;
  detailDrawer.value = true;
}
function allowed(a) {
  return allowedAppealActions(a.status);
}

const mobileCols = [
  { prop: 'reviewId', label: 'Review' },
  { prop: 'sku', label: 'SKU' },
  { prop: 'author', label: '评论作者' },
  { prop: 'status', label: '状态' },
];
</script>

<template>
  <div>
    <PageHeader title="申诉中心" subtitle="可申诉评论 · AI 起草文案 · 提交亚马逊 · 状态机驱动（draft → submitted → reviewed → accepted/rejected → retry）">
      <template #extra>
        <el-button type="primary" :icon="'Plus'" @click="draftDialog = true">起草申诉</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="待申诉（草稿）" :value="summary.draft || 0" status="warning" icon="Edit" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="已提交" :value="summary.submitted || 0" hint="等待亚马逊处理" status="info" icon="Promotion" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="已接受" :value="summary.accepted || 0" status="success" icon="CircleCheck" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="申诉成功率" :value="`${Math.round((summary.successRate || 0) * 100)}%`" hint="历史" :status="(summary.successRate || 0) >= 0.3 ? 'success' : 'warning'" icon="DataAnalysis" /></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <el-tabs v-model="tab">
          <el-tab-pane label="全部" name="all" />
          <el-tab-pane label="草稿" name="draft" />
          <el-tab-pane label="已提交" name="submitted" />
          <el-tab-pane label="审核中" name="under_review" />
          <el-tab-pane label="已接受" name="accepted" />
          <el-tab-pane label="已拒绝" name="rejected" />
        </el-tabs>
      </template>

      <EmptyState v-if="!ap.loading.value && filtered.length === 0" title="暂无申诉" :description="`tab=${tab}`" icon="Document" />
      <ResponsiveTable v-else :data="filtered" :mobile-columns="mobileCols" row-clickable stripe @row-click="viewDetail">
        <el-table-column prop="reviewId" label="Review ID" width="120">
          <template #default="{ row }">{{ row.reviewId || row.review_id || '-' }}</template>
        </el-table-column>
        <el-table-column prop="sku" label="SKU" width="110" />
        <el-table-column label="评论摘要" min-width="240">
          <template #default="{ row }">
            <div><strong>{{ row.author || '-' }}</strong> · ★ {{ row.rating || '-' }}</div>
            <div class="text-muted" style="font-size: 12px">"{{ (row.body || '').slice(0, 60) }}"</div>
          </template>
        </el-table-column>
        <el-table-column label="违规类型" width="150">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ violationLabel(row.violationType || row.violation_type) }}</el-tag>
            <div class="text-muted" style="font-size: 11px; margin-top: 2px">置信 {{ Math.round((row.confidence || 0) * 100) }}%</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="Case ID" width="140">
          <template #default="{ row }"><span class="tnum text-muted" style="font-size: 12px">{{ row.amazonCaseId || row.amazon_case_id || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button v-if="allowed(row).includes('submitted')" size="small" type="primary" plain @click.stop="submit(row)">提交</el-button>
            <el-button v-if="allowed(row).includes('accepted')" size="small" type="success" plain @click.stop="reviewAppeal(row, 'accepted')">通过</el-button>
            <el-button v-if="allowed(row).includes('rejected')" size="small" type="danger" plain @click.stop="reviewAppeal(row, 'rejected')">驳回</el-button>
            <el-button v-if="row.status === 'rejected'" size="small" type="warning" plain @click.stop="retry(row)">重提</el-button>
            <el-button size="small" link @click.stop="viewDetail(row)">详情</el-button>
          </template>
        </el-table-column>

        <template #mobile-status="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
        <template #mobile-actions="{ row }">
          <el-button v-if="allowed(row).includes('submitted')" size="small" type="primary" plain @click.stop="submit(row)">提交</el-button>
          <el-button v-if="allowed(row).includes('accepted')" size="small" type="success" plain @click.stop="reviewAppeal(row, 'accepted')">通过</el-button>
          <el-button v-if="allowed(row).includes('rejected')" size="small" type="danger" plain @click.stop="reviewAppeal(row, 'rejected')">驳回</el-button>
          <el-button v-if="row.status === 'rejected'" size="small" type="warning" plain @click.stop="retry(row)">重提</el-button>
          <el-button size="small" link @click.stop="viewDetail(row)">详情</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <!-- 起草申诉对话框（草稿自动 localStorage 持久化） -->
    <ResponsiveDialog v-model="draftDialog" title="起草申诉" width="640px">
      <MobileFallback v-if="isMobile" page-name="申诉草稿编辑" reason="编辑多字段表单建议在桌面端使用以获得最佳体验。">
        <template #readonly>
          <el-form label-position="top">
            <el-form-item label="Review ID">
              <el-input v-model="draftForm.reviewId" placeholder="rev-xxx" />
            </el-form-item>
            <el-form-item label="违规类型">
              <el-select v-model="draftForm.violationType" style="width: 100%">
                <el-option label="与产品无关" value="unrelated_to_product" />
                <el-option label="利益冲突" value="conflict_of_interest" />
                <el-option label="物流问题（非产品）" value="logistics_unrelated" />
                <el-option label="重复评论" value="duplicate" />
                <el-option label="不当语言" value="hateful" />
                <el-option label="跟卖假货" value="hijacking_counterfeit" />
              </el-select>
            </el-form-item>
            <el-form-item label="文案（草稿自动保存）">
              <el-input v-model="draftForm.payload.body" type="textarea" :rows="5" placeholder="AI 草稿文案" />
            </el-form-item>
          </el-form>
        </template>
      </MobileFallback>
      <el-form v-else label-width="100px">
        <el-form-item label="Review ID">
          <el-input v-model="draftForm.reviewId" placeholder="rev-xxx" />
        </el-form-item>
        <el-form-item label="违规类型">
          <el-select v-model="draftForm.violationType" style="width: 100%">
            <el-option label="与产品无关" value="unrelated_to_product" />
            <el-option label="利益冲突" value="conflict_of_interest" />
            <el-option label="物流问题（非产品）" value="logistics_unrelated" />
            <el-option label="重复评论" value="duplicate" />
            <el-option label="不当语言" value="hateful" />
            <el-option label="跟卖假货" value="hijacking_counterfeit" />
          </el-select>
        </el-form-item>
        <el-form-item label="文案">
          <el-input v-model="draftForm.payload.body" type="textarea" :rows="6" placeholder="AI 草稿文案（自动保存到 localStorage）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="draftDialog = false">关闭（草稿已保存）</el-button>
        <el-button type="primary" @click="onDraft">生成草稿入库</el-button>
      </template>
    </ResponsiveDialog>

    <!-- 详情抽屉 - 显式渲染状态机 -->
    <ResponsiveDrawer v-model="detailDrawer" :title="current ? `Appeal · ${current.id}` : ''" size="500px">
      <div v-if="current">
        <h3>{{ statusLabel(current.status) }}</h3>
        <el-steps :active="['draft', 'submitted', 'under_review', 'accepted'].indexOf(current.status) + 1" simple>
          <el-step title="草稿" />
          <el-step title="已提交" />
          <el-step title="审核中" />
          <el-step :title="current.status === 'rejected' ? '已拒绝' : '已接受'" :status="current.status === 'rejected' ? 'error' : (current.status === 'accepted' ? 'success' : 'wait')" />
        </el-steps>

        <h4 class="block-label">允许动作</h4>
        <div>
          <el-tag v-for="act in allowed(current)" :key="act" size="small" effect="plain" style="margin-right: 4px">{{ act }}</el-tag>
          <el-tag v-if="allowed(current).length === 0" size="small" type="info">终态</el-tag>
        </div>

        <h4 class="block-label">详情</h4>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="Review">{{ current.reviewId || current.review_id }}</el-descriptions-item>
          <el-descriptions-item label="违规">{{ violationLabel(current.violationType || current.violation_type) }}</el-descriptions-item>
          <el-descriptions-item label="Amazon Case">{{ current.amazonCaseId || current.amazon_case_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ current.submittedAt || current.submitted_at || '-' }}</el-descriptions-item>
          <el-descriptions-item label="重提次数">{{ current.retryCount || current.retry_count || 0 }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="block-label">起草文案</h4>
        <p class="block-text">{{ current.draftContent || current.draft_content || '-' }}</p>
      </div>
    </ResponsiveDrawer>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 0; }
.kpi-row :deep(.el-col) { margin-bottom: 16px; }
.mt-16 { margin-top: 16px; }
.block-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin: 16px 0 6px; }
.block-text { margin: 0; font-size: 13px; line-height: 1.7; padding: 8px 12px; background: #f9fafb; border-radius: 4px; }
</style>
