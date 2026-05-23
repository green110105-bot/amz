<script setup>
// RecoveryEmails — 挽回邮件中心
// 状态机：pending → draft → sent → replied → review_updated（next_round 可创建新轮）
// 草稿 localStorage 持久化：m4_draft_recovery_<reviewId>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { useRecovery, allowedRecoveryActions, canRecoveryTransition } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';

const route = useRoute();
const router = useRouter();
const re = useRecovery();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

const tab = ref(route.query.tab || 'all');
const draftDialog = ref(false);
const draftForm = ref({ reviewId: '', templateId: 't1', subject: '', body: '' });

watch(tab, (v) => {
  router.replace({ query: { ...route.query, tab: v === 'all' ? undefined : v } });
});

async function load() {
  await re.fetch({}, true);
}
onMounted(async () => {
  await load();
  if (route.query.reviewId) {
    draftForm.value.reviewId = String(route.query.reviewId);
    loadDraftLocal(draftForm.value.reviewId);
    draftDialog.value = true;
  }
});

const filtered = computed(() => {
  const list = re.list.value || [];
  if (tab.value === 'all') return list;
  return list.filter((e) => e.status === tab.value);
});
const summary = computed(() => {
  const list = re.list.value || [];
  return {
    pending: list.filter((e) => e.status === 'pending').length,
    sent: list.filter((e) => e.status === 'sent').length,
    draft: list.filter((e) => e.status === 'draft').length,
    reviewUpdated: list.filter((e) => e.reviewUpdated || e.review_updated || e.status === 'review_updated').length,
  };
});

function statusType(s) {
  return { pending: 'warning', draft: '', sent: 'success', replied: 'primary', review_updated: 'success', closed: 'info', failed: 'danger' }[s] || '';
}
function statusText(s) {
  return { pending: '待发送', draft: '草稿', sent: '已发送', replied: '已回复', review_updated: '评分更新', closed: '关闭', failed: '失败' }[s] || s;
}

// ---- 草稿 localStorage 持久化 ----
function draftKey(reviewId) { return `m4_draft_recovery_${reviewId}`; }
function loadDraftLocal(reviewId) {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(reviewId)) || 'null');
    if (saved) {
      draftForm.value.templateId = saved.templateId || 't1';
      draftForm.value.subject = saved.subject || '';
      draftForm.value.body = saved.body || '';
    }
  } catch {}
}
watch(() => draftForm.value, (val) => {
  if (val.reviewId) {
    try { localStorage.setItem(draftKey(val.reviewId), JSON.stringify({ templateId: val.templateId, subject: val.subject, body: val.body })); } catch {}
  }
}, { deep: true });

async function onDraft() {
  if (!draftForm.value.reviewId) {
    ElMessage.warning('请输入 reviewId');
    return;
  }
  const created = await re.draft({ ...draftForm.value });
  if (created) {
    try { localStorage.removeItem(draftKey(draftForm.value.reviewId)); } catch {}
    draftDialog.value = false;
    bus.pushLocal({ severity: 'P2', sourceModule: 'M4B', title: '挽回邮件草稿已生成', body: `Review ${draftForm.value.reviewId}` });
  }
}

async function send(e) {
  if (!canRecoveryTransition(e.status, 'sent')) {
    ElMessage.warning(`非法跳转：${e.status} → sent`);
    return;
  }
  const updated = await re.send(e.id);
  if (updated) bus.pushLocal({ severity: 'P2', sourceModule: 'M4B', title: '挽回邮件已发送', body: e.author || '' });
}

async function recordReply(e) {
  try {
    const { value: body } = await ElMessageBox.prompt('买家回复内容', '记录回复', { confirmButtonText: '保存' });
    if (!body) return;
    const { value: rating } = await ElMessageBox.prompt('如评分已更新，填入新评分（1-5），否则留空', '评分更新', { confirmButtonText: '保存' });
    await re.recordReply(e.id, { repliedBody: body, reviewUpdated: !!rating, newRating: rating ? Number(rating) : undefined });
  } catch (_) {/* cancel */}
}

async function nextRound(e) {
  const created = await re.nextRound(e.id, {});
  if (created) ElMessage.success(`已创建第 ${created.roundNo || created.round_no || '?'} 轮草稿`);
}

function allowed(e) { return allowedRecoveryActions(e.status); }
</script>

<template>
  <div>
    <PageHeader title="挽回邮件中心" subtitle="差评后挽回 · AI 起草模板 · 多轮跟进 · 状态机驱动">
      <template #extra><el-button :icon="'Plus'" type="primary" @click="draftDialog = true">新建挽回</el-button></template>
    </PageHeader>

    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="待挽回" :value="summary.pending" hint="新差评" status="warning" icon="Message" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="草稿" :value="summary.draft" hint="编辑中" status="default" icon="Edit" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="已发送" :value="summary.sent" hint="通过 Buyer-Seller Messaging" status="success" icon="Promotion" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="评分已更新" :value="summary.reviewUpdated" hint="挽回成功" status="success" icon="StarFilled" /></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <el-tabs v-model="tab">
          <el-tab-pane label="全部" name="all" />
          <el-tab-pane label="待发送" name="pending" />
          <el-tab-pane label="草稿" name="draft" />
          <el-tab-pane label="已发送" name="sent" />
          <el-tab-pane label="已回复" name="replied" />
          <el-tab-pane label="评分已更新" name="review_updated" />
        </el-tabs>
      </template>

      <EmptyState v-if="!re.loading.value && filtered.length === 0" title="暂无邮件" :description="`tab=${tab}`" icon="Message" />
      <div v-else v-for="e in filtered" :key="e.id" class="email-row">
        <div class="email-head">
          <strong>{{ e.author || '-' }}</strong>
          <span class="rating">★ {{ e.rating || '-' }}</span>
          <span class="text-muted">SKU {{ e.sku || '-' }}</span>
          <el-tag :type="statusType(e.status)" size="small">{{ statusText(e.status) }}</el-tag>
          <el-tag size="small" effect="plain">第 {{ e.roundNo || e.round_no || 1 }} 轮</el-tag>
          <el-tag v-if="e.reviewUpdated || e.review_updated" size="small" type="success">评分 → ★{{ e.newRating || e.new_rating }}</el-tag>
        </div>
        <p class="email-subject">{{ e.subject || '-' }}</p>
        <p class="email-preview">"{{ (e.preview || e.body || '').slice(0, 200) }}"</p>
        <div class="email-foot">
          <span class="text-muted">起草 {{ (e.draftedAt || e.drafted_at || '').slice(0, 16).replace('T', ' ') }}<span v-if="e.sentAt || e.sent_at"> · 发送 {{ (e.sentAt || e.sent_at || '').slice(0, 16).replace('T', ' ') }}</span></span>
          <div>
            <el-tag size="small" type="info" effect="plain" style="margin-right: 6px">允许动作：{{ allowed(e).join(' / ') || '终态' }}</el-tag>
            <el-button v-if="allowed(e).includes('sent')" size="small" type="primary" @click="send(e)">发送</el-button>
            <el-button v-if="allowed(e).includes('replied') || allowed(e).includes('review_updated')" size="small" plain @click="recordReply(e)">记录回复</el-button>
            <el-button v-if="allowed(e).includes('next_round')" size="small" plain @click="nextRound(e)">下一轮</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <ResponsiveDialog v-model="draftDialog" title="新建挽回邮件" width="640px">
      <el-form :label-width="isMobile ? '0' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="Review ID">
          <el-input v-model="draftForm.reviewId" placeholder="rev-xxx" />
        </el-form-item>
        <el-form-item label="模板">
          <el-select v-model="draftForm.templateId" style="width: 100%">
            <el-option label="模板 1 · 温和致歉" value="t1" />
            <el-option label="模板 2 · 补偿邀请" value="t2" />
            <el-option label="模板 3 · 主动跟进" value="t3" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="draftForm.subject" placeholder="自动保存到 localStorage" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="draftForm.body" type="textarea" :rows="6" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="draftDialog = false">关闭（草稿已保存）</el-button>
        <el-button type="primary" @click="onDraft">生成草稿</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 0; }
.kpi-row :deep(.el-col) { margin-bottom: 16px; }
.email-row { padding: 14px 0; border-bottom: 1px dashed var(--line-soft); }
.email-row:last-child { border-bottom: none; }
.email-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
.rating { color: #fbbf24; font-weight: 600; }
.email-subject { margin: 4px 0; font-size: 14px; font-weight: 500; }
.email-preview { margin: 4px 0; font-size: 13px; color: var(--text-muted); padding: 8px 12px; background: #f9fafb; border-left: 3px solid var(--text-muted); border-radius: 4px; }
.email-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; flex-wrap: wrap; gap: 8px; }
.mt-16 { margin-top: 16px; }
@media (max-width: 767px) {
  .email-head { gap: 6px 8px; }
  .email-foot { flex-direction: column; align-items: stretch; }
}
</style>
