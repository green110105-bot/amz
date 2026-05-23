<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { useSuppliers } from '../composables/useM2State';
import { formatCurrency } from '../utils/format';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const suppliers = useSuppliers();

const statusFilter = ref(route.query.status || 'all');
const dialog = ref(false);
const editing = ref(null);

const draftKey = 'm2:draft:supplier';
const draft = ref({
  name: '',
  contact: '',
  email: '',
  phone: '',
  region: '',
  rating: 4.0,
  leadDays: 35,
  paymentTerms: '30% 定金 / 70% 尾款',
  notes: '',
});

function loadDraft() {
  try {
    const v = localStorage.getItem(draftKey);
    if (v) draft.value = { ...draft.value, ...JSON.parse(v) };
  } catch {}
}
function saveDraft() { try { localStorage.setItem(draftKey, JSON.stringify(draft.value)); } catch {} }
function clearDraft() { try { localStorage.removeItem(draftKey); } catch {} }

async function load() {
  const params = {};
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  await suppliers.fetch(params, true);
}

watch(statusFilter, () => {
  router.replace({ query: { ...route.query, status: statusFilter.value === 'all' ? undefined : statusFilter.value } });
  load();
});

watch(draft, saveDraft, { deep: true });

onMounted(() => {
  loadDraft();
  load();
});

function openCreate() {
  editing.value = null;
  dialog.value = true;
}
function openEdit(sup) {
  editing.value = sup;
  draft.value = { ...draft.value, ...sup };
  dialog.value = true;
}

async function submit() {
  if (!draft.value.name) { ElMessage.warning('请填写供应商名称'); return; }
  try {
    if (editing.value) {
      await suppliers.update(editing.value.id, draft.value);
    } else {
      await suppliers.create(draft.value);
    }
    dialog.value = false;
    clearDraft();
    draft.value = {
      name: '', contact: '', email: '', phone: '', region: '',
      rating: 4.0, leadDays: 35, paymentTerms: '30% 定金 / 70% 尾款', notes: '',
    };
  } catch {}
}

async function remove(sup) {
  try {
    await ElMessageBox.confirm(`确认停用 ${sup.name}？`, '提示', { type: 'warning' });
    await suppliers.remove(sup.id);
  } catch {}
}

function ratingType(r) {
  if (r >= 4.5) return 'success';
  if (r >= 4) return 'primary';
  if (r >= 3.5) return 'warning';
  return 'danger';
}

const list = computed(() => suppliers.list.value || []);
</script>

<template>
  <div>
    <PageHeader title="供应商管理" subtitle="供应商画像 · 准时率 / 缺陷率 / 价格稳定性 / 综合评分">
      <template #extra>
        <el-radio-group v-model="statusFilter" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="active">活跃</el-radio-button>
          <el-radio-button value="inactive">停用</el-radio-button>
        </el-radio-group>
        <el-button type="primary" :icon="'Plus'" @click="openCreate">添加供应商</el-button>
      </template>
    </PageHeader>

    <div v-loading="suppliers.loading.value">
      <EmptyState v-if="!suppliers.loading.value && !list.length" title="暂无供应商" description="点击右上角添加首个供应商" />
      <el-row :gutter="16">
        <el-col v-for="sup in list" :key="sup.id" :xs="24" :sm="24" :md="12" :lg="12">
          <el-card shadow="never" class="sup-card">
            <div class="sup-head">
              <div>
                <h3 class="sup-name">{{ sup.name }}</h3>
                <p class="text-muted sup-contact">{{ sup.contact }} {{ sup.email ? `· ${sup.email}` : '' }}</p>
              </div>
              <el-tag :type="sup.status === 'active' ? 'success' : 'info'" size="small">
                {{ sup.status === 'active' ? '活跃' : '已停用' }}
              </el-tag>
            </div>

            <div class="sup-rating">
              <span class="rating-num">{{ Number(sup.rating || 0).toFixed(1) }}</span>
              <el-rate :model-value="sup.rating || 0" disabled allow-half size="small" />
              <el-tag :type="ratingType(sup.rating || 0)" size="small" effect="light" round>综合评分</el-tag>
            </div>

            <el-row :gutter="8" class="sup-metrics">
              <el-col :span="6"><div class="m-cell"><span>SKU 数</span><strong>{{ sup.skuCount || sup.sku_count || 0 }}</strong></div></el-col>
              <el-col :span="6"><div class="m-cell"><span>累计采购</span><strong class="tnum">{{ formatCurrency(sup.totalSpend || sup.total_spend || 0) }}</strong></div></el-col>
              <el-col :span="6"><div class="m-cell"><span>准时率</span><strong class="tnum">{{ Math.round((sup.onTimeRate || sup.on_time_rate || 0) * 100) }}%</strong></div></el-col>
              <el-col :span="6"><div class="m-cell"><span>缺陷率</span><strong class="tnum">{{ ((sup.defectRate || sup.defect_rate || 0) * 100).toFixed(1) }}%</strong></div></el-col>
            </el-row>

            <div class="sup-foot">
              <span class="text-muted">交期 {{ sup.leadDays || sup.lead_days || '-' }} 天 · 末次下单 {{ sup.lastOrderAt || sup.last_order_at || '-' }}</span>
              <div>
                <el-button size="small" @click="openEdit(sup)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="remove(sup)" v-if="sup.status === 'active'">停用</el-button>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <ResponsiveDialog v-model="dialog" :title="editing ? '编辑供应商' : '添加供应商'" width="560px">
      <el-form :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'left'">
        <el-form-item label="名称">
          <el-input v-model="draft.name" placeholder="供应商名称" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="draft.contact" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="draft.email" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="draft.phone" />
        </el-form-item>
        <el-form-item label="地区">
          <el-input v-model="draft.region" placeholder="如：深圳" />
        </el-form-item>
        <el-form-item label="交期 (天)">
          <el-input-number v-model="draft.leadDays" :min="1" :max="180" />
        </el-form-item>
        <el-form-item label="评分">
          <el-rate v-model="draft.rating" allow-half />
        </el-form-item>
        <el-form-item label="付款条款">
          <el-input v-model="draft.paymentTerms" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="draft.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">{{ editing ? '保存' : '添加' }}</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.sup-card { margin-bottom: 16px; }
.sup-head { display: flex; justify-content: space-between; align-items: flex-start; }
.sup-name { font-size: 16px; font-weight: 600; margin: 0; }
.sup-contact { margin: 4px 0 0; font-size: 12px; }
.sup-rating { display: flex; align-items: center; gap: 12px; margin: 14px 0; }
.rating-num { font-size: 22px; font-weight: 700; color: var(--text); }
.sup-metrics { margin: 12px 0; }
.m-cell { text-align: center; padding: 8px; background: #f9fafb; border-radius: 6px; }
.m-cell span { display: block; font-size: 11px; color: var(--text-muted); }
.m-cell strong { display: block; font-size: 16px; margin-top: 2px; color: var(--text); }
.sup-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px dashed var(--line-soft); font-size: 12px; }
</style>
