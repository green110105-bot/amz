<script setup>
// MonitorAnomalies — 22 类异常列表 + AI 根因 + 处置建议
// M4 真后端 · URL query 同步 · 分派 / 确认 / 升级 / 解决 / 忽略 操作
// T1 移动一等公民：ResponsiveTable + ResponsiveDrawer + KPI 响应式栅格
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDrawer from '../components/ResponsiveDrawer.vue';
import { useViewport } from '../composables/useViewport';
import { useAnomalies, allowedAnomalyActions } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';

const route = useRoute();
const router = useRouter();
const anom = useAnomalies();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

const sevFilter = ref(route.query.sev || 'all');
const statusFilter = ref(route.query.status || 'all');
const assigneeFilter = ref(route.query.assignee || '');

const detail = ref(null);
const drawer = ref(false);

watch([sevFilter, statusFilter, assigneeFilter], ([sev, st, asg]) => {
  const q = {};
  if (sev !== 'all') q.sev = sev;
  if (st !== 'all') q.status = st;
  if (asg) q.assignee = asg;
  router.replace({ query: q });
}, { deep: false });

async function load() {
  const params = {};
  if (sevFilter.value !== 'all') params.severity = sevFilter.value;
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  if (assigneeFilter.value) params.assignee = assigneeFilter.value;
  await anom.fetch(params, true);
}

onMounted(load);
watch([sevFilter, statusFilter, assigneeFilter], load);

const cards = computed(() => anom.list.value || []);
const summary = computed(() => anom.summary.value || {});

function sevType(s) { return { P0: 'danger', P1: 'warning', P2: 'info' }[s] || ''; }
function statusLabel(s) {
  return ({
    open: '未处理', assigned: '已分派', investigating: '调查中',
    resolving: '处置中', resolved: '已解决', dismissed: '已忽略',
    escalated: '已升级',
  })[s] || s;
}

async function onAssign(row) {
  try {
    const { value } = await ElMessageBox.prompt('分派给（输入用户名）', '分派异常', { confirmButtonText: '确认' });
    if (!value) return;
    await anom.assign(row.id, { assigneeUserId: value, assigneeLabel: value });
    bus.pushLocal({ severity: row.severity || 'P1', sourceModule: 'M4A', title: `异常已分派 → ${value}`, body: row.title, link: '/monitor/anomalies' });
  } catch (_) {/* cancel */}
}
async function onAck(row) {
  await anom.acknowledge(row.id);
}
async function onResolve(row) {
  try {
    const { value } = await ElMessageBox.prompt('解决说明（可填入 caseId）', '标记为已解决', { confirmButtonText: '确认' });
    await anom.resolve(row.id, { note: value });
    bus.pushLocal({ severity: 'P2', sourceModule: 'M4A', title: `异常已解决：${row.title}`, body: value || '' });
  } catch (_) {/* cancel */}
}
async function onDismiss(row) {
  try {
    const { value } = await ElMessageBox.prompt('忽略原因', '忽略异常', { confirmButtonText: '确认' });
    if (!value) return;
    await anom.dismiss(row.id, { reason: value });
  } catch (_) {}
}
async function onEscalate(row) {
  try {
    const { value } = await ElMessageBox.prompt('升级原因', '升级异常', { confirmButtonText: '升级' });
    if (!value) return;
    await anom.escalate(row.id, { reason: value });
    bus.pushLocal({ severity: 'P0', sourceModule: 'M4A', title: `异常已升级：${row.title}`, body: value });
  } catch (_) {}
}
function viewDetail(row) {
  detail.value = row;
  drawer.value = true;
}
function canDo(row, action) {
  return allowedAnomalyActions(row.status).includes(action);
}

const mobileCols = [
  { prop: 'severity', label: '严重度' },
  { prop: 'title', label: '标题' },
  { prop: 'sku', label: 'SKU' },
  { prop: 'status', label: '状态' },
  { prop: 'slaMinutes', label: 'SLA' },
];
</script>

<template>
  <div>
    <PageHeader title="异常监控" subtitle="22 类异常 + AI 根因 + 处置建议 · URL query 持久化">
      <template #extra>
        <el-button :icon="'Refresh'" @click="load" :loading="anom.loading.value">刷新</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16" class="summary">
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><el-card shadow="never" class="summary-card"><span class="summary-label">未处理</span><strong class="tnum">{{ summary.totalOpen || 0 }}</strong></el-card></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><el-card shadow="never" class="summary-card danger"><span class="summary-label">P0 紧急</span><strong class="tnum">{{ summary.p0 || 0 }}</strong></el-card></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><el-card shadow="never" class="summary-card warn"><span class="summary-label">P1 重要</span><strong class="tnum">{{ summary.p1 || 0 }}</strong></el-card></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><el-card shadow="never" class="summary-card"><span class="summary-label">P2 关注</span><strong class="tnum">{{ summary.p2 || 0 }}</strong></el-card></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">异常列表</h2>
          <div class="filter-bar">
            <el-radio-group v-model="sevFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="P0">P0</el-radio-button>
              <el-radio-button value="P1">P1</el-radio-button>
              <el-radio-button value="P2">P2</el-radio-button>
            </el-radio-group>
            <el-select v-model="statusFilter" size="small" class="filter-select">
              <el-option label="全部状态" value="all" />
              <el-option label="未处理" value="open" />
              <el-option label="已分派" value="assigned" />
              <el-option label="调查中" value="investigating" />
              <el-option label="处置中" value="resolving" />
              <el-option label="已解决" value="resolved" />
              <el-option label="已升级" value="escalated" />
              <el-option label="已忽略" value="dismissed" />
            </el-select>
            <el-input v-model="assigneeFilter" size="small" placeholder="按 assignee 过滤" class="filter-input" clearable />
          </div>
        </div>
      </template>

      <div v-loading="anom.loading.value">
        <EmptyState v-if="!anom.loading.value && cards.length === 0" title="无异常事件" description="所有监控指标当前正常" icon="CircleCheck" />
        <ResponsiveTable
          v-else
          :data="cards"
          :mobile-columns="mobileCols"
          row-clickable
          stripe
          @row-click="viewDetail"
        >
          <el-table-column label="严重度" width="80">
            <template #default="{ row }"><el-tag :type="sevType(row.severity)" size="small">{{ row.severity }}</el-tag></template>
          </el-table-column>
          <el-table-column label="标题" min-width="240">
            <template #default="{ row }">
              <strong>{{ row.title }}</strong>
              <div class="text-muted" style="font-size: 12px">{{ row.anomalyCode || row.anomaly_code }} · {{ row.category }}</div>
            </template>
          </el-table-column>
          <el-table-column label="SKU/ASIN" width="160">
            <template #default="{ row }">
              <div class="tnum" style="font-size: 12px">{{ row.sku || '-' }}</div>
              <div class="text-muted tnum" style="font-size: 11px">{{ row.asin || '-' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" effect="plain">{{ statusLabel(row.status) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="SLA" width="120">
            <template #default="{ row }">
              <span :class="row.slaBreached ? 'text-danger' : ''" class="tnum">{{ row.slaMinutes }} min</span>
              <div v-if="row.slaBreached" class="text-danger" style="font-size: 11px">超时</div>
            </template>
          </el-table-column>
          <el-table-column label="Assignee" width="120">
            <template #default="{ row }">{{ row.assigneeLabel || '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="280">
            <template #default="{ row }">
              <el-button v-if="canDo(row, 'assigned')" size="small" plain @click.stop="onAssign(row)">分派</el-button>
              <el-button v-if="canDo(row, 'investigating')" size="small" plain @click.stop="onAck(row)">确认</el-button>
              <el-button v-if="canDo(row, 'resolved')" size="small" type="success" plain @click.stop="onResolve(row)">解决</el-button>
              <el-button v-if="canDo(row, 'escalated')" size="small" type="warning" plain @click.stop="onEscalate(row)">升级</el-button>
              <el-button v-if="canDo(row, 'dismissed')" size="small" link @click.stop="onDismiss(row)">忽略</el-button>
            </template>
          </el-table-column>

          <!-- Mobile slots: severity as colored chip -->
          <template #mobile-severity="{ row }">
            <el-tag :type="sevType(row.severity)" size="small">{{ row.severity }}</el-tag>
          </template>
          <template #mobile-title="{ row }">
            <strong>{{ row.title }}</strong>
            <div class="text-muted" style="font-size: 11px">{{ row.anomalyCode || row.anomaly_code }}</div>
          </template>
          <template #mobile-status="{ row }">
            <el-tag size="small" effect="plain">{{ statusLabel(row.status) }}</el-tag>
          </template>
          <template #mobile-slaMinutes="{ row }">
            <span :class="row.slaBreached ? 'text-danger' : ''" class="tnum">{{ row.slaMinutes }} min</span>
            <span v-if="row.slaBreached" class="text-danger" style="font-size: 11px"> · 超时</span>
          </template>
          <template #mobile-actions="{ row }">
            <el-button v-if="canDo(row, 'assigned')" size="small" plain @click.stop="onAssign(row)">分派</el-button>
            <el-button v-if="canDo(row, 'investigating')" size="small" plain @click.stop="onAck(row)">确认</el-button>
            <el-button v-if="canDo(row, 'resolved')" size="small" type="success" plain @click.stop="onResolve(row)">解决</el-button>
            <el-button v-if="canDo(row, 'escalated')" size="small" type="warning" plain @click.stop="onEscalate(row)">升级</el-button>
            <el-button v-if="canDo(row, 'dismissed')" size="small" link @click.stop="onDismiss(row)">忽略</el-button>
          </template>
        </ResponsiveTable>
      </div>
    </el-card>

    <ResponsiveDrawer v-model="drawer" :title="detail ? `异常 · ${detail.id}` : ''" size="520px">
      <div v-if="detail">
        <h3>{{ detail.title }}</h3>
        <el-descriptions :column="1" border size="small" class="mt-12">
          <el-descriptions-item label="Severity">{{ detail.severity }}</el-descriptions-item>
          <el-descriptions-item label="Code">{{ detail.anomalyCode || detail.anomaly_code }}</el-descriptions-item>
          <el-descriptions-item label="Status">{{ statusLabel(detail.status) }}</el-descriptions-item>
          <el-descriptions-item label="SKU / ASIN">{{ detail.sku }} / {{ detail.asin }}</el-descriptions-item>
          <el-descriptions-item label="Detected">{{ detail.detectedAt || detail.detected_at }}</el-descriptions-item>
          <el-descriptions-item label="SLA Deadline">{{ detail.slaDeadline || detail.sla_deadline }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="block-label">AI 根因</h4>
        <p class="block-text">{{ detail.aiRootCause || detail.ai_root_cause || '-' }}</p>
        <h4 class="block-label">建议处置</h4>
        <p class="block-text">{{ detail.recommendedAction || detail.recommended_action || '-' }}</p>
      </div>
    </ResponsiveDrawer>
  </div>
</template>

<style scoped>
.summary { margin-bottom: 16px; }
.summary-card { border: 1px solid var(--line); }
.summary-card :deep(.el-card__body) { padding: 16px 18px; }
.summary-label { font-size: 12px; color: var(--text-muted); }
.summary-card strong {
  display: block; font-size: 28px; font-weight: 700; margin-top: 4px; color: var(--text); line-height: 1.1;
}
.summary-card.danger strong { color: var(--danger); }
.summary-card.warn strong { color: var(--warning); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.filter-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.filter-select { width: 130px; }
.filter-input { width: 160px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.block-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin: 16px 0 6px; }
.block-text { margin: 0; font-size: 13px; line-height: 1.7; padding: 10px 12px; background: #f9fafb; border-radius: 4px; }
.mt-12 { margin-top: 12px; }
.summary { margin-bottom: 16px; }
@media (max-width: 767px) {
  .summary :deep(.el-col) { margin-bottom: 8px; }
  .summary-card strong { font-size: 22px; }
  .filter-bar { width: 100%; }
  .filter-select, .filter-input { width: 100%; }
}
</style>
