<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import MobileFallback from '../components/MobileFallback.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useTax } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();
const mobileVatCols = [
  { prop: 'region', label: '国家' },
  { prop: 'sales', label: '销售额', formatter: (v) => formatCurrency(v) },
  { prop: 'due', label: '应纳', formatter: (v) => formatCurrency(v) },
  { prop: 'status', label: '状态' },
];
const mobileSalesTaxCols = [
  { prop: 'region', label: '州' },
  { prop: 'sales', label: '销售额', formatter: (v) => formatCurrency(v) },
  { prop: 'collected', label: '已代收', formatter: (v) => formatCurrency(v) },
  { prop: 'nexus', label: 'Nexus', formatter: (v) => v ? '已触线' : '未触线' },
];

const route = useRoute();
const router = useRouter();
const tax = useTax();

const typeFilter = ref(route.query.type || 'all');
const regionFilter = ref(route.query.region || '');
const statusFilter = ref(route.query.status || 'all');

async function load() {
  const params = {};
  if (typeFilter.value !== 'all') params.type = typeFilter.value;
  if (regionFilter.value) params.region = regionFilter.value;
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  await tax.fetch(params);
}

watch([typeFilter, regionFilter, statusFilter], () => {
  router.replace({
    query: {
      ...route.query,
      type: typeFilter.value === 'all' ? undefined : typeFilter.value,
      region: regionFilter.value || undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
    },
  });
  load();
});

onMounted(load);

async function fileTax(row) {
  try {
    const { value: filingRef } = await ElMessageBox.prompt(
      '本地标记为已申报（不向税局 / Avalara 提交）。请输入申报参考号以便对账：',
      '本地标记已申报',
      {
        confirmButtonText: '本地标记',
        cancelButtonText: '取消',
        inputPattern: /.+/,
        inputErrorMessage: '不能为空',
      }
    );
    await tax.file(row.id, filingRef);
    ElMessage.success('已在本地标记为已申报（未向税局 / Avalara 提交）');
  } catch {}
}

// 导出功能尚未实现：没有真实文件生成，按钮置灰以免伪装“已导出”。
// 安全不变量：未真正发生的导出/申报不得用 toast 谎报成功。
const EXPORT_DISABLED_HINT = '导出功能未上线，暂不可用（不会生成文件）';

// 当前日期（每次组件实例化时求值），用于 days_left 实时计算。
const today = ref(new Date());

// 状态文案：与税局真实申报区分，'filed' 仅表示本地标记。
function statusLabel(status) {
  const labels = {
    pending: '待申报',
    filed: '本地已标记',
    paid: '已缴',
    overdue: '逾期',
  };
  return labels[status] || status;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(today.value.getFullYear(), today.value.getMonth(), today.value.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((startOfDue - startOfToday) / MS_PER_DAY);
}

const summary = computed(() => tax.summary.value || {});
const records = computed(() => tax.records.value || []);
const vatRecords = computed(() => records.value.filter((r) => r.taxType === 'vat' || r.tax_type === 'vat'));
const salesTaxRecords = computed(() => records.value.filter((r) => r.taxType === 'sales_tax' || r.tax_type === 'sales_tax'));
// days_left / 剩余天数改为基于到期日与当前日期实时计算（非 seed 静态值）。
const deadlines = computed(() =>
  (summary.value.deadlines || []).map((d) => {
    const dueAt = d.dueAt || d.due_at;
    const computedDaysLeft = daysUntil(dueAt);
    return { ...d, daysLeft: computedDaysLeft != null ? computedDaysLeft : (d.daysLeft ?? d.days_left) };
  })
);
</script>

<template>
  <div>
    <PageHeader title="税务辅助" subtitle="VAT 申报数据 · 美国销售税自动归集 · Nexus 阈值监控">
      <template #extra>
        <el-select v-model="typeFilter" size="default" style="width: 130px">
          <el-option label="全部类型" value="all" />
          <el-option label="VAT" value="vat" />
          <el-option label="销售税" value="sales_tax" />
        </el-select>
        <el-select v-model="statusFilter" size="default" style="width: 130px">
          <el-option label="全部状态" value="all" />
          <el-option label="待申报" value="pending" />
          <el-option label="已申报" value="filed" />
          <el-option label="已缴" value="paid" />
          <el-option label="逾期" value="overdue" />
        </el-select>
        <el-tooltip :content="EXPORT_DISABLED_HINT" placement="bottom">
          <span><el-button :icon="'Download'" disabled>导出</el-button></span>
        </el-tooltip>
      </template>
    </PageHeader>

    <el-row :gutter="16" class="kpi-row" v-loading="tax.loading.value">
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="VAT 应纳" :value="formatCurrency(summary.vat?.totalDue || 0)" hint="EU/UK 站" status="warning" icon="Money" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="销售税已收" :value="formatCurrency(summary.salesTax?.totalCollected || 0)" hint="美国各州" status="info" icon="Document" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="即将到期" :value="deadlines.length" hint="申报截止" status="danger" icon="AlarmClock" /></el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="Nexus 触线" :value="salesTaxRecords.filter(r => r.nexus).length" hint="美国各州阈值" :status="salesTaxRecords.filter(r => r.nexus).length ? 'warning' : 'success'" icon="CircleCheck" /></el-col>
    </el-row>

    <MobileFallback v-if="isMobile" page-name="税务辅助" reason="VAT/销售税多列申报建议在桌面端使用。下方为概览。">
      <template #readonly>
        <el-card shadow="never" style="margin-top: 16px">
          <template #header><h2 class="section-title">关键数据</h2></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="VAT 应纳">{{ formatCurrency(summary.vat?.totalDue || 0) }}</el-descriptions-item>
            <el-descriptions-item label="销售税已收">{{ formatCurrency(summary.salesTax?.totalCollected || 0) }}</el-descriptions-item>
            <el-descriptions-item label="即将到期">{{ deadlines.length }} 项</el-descriptions-item>
            <el-descriptions-item label="Nexus 触线">{{ salesTaxRecords.filter(r => r.nexus).length }} 州</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </template>
    </MobileFallback>

    <el-card v-if="!isMobile && (vatRecords.length || typeFilter !== 'sales_tax')" shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">VAT 记录</h2>
          <el-tooltip :content="EXPORT_DISABLED_HINT" placement="top">
            <span><el-button size="small" :icon="'Download'" disabled>导出 OSS / IOSS 格式</el-button></span>
          </el-tooltip>
        </div>
      </template>
      <el-table :data="vatRecords" stripe empty-text="无 VAT 记录">
        <el-table-column prop="region" label="国家" width="100" />
        <el-table-column label="周期">
          <template #default="{ row }">{{ row.periodStart || row.period_start }} ~ {{ row.periodEnd || row.period_end }}</template>
        </el-table-column>
        <el-table-column label="销售额" align="right" width="140"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.sales) }}</span></template></el-table-column>
        <el-table-column label="VAT 率" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ formatPercent(row.taxRate || row.tax_rate) }}</span></template></el-table-column>
        <el-table-column label="应纳" align="right" width="140"><template #default="{ row }"><strong class="tnum text-warning">{{ formatCurrency(row.due) }}</strong></template></el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'filed' || row.status === 'paid' ? 'info' : row.status === 'overdue' ? 'danger' : 'warning'">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" type="primary" link @click="fileTax(row)">本地标记申报</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="!isMobile && (salesTaxRecords.length || typeFilter !== 'vat')" shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">美国销售税</h2>
          <el-tooltip :content="EXPORT_DISABLED_HINT" placement="top">
            <span><el-button size="small" :icon="'Download'" disabled>导出 Avalara 格式</el-button></span>
          </el-tooltip>
        </div>
      </template>
      <el-table :data="salesTaxRecords" stripe empty-text="无销售税记录">
        <el-table-column prop="region" label="州" width="80" />
        <el-table-column label="销售额" align="right" width="140"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.sales) }}</span></template></el-table-column>
        <el-table-column label="税率" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ formatPercent(row.taxRate || row.tax_rate) }}</span></template></el-table-column>
        <el-table-column label="已代收" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.collected) }}</span></template></el-table-column>
        <el-table-column label="Nexus 阈值" align="right" width="140"><template #default="{ row }"><span class="tnum text-muted">{{ formatCurrency(row.threshold) }}</span></template></el-table-column>
        <el-table-column label="状态">
          <template #default="{ row }">
            <el-tag v-if="row.nexus" type="warning" size="small">已触线（需注册）</el-tag>
            <el-tag v-else type="success" size="small">未触线</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" type="primary" link @click="fileTax(row)">本地标记申报</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="!isMobile" shadow="never" class="mt-16">
      <template #header><h2 class="section-title">即将到期申报</h2></template>
      <el-table :data="deadlines" stripe empty-text="近期无申报">
        <el-table-column prop="name" label="申报项" min-width="240" />
        <el-table-column label="到期日" width="140">
          <template #default="{ row }">{{ row.dueAt || row.due_at }}</template>
        </el-table-column>
        <el-table-column label="剩余天数" align="right" width="120">
          <template #default="{ row }">
            <span class="tnum" :class="row.daysLeft < 30 ? 'text-danger' : row.daysLeft < 90 ? 'text-warning' : ''">{{ row.daysLeft }} 天</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row .el-col { margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
</style>
