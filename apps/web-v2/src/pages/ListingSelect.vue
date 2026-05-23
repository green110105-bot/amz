<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useTargets } from '../composables/useM1State';

const { isMobile } = useViewport();

const mobileTargetCols = [
  { prop: 'id', label: 'ID', formatter: (v) => (v ? String(v).slice(0, 12) : '-') },
  { prop: 'product_id', label: 'SKU' },
  { prop: 'asin', label: 'ASIN' },
  { prop: 'status', label: '状态', formatter: (v) => v || 'draft' },
];

const route = useRoute();
const router = useRouter();
const { list: targets, fetch: fetchTargets, create: createTarget } = useTargets();

const mode = ref(String(route.query.mode || '1'));
watch(() => route.query.mode, (v) => { if (v) mode.value = String(v); });

function setMode(m) {
  mode.value = String(m);
  router.replace({ query: { ...route.query, mode: String(m) } });
}

onMounted(async () => {
  await fetchTargets();
});

// ===== Mode 1: 选已有 =====
const search = ref(route.query.q || '');
const selection = ref([]);

watch(search, (v) => {
  const q = { ...route.query };
  if (v) q.q = v; else delete q.q;
  router.replace({ query: q });
});

const existing = computed(() =>
  targets.value.filter((t) => t.mode === 'existing'),
);
const existingFiltered = computed(() => {
  const q = (search.value || '').toLowerCase();
  if (!q) return existing.value;
  return existing.value.filter((t) =>
    [t.product_id, t.asin, t.id].some((x) => String(x || '').toLowerCase().includes(q)),
  );
});

function handleSelectionChange(rows) {
  selection.value = rows;
}

function optimizeMode1() {
  if (!selection.value.length) {
    ElMessage.warning('请至少选择 1 个 listing');
    return;
  }
  const first = selection.value[0];
  router.push(`/listings/optimize/${first.id}`);
}

// ===== Mode 2: ASIN 输入 =====
const asinInput = ref('');
const asinResult = ref(null);
const identifying = ref(false);

async function identifyAsin() {
  if (!asinInput.value.trim()) {
    ElMessage.warning('请输入 ASIN 或链接');
    return;
  }
  identifying.value = true;
  asinResult.value = null;
  try {
    // 从链接抠 ASIN
    const m = asinInput.value.match(/B0[A-Z0-9]{8}/i);
    const asin = m ? m[0].toUpperCase() : asinInput.value.trim().toUpperCase();
    const created = await createTarget({ mode: 'asin_input', asin });
    asinResult.value = created;
  } catch (e) {
    // 错误已由 composable 上抛
  } finally {
    identifying.value = false;
  }
}

function gotoMode2() {
  if (!asinResult.value) return;
  if ((asinResult.value.asin_kind || asinResult.value.asinKind) === 'external') {
    ElMessage.info('外部 ASIN 仅可加入对标池，不能直接优化');
    return;
  }
  router.push(`/listings/optimize/${asinResult.value.id}`);
}

// ===== Mode 3: 新 Listing 表单 =====
const DRAFT_KEY = 'm1_draft_new_listing';

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
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
  if (!form.value.category.trim()) { ElMessage.warning('请填类目'); return; }
  if (sp.length < 3) { ElMessage.warning('核心卖点至少 3 条'); return; }
  if (!form.value.targetAudience.trim()) { ElMessage.warning('请填目标人群'); return; }
  if (!form.value.priceBand.trim()) { ElMessage.warning('请填价格段'); return; }

  submitting.value = true;
  try {
    const body = {
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
    };
    const created = await createTarget(body);
    if (created?.id) {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      router.push(`/listings/optimize/${created.id}`);
    }
  } catch {} finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader title="优化目标选择" subtitle="3 种模式 · 选已有 listing / 输入 ASIN / 全新 listing" />

    <el-radio-group :model-value="mode" @change="setMode" class="mode-tabs" :size="isMobile ? 'small' : 'default'">
      <el-radio-button label="1">Mode 1 · 选已有</el-radio-button>
      <el-radio-button label="2">Mode 2 · ASIN</el-radio-button>
      <el-radio-button label="3">Mode 3 · 新建</el-radio-button>
    </el-radio-group>

    <!-- Mode 1 -->
    <div v-if="mode === '1'" class="mode-body">
      <el-card shadow="never">
        <template #header>
          <div class="card-head">
            <el-input v-model="search" placeholder="搜索 SKU / ASIN" :style="isMobile ? 'width:100%' : 'width:240px'" clearable />
            <span class="spacer" />
            <el-button type="primary" :disabled="!selection.length" :size="isMobile ? 'small' : 'default'" @click="optimizeMode1">
              开始优化（{{ selection.length }}）
            </el-button>
          </div>
        </template>
        <ResponsiveTable
          :data="existingFiltered"
          :mobile-columns="mobileTargetCols"
          stripe
          @selection-change="handleSelectionChange"
          empty-text="尚无现有 listing 优化目标，可去 Mode 2 输入 ASIN"
        >
          <el-table-column type="selection" width="48" />
          <el-table-column label="ID" width="160" prop="id">
            <template #default="{ row }">
              <span class="tnum">{{ row.id?.slice(0, 12) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="SKU / Product" prop="product_id" width="160" />
          <el-table-column label="ASIN" prop="asin" width="120" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 'draft' ? 'info' : 'primary'">{{ row.status || 'draft' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建" min-width="120">
            <template #default="{ row }">
              <span class="text-muted" style="font-size: 12px">{{ (row.created_at || row.createdAt || '').slice(0, 16) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="$router.push(`/listings/optimize/${row.id}`)">
                进入优化室
              </el-button>
            </template>
          </el-table-column>
          <template #mobile-status="{ value }">
            <el-tag size="small" :type="value === 'draft' ? 'info' : 'primary'">{{ value }}</el-tag>
          </template>
          <template #mobile-actions="{ row }">
            <el-button size="small" type="primary" @click.stop="$router.push(`/listings/optimize/${row.id}`)">
              进入优化室
            </el-button>
          </template>
        </ResponsiveTable>
      </el-card>
    </div>

    <!-- Mode 2 -->
    <div v-else-if="mode === '2'" class="mode-body">
      <el-card shadow="never">
        <template #header><h2 class="section-title">输入 ASIN / 商品链接</h2></template>
        <div class="mode2-row">
          <el-input
            v-model="asinInput"
            placeholder="例：B0CXXXXXXXX 或 https://www.amazon.com/dp/B0CXXXXXXXX"
            clearable
            style="flex: 1"
          />
          <el-button type="primary" :loading="identifying" @click="identifyAsin">识别</el-button>
        </div>

        <div v-if="asinResult" class="mode2-result">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="ASIN">{{ asinResult.asin }}</el-descriptions-item>
            <el-descriptions-item label="类型">
              <el-tag :type="(asinResult.asin_kind || asinResult.asinKind) === 'own' ? 'success' : 'warning'">
                {{ (asinResult.asin_kind || asinResult.asinKind) === 'own' ? '本店 own' : '外部 external' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="ID" :span="2">
              <span class="tnum">{{ asinResult.id }}</span>
            </el-descriptions-item>
          </el-descriptions>
          <div class="mode2-tag-row">
            <el-tag
              v-if="(asinResult.asin_kind || asinResult.asinKind) === 'external'"
              type="warning"
              effect="dark"
            >
              ⚠️ 仅加入对标池 · 外部 ASIN 不能直接优化
            </el-tag>
            <el-button
              type="primary"
              :disabled="(asinResult.asin_kind || asinResult.asinKind) === 'external'"
              @click="gotoMode2"
            >
              进入优化室
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Mode 3 -->
    <div v-else-if="mode === '3'" class="mode-body">
      <el-card shadow="never">
        <template #header><h2 class="section-title">填写新 listing 信息</h2></template>
        <el-form :model="form" :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'right'">
          <el-form-item label="类目" required>
            <el-input v-model="form.category" placeholder="例：手机壳 / 厨房收纳 / 户外瓦斯炉" />
          </el-form-item>

          <el-form-item label="核心卖点" required>
            <div v-for="(pt, i) in form.sellingPoints" :key="i" class="point-row">
              <el-input v-model="form.sellingPoints[i]" :placeholder="`卖点 #${i + 1}`" />
              <el-button v-if="form.sellingPoints.length > 3" link type="danger" @click="removePoint(i)">删</el-button>
            </div>
            <el-button v-if="form.sellingPoints.length < 5" link type="primary" @click="addPoint">+ 添加卖点</el-button>
            <p class="hint">3-5 条</p>
          </el-form-item>

          <el-form-item label="目标人群" required>
            <el-input v-model="form.targetAudience" placeholder="例：18-35 岁女性 / 户外露营用户" />
          </el-form-item>

          <el-form-item label="价格段" required>
            <el-input v-model="form.priceBand" placeholder="例：$15-25 / $80-120" />
          </el-form-item>

          <el-form-item label="物理参数">
            <el-input v-model="form.physicalSpecs" type="textarea" :rows="2" placeholder="尺寸 / 重量 / 材质 (可选)" />
          </el-form-item>

          <el-form-item label="品牌定位">
            <el-input v-model="form.brandPositioning" placeholder="例：极简 / 性价比 / 高端 (可选)" />
          </el-form-item>

          <el-form-item label="目标关键词">
            <el-input v-model="form.targetKeywords" type="textarea" :rows="2" placeholder="用逗号或换行分隔（可选）" />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="submitting" @click="submitMode3">提交并进入优化室</el-button>
            <span class="hint" style="margin-left: 12px">表单内容自动保存到本地草稿</span>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.mode-tabs { margin-bottom: 16px; }
.mode-body { margin-top: 12px; }
.card-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.mode2-row { display: flex; gap: 12px; }
.mode2-result { margin-top: 16px; }
.mode2-tag-row { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
.point-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.hint { margin: 4px 0 0; font-size: 11px; color: var(--text-muted); }
</style>
