<script setup>
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { mockAuditLogs } from '../utils/mock-data';
import { useLocalStore } from '../composables/useLocalStore';
import { formatCurrency, actionLabel } from '../utils/format';

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

const summary = computed(() => ({
  todayTotal: logs.value.length,
  successCount: logs.value.filter((l) => l.status === 'success').length,
  reverted: logs.value.filter((l) => l.reverted).length,
  monthlyImpact: logs.value.reduce((s, l) => s + (l.monthlySaving || 0), 0),
}));

function statusTagType(s) {
  return { success: 'success', failed: 'danger', reverted: 'warning', queued: '' }[s] || '';
}
function moduleColor(m) {
  return { M1: '#8b5cf6', M2: '#22d3ee', M3: '#f59e0b', M4: '#10b981' }[m] || '#6b7280';
}

async function revert(log) {
  if (log.reverted) {
    ElMessage.info('该操作已回滚');
    return;
  }
  try {
    await ElMessageBox.confirm(`确认回滚 ${log.actionType} ?`, '回滚确认', {
      confirmButtonText: '确认回滚',
      cancelButtonText: '取消',
      type: 'warning',
    });
    // 真接 LocalStorage 持久化
    localStore.revertAuditLog(log.id, 'user_revert');
    // mock 历史也改（兼容）
    log.reverted = true;
    log.status = 'reverted';
    log.revertedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    ElMessage.success('已回滚（反向 API 调用 + 审计记录已持久化）');
  } catch {}
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
      <KpiCard label="今日操作" :value="summary.todayTotal" hint="所有模块" status="default" icon="Document" />
      <KpiCard label="成功执行" :value="summary.successCount" hint="mock 模式" status="success" icon="CircleCheck" />
      <KpiCard label="本月已挽回" :value="formatCurrency(summary.monthlyImpact)" hint="累计自动节省" status="info" icon="TrendCharts" />
      <KpiCard label="已回滚" :value="summary.reverted" hint="7 天窗口可回滚" status="warning" icon="RefreshLeft" />
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
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ ({ success: '成功', failed: '失败', reverted: '已回滚', queued: '排队' })[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="!row.reverted && row.status === 'success'" size="small" type="warning" plain @click="revert(row)">回滚</el-button>
            <el-button size="small" link>详情</el-button>
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
