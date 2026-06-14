<script setup>
// Hijacking — 跟卖处置（Test Buy + 联动 M3 暂停广告显示）
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { formatCurrency } from '../utils/format';
import { useHijacking } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';
import { hijackingApi } from '../api/m4';

const route = useRoute();
const router = useRouter();
const hj = useHijacking();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

const statusFilter = ref(route.query.status || 'all');
const typeFilter = ref(route.query.type || 'all');
const dialog = ref(false);
const current = ref(null);

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
  await hj.fetch(params, true);
}
onMounted(load);

const list = computed(() => hj.list.value || []);

function statusType(s) {
  return { pending_test_buy: 'warning', test_buy_in_transit: 'info', test_buy_received: 'primary', appeal_drafted: '', appeal_submitted: 'primary', appeal_accepted: 'success', genuine: '', closed: 'info' }[s] || '';
}
function statusLabel(s) {
  return { pending_test_buy: '待 Test Buy', test_buy_in_transit: 'Test Buy 在途', test_buy_received: '已收货', appeal_drafted: '已起草申诉', appeal_submitted: '人工申诉已提交', appeal_accepted: '申诉成功', genuine: '已确认正品', closed: '已关闭' }[s] || s;
}
function typeLabel(t) {
  return { price_competition: '价格竞争', counterfeit_suspect: '疑似假货', counterfeit_confirmed: '已确认假货', genuine_authorized: '正品授权' }[t] || t;
}

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pausedCampaignIds(row) {
  return parseMaybeJsonArray(row.m3PausedCampaignIds ?? row.m3_paused_campaign_ids);
}

function pausedCampaignIdsText(row) {
  const ids = pausedCampaignIds(row);
  return ids.length ? ids.join(', ') : '无活动被暂停或后端未返回 campaign id';
}

function m3DedupKey(row) {
  return row.m3PauseDedupKey || row.m3_pause_dedup_key || '未返回联动编号';
}

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function estimateResumeAt(row) {
  const key = m3DedupKey(row);
  const keyDate = key.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];
  const base = keyDate ? new Date(`${keyDate}T00:00:00`) : new Date(row.testBuyReceivedAt || row.updatedAt || row.createdAt || '');
  if (!Number.isNaN(base.getTime())) {
    base.setHours(base.getHours() + 24);
    return `${formatDateTime(base)} 后，或人工关闭/审计回滚时`;
  }
  return '需人工关闭跟卖、误伤恢复或在审计中心回滚';
}

function m3LinkVisible(row) {
  return !!(row.m3AdsPaused || row.m3_ads_paused || row.m3PauseDedupKey || row.m3_pause_dedup_key || pausedCampaignIds(row).length);
}

function recoveryOverrideNote(row) {
  if (row.m3AdsPaused || row.m3_ads_paused) {
    return '误伤恢复/覆盖：可在审计中心回滚联动，或确认跟卖关闭后恢复；人工覆盖会保留审计记录。';
  }
  if (row.type === 'counterfeit_confirmed') {
    return '误伤恢复/覆盖：本次可能被 24h 去重跳过，需核对同 ASIN 联动编号后人工处理。';
  }
  return '误伤恢复/覆盖：未触发 M3 暂停。';
}

function patchHijackingRow(item, updated) {
  if (!updated?.id) return;
  Object.assign(item, updated);
  const idx = hj.list.value.findIndex((r) => r.id === updated.id);
  if (idx >= 0) hj.list.value.splice(idx, 1, { ...hj.list.value[idx], ...updated });
}

async function scan() {
  await hj.scan({});
}

async function startTestBuy(item) {
  try {
    const { value } = await ElMessageBox.prompt(
      'Test Buy requires a manual Amazon order. The system only records the result and does not place orders; fill order id, submitter, submitted time and evidence attachment.',
      'Record Manual Test Buy',
      {
        type: 'info',
        inputType: 'textarea',
        inputValue: 'Order ID: \nSubmitted By: \nSubmitted At: \nEvidence Attachment: ',
        inputPlaceholder: 'Order ID, submitter, submitted time and evidence attachment are required',
        confirmButtonText: 'Record manual Test Buy',
        cancelButtonText: 'Cancel',
      },
    );
    const raw = String(value || '');
    const pick = (patterns) => {
      for (const pattern of patterns) {
        const m = raw.match(new RegExp(`${pattern.source}\\s*:\\s*([^\\n]+)`, 'i'));
        if (m?.[1]) return m[1].trim();
      }
      return '';
    };
    const payload = {
      manualOrderId: pick([/Order\s*ID/i, /manualOrderId/i]),
      submittedBy: pick([/Submitted\s*By/i, /submittedBy/i]),
      manualSubmittedAt: pick([/Submitted\s*At/i, /submittedAt/i, /manualSubmittedAt/i]),
      evidenceAttachment: pick([/Evidence\s*Attachment/i, /evidenceAttachment/i]),
    };
    if (!payload.manualOrderId || !payload.submittedBy || !payload.manualSubmittedAt || !payload.evidenceAttachment) {
      ElMessage.warning('Order ID, submitter, submitted time and evidence attachment are required; this only records a manual Test Buy.');
      return;
    }
    await hj.startTestBuy(item.id, payload);
  } catch (_) {/* cancel */}
}

async function uploadProof(item) {
  try {
    const { value: typeChoice } = await ElMessageBox.prompt('Test Buy 验证结果（counterfeit_confirmed / genuine_authorized）', '上传开箱照', { confirmButtonText: '提交', inputValue: 'counterfeit_confirmed' });
    if (!typeChoice) return;
    const updated = await hj.uploadProof(item.id, { proofImages: ['placeholder://proof.jpg'], type: typeChoice });
    if (typeChoice === 'counterfeit_confirmed') {
      bus.pushLocal({
        severity: 'P0',
        sourceModule: 'M4A',
        title: `跟卖确认假货 → 已记录 M3 暂停联动`,
        body: `ASIN ${item.asin} · paused campaign ids: ${pausedCampaignIdsText(updated)} · 联动编号: ${m3DedupKey(updated)} · 预计恢复: ${estimateResumeAt(updated)}`,
        link: '/monitor/hijacking',
      });
    }
  } catch (_) {/* cancel */}
}

// M4-P0-02: collect the four manual-evidence fields
// (amazonCaseId / submittedBy / manualSubmittedAt / evidenceAttachment) in a single
// dialog form. appealId is NEVER taken from user input — it is carried by row.appealId.
// Returns the collected form or null if cancelled / incomplete.
async function collectManualEvidence() {
  const { value } = await ElMessageBox.prompt(
    '本操作仅记录你已在 Amazon 人工提交申诉的结果，不会调用外部 Amazon/legal API。请逐行填写四项人工证据。',
    '记录人工申诉提交',
    {
      type: 'info',
      inputType: 'textarea',
      inputValue: 'Amazon Case ID: \nSubmitted By: \nSubmitted At: \nEvidence Attachment: ',
      inputPlaceholder: 'Amazon Case ID / 提交人 / 提交时间 / 证据附件 四项均必填',
      confirmButtonText: '记录人工提交',
      cancelButtonText: '取消',
    },
  );
  const raw = String(value || '');
  const pick = (patterns) => {
    for (const pattern of patterns) {
      const m = raw.match(new RegExp(`${pattern.source}\\s*:\\s*([^\\n]+)`, 'i'));
      if (m?.[1]) return m[1].trim();
    }
    return '';
  };
  const form = {
    amazonCaseId: pick([/Amazon\s*Case\s*ID/i, /Case\s*ID/i, /amazonCaseId/i]),
    submittedBy: pick([/Submitted\s*By/i, /submittedBy/i]),
    manualSubmittedAt: pick([/Submitted\s*At/i, /submittedAt/i, /manualSubmittedAt/i]),
    evidenceAttachment: pick([/Evidence\s*Attachment/i, /evidenceAttachment/i]),
  };
  const missing = [];
  if (!form.amazonCaseId) missing.push('amazonCaseId');
  if (!form.submittedBy) missing.push('submittedBy');
  if (!form.manualSubmittedAt) missing.push('manualSubmittedAt');
  if (!form.evidenceAttachment) missing.push('evidenceAttachment');
  return { form, missing };
}

async function recordAppealSubmission(item) {
  // M4-P0-02: the server uses its own draft appeal_id (carried by row.appealId, never a
  // user-typed value) and requires four manual-evidence fields. Submission only marks the
  // server-side draft as 人工提交; it does NOT call any external Amazon/legal API.
  let collected;
  try {
    collected = await collectManualEvidence();
  } catch (_) {
    return; // cancelled
  }
  const { form, missing } = collected;
  if (missing.length) {
    // (c) per-field validation — do NOT call the API, list each missing field.
    ElMessage.warning(`以下字段必填，未记录人工申诉：${missing.join('、')}`);
    return;
  }
  try {
    const updated = await hijackingApi.submitAppeal(item.id, {
      // (d) appealId carried by the row, never user input.
      appealId: item.appealId ?? item.appeal_id,
      amazonCaseId: form.amazonCaseId,
      submittedBy: form.submittedBy,
      manualSubmittedAt: form.manualSubmittedAt,
      evidenceAttachment: form.evidenceAttachment,
    });
    patchHijackingRow(item, updated);
    // Success toast only when the backend confirms the manual submission landed.
    const newStatus = updated?.status ?? updated?.hijacking?.status;
    const appealStatus = updated?.appeal?.status ?? updated?.appealStatus;
    if (newStatus === 'appeal_submitted' || appealStatus === 'submitted') {
      ElMessage.success('已记录人工申诉提交（未调用外部 Amazon/legal API）');
    } else {
      ElMessage.warning('已发送，但后端未确认进入 appeal_submitted 状态，请刷新核对。');
    }
  } catch (_) {/* error already surfaced by api layer */}
}
async function close(item) {
  await hj.close(item.id, { outcome: 'resolved' });
}

function viewDetail(item) {
  current.value = item;
  dialog.value = true;
}

const mobileCols = [
  { prop: 'asin', label: 'ASIN' },
  { prop: 'hijackerSeller', label: '跟卖者' },
  { prop: 'hijackerPrice', label: '跟卖价', formatter: (v) => formatCurrency(v, 'USD') },
  { prop: 'ourPrice', label: '我方价', formatter: (v) => formatCurrency(v, 'USD') },
  { prop: 'status', label: '状态' },
];
</script>

<template>
  <div>
    <PageHeader title="跟卖处置" subtitle="检测 → Test Buy 指导 → 验货 → 申诉（系统不代下单）">
      <template #extra>
        <div class="toolbar">
          <el-select v-model="statusFilter" size="default" class="tb-select">
            <el-option label="全部状态" value="all" />
            <el-option label="待 Test Buy" value="pending_test_buy" />
            <el-option label="在途" value="test_buy_in_transit" />
            <el-option label="已收货" value="test_buy_received" />
            <el-option label="人工申诉已提交" value="appeal_submitted" />
            <el-option label="申诉成功" value="appeal_accepted" />
            <el-option label="已关闭" value="closed" />
          </el-select>
          <el-button :icon="'Refresh'" @click="scan" :loading="hj.loading.value">扫描跟卖</el-button>
        </div>
      </template>
    </PageHeader>

    <el-alert type="warning" show-icon :closable="false">
      <template #title>系统不代用户下单</template>
      <template #default>
        Test Buy 涉及买家账户授权 + 资金 + 物流。本系统<strong>仅提供指导和文案起草</strong>，下单由你自主完成。M3 暂停广告为内部联动记录；未取得真实 Ads/API 授权前，不代表已调用外部 Amazon Ads 写入。
      </template>
    </el-alert>

    <el-card shadow="never" class="mt-16" v-loading="hj.loading.value">
      <EmptyState v-if="!hj.loading.value && list.length === 0" title="暂无跟卖" description="未检测到跟卖事件" icon="CircleCheck" />
      <ResponsiveTable v-else :data="list" :mobile-columns="mobileCols" stripe>
        <el-table-column label="ASIN" width="120"><template #default="{ row }"><span class="tnum">{{ row.asin }}</span></template></el-table-column>
        <el-table-column prop="sku" label="SKU" width="100" />
        <el-table-column label="跟卖者" width="160"><template #default="{ row }"><strong>{{ row.hijackerSeller || row.hijacker_seller }}</strong></template></el-table-column>
        <el-table-column label="跟卖价" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.hijackerPrice || row.hijacker_price, 'USD') }}</span></template></el-table-column>
        <el-table-column label="我方价" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.ourPrice || row.our_price, 'USD') }}</span></template></el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }"><el-tag size="small" :type="row.type === 'counterfeit_confirmed' ? 'danger' : row.type?.includes('counterfeit') ? 'warning' : ''">{{ typeLabel(row.type) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="持续时长" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ Math.round((row.durationMin || row.duration_min || 0) / 60) }} h</span></template></el-table-column>
        <el-table-column label="损失/小时" align="right" width="100"><template #default="{ row }"><span class="tnum text-danger">{{ formatCurrency(row.estimatedLossPerHour || row.estimated_loss_per_hour) }}</span></template></el-table-column>
        <el-table-column label="M3 暂停证据" min-width="320">
          <template #default="{ row }">
            <div v-if="m3LinkVisible(row)" class="m3-evidence">
              <el-tag size="small" :type="row.m3AdsPaused || row.m3_ads_paused ? 'warning' : 'info'">
                {{ row.m3AdsPaused || row.m3_ads_paused ? '已联动暂停' : '去重/未重复暂停' }}
              </el-tag>
              <div>paused campaign ids: {{ pausedCampaignIdsText(row) }}</div>
              <div>联动编号: {{ m3DedupKey(row) }}</div>
              <div>预计恢复: {{ estimateResumeAt(row) }}</div>
              <div class="text-muted">{{ recoveryOverrideNote(row) }}</div>
            </div>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending_test_buy'" size="small" type="primary" plain @click="startTestBuy(row)">Test Buy</el-button>
            <el-button v-else-if="row.status === 'test_buy_in_transit'" size="small" type="warning" plain @click="uploadProof(row)">上传开箱照</el-button>
            <el-button v-else-if="row.status === 'test_buy_received'" size="small" type="primary" plain @click="recordAppealSubmission(row)">记录人工申诉</el-button>
            <el-button v-else-if="row.status === 'appeal_accepted' || row.status === 'genuine'" size="small" plain @click="close(row)">关闭</el-button>
            <el-button v-else size="small" link @click="viewDetail(row)">详情</el-button>
          </template>
        </el-table-column>

        <template #mobile-status="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
        <template #mobile-actions="{ row }">
          <el-button v-if="row.status === 'pending_test_buy'" size="small" type="primary" plain @click="startTestBuy(row)">Test Buy</el-button>
          <el-button v-else-if="row.status === 'test_buy_in_transit'" size="small" type="warning" plain @click="uploadProof(row)">上传开箱照</el-button>
          <el-button v-else-if="row.status === 'test_buy_received'" size="small" type="primary" plain @click="recordAppealSubmission(row)">记录人工申诉</el-button>
          <el-button v-else-if="row.status === 'appeal_accepted' || row.status === 'genuine'" size="small" plain @click="close(row)">关闭</el-button>
          <el-button v-else size="small" link @click="viewDetail(row)">详情</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <ResponsiveDialog v-model="dialog" title="跟卖详情" width="600px">
      <div v-if="current">
        <h4>处置流程</h4>
        <el-steps :active="['pending_test_buy', 'test_buy_in_transit', 'test_buy_received', 'appeal_submitted', 'appeal_accepted', 'closed'].indexOf(current.status) + 1" finish-status="success" simple :direction="isMobile ? 'vertical' : 'horizontal'">
          <el-step title="Test Buy" />
          <el-step title="在途" />
          <el-step title="验货" />
          <el-step title="申诉" />
          <el-step title="处置完成" />
          <el-step title="关闭" />
        </el-steps>
        <div v-if="m3LinkVisible(current)" class="m3-detail">
          <h4>M3 暂停证据</h4>
          <p>paused campaign ids: {{ pausedCampaignIdsText(current) }}</p>
          <p>联动编号: {{ m3DedupKey(current) }}</p>
          <p>预计恢复: {{ estimateResumeAt(current) }}</p>
          <p>{{ recoveryOverrideNote(current) }}</p>
        </div>
      </div>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.mt-16 { margin-top: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tb-select { width: 130px; }
.m3-evidence { display: grid; gap: 4px; font-size: 12px; line-height: 1.45; }
.m3-detail { margin-top: 16px; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; background: var(--el-fill-color-light); }
.m3-detail p { margin: 6px 0; }
@media (max-width: 767px) {
  .toolbar { width: 100%; }
  .tb-select { width: 100%; }
}
</style>
