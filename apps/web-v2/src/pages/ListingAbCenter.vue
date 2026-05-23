<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDrawer from '../components/ResponsiveDrawer.vue';
import { useViewport } from '../composables/useViewport';
import { useTargets, useAbTests, useVersions } from '../composables/useM1State';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const { submit } = useAudit();

const { list: targets, fetch: fetchTargets } = useTargets();
const { list: abTests, kpi, fetch: fetchAb, create, start, abort, metrics, adoptWinner } = useAbTests();

const statusFilter = ref(route.query.status || 'all');

watch(statusFilter, (v) => {
  const q = { ...route.query };
  if (v === 'all') delete q.status; else q.status = v;
  router.replace({ query: q });
});

const filtered = computed(() => {
  if (statusFilter.value === 'all') return abTests.value;
  return abTests.value.filter((t) => t.status === statusFilter.value);
});

onMounted(async () => {
  await Promise.all([fetchTargets(), fetchAb()]);
});

// ===== 创建抽屉 =====
const createOpen = ref(false);
const createForm = ref({
  targetId: '',
  testType: 'title',
  controlVersionId: '',
  treatmentVersionId: '',
  durationDays: 14,
});

const versionsForTarget = ref([]);

watch(() => createForm.value.targetId, async (id) => {
  if (!id) { versionsForTarget.value = []; return; }
  const v = useVersions(id);
  versionsForTarget.value = await v.fetch(true);
});

const testTypeOptions = [
  { value: 'title', label: '标题 (自动)' },
  { value: 'main_image', label: '主图 (自动)' },
  { value: 'a_plus', label: 'A+ 模块 (自动)' },
  { value: 'manual', label: '手动（5 点 / 描述 / 价格）' },
];

const isManualType = computed(() => createForm.value.testType === 'manual');

function openCreate() {
  createForm.value = { targetId: '', testType: 'title', controlVersionId: '', treatmentVersionId: '', durationDays: 14 };
  createOpen.value = true;
}

async function submitCreate() {
  if (!createForm.value.targetId) { ElMessage.warning('选择 target'); return; }
  if (!createForm.value.controlVersionId || !createForm.value.treatmentVersionId) {
    ElMessage.warning('请选 control + treatment 两个版本');
    return;
  }
  if (createForm.value.controlVersionId === createForm.value.treatmentVersionId) {
    ElMessage.warning('control 与 treatment 不能相同');
    return;
  }
  try {
    await create({ ...createForm.value });
    createOpen.value = false;
  } catch {}
}

// ===== 详情抽屉 =====
const detailOpen = ref(false);
const detail = ref(null);
const detailMetrics = ref(null);
const detailLoading = ref(false);

async function viewDetail(row) {
  detail.value = row;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    detailMetrics.value = await metrics(row.id);
  } finally {
    detailLoading.value = false;
  }
}

function statusType(s) {
  return ({
    draft: 'info',
    running: 'warning',
    completed: 'success',
    aborted: 'danger',
    manual_required: 'warning',
  })[s] || 'info';
}

function statusLabel(s) {
  return ({
    draft: '草稿',
    running: '进行中',
    completed: '已完成',
    aborted: '已中止',
    manual_required: '需手动',
  })[s] || s;
}

function testTypeLabel(t) {
  return ({ title: '标题', main_image: '主图', a_plus: 'A+', manual: '手动' })[t] || t;
}

async function onStart(row) {
  await start(row.id);
}

async function onAbort(row) {
  try {
    await ElMessageBox.confirm(`确认中止 ${row.id?.slice(0, 8)}？`, '中止 A/B 测试', { type: 'warning' });
    await abort(row.id);
  } catch {}
}

async function onAdoptWinner(row) {
  try {
    await submit({
      sourceModule: 'M1',
      actionType: 'ADOPT_AB_WINNER',
      target: { type: 'ab_test', id: row.id },
      payload: { winner: row.winner, lift: row.lift },
      expectedImpact: { metric: 'cvr_lift', change: `+${((row.lift || 0) * 100).toFixed(1)}%` },
      description: `采用 A/B Winner（${row.id?.slice(0, 8)} · lift ${((row.lift || 0) * 100).toFixed(1)}%）`,
    });
    await adoptWinner(row.id);
  } catch {}
}

function formatPct(v) {
  if (v == null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

const mobileAbCols = [
  { prop: 'id', label: 'ID', formatter: (v) => (v ? String(v).slice(0, 12) : '-') },
  { prop: 'asin', label: 'ASIN' },
  { prop: 'test_type', label: '类型', formatter: (v, row) => testTypeLabel(v || row.testType) },
  { prop: 'status', label: '状态', formatter: (v) => statusLabel(v) },
  { prop: 'lift', label: 'Lift', formatter: (v) => (v != null ? formatPct(v) : '—') },
];

const mobileMetricCols = [
  { prop: 'date', label: '日期' },
  { prop: 'arm', label: 'Arm' },
  { prop: 'impressions', label: '曝光' },
  { prop: 'clicks', label: '点击' },
  { prop: 'orders', label: '订单' },
  { prop: 'ctr', label: 'CTR', formatter: (v) => formatPct(v) },
  { prop: 'cvr', label: 'CVR', formatter: (v) => formatPct(v) },
];
</script>

<template>
  <div>
    <PageHeader title="A/B 测试中心" subtitle="亚马逊原生主图 / 标题 / A+ A/B · 14 天 · 显著性 z-test">
      <template #extra>
        <el-button type="primary" :icon="'Plus'" @click="openCreate">新建 A/B 测试</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="进行中" :value="kpi.running" status="warning" icon="Stopwatch" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="已完成" :value="kpi.completed" status="success" icon="CircleCheck" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="需手动" :value="kpi.manualRequired" status="info" icon="WarningFilled" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="总数" :value="kpi.total" status="default" icon="DataAnalysis" /></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-head">
          <h2 class="section-title">A/B 测试列表</h2>
          <span class="spacer" />
          <el-select v-model="statusFilter" size="default" style="width: 140px">
            <el-option label="全部" value="all" />
            <el-option label="进行中" value="running" />
            <el-option label="已完成" value="completed" />
            <el-option label="草稿" value="draft" />
            <el-option label="需手动" value="manual_required" />
            <el-option label="已中止" value="aborted" />
          </el-select>
        </div>
      </template>

      <el-empty v-if="!filtered.length" description="尚无 A/B 测试" />

      <ResponsiveTable v-else :data="filtered" :mobile-columns="mobileAbCols" stripe>
        <el-table-column label="ID" width="130">
          <template #default="{ row }"><span class="tnum">{{ row.id?.slice(0, 12) }}</span></template>
        </el-table-column>
        <el-table-column label="ASIN" prop="asin" width="120" />
        <el-table-column label="测试类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ testTypeLabel(row.test_type || row.testType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            <span v-if="row.status === 'manual_required'" class="manual-tag" style="margin-left: 6px">需手动</span>
          </template>
        </el-table-column>
        <el-table-column label="Lift" width="100" align="right">
          <template #default="{ row }">
            <span class="tnum" :class="(row.lift || 0) > 0 ? 'text-success' : (row.lift || 0) < 0 ? 'text-danger' : 'text-muted'">
              {{ row.lift != null ? formatPct(row.lift) : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="显著性" width="100" align="right">
          <template #default="{ row }">
            <span class="tnum">{{ row.significance != null ? formatPct(row.significance) : '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Winner" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.winner" size="small" :type="row.winner === 'treatment' ? 'success' : 'info'">
              {{ row.winner }}
            </el-tag>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="viewDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'draft'" size="small" type="primary" plain @click="onStart(row)">启动</el-button>
            <el-button v-if="row.status === 'running'" size="small" type="danger" plain @click="onAbort(row)">中止</el-button>
            <el-button v-if="row.status === 'completed' && row.winner === 'treatment'" size="small" type="primary" @click="onAdoptWinner(row)">
              采用 Winner
            </el-button>
          </template>
        </el-table-column>
        <template #mobile-status="{ row, value }">
          <el-tag :type="statusType(row.status)" size="small">{{ value }}</el-tag>
        </template>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" plain @click.stop="viewDetail(row)">详情</el-button>
          <el-button v-if="row.status === 'draft'" size="small" type="primary" @click.stop="onStart(row)">启动</el-button>
          <el-button v-if="row.status === 'running'" size="small" type="danger" @click.stop="onAbort(row)">中止</el-button>
          <el-button v-if="row.status === 'completed' && row.winner === 'treatment'" size="small" type="primary" @click.stop="onAdoptWinner(row)">采用</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <!-- 创建抽屉 -->
    <ResponsiveDrawer v-model="createOpen" title="新建 A/B 测试" size="500px">
      <el-form :model="createForm" :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="Target" required>
          <el-select v-model="createForm.targetId" placeholder="选 target" style="width: 100%">
            <el-option
              v-for="t in targets"
              :key="t.id"
              :label="`${t.product_id || t.asin || t.new_category || t.id?.slice(0, 8)} · ${t.mode}`"
              :value="t.id"
              :disabled="t.mode === 'asin_input' && (t.asin_kind || t.asinKind) === 'external'"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="测试类型" required>
          <el-select v-model="createForm.testType" style="width: 100%">
            <el-option v-for="o in testTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-alert v-if="isManualType" type="warning" :closable="false" style="margin-bottom: 12px">
          ⚠️ 该测试类型需手动执行 · 创建后会生成 manual guidance，请按指引在亚马逊后台操作
        </el-alert>
        <el-form-item label="Control 版本" required>
          <el-select v-model="createForm.controlVersionId" placeholder="选 control 版本" style="width: 100%">
            <el-option
              v-for="v in versionsForTarget"
              :key="v.id"
              :label="`R${v.round_no ?? v.roundNo} · ${v.source} · ${(v.title || '').slice(0, 30)}`"
              :value="v.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Treatment 版本" required>
          <el-select v-model="createForm.treatmentVersionId" placeholder="选 treatment 版本" style="width: 100%">
            <el-option
              v-for="v in versionsForTarget"
              :key="v.id"
              :label="`R${v.round_no ?? v.roundNo} · ${v.source} · ${(v.title || '').slice(0, 30)}`"
              :value="v.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="持续天数">
          <el-input-number v-model="createForm.durationDays" :min="7" :max="60" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="submitCreate">创建</el-button>
          <el-button @click="createOpen = false">取消</el-button>
        </el-form-item>
      </el-form>
    </ResponsiveDrawer>

    <!-- 详情抽屉 -->
    <ResponsiveDrawer v-model="detailOpen" title="A/B 详情" size="640px">
      <div v-if="detail" v-loading="detailLoading">
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item label="ID" :span="2"><span class="tnum">{{ detail.id }}</span></el-descriptions-item>
          <el-descriptions-item label="ASIN">{{ detail.asin }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ testTypeLabel(detail.test_type || detail.testType) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detail.status)" size="small">{{ statusLabel(detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Winner">
            <el-tag v-if="detail.winner" size="small" :type="detail.winner === 'treatment' ? 'success' : 'info'">
              {{ detail.winner }}
            </el-tag>
            <span v-else class="text-muted">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="Lift">{{ detail.lift != null ? formatPct(detail.lift) : '—' }}</el-descriptions-item>
          <el-descriptions-item label="显著性">{{ detail.significance != null ? formatPct(detail.significance) : '—' }}</el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="detail.status === 'manual_required'"
          type="warning"
          :closable="false"
          style="margin-top: 16px"
          show-icon
        >
          <template #title>⚠️ 该测试需手动执行</template>
          <p>{{ detail.manual_guidance || detail.manualGuidance || '请在亚马逊后台手动启动测试，并定期回传 metrics' }}</p>
        </el-alert>

        <h3 class="sub-head">每日 metrics</h3>
        <el-empty v-if="!detailMetrics || !(detailMetrics.metrics || detailMetrics.items || []).length" description="尚无 metrics" />
        <ResponsiveTable v-else :data="(detailMetrics.metrics || detailMetrics.items || [])" :mobile-columns="mobileMetricCols" stripe>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column prop="arm" label="Arm" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.arm === 'treatment' ? 'success' : 'info'">{{ row.arm }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="impressions" label="曝光" align="right" />
          <el-table-column prop="clicks" label="点击" align="right" />
          <el-table-column prop="orders" label="订单" align="right" />
          <el-table-column label="CTR" align="right">
            <template #default="{ row }">{{ formatPct(row.ctr) }}</template>
          </el-table-column>
          <el-table-column label="CVR" align="right">
            <template #default="{ row }">{{ formatPct(row.cvr) }}</template>
          </el-table-column>
        </ResponsiveTable>
      </div>
    </ResponsiveDrawer>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 0; }
.kpi-row > .el-col { margin-bottom: 12px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.spacer { flex: 1; }
.sub-head { font-size: 14px; font-weight: 600; margin: 16px 0 10px; }
.manual-tag {
  display: inline-block;
  font-size: 11px;
  color: #f97316;
  background: #fff7ed;
  border: 1px solid #fb923c;
  padding: 1px 6px;
  border-radius: 10px;
}
</style>
