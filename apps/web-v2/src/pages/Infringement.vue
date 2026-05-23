<script setup>
// Infringement — 侵权告警（legalDisclaimerAck 勾选 → draft → submit → resolve）
// 草稿 localStorage 持久化：m4_draft_infringement_<id>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { useInfringement } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';

const route = useRoute();
const router = useRouter();
const inf = useInfringement();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

const statusFilter = ref(route.query.status || 'all');
const typeFilter = ref(route.query.type || 'all');
const showDraft = ref(false);
const draftCurrent = ref(null);
const draftAck = ref(false);
const draftContent = ref('');

watch([statusFilter, typeFilter], ([s, t]) => {
  const q = {};
  if (s !== 'all') q.status = s;
  if (t !== 'all') q.type = t;
  router.replace({ query: q });
  load();
}, { deep: false });

async function load() {
  const params = {};
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  if (typeFilter.value !== 'all') params.type = typeFilter.value;
  await inf.fetch(params, true);
}
onMounted(load);

const list = computed(() => inf.list.value || []);

function typeTag(t) { return { trademark: 'danger', patent: 'warning', copyright: 'primary', counterfeit: 'danger' }[t] || ''; }
function typeLabel(t) { return { trademark: '商标', patent: '专利', copyright: '版权', counterfeit: '假货' }[t] || t; }
function statusType(s) { return { investigating: 'warning', pending_legal_review: '', draft: '', submitted: 'primary', accepted: 'success', rejected: 'danger', resolved: 'success', dismissed: 'info' }[s] || ''; }
function statusLabel(s) { return { investigating: '调查中', pending_legal_review: '待法律审核', draft: '草稿', submitted: '已提交', accepted: '已接受', rejected: '已拒绝', resolved: '已解决', dismissed: '已忽略' }[s] || s; }

// ---- 草稿 localStorage 持久化 ----
function draftKey(id) { return `m4_draft_infringement_${id}`; }
function loadDraft(id) {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null') || {}; } catch { return {}; }
}
function saveDraft(id, data) {
  try { localStorage.setItem(draftKey(id), JSON.stringify(data)); } catch {}
}
function clearDraft(id) {
  try { localStorage.removeItem(draftKey(id)); } catch {}
}

function openDraft(item) {
  draftCurrent.value = item;
  const saved = loadDraft(item.id);
  draftAck.value = saved.ack || false;
  draftContent.value = saved.content || item.draftContent || '';
  showDraft.value = true;
}

watch([draftAck, draftContent], () => {
  if (draftCurrent.value) {
    saveDraft(draftCurrent.value.id, { ack: draftAck.value, content: draftContent.value });
  }
});

async function submitDraft() {
  if (!draftAck.value) {
    ElMessage.warning('请先勾选法律免责声明');
    return;
  }
  const updated = await inf.draft(draftCurrent.value.id, { legalDisclaimerAck: true, draftContent: draftContent.value });
  clearDraft(draftCurrent.value.id);
  showDraft.value = false;
  bus.pushLocal({ severity: 'P1', sourceModule: 'M4A', title: `IP 投诉草稿已生成`, body: `${typeLabel(draftCurrent.value.type)} · ${draftCurrent.value.asin}`, link: '/infringement' });
}

async function submitToAmazon(item) {
  try {
    const { value } = await ElMessageBox.prompt('亚马逊投诉单号（如有）', '提交投诉', { confirmButtonText: '提交' });
    await inf.submit(item.id, { amazonComplaintId: value });
    bus.pushLocal({ severity: 'P1', sourceModule: 'M4A', title: '侵权投诉已提交', body: item.asin });
  } catch (_) {}
}
async function resolveItem(item) {
  try {
    const { value } = await ElMessageBox.prompt('结果（accepted/rejected/dismissed）', '结案', { confirmButtonText: '确认', inputValue: 'accepted' });
    await inf.resolve(item.id, { outcome: value });
  } catch (_) {}
}

const mobileCols = [
  { prop: 'id', label: '告警 ID' },
  { prop: 'asin', label: 'ASIN' },
  { prop: 'type', label: '类型' },
  { prop: 'severity', label: '严重度' },
  { prop: 'status', label: '状态' },
];
</script>

<template>
  <div>
    <PageHeader title="侵权告警" subtitle="商标 / 专利 / 版权 / 假货 · AI 起草 IP 投诉（草稿入库 + 状态机）">
      <template #extra>
        <div class="toolbar">
          <el-select v-model="typeFilter" size="default" class="tb-select tb-select-small">
            <el-option label="全部类型" value="all" />
            <el-option label="商标" value="trademark" />
            <el-option label="专利" value="patent" />
            <el-option label="版权" value="copyright" />
            <el-option label="假货" value="counterfeit" />
          </el-select>
          <el-select v-model="statusFilter" size="default" class="tb-select">
            <el-option label="全部状态" value="all" />
            <el-option label="调查中" value="investigating" />
            <el-option label="待法律审核" value="pending_legal_review" />
            <el-option label="草稿" value="draft" />
            <el-option label="已提交" value="submitted" />
            <el-option label="已解决" value="resolved" />
          </el-select>
        </div>
      </template>
    </PageHeader>

    <el-alert type="info" show-icon :closable="false">
      <template #title>法律免责</template>
      <template #default>
        本系统起草的文案<strong>不构成法律意见</strong>。涉及商标 / 专利的复杂案件建议咨询专业律师。
      </template>
    </el-alert>

    <el-card shadow="never" class="mt-16" v-loading="inf.loading.value">
      <EmptyState v-if="!inf.loading.value && list.length === 0" title="暂无侵权告警" description="未检测到侵权事件" icon="CircleCheck" />
      <ResponsiveTable v-else :data="list" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="id" label="告警 ID" width="120" />
        <el-table-column prop="asin" label="ASIN" width="120" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }"><el-tag :type="typeTag(row.type)" size="small">{{ typeLabel(row.type) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="reportedBy" label="报告方" width="160" />
        <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip />
        <el-table-column label="严重度" width="90">
          <template #default="{ row }">
            <el-tag :type="row.severity === 'high' ? 'danger' : row.severity === 'medium' ? 'warning' : ''" size="small">{{ row.severity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button v-if="['investigating', 'pending_legal_review'].includes(row.status)" size="small" type="primary" plain @click="openDraft(row)">起草投诉</el-button>
            <el-button v-else-if="row.status === 'draft'" size="small" type="primary" @click="submitToAmazon(row)">提交</el-button>
            <el-button v-else-if="row.status === 'submitted'" size="small" type="success" plain @click="resolveItem(row)">结案</el-button>
            <el-button v-else size="small" link>详情</el-button>
          </template>
        </el-table-column>

        <template #mobile-type="{ row }">
          <el-tag :type="typeTag(row.type)" size="small">{{ typeLabel(row.type) }}</el-tag>
        </template>
        <template #mobile-severity="{ row }">
          <el-tag :type="row.severity === 'high' ? 'danger' : row.severity === 'medium' ? 'warning' : ''" size="small">{{ row.severity }}</el-tag>
        </template>
        <template #mobile-status="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
        <template #mobile-actions="{ row }">
          <el-button v-if="['investigating', 'pending_legal_review'].includes(row.status)" size="small" type="primary" plain @click="openDraft(row)">起草投诉</el-button>
          <el-button v-else-if="row.status === 'draft'" size="small" type="primary" @click="submitToAmazon(row)">提交</el-button>
          <el-button v-else-if="row.status === 'submitted'" size="small" type="success" plain @click="resolveItem(row)">结案</el-button>
          <el-button v-else size="small" link>详情</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <ResponsiveDialog v-model="showDraft" :title="draftCurrent ? `起草 IP 投诉 · ${draftCurrent.id}` : ''" width="640px">
      <el-form :label-width="isMobile ? '0' : '100px'" :label-position="isMobile ? 'top' : 'right'" v-if="draftCurrent">
        <el-form-item label="类型">
          <el-tag :type="typeTag(draftCurrent.type)">{{ typeLabel(draftCurrent.type) }}</el-tag>
        </el-form-item>
        <el-form-item label="ASIN">{{ draftCurrent.asin }}</el-form-item>
        <el-form-item label="投诉文案">
          <el-input v-model="draftContent" type="textarea" :rows="isMobile ? 6 : 8" placeholder="AI 起草内容（可编辑，自动保存草稿到 localStorage）" />
        </el-form-item>
        <el-form-item label="法律免责">
          <el-checkbox v-model="draftAck">我已知晓本系统的起草文案不构成法律意见，复杂案件需咨询律师</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDraft = false">关闭（草稿已保存）</el-button>
        <el-button type="primary" :disabled="!draftAck" @click="submitDraft">生成草稿到后端</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.mt-16 { margin-top: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tb-select { width: 130px; }
.tb-select-small { width: 110px; }
@media (max-width: 767px) {
  .toolbar { width: 100%; }
  .tb-select, .tb-select-small { width: 100%; }
}
</style>
