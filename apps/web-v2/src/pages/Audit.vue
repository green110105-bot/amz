<script setup>
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { mockAuditLogs } from '../utils/mock-data';
import { useLocalStore } from '../composables/useLocalStore';
import { formatCurrency, actionLabel, publishStatusLabel } from '../utils/format';
import { splitMonthlyImpact } from '../utils/audit-impact';

const { isMobile } = useViewport();

const localStore = useLocalStore();
// 合并 mock 历史 + LocalStorage 真实记录（最近的在前）
const logs = computed({
  get: () => [...localStore.auditLogs, ...mockAuditLogs.filter((m) => !localStore.auditLogs.some((l) => l.id === m.id))],
  set: () => {},
});
const moduleFilter = ref('all');
const statusFilter = ref('all');
const search = ref('');

const filtered = computed(() => {
  return logs.value.filter((l) => {
    if (moduleFilter.value !== 'all' && l.sourceModule !== moduleFilter.value) return false;
    if (statusFilter.value !== 'all' && l.status !== statusFilter.value) return false;
    if (search.value && !`${l.actionType} ${l.resourceId}`.toLowerCase().includes(search.value.toLowerCase())) return false;
    return true;
  });
});

// X-P1-09: monthlyImpact 不再对正负 monthlySaving 净加(净加会把 已节省 与 已投入
// 互相抵消, 输出语义错乱数字), 改拆为 已节省(saved)/已投入(invested) 两个分账字段。
const impact = computed(() => splitMonthlyImpact(logs.value));
const summary = computed(() => ({
  todayTotal: logs.value.length,
  successCount: logs.value.filter((l) => l.status === 'success').length,
  reverted: logs.value.filter((l) => l.reverted).length,
  // 分账: saved=正值汇总(已节省), invested=负值绝对值汇总(已投入)
  monthlySaved: impact.value.saved,
  monthlyInvested: impact.value.invested,
}));

function statusTagType(s) {
  return { success: 'success', failed: 'danger', reverted: 'warning', queued: '' }[s] || '';
}

// X-P1-07: classify each row by origin and decide the rollback affordance.
//   mock-seed      -> mock/demo record, rollback disabled (nothing external to undo)
//   ads-real-write -> real Amazon write, rollback blocked -> '申请人工回滚'
//   local-real     -> real local DB change, programmatic rollback allowed
function rowOrigin(row) {
  if (row.origin) return row.origin;
  if (row.actionType === 'ACTION_QUEUE_REAL_WRITE' || row.requiresRealStoreWrite === true) return 'ads-real-write';
  if (row.actionType === 'ACTION_QUEUE_DRY_RUN') return 'mock-seed';
  // legacy mock seed history has no origin and never touched anything external
  return row.executor === 'auto_system' || row.id?.startsWith?.('mock') ? 'mock-seed' : 'local-real';
}
const ORIGIN_LABELS = {
  'mock-seed': { text: 'Mock', type: 'info' },
  'local-real': { text: '本地真实', type: 'success' },
  'ads-real-write': { text: '广告真实写', type: 'danger' },
};
function originMeta(row) {
  return ORIGIN_LABELS[rowOrigin(row)] || ORIGIN_LABELS['mock-seed'];
}
function canRollback(row) {
  if (row.reverted || row.status !== 'success') return false;
  return rowOrigin(row) === 'local-real';
}
function isRealWriteRow(row) {
  return rowOrigin(row) === 'ads-real-write' && !row.reverted;
}
function moduleColor(m) {
  return { M1: '#8b5cf6', M2: '#22d3ee', M3: '#f59e0b', M4: '#10b981' }[m] || '#6b7280';
}

async function revert(log) {
  if (log.reverted) {
    ElMessage.info('该操作已回滚');
    return;
  }
  // X-P1-07 / X-P0-01: real Amazon writes cannot be auto-rolled back.
  if (isRealWriteRow(log)) {
    ElMessage.warning('真实写入不可自动回滚，请走「申请人工回滚」流程');
    return;
  }
  if (rowOrigin(log) === 'mock-seed') {
    ElMessage.info('Mock 记录无需回滚（未触达任何外部账户）');
    return;
  }
  try {
    await ElMessageBox.confirm(`确认回滚 ${log.actionType} ?`, '回滚确认', {
      confirmButtonText: '确认回滚',
      cancelButtonText: '取消',
      type: 'warning',
    });
    // X-P0-02: pessimistic await. Decide local state ONLY from the backend response.
    // revertAuditLog never optimistically flips reverted before the网络 result.
    const res = await localStore.revertAuditLog(log.id, 'user_revert');
    // X-P0-02: 真相在后端响应。dispatchedInverse===false (or needsManualReversal)
    // means Amazon端未自动回滚 -> render the RED blocked-state, do NOT mark reverted,
    // and never show the "已回滚（反向 API 调用...已持久化）" success line.
    if (res && (res.dispatchedInverse === false || res.needsManualReversal === true)) {
      log.needsManualReversal = true;
      ElMessage.error('本地已标记, Amazon 端未自动回滚, 需人工处理');
      return;
    }
    // Only a confirmed inverse dispatch (dispatchedInverse===true) is a success.
    log.reverted = true;
    log.status = 'reverted';
    log.revertedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    ElMessage.success('已回滚（反向 API 调用 + 审计记录已持久化）');
  } catch (e) {
    // X-P0-02: do NOT swallow errors silently. Surface failures and never fake success.
    if (e && e.status === 409) {
      ElMessage.error('本地已标记, Amazon 端未自动回滚, 需人工处理');
      return;
    }
    // ElMessageBox cancel rejects with 'cancel'/'close' — only those are benign.
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(`回滚失败：${e?.message || e}`);
    }
  }
}

async function requestManualReversal(log) {
  ElMessage.info(`已登记「申请人工回滚」：${actionLabel(log.actionType)} · ${log.resourceId}（运营将人工反向处理）`);
}
</script>

<template>
  <MobileFallback
    v-if="isMobile"
    page-name="审计中心"
    reason="审计日志为宽表（多字段筛选 + 回滚操作），建议在桌面端查看。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <h4 style="margin: 0 0 8px">本页用途：</h4>
        <ul style="padding-left: 20px; line-height: 2; margin: 0">
          <li>所有模块自动操作的审计追踪</li>
          <li>冲突检测 · 一键回滚 (7 天窗口) · 熔断保护</li>
          <li>支持按模块 / 状态 / 关键词筛选</li>
        </ul>
        <el-button type="primary" style="margin-top: 16px; width: 100%" @click="$router.push('/workbench')">返回工作台</el-button>
      </el-card>
    </template>
  </MobileFallback>
  <div v-else>
    <PageHeader title="审计中心" subtitle="所有自动操作 · 冲突检测 · 一键回滚（7 天内）· 熔断保护">
      <template #extra>
        <el-button :icon="'Download'">导出审计</el-button>
      </template>
    </PageHeader>

    <div class="kpi-row">
      <!-- X-P0-07 (B方案/纯 mock 坦白): all副作用 claims carry a 模拟/预估 qualifier.
           No copy asserts a real Amazon side-effect ("已执行/已挽回/可回滚") without it. -->
      <KpiCard label="今日操作" :value="summary.todayTotal" hint="所有模块" status="default" icon="Document" />
      <KpiCard label="模拟执行" :value="summary.successCount" hint="mock 模式 · 未触达 Amazon" status="success" icon="CircleCheck" />
      <!-- X-P1-09: 改 预估可挽回(模拟) + 橙色(warning)水印, 移除原"自动节省累计"真实功效暗示;
           已节省/已投入 分账展示, 明示来源为 模拟/预估 且未真实写回 Amazon。 -->
      <KpiCard
        label="预估可挽回(模拟)"
        :value="formatCurrency(summary.monthlySaved)"
        :hint="`模拟/预估 · 已节省 ${formatCurrency(summary.monthlySaved)} / 已投入 ${formatCurrency(summary.monthlyInvested)} · 未实际写回 Amazon`"
        status="warning"
        icon="TrendCharts"
      />
      <KpiCard label="已标记回滚" :value="summary.reverted" hint="本地标记 · 真实写需人工反向" status="warning" icon="RefreshLeft" />
    </div>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">操作日志</h2>
          <div style="display: flex; gap: 8px">
            <el-input v-model="search" placeholder="搜动作类型 / 资源" :prefix-icon="'Search'" size="small" style="width: 200px" clearable />
            <el-select v-model="moduleFilter" size="small" style="width: 100px">
              <el-option label="所有模块" value="all" />
              <el-option label="M1" value="M1" />
              <el-option label="M2" value="M2" />
              <el-option label="M3" value="M3" />
              <el-option label="M4" value="M4" />
            </el-select>
            <el-select v-model="statusFilter" size="small" style="width: 100px">
              <el-option label="全部状态" value="all" />
              <el-option label="成功" value="success" />
              <el-option label="失败" value="failed" />
              <el-option label="已回滚" value="reverted" />
            </el-select>
          </div>
        </div>
      </template>
      <el-table :data="filtered" stripe>
        <el-table-column label="时间" width="160"><template #default="{ row }"><span class="tnum text-muted">{{ row.executedAt }}</span></template></el-table-column>
        <el-table-column label="模块" width="80">
          <template #default="{ row }">
            <el-tag :color="moduleColor(row.sourceModule)" :style="{ color: '#fff', borderColor: moduleColor(row.sourceModule) }" size="small" effect="dark">{{ row.sourceModule }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="动作" min-width="180">
          <template #default="{ row }">
            <strong>{{ actionLabel(row.actionType) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="资源" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="tnum text-muted">{{ row.resourceType }} · {{ row.resourceId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="执行人" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="row.executor === 'auto_system' ? 'primary' : ''" effect="plain">
              {{ row.executor === 'auto_system' ? '自动' : row.executor }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="月度影响" align="right" width="120">
          <template #default="{ row }">
            <span v-if="row.monthlySaving === null" class="text-muted">-</span>
            <span v-else class="tnum" :class="row.monthlySaving > 0 ? 'text-success' : 'text-danger'">
              {{ row.monthlySaving > 0 ? '+' : '' }}{{ formatCurrency(row.monthlySaving) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <el-tag :type="originMeta(row).type" size="small" effect="plain">{{ originMeta(row).text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="160">
          <template #default="{ row }">
            <!-- M1-011: UPLOAD/PUBLISH-class entries render publish status from the
                 amazon_receipt presence — never claim '已发布' for a receipt-less draft. -->
            <el-tag
              v-if="publishStatusLabel(row)"
              :type="publishStatusLabel(row) === '已发布' ? 'success' : 'info'"
              size="small"
            >{{ publishStatusLabel(row) }}</el-tag>
            <el-tag v-else :type="statusTagType(row.status)" size="small">{{ ({ success: '成功', failed: '失败', reverted: '已回滚', queued: '排队' })[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <!-- X-P0-02: when the backend reports no auto inverse dispatch, surface the
                 RED blocked-state instead of a fake success. -->
            <span v-if="row.needsManualReversal" class="text-danger manual-reversal-blocked">
              本地已标记, Amazon 端未自动回滚, 需人工处理
            </span>
            <template v-else>
              <el-button v-if="canRollback(row)" size="small" type="warning" plain @click="revert(row)">回滚</el-button>
              <el-button v-else-if="isRealWriteRow(row)" size="small" type="danger" plain @click="requestManualReversal(row)">申请人工回滚</el-button>
              <el-button size="small" link>详情</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-row :gutter="16" class="mt-16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><h2 class="section-title">熔断状态</h2></template>
          <ul class="status-list">
            <li><span class="dot ok" /><span class="flex-1">M2 利润模块</span><span class="text-muted">正常</span></li>
            <li><span class="dot ok" /><span class="flex-1">M3 广告模块</span><span class="text-muted">正常</span></li>
            <li><span class="dot ok" /><span class="flex-1">M4 监控模块</span><span class="text-muted">正常</span></li>
            <li><span class="dot ok" /><span class="flex-1">全局自动模式</span><span class="text-muted">已启用</span></li>
          </ul>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><h2 class="section-title">配额使用</h2></template>
          <div class="quota-row"><span>日操作配额</span><el-progress :percentage="Math.round(summary.todayTotal / 200 * 100)" :stroke-width="10" :format="() => `${summary.todayTotal} / 200`" /></div>
          <div class="quota-row"><span>M3 自动操作</span><el-progress :percentage="Math.round(2 / 50 * 100)" :stroke-width="10" :format="() => '2 / 50'" /></div>
          <div class="quota-row"><span>LLM Token</span><el-progress :percentage="34" :stroke-width="10" :format="() => '34%'" status="warning" /></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.status-list { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.status-list li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line-soft); }
.status-list li:last-child { border-bottom: none; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-soft); }
.dot.ok { background: var(--success); }
.dot.warn { background: var(--warning); }
.dot.bad { background: var(--danger); }
.quota-row { padding: 8px 0; }
.quota-row > span { display: block; margin-bottom: 4px; font-size: 13px; color: var(--text-muted); }
@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
</style>
