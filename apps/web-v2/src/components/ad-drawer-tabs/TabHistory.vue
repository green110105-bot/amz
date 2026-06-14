<script setup>
// 溯源（日志） — 操作历史。Campaign 时用 MCompare 内嵌；其他时是独立 drawer。
// 此组件做内嵌版；独立 drawer 版可复用此组件。
// 真实操作日志从 audit_logs endpoint 拉，按 entity.id 过滤。失败 fallback 到 mock。
import { computed, ref, watchEffect } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeApi } from '../../api/store';
import { generateMockHistory } from './_mock-data.js';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });

const allRows = ref([]);
const filterType = ref('all');
const loading = ref(false);

async function load() {
  if (!props.entity?.id) return;
  loading.value = true;
  try {
    const logs = await storeApi.listAuditLogs();
    // Filter to current entity (resource_id match) + most recent first
    const filtered = (logs || [])
      .filter((l) => l.resourceId === props.entity.id || l.resource_id === props.entity.id)
      .sort((a, b) => (b.executedAt || b.executed_at || '').localeCompare(a.executedAt || a.executed_at || ''))
      .map((l) => normalizeLogRow(l));
    if (filtered.length > 0) {
      allRows.value = filtered;
    } else {
      // No real history for this entity → mock for visual demo
      allRows.value = generateMockHistory(props.entity);
    }
  } catch (e) {
    // API unavailable / 401 etc → fall back to mock
    allRows.value = generateMockHistory(props.entity);
  } finally {
    loading.value = false;
  }
}

function normalizeLogRow(l) {
  return {
    id: l.id,
    ts: l.executedAt || l.executed_at,
    operator: l.operator || (l.sourceModule === 'AUTO_RULE' ? '自动规则' : '操作员'),
    actionType: simplifyActionType(l.actionType || l.action_type),
    actionTypeRaw: l.actionType || l.action_type,
    before: l.before || (l.payload?.before ? JSON.stringify(l.payload.before).slice(0, 40) : '—'),
    after: l.after || (l.payload?.after ? JSON.stringify(l.payload.after).slice(0, 40) : '—'),
    status: l.status === 'success' || l.status === 'ok' ? 'ok' : 'failed',
    source: l.source || '手动',
    reverted: !!(l.reverted),
    isReal: true,
  };
}

function simplifyActionType(raw) {
  if (!raw) return 'other';
  const r = raw.toUpperCase();
  if (/BID/.test(r)) return 'bid_update';
  if (/BUDGET/.test(r)) return 'budget_update';
  if (/TOGGLE|PAUSE|ENABLE|STATE/.test(r)) return 'state_toggle';
  if (/CREATE/.test(r)) return 'create';
  if (/DELETE|REMOVE/.test(r)) return 'delete';
  if (/RULE|APPLY/.test(r)) return 'rule_apply';
  return 'other';
}

watchEffect(() => {
  if (!props.active || !props.entity?.id) return;
  load();
});

const filteredRows = computed(() => {
  if (filterType.value === 'all') return allRows.value;
  return allRows.value.filter((r) => r.actionType === filterType.value);
});

const ACTION_TYPE_LABELS = {
  all: '全部',
  bid_update: '调价',
  budget_update: '改预算',
  state_toggle: '启停',
  create: '创建',
  delete: '删除',
  rule_apply: '应用规则',
  other: '其他',
};

async function onRevert(row) {
  if (row.reverted) return;
  if (!row.isReal) {
    ElMessage.warning('演示数据无法撤销 — 等真实操作发生后再试');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确认撤销 ${ACTION_TYPE_LABELS[row.actionType] || row.actionType} 操作？此动作不可重复撤销。`,
      '撤销操作',
      { confirmButtonText: '撤销', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  try {
    // M4-P0-05: the backend honestly returns dispatchedInverse — whether the inverse
    // action was actually dispatched/applied. We MUST NOT mark the row reverted unless
    // the inverse truly happened. dispatchedInverse===false means the revert was recorded
    // but the real reversal did NOT take effect (e.g. real-write change-limit guard), so
    // we keep reverted=false, warn the user, and reload to reflect the true state.
    const res = await storeApi.revertAuditLog(row.id, '用户从 drawer 撤销');
    if (res?.dispatchedInverse === false) {
      ElMessage.warning('撤销未生效(动作未实际反转)');
    } else {
      ElMessage.success(`已撤销操作 ${row.id}`);
      row.reverted = true;
    }
    await load();
  } catch (e) {
    ElMessage.error(`撤销失败：${e.message || e}`);
  }
}
</script>

<template>
  <div class="tab-history">
    <div class="toolbar">
      <el-select v-model="filterType" size="small" style="width: 160px">
        <el-option v-for="(label, key) in ACTION_TYPE_LABELS" :key="key" :value="key" :label="label" />
      </el-select>
    </div>

    <el-table v-loading="loading" :data="filteredRows" stripe border size="small" max-height="380" empty-text="此实体暂无操作历史">
      <el-table-column prop="ts" label="操作时间" width="150">
        <template #default="{ row }">{{ row.ts.slice(0, 16).replace('T', ' ') }}</template>
      </el-table-column>
      <el-table-column prop="operator" label="操作人" width="100" />
      <el-table-column prop="actionType" label="操作类型" width="110">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ ACTION_TYPE_LABELS[row.actionType] || row.actionType }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="before" label="操作前" />
      <el-table-column prop="after" label="操作后" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'ok' ? 'success' : 'danger'">{{ row.status === 'ok' ? '成功' : '失败' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="100" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button v-if="row.status === 'ok' && !row.reverted" size="small" link type="primary" @click="onRevert(row)">撤销</el-button>
          <span v-else-if="row.reverted" style="font-size: 11px; color: var(--text-muted)">已撤销</span>
          <span v-else style="font-size: 11px; color: var(--text-muted)">—</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.tab-history { padding: 8px 0; }
.toolbar { margin-bottom: 12px; }
:deep(.el-table) { font-size: 12px; }
</style>
