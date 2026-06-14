<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useInventoryLink } from '../composables/useM2State';

const { isMobile } = useViewport();
const mobileRuleCols = [
  { prop: 'range', label: '剩余天数' },
  { prop: 'action', label: '行动' },
  { prop: 'detail', label: '说明' },
];
const mobileEventCols = [
  { prop: 'sku', label: 'SKU' },
  { prop: 'asin', label: 'ASIN' },
  { prop: 'daysLeft', label: '剩余天数', formatter: (v, row) => (row.daysLeft ?? row.days_left ?? 0) + ' 天' },
  { prop: 'action', label: '行动' },
  { prop: 'status', label: '状态' },
];

const route = useRoute();
const router = useRouter();
const il = useInventoryLink();

const statusFilter = ref(route.query.status || 'all');

const draftKey = 'm2:draft:inventory_link_thresholds';
const draft = ref({
  enabled: true,
  stopAt: 3,
  reduce50At: 7,
  reduce20At: 14,
  alertAt: 21,
});

function loadDraft() {
  try {
    const v = localStorage.getItem(draftKey);
    if (v) draft.value = { ...draft.value, ...JSON.parse(v) };
  } catch {}
}
function saveDraft() { try { localStorage.setItem(draftKey, JSON.stringify(draft.value)); } catch {} }
function clearDraft() { try { localStorage.removeItem(draftKey); } catch {} }

async function load() {
  const params = {};
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  await il.fetch(params);
  if (il.config.value) {
    const c = il.config.value;
    draft.value = {
      enabled: !!c.enabled,
      stopAt: c.stopAt ?? c.stop_at ?? 3,
      reduce50At: c.reduce50At ?? c.reduce_50_at ?? 7,
      reduce20At: c.reduce20At ?? c.reduce_20_at ?? 14,
      alertAt: c.alertAt ?? c.alert_at ?? 21,
    };
  }
}

watch(statusFilter, () => {
  router.replace({ query: { ...route.query, status: statusFilter.value === 'all' ? undefined : statusFilter.value } });
  load();
});

watch(draft, saveDraft, { deep: true });

onMounted(() => {
  loadDraft();
  load();
});

async function save() {
  try {
    await il.saveConfig({
      enabled: draft.value.enabled,
      thresholds: {
        stopAt: draft.value.stopAt,
        reduce50At: draft.value.reduce50At,
        reduce20At: draft.value.reduce20At,
        alertAt: draft.value.alertAt,
      },
    });
    clearDraft();
  } catch {}
}

// M2-P2-03: enabled 开关立即持久化（非仅乐观）
async function toggleEnabled(val) {
  draft.value.enabled = val;
  try {
    await il.saveConfig({ enabled: val });
  } catch {
    draft.value.enabled = !val; // 回滚
  }
}

async function executeEvent(ev) {
  // M2-P0-06: 诚实文案 — 入队待 M3 审核，不直接停广告
  try {
    await ElMessageBox.confirm(
      `确认对 ${ev.sku} 执行「${actionLabel(ev.action)}」？该操作会将广告动作入队（dryRun，待 M3 人工审核），不直接写入广告平台。`,
      '库存联动', { type: 'warning' });
  } catch { return; }
  try {
    await il.executeEvent(ev.id);
    await load();
  } catch {}
}

function statusType(s) {
  return { queued_pending_review: 'warning', auto_executed: 'success', monitoring: 'info', pending: 'warning', cancelled: 'info' }[s] || '';
}

function actionLabel(a) {
  return { stop_all: '必停所有广告', bid_reduce_50: '出价 -50%', bid_reduce_20: '出价 -20% + 触发 M2 紧急补货', alert_only: '仅预警，不动广告' }[a] || a;
}

const events = computed(() => il.events.value || []);
</script>

<template>
  <div>
    <PageHeader title="库存联动（断货保护）" subtitle="库存即将断货时自动降低/暂停广告，避免浪费">
      <template #extra>
        <el-switch :model-value="draft.enabled" active-text="联动启用" inactive-text="已禁用" @change="toggleEnabled" />
      </template>
    </PageHeader>

    <el-card shadow="never">
      <template #header><h2 class="section-title">4 档保护规则</h2></template>
      <ResponsiveTable :data="[
        { range: '< 3 天', action: 'stop_all', detail: '完全停广告（库存救不回，避免浪费）', color: '#dc2626' },
        { range: '3-7 天', action: 'bid_reduce_50', detail: '出价大幅下调（激进保护）', color: '#d97706' },
        { range: '7-14 天', action: 'bid_reduce_20', detail: '出价适度下调 + 自动通知 M2 触发紧急补货建议', color: '#2563eb' },
        { range: '14-21 天', action: 'alert_only', detail: '仅站内提醒，广告不动', color: '#059669' },
      ]" :mobile-columns="mobileRuleCols" stripe size="default">
        <el-table-column label="剩余库存天数" width="140">
          <template #default="{ row }">
            <el-tag :color="row.color" :style="{ color: '#fff', borderColor: row.color }" effect="dark">{{ row.range }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="自动行动" width="220">
          <template #default="{ row }"><strong>{{ actionLabel(row.action) }}</strong></template>
        </el-table-column>
        <el-table-column prop="detail" label="说明" />
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">当前受影响 SKU</h2>
          <div>
            <el-radio-group v-model="statusFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="pending">待处理</el-radio-button>
              <el-radio-button value="queued_pending_review">待审核</el-radio-button>
              <el-radio-button value="monitoring">监控中</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>
      <ResponsiveTable :data="events" :mobile-columns="mobileEventCols" v-loading="il.loading.value" stripe empty-text="暂无受影响 SKU">
        <el-table-column prop="sku" label="SKU" width="120" />
        <el-table-column prop="asin" label="ASIN" width="120"><template #default="{ row }"><span class="tnum text-muted">{{ row.asin }}</span></template></el-table-column>
        <el-table-column label="剩余天数" align="right" width="100">
          <template #default="{ row }">
            <span class="tnum" :class="(row.daysLeft || row.days_left) < 7 ? 'text-danger' : (row.daysLeft || row.days_left) < 14 ? 'text-warning' : ''">{{ row.daysLeft || row.days_left }} 天</span>
          </template>
        </el-table-column>
        <el-table-column label="自动行动" min-width="240">
          <template #default="{ row }"><strong>{{ actionLabel(row.action) }}</strong></template>
        </el-table-column>
        <el-table-column label="影响 Campaign" min-width="200">
          <template #default="{ row }">
            <el-tag v-for="(c, i) in (row.impactCampaigns || row.impact_campaigns || [])" :key="i" size="small" effect="plain" style="margin: 2px 4px 2px 0">{{ c }}</el-tag>
            <span v-if="!(row.impactCampaigns || row.impact_campaigns || []).length" class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ ({ queued_pending_review: '已入队待审', auto_executed: '已入队待审', monitoring: '监控中', pending: '待处理', cancelled: '已取消' })[row.status] || row.status }}</el-tag>
            <div v-if="row.status === 'queued_pending_review'" class="text-muted" style="font-size: 11px">动作已入 M3 审核队列（dryRun），尚未真实写广告平台</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" type="primary" link @click="executeEvent(row)">入队待审</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button v-if="row.status === 'pending'" size="small" type="primary" @click="executeEvent(row)">入队待审</el-button>
        </template>
      </ResponsiveTable>
      <EmptyState v-if="!il.loading.value && !events.length" title="无受影响 SKU" description="当前所有 SKU 库存充足" />
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">阈值配置</h2></template>
      <el-form :label-width="isMobile ? 'auto' : '200px'" :label-position="isMobile ? 'top' : 'left'">
        <el-form-item label="必停阈值（天）">
          <el-input-number v-model="draft.stopAt" :min="1" :max="14" />
          <span class="text-muted" style="margin-left: 12px; font-size: 12px">海运周期 35 天，3 天断货时已晚</span>
        </el-form-item>
        <el-form-item label="出价 -50% 阈值（天）">
          <el-input-number v-model="draft.reduce50At" :min="3" :max="21" />
        </el-form-item>
        <el-form-item label="出价 -20% 阈值（天）">
          <el-input-number v-model="draft.reduce20At" :min="7" :max="30" />
        </el-form-item>
        <el-form-item label="仅预警阈值（天）">
          <el-input-number v-model="draft.alertAt" :min="14" :max="60" />
          <span class="text-muted" style="margin-left: 12px; font-size: 12px">推荐 21 天 + 联动 M2 紧急补货</span>
        </el-form-item>
      </el-form>
      <el-button type="primary" @click="save">保存配置</el-button>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
