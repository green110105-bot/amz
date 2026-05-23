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
  return { pending_test_buy: '待 Test Buy', test_buy_in_transit: 'Test Buy 在途', test_buy_received: '已收货', appeal_drafted: '已起草申诉', appeal_submitted: '已提交申诉', appeal_accepted: '申诉成功', genuine: '已确认正品', closed: '已关闭' }[s] || s;
}
function typeLabel(t) {
  return { price_competition: '价格竞争', counterfeit_suspect: '疑似假货', counterfeit_confirmed: '已确认假货', genuine_authorized: '正品授权' }[t] || t;
}

async function scan() {
  await hj.scan({});
}

async function startTestBuy(item) {
  try {
    await ElMessageBox.confirm(`Test Buy 由你自主完成（系统不代下单）。系统会指导：用非主账号下单 / 推荐数量 1 / 跟踪物流。`, 'Test Buy 指引', { type: 'info', confirmButtonText: '我知道了，去 Amazon 下单' });
    await hj.startTestBuy(item.id);
  } catch (_) {/* cancel */}
}

async function uploadProof(item) {
  try {
    const { value: typeChoice } = await ElMessageBox.prompt('Test Buy 验证结果（counterfeit_confirmed / genuine_authorized）', '上传开箱照', { confirmButtonText: '提交', inputValue: 'counterfeit_confirmed' });
    if (!typeChoice) return;
    const updated = await hj.uploadProof(item.id, { proofImages: ['placeholder://proof.jpg'], type: typeChoice });
    if (typeChoice === 'counterfeit_confirmed') {
      bus.pushLocal({ severity: 'P0', sourceModule: 'M4A', title: `跟卖确认假货 → 已暂停 24h 广告`, body: `ASIN ${item.asin}`, link: '/hijacking' });
    }
  } catch (_) {/* cancel */}
}

async function submitAppeal(item) {
  await hj.submitAppeal(item.id, { appealId: item.appealId || 'auto' });
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
            <el-option label="已提交申诉" value="appeal_submitted" />
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
        Test Buy 涉及买家账户授权 + 资金 + 物流。本系统<strong>仅提供指导和文案起草</strong>，下单由你自主完成。
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
        <el-table-column label="M3 暂停" align="center" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.m3AdsPaused || row.m3_ads_paused" size="small" type="warning">已联动</el-tag>
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
            <el-button v-else-if="row.status === 'appeal_drafted'" size="small" type="primary" plain @click="submitAppeal(row)">提交申诉</el-button>
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
          <el-button v-else-if="row.status === 'appeal_drafted'" size="small" type="primary" plain @click="submitAppeal(row)">提交申诉</el-button>
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
      </div>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.mt-16 { margin-top: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tb-select { width: 130px; }
@media (max-width: 767px) {
  .toolbar { width: 100%; }
  .tb-select { width: 100%; }
}
</style>
