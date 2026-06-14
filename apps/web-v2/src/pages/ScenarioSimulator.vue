<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import MobileFallback from '../components/MobileFallback.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { useScenarios, useProfit } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const scenarios = useScenarios();
const profit = useProfit();

const sku = ref(route.query.sku || '');
const skus = ref([]);
const sim = ref({ priceDelta: 0, acosDelta: 0, volumeDelta: 0, returnDelta: 0 });
const baseline = ref({ price: 0, acos: 0.22, monthlyVolume: 0, returnRate: 0.05 });
const simulated = ref(null);
const previewResult = ref(null);
const previewing = ref(false);
const saveDialog = ref(false);
const saveName = ref('');

const draftKey = computed(() => `m2:draft:scenario_${sku.value || 'default'}`);

function loadDraft() {
  try {
    const v = localStorage.getItem(draftKey.value);
    if (v) sim.value = { ...sim.value, ...JSON.parse(v) };
  } catch {}
}
function saveDraft() {
  try {
    localStorage.setItem(draftKey.value, JSON.stringify(sim.value));
  } catch {}
}

async function loadSkus() {
  const list = await profit.fetchSkus({ range: '30d' });
  skus.value = list || [];
  if (!sku.value && skus.value.length) sku.value = skus.value[0].sku;
}

async function syncBaseline() {
  const found = skus.value.find((s) => s.sku === sku.value);
  if (found) {
    // M2-P1-01: 传真实 unitCost（cogs/unitsSold），避免后端落回 price*0.45
    const units = Number(found.unitsSold) || 0;
    const unitCost = units > 0 && found.cogs != null ? Number(found.cogs) / units : undefined;
    baseline.value = {
      price: Number(found.price) || (found.revenue && units ? Number(found.revenue) / units : 0) || 0,
      acos: Number(found.acos) || 0.22,
      monthlyVolume: Number(found.monthlyVolume) || units || 320,
      returnRate: Number(found.returnRate) || 0.05,
      unitCost,
    };
  }
}

let _t;
async function doPreview() {
  if (!sku.value) return;
  previewing.value = true;
  try {
    const r = await scenarios.preview({
      sku: sku.value,
      baseline: baseline.value,
      variables: sim.value,
    });
    if (r) { previewResult.value = r; simulated.value = r.simulated || r; }
  } finally {
    previewing.value = false;
  }
}
function schedulePreview() {
  clearTimeout(_t);
  _t = setTimeout(doPreview, 300);
}

watch(sku, async (v) => {
  router.replace({ query: { ...route.query, sku: v || undefined } });
  await syncBaseline();
  loadDraft();
  await doPreview();
});

watch(sim, () => {
  saveDraft();
  schedulePreview();
}, { deep: true });

onMounted(async () => {
  await loadSkus();
  await syncBaseline();
  loadDraft();
  await doPreview();
  scenarios.fetch({ sku: sku.value });
});

// M2-P1-01: 消费后端权威 delta，不再前端用写死 20% 毛利自算
const delta = computed(() => {
  const r = previewResult.value;
  return r && typeof r.delta === 'number' ? r.delta : 0;
});
// 净利率<0 或后端 feasible=false → 禁用"采用"
const feasible = computed(() => {
  const r = previewResult.value;
  if (r && typeof r.feasible === 'boolean') return r.feasible;
  return (simulated.value?.margin ?? 0) >= 0 && (simulated.value?.unitProfit ?? 0) >= 0;
});

function preset(name) {
  if (name === 'aggressive') sim.value = { priceDelta: -10, acosDelta: 5, volumeDelta: 30, returnDelta: 1 };
  else if (name === 'conservative') sim.value = { priceDelta: 0, acosDelta: -3, volumeDelta: -5, returnDelta: 0 };
  else sim.value = { priceDelta: 0, acosDelta: 0, volumeDelta: 0, returnDelta: 0 };
}

async function save() {
  if (!saveName.value) { ElMessage.warning('请输入快照名称'); return; }
  // M2-P0-04/P1-01: 净利率<0 时升级危险二次确认 + 诚实文案
  if (!feasible.value) {
    try {
      await ElMessageBox.confirm(
        '当前方案净利率/单件利润为负。保存仅记录情景，不会真实改价；如需调价仅生成 M1 草稿，需到 M1 上架才真实生效。确认继续？',
        '风险确认', { type: 'warning', confirmButtonText: '仍然保存', cancelButtonText: '取消' });
    } catch { return; }
  }
  try {
    await scenarios.save({
      name: saveName.value,
      sku: sku.value,
      baseline: baseline.value,
      variables: sim.value,
      result: simulated.value,
      preset: 'custom',
    });
    saveDialog.value = false;
    saveName.value = '';
  } catch {}
}
</script>

<template>
  <div>
    <PageHeader title="情景模拟器" subtitle="多变量滑块 · 估算利润影响（未含 FBA/头程/资金成本，与利润页可能不符）· 决策前先看 'if'">
      <template #extra>
        <el-select v-model="sku" filterable size="default" style="width: 240px" placeholder="选择 SKU">
          <el-option v-for="s in skus" :key="s.sku" :label="`${s.sku} - ${s.title || ''}`" :value="s.sku" />
        </el-select>
        <el-button type="primary" plain @click="saveDialog = true" :disabled="!simulated">保存快照</el-button>
      </template>
    </PageHeader>

    <MobileFallback v-if="isMobile" page-name="情景模拟器" reason="多变量滑块在桌面端使用更顺手。下方为基线只读概览。">
      <template #readonly>
        <el-card shadow="never">
          <template #header><h2 class="section-title">基线 / 模拟结果</h2></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="SKU">{{ sku || '-' }}</el-descriptions-item>
            <el-descriptions-item label="基线售价">{{ formatCurrency(baseline.price, 'USD') }}</el-descriptions-item>
            <el-descriptions-item label="基线月销量">{{ baseline.monthlyVolume }}</el-descriptions-item>
            <el-descriptions-item label="基线 ACOS">{{ formatPercent(baseline.acos) }}</el-descriptions-item>
            <el-descriptions-item label="模拟月利润">{{ formatCurrency(simulated?.monthlyProfit || 0) }}</el-descriptions-item>
            <el-descriptions-item label="vs 基线">{{ delta > 0 ? '+' : '' }}{{ formatCurrency(delta) }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </template>
    </MobileFallback>
    <el-row v-else :gutter="16">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <h2 class="section-title">变量调整</h2>
              <div>
                <el-button size="small" plain @click="preset('reset')">基线</el-button>
                <el-button size="small" plain @click="preset('conservative')">保守</el-button>
                <el-button size="small" type="primary" plain @click="preset('aggressive')">激进</el-button>
              </div>
            </div>
          </template>
          <div class="slider-block">
            <div class="slider-label">售价 <span class="tnum">{{ formatCurrency(simulated?.price ?? baseline.price, 'USD') }}</span> <small class="text-muted">基线 {{ formatCurrency(baseline.price, 'USD') }}</small></div>
            <el-slider v-model="sim.priceDelta" :min="-30" :max="30" :step="1" :marks="{ 0: '0%' }" />
            <small class="text-muted">{{ sim.priceDelta > 0 ? '+' : '' }}{{ sim.priceDelta }}% 价格调整</small>
          </div>
          <div class="slider-block">
            <div class="slider-label">ACOS <span class="tnum">{{ formatPercent(simulated?.acos ?? baseline.acos) }}</span> <small class="text-muted">基线 {{ formatPercent(baseline.acos) }}</small></div>
            <el-slider v-model="sim.acosDelta" :min="-20" :max="40" :step="1" :marks="{ 0: '0pp' }" />
            <small class="text-muted">{{ sim.acosDelta > 0 ? '+' : '' }}{{ sim.acosDelta }}pp 调整</small>
          </div>
          <div class="slider-block">
            <div class="slider-label">月销量 <span class="tnum">{{ Math.round(simulated?.volume ?? baseline.monthlyVolume) }}</span> <small class="text-muted">基线 {{ baseline.monthlyVolume }}</small></div>
            <el-slider v-model="sim.volumeDelta" :min="-50" :max="100" :step="5" :marks="{ 0: '0%' }" />
            <small class="text-muted">{{ sim.volumeDelta > 0 ? '+' : '' }}{{ sim.volumeDelta }}% 销量变化</small>
          </div>
          <div class="slider-block">
            <div class="slider-label">退货率 <span class="tnum">{{ formatPercent(simulated?.returnRate ?? baseline.returnRate) }}</span> <small class="text-muted">基线 {{ formatPercent(baseline.returnRate) }}</small></div>
            <el-slider v-model="sim.returnDelta" :min="-5" :max="15" :step="1" :marks="{ 0: '0pp' }" />
            <small class="text-muted">{{ sim.returnDelta > 0 ? '+' : '' }}{{ sim.returnDelta }}pp 调整</small>
          </div>
        </el-card>
      </el-col>

      <el-col :span="10">
        <el-card v-loading="previewing" shadow="never" class="result-card">
          <template #header><h2 class="section-title">模拟结果</h2></template>
          <div class="big-num"><span class="text-muted">月利润</span>
            <strong class="tnum" :class="delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : ''">
              {{ formatCurrency(simulated?.monthlyProfit || 0) }}
            </strong>
          </div>
          <div class="delta-line">
            <span class="text-muted">vs 基线</span>
            <strong class="tnum" :class="delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : ''">
              {{ delta > 0 ? '+' : '' }}{{ formatCurrency(delta) }}
            </strong>
          </div>
          <el-descriptions :column="1" border size="small" class="mt-12">
            <el-descriptions-item label="月销售额">{{ formatCurrency(simulated?.monthlyRevenue || 0) }}</el-descriptions-item>
            <el-descriptions-item label="单件毛利">{{ formatCurrency(simulated?.unitProfit || 0, 'USD') }}</el-descriptions-item>
            <el-descriptions-item label="毛利率">
              <span :class="(simulated?.margin || 0) < 0 ? 'text-danger' : (simulated?.margin || 0) < 0.10 ? 'text-warning' : 'text-success'">{{ formatPercent(simulated?.margin || 0) }}</span>
            </el-descriptions-item>
          </el-descriptions>
          <el-alert v-if="!feasible" type="error" :closable="false" show-icon class="mt-12"
            title="方案不可行（净利率/单件利润为负）" description="此方案会亏本，不建议采用；任何调价仅生成 M1 草稿，需到 M1 上架才真实生效。" />
          <el-alert type="info" :closable="false" class="mt-12"
            title="估算口径" description="未含 FBA/头程/资金成本逐项，数值与利润页可能不符。" />
        </el-card>

        <el-card shadow="never" class="mt-16" v-if="scenarios.list.value.length">
          <template #header><h2 class="section-title">历史快照</h2></template>
          <ul class="hist">
            <li v-for="h in scenarios.list.value.slice(0, 5)" :key="h.id">
              <strong>{{ h.name || h.preset || h.id }}</strong>
              <span class="text-muted">{{ h.created_at || h.createdAt }}</span>
            </li>
          </ul>
        </el-card>
      </el-col>
    </el-row>

    <ResponsiveDialog v-model="saveDialog" title="保存情景快照" width="420px">
      <el-form :label-width="isMobile ? 'auto' : '80px'" :label-position="isMobile ? 'top' : 'left'">
        <el-form-item label="名称">
          <el-input v-model="saveName" placeholder="如：激进 30 天" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveDialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.slider-block { padding: 12px 0; border-bottom: 1px dashed var(--line-soft); }
.slider-block:last-child { border-bottom: none; }
.slider-label { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 6px; }
.slider-label .tnum { font-size: 16px; font-weight: 600; }
.result-card .big-num { display: flex; flex-direction: column; gap: 6px; padding: 16px 0; border-bottom: 1px dashed var(--line-soft); }
.result-card .big-num strong { font-size: 32px; }
.delta-line { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; }
.delta-line strong { font-size: 18px; }
.mt-12 { margin-top: 12px; }
.hist { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.hist li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed var(--line-soft); }
.hist li:last-child { border-bottom: none; }
</style>
