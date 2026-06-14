<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useTargets } from '../composables/useM1State';

const { isMobile } = useViewport();
const route = useRoute();
const router = useRouter();
const { list: targets, kpi, fetch: fetchTargets, create: createTarget, loading } = useTargets();

const mode = ref(String(route.query.mode || '1'));
const search = ref(route.query.q || '');
const selection = ref([]);

const mobileTargetCols = [
  { prop: 'product_id', label: 'SKU', formatter: (v, row) => v || row.new_category || '-' },
  { prop: 'asin', label: 'ASIN', formatter: (v) => v || '待生成' },
  { prop: 'status', label: '状态', formatter: (v) => v || 'draft' },
];

watch(() => route.query.mode, (v) => { if (v) mode.value = String(v); });
watch(search, (v) => {
  const q = { ...route.query };
  if (v) q.q = v; else delete q.q;
  router.replace({ query: q });
});

function setMode(m) {
  mode.value = String(m);
  router.replace({ query: { ...route.query, mode: String(m) } });
}

onMounted(() => fetchTargets());

const visibleTargets = computed(() => {
  const q = String(search.value || '').toLowerCase();
  const rows = targets.value.filter((t) => (mode.value === '1' ? t.mode === 'existing' : true));
  if (!q) return rows;
  return rows.filter((t) => [t.product_id, t.asin, t.id, t.new_category]
    .some((x) => String(x || '').toLowerCase().includes(q)));
});

const sourceStats = computed(() => {
  const mock = targets.value.filter((t) => t.sourceMeta?.source?.includes('mock')).length;
  return { mock, api: Math.max(0, targets.value.length - mock) };
});

const opsCards = computed(() => [
  { label: '可优化 Listing', value: kpi.value.existing, hint: '店铺自有 SKU，可进入改写与发布前检查。', tone: 'green' },
  { label: 'ASIN 识别', value: kpi.value.asinInput, hint: '自有 ASIN 可优化，外部 ASIN 只做对标。', tone: 'amber' },
  { label: '新建 Listing', value: kpi.value.newListing, hint: '从 0 准备文案、图片、A+ 与属性。', tone: 'blue' },
  { label: 'Mock 标记', value: sourceStats.value.mock, hint: '所有样例都带 source/confidence，方便替换真数据。', tone: 'slate' },
]);

function handleSelectionChange(rows) {
  selection.value = rows;
}

function optimizeSelected() {
  if (!selection.value.length) {
    ElMessage.warning('请先选择 1 个 Listing');
    return;
  }
  router.push(`/listings/optimize/${selection.value[0].id}`);
}

const asinInput = ref('');
const asinResult = ref(null);
const identifying = ref(false);

async function identifyAsin() {
  if (!asinInput.value.trim()) {
    ElMessage.warning('请输入 ASIN 或 Amazon 商品链接');
    return;
  }
  identifying.value = true;
  asinResult.value = null;
  try {
    const m = asinInput.value.match(/B0[A-Z0-9]{8}/i);
    const asin = m ? m[0].toUpperCase() : asinInput.value.trim().toUpperCase();
    asinResult.value = await createTarget({ mode: 'asin_input', asin });
  } finally {
    identifying.value = false;
  }
}

function gotoMode2() {
  if (!asinResult.value) return;
  const kind = asinResult.value.asin_kind || asinResult.value.asinKind;
  if (kind === 'external') {
    ElMessage.info('外部 ASIN 只能做对标分析，不能直接改写或发布');
    return;
  }
  router.push(`/listings/optimize/${asinResult.value.id}`);
}

const DRAFT_KEY = 'm1_draft_new_listing';
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const form = ref(loadDraft() || {
  category: '',
  sellingPoints: ['', '', ''],
  targetAudience: '',
  priceBand: '',
  physicalSpecs: '',
  brandPositioning: '',
  targetKeywords: '',
});
const submitting = ref(false);

watch(form, (v) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch {}
}, { deep: true });

function addPoint() {
  if (form.value.sellingPoints.length < 5) form.value.sellingPoints.push('');
}
function removePoint(i) {
  if (form.value.sellingPoints.length > 3) form.value.sellingPoints.splice(i, 1);
}

async function submitMode3() {
  const sp = form.value.sellingPoints.map((s) => s.trim()).filter(Boolean);
  if (!form.value.category.trim()) { ElMessage.warning('请填写类目'); return; }
  if (sp.length < 3) { ElMessage.warning('至少填写 3 个核心卖点'); return; }
  if (!form.value.targetAudience.trim()) { ElMessage.warning('请填写目标人群'); return; }
  if (!form.value.priceBand.trim()) { ElMessage.warning('请填写价格带'); return; }

  submitting.value = true;
  try {
    const created = await createTarget({
      mode: 'new_listing',
      new_category: form.value.category,
      new_selling_points: sp,
      new_target_audience: form.value.targetAudience,
      new_price_band: form.value.priceBand,
      new_physical_specs: form.value.physicalSpecs ? { raw: form.value.physicalSpecs } : null,
      new_brand_positioning: form.value.brandPositioning || null,
      new_target_keywords: form.value.targetKeywords
        ? form.value.targetKeywords.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean)
        : [],
    });
    if (created?.id) {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      router.push(`/listings/optimize/${created.id}`);
    }
  } finally {
    submitting.value = false;
  }
}

function sourceLabel(row) {
  return row.sourceMeta?.source
    ? `${row.sourceMeta.source} · ${Math.round((row.sourceMeta.confidence || 0) * 100)}%`
    : 'api';
}
</script>

<template>
  <div class="select-page">
    <PageHeader title="Listing 优化目标选择" subtitle="按真实运营流程选择：已有 Listing、ASIN 识别，或从 0 新建 Listing。" />

    <div class="ops-cards">
      <div v-for="card in opsCards" :key="card.label" class="ops-card" :class="card.tone">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small>{{ card.hint }}</small>
      </div>
    </div>

    <el-radio-group :model-value="mode" @change="setMode" class="mode-tabs" :size="isMobile ? 'small' : 'default'">
      <el-radio-button label="1">Mode 1 · 选择店铺 Listing</el-radio-button>
      <el-radio-button label="2">Mode 2 · ASIN 识别</el-radio-button>
      <el-radio-button label="3">Mode 3 · 新建 Listing</el-radio-button>
    </el-radio-group>

    <el-card v-if="mode === '1'" shadow="never" class="mode-card mode-body" v-loading="loading">
      <template #header>
        <div class="card-head">
          <div>
            <h2>已有 Listing 作战入口</h2>
            <p>从自有 SKU 进入完整作战室：图片矩阵、文案、关键词、合规、版本、发布前检查。</p>
          </div>
          <div class="head-actions">
            <el-input v-model="search" placeholder="搜索 SKU / ASIN / 类目" clearable :style="isMobile ? 'width:100%' : 'width:260px'" />
            <el-button type="primary" :disabled="!selection.length" @click="optimizeSelected">开始优化（{{ selection.length }}）</el-button>
          </div>
        </div>
      </template>

      <ResponsiveTable
        :data="visibleTargets"
        :mobile-columns="mobileTargetCols"
        stripe
        @selection-change="handleSelectionChange"
        empty-text="暂无 Listing，可使用 Mode 2 输入 ASIN 或 Mode 3 新建。"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="SKU / 类目" min-width="170">
          <template #default="{ row }">
            <strong>{{ row.product_id || row.new_category || '未命名目标' }}</strong>
            <div class="muted">{{ row.id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="ASIN" width="140">
          <template #default="{ row }">{{ row.asin || '待生成' }}</template>
        </el-table-column>
        <el-table-column label="模式" width="130">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.mode }}</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag size="small" :type="row.status === 'draft' ? 'info' : 'success'">{{ row.status || 'draft' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="Source / Confidence" min-width="190">
          <template #default="{ row }"><span class="muted">{{ sourceLabel(row) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="$router.push(`/listings/optimize/${row.id}`)">进入作战室</el-button>
          </template>
        </el-table-column>
        <template #mobile-status="{ value }"><el-tag size="small">{{ value }}</el-tag></template>
        <template #mobile-actions="{ row }"><el-button size="small" type="primary" @click.stop="$router.push(`/listings/optimize/${row.id}`)">进入</el-button></template>
      </ResponsiveTable>
    </el-card>

    <el-card v-else-if="mode === '2'" shadow="never" class="mode-card mode-body asin-card">
      <template #header><h2>输入 ASIN / Amazon 链接</h2></template>
      <p class="mode-desc">系统先识别 ASIN 是否属于本店。自有 ASIN 可进入优化；外部 ASIN 会被锁为只读竞品对标，避免误操作。</p>
      <div class="mode2-row">
        <el-input v-model="asinInput" placeholder="B0CXXXXXXXX 或 https://www.amazon.com/dp/B0CXXXXXXXX" clearable />
        <el-button type="primary" :loading="identifying" @click="identifyAsin">识别</el-button>
      </div>
      <div v-if="asinResult" class="mode2-result">
        <el-descriptions :column="isMobile ? 1 : 3" border>
          <el-descriptions-item label="ASIN">{{ asinResult.asin }}</el-descriptions-item>
          <el-descriptions-item label="归属">
            <el-tag :type="(asinResult.asin_kind || asinResult.asinKind) === 'own' ? 'success' : 'warning'">
              {{ (asinResult.asin_kind || asinResult.asinKind) === 'own' ? '本店 own' : '外部 external' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Target ID"><span class="muted">{{ asinResult.id }}</span></el-descriptions-item>
        </el-descriptions>
        <div class="mode2-actions">
          <el-alert v-if="(asinResult.asin_kind || asinResult.asinKind) === 'external'" type="warning" show-icon :closable="false" title="外部 ASIN 已锁为只读，只用于竞品研究与差距分析。" />
          <el-button type="primary" :disabled="(asinResult.asin_kind || asinResult.asinKind) === 'external'" @click="gotoMode2">进入作战室</el-button>
        </div>
      </div>
    </el-card>

    <el-card v-else shadow="never" class="mode-card mode-body">
      <template #header><h2>新建 Listing 简报</h2></template>
      <p class="mode-desc">运营先补齐真实商品信息，系统再生成标题、五点、图片矩阵、A+ 和发布前检查。草稿会自动保存在本机。</p>
      <el-form :model="form" :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="类目" required><el-input v-model="form.category" placeholder="例如：3C 配件 / 厨房收纳 / 宠物用品" /></el-form-item>
        <el-form-item label="核心卖点" required>
          <div class="point-stack">
            <div v-for="(pt, i) in form.sellingPoints" :key="i" class="point-row">
              <el-input v-model="form.sellingPoints[i]" :placeholder="`卖点 #${i + 1}：功能 + 证据 + 场景`" />
              <el-button v-if="form.sellingPoints.length > 3" link type="danger" @click="removePoint(i)">删除</el-button>
            </div>
            <el-button v-if="form.sellingPoints.length < 5" link type="primary" @click="addPoint">+ 添加卖点</el-button>
          </div>
        </el-form-item>
        <el-form-item label="目标人群" required><el-input v-model="form.targetAudience" placeholder="例如：18-35 岁通勤用户 / 家庭收纳 / 礼品购买者" /></el-form-item>
        <el-form-item label="价格带" required><el-input v-model="form.priceBand" placeholder="例如：$15-25 / $80-120" /></el-form-item>
        <el-form-item label="物理规格"><el-input v-model="form.physicalSpecs" type="textarea" :rows="2" placeholder="材质 / 尺寸 / 重量 / 颜色 / 兼容型号" /></el-form-item>
        <el-form-item label="品牌定位"><el-input v-model="form.brandPositioning" placeholder="例如：可靠、轻量、专业、礼品感" /></el-form-item>
        <el-form-item label="目标关键词"><el-input v-model="form.targetKeywords" type="textarea" :rows="2" placeholder="用逗号或换行分隔，例如 phone case, magsafe case" /></el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submitMode3">提交并进入作战室</el-button>
          <span class="muted local-save">草稿自动保存</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.select-page { padding-bottom: 32px; }
.ops-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.ops-card { padding: 14px; border-radius: 16px; border: 1px solid #e2e8f0; background: #fff; display: grid; gap: 4px; }
.ops-card span { color: #64748b; font-size: 12px; }
.ops-card strong { font-size: 28px; line-height: 1; color: #0f172a; }
.ops-card small { color: #64748b; line-height: 1.45; }
.ops-card.green { background: #f0fdfa; border-color: #ccfbf1; }
.ops-card.amber { background: #fffbeb; border-color: #fde68a; }
.ops-card.blue { background: #eff6ff; border-color: #bfdbfe; }
.ops-card.slate { background: #f8fafc; }
.mode-tabs { margin-bottom: 16px; }
.mode-card { border-radius: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
h2 { margin: 0; font-size: 16px; color: #0f172a; }
.card-head p, .mode-desc { margin: 5px 0 0; color: #64748b; font-size: 12px; }
.head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.muted { color: #64748b; font-size: 12px; word-break: break-all; }
.mode2-row { display: flex; gap: 12px; margin-top: 14px; }
.mode2-result { margin-top: 16px; }
.mode2-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.point-stack { width: 100%; display: grid; gap: 8px; }
.point-row { display: flex; gap: 8px; align-items: center; }
.local-save { margin-left: 12px; }
@media (max-width: 900px) {
  .ops-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .card-head { align-items: flex-start; flex-direction: column; }
  .head-actions { width: 100%; justify-content: flex-start; }
}
@media (max-width: 560px) {
  .ops-cards { grid-template-columns: 1fr; }
  .mode2-row, .mode2-actions, .point-row { flex-direction: column; align-items: stretch; }
  .local-save { display: block; margin: 8px 0 0; }
}
</style>
