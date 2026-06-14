<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { useViewport } from '../composables/useViewport';
import { useSlowMoving } from '../composables/useM2State';
import { formatCurrency } from '../utils/format';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const slow = useSlowMoving();

const currentId = ref(route.query.id || '');

async function load() {
  await slow.fetch();
  if (!currentId.value && slow.list.value.length) {
    currentId.value = slow.list.value[0].id;
  }
}

watch(currentId, (v) => {
  router.replace({ query: { ...route.query, id: v || undefined } });
});

onMounted(load);

const current = computed(() => slow.list.value.find((d) => d.id === currentId.value) || slow.list.value[0] || null);

async function execute(opt) {
  if (!current.value) return;
  let confirmBelowBreakeven = false;
  // M2-P0-05: option A 降价 — 预览价与执行价同源；低于成本时 warning 展示单件亏损并要求二次确认
  if (opt.id === 'A') {
    let preview = null;
    try { preview = await slow.preview(current.value.id, 'A'); } catch {}
    if (preview) {
      if (preview.belowBreakeven || (preview.unitLoss && preview.unitLoss > 0)) {
        try {
          await ElMessageBox.confirm(
            `降价方案：原价 ${formatCurrency(preview.oldPrice, 'USD')} → 新价 ${formatCurrency(preview.newPrice, 'USD')}，` +
            `已低于保本价 ${formatCurrency(preview.breakEven, 'USD')}，单件亏损约 ${formatCurrency(preview.unitLoss, 'USD')}。` +
            `执行仅生成 M1 降价草稿、待 M1 上架方生效。确认亏本甩卖？`,
            '亏本甩卖确认', { type: 'warning', confirmButtonText: '确认亏本甩卖', cancelButtonText: '取消' });
          confirmBelowBreakeven = true;
        } catch { return; }
      } else {
        try {
          await ElMessageBox.confirm(
            `降价方案：原价 ${formatCurrency(preview.oldPrice, 'USD')} → 新价 ${formatCurrency(preview.newPrice, 'USD')}（不低于保本价 ${formatCurrency(preview.breakEven, 'USD')}）。` +
            `执行仅生成 M1 降价草稿、待 M1 上架方生效。`,
            '降价确认', { type: 'info' });
        } catch { return; }
      }
    }
  } else {
    try {
      await ElMessageBox.confirm(`确认执行：${opt.label || opt.id}？该操作仅生成处置草稿/工单，不直接改动 Amazon。`, '滞销决策', { type: opt.id === 'D' ? 'warning' : 'info' });
    } catch { return; }
  }
  try {
    await slow.execute(current.value.id, opt.id, { confirmBelowBreakeven });
    await load();
  } catch {}
}

function colorByLossSize(loss) {
  if (loss >= -3000) return 'text-success';
  if (loss >= -10000) return 'text-warning';
  return 'text-danger';
}
</script>

<template>
  <div>
    <PageHeader :title="current ? `滞销决策 · ${current.sku}` : '滞销决策'" subtitle="4 选项对比 · 真实成本测算 · A/B/C/D 按心理接受度排序">
      <template #extra>
        <el-select v-model="currentId" filterable size="default" style="width: 220px" placeholder="选择 SKU">
          <el-option v-for="d in slow.list.value" :key="d.id" :label="`${d.sku} (库存 ${d.inventory})`" :value="d.id" />
        </el-select>
        <el-tag v-if="current" type="info" effect="plain">入仓 {{ current.inStockDays }} 天</el-tag>
      </template>
    </PageHeader>

    <EmptyState v-if="!current && !slow.loading.value" title="无滞销决策" description="当前无 SKU 触发滞销策略" />

    <template v-if="current">
      <el-row :gutter="16" class="kpi-row">
        <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="库存数" :value="current.inventory" hint="件" status="default" icon="Box" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="库存价值" :value="formatCurrency(current.inventoryValue)" status="info" icon="Money" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="月仓储费" :value="formatCurrency(current.monthlyStorageCost)" status="warning" icon="Clock" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="6"><KpiCard label="LTS 触发倒计时" :value="`${current.ltsCountdownDays || 0} 天`" hint="长期仓储费即将触发" status="danger" icon="AlarmClock" /></el-col>
      </el-row>

      <el-row :gutter="16" class="mt-16">
        <el-col v-for="opt in (current.options || [])" :key="opt.id" :xs="24" :sm="24" :md="12" :lg="12">
          <el-card shadow="never" class="opt-card" :class="{ recommended: opt.recommended || opt.id === current.recommendedOption, danger: opt.id === 'D' }">
            <div class="opt-head">
              <div>
                <span class="opt-id">选项 {{ opt.id }}</span>
                <h3>{{ opt.label }}</h3>
              </div>
              <el-tag v-if="opt.recommended || opt.id === current.recommendedOption" type="success" effect="dark">⭐ AI 推荐</el-tag>
              <el-tag v-else-if="opt.id === 'D'" type="danger" effect="plain">慎用</el-tag>
            </div>

            <el-descriptions :column="isMobile ? 1 : 2" border size="small" class="mt-12">
              <el-descriptions-item label="清完时间">{{ opt.daysToClose }} 天</el-descriptions-item>
              <el-descriptions-item label="总损失">
                <span :class="colorByLossSize(opt.totalLoss)" class="tnum">{{ formatCurrency(opt.totalLoss) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="现金回收">
                <span class="tnum text-success">{{ formatCurrency(opt.cashRecovery) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="账户健康">
                {{ opt.id === 'A' || opt.id === 'B' ? '不影响' : '可能影响' }}
              </el-descriptions-item>
            </el-descriptions>

            <p class="reason">{{ opt.reason }}</p>

            <el-button :type="(opt.recommended || opt.id === current.recommendedOption) ? 'primary' : opt.id === 'D' ? 'danger' : 'default'" :plain="opt.id === 'D'" size="default" style="width: 100%" :disabled="current.status === 'executed'" @click="execute(opt)">
              {{ current.status === 'executed' ? (opt.id === 'A' ? '已生成 M1 降价草稿' : '已生成处置草稿') : (opt.recommended || opt.id === current.recommendedOption) ? '生成推荐方案草稿' : `生成选项 ${opt.id} 草稿` }}
            </el-button>
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="mt-16">
        <template #header><h2 class="section-title">不立即处理的"沉默成本"</h2></template>
        <p class="explain">
          <strong class="text-danger">每月持有成本 ¥{{ current.monthlyStorageCost }} 仓储</strong> + 资金占用 ¥{{ Math.round((current.capitalLockCostYearly || 0) / 12) }}/月 + 30 天后 LTS 费用触发。
          <strong class="text-warning">越晚处理损失越大。</strong>
        </p>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.kpi-row .el-col { margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.opt-card { margin-bottom: 16px; border: 1px solid var(--line); }
.opt-card.recommended { border-color: var(--success); border-width: 2px; }
.opt-card.danger { border-left: 3px solid var(--danger); }
.opt-head { display: flex; justify-content: space-between; align-items: flex-start; }
.opt-id { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; }
.opt-head h3 { font-size: 16px; margin: 4px 0 0; }
.reason { padding: 8px 12px; background: #f9fafb; border-radius: 4px; font-size: 12px; color: var(--text-muted); margin: 12px 0; line-height: 1.5; }
.explain { font-size: 13px; line-height: 1.7; color: var(--text-muted); margin: 0; }
.explain strong { font-weight: 600; }
.mt-12 { margin-top: 12px; }
</style>
