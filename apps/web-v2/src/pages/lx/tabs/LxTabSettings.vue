<script setup>
import { onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { campaignsApi, portfoliosApi } from '../../../api/lx';
import { useViewport } from '../../../composables/useViewport';

const { isMobile } = useViewport();

const props = defineProps({ campaign: Object });

// 草稿 key 与 campaign id 相关
const draftKey = `amz_lx_drafts_settings_${props.campaign?.id || 'unknown'}`;

function defaultForm() {
  return {
    name: props.campaign?.name || '',
    state: props.campaign?.state || '启用',
    type: props.campaign?.type || '',
    targetingType: props.campaign?.targetingType || '',
    dailyBudget: props.campaign?.dailyBudget ?? 0,
    bidStrategy: props.campaign?.bidStrategy || '动态竞价 - 仅降低',
    startDate: props.campaign?.startedAt || null,
    endDate: null,
    portfolioId: props.campaign?.portfolioId || '',
  };
}

const form = ref(defaultForm());

// 尝试从 localStorage 恢复未保存草稿
function loadDraft() {
  try {
    const raw = localStorage.getItem(draftKey);
    if (raw) {
      const draft = JSON.parse(raw);
      form.value = { ...defaultForm(), ...draft };
    }
  } catch {}
}

function persistDraft() {
  try { localStorage.setItem(draftKey, JSON.stringify(form.value)); } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(draftKey); } catch {}
}

watch(form, persistDraft, { deep: true });

const portfolios = ref([]);

async function loadPortfolios() {
  try {
    const items = await portfoliosApi.list();
    portfolios.value = Array.isArray(items) ? items : [];
  } catch {
    portfolios.value = [];
  }
}

onMounted(() => {
  loadDraft();
  loadPortfolios();
});

async function save() {
  try {
    await campaignsApi.update(props.campaign.id, {
      name: form.value.name,
      state: form.value.state,
      dailyBudget: form.value.dailyBudget,
      bidStrategy: form.value.bidStrategy,
      portfolioId: form.value.portfolioId,
      startedAt: form.value.startDate,
    });
    clearDraft();
    ElMessage.success('已保存 Campaign 设置');
  } catch (e) {
    ElMessage.error(`保存失败：${e.message || e}`);
  }
}
</script>

<template>
  <div class="settings-page">
    <el-card shadow="never">
      <el-form :label-width="isMobile ? 'auto' : '140px'" :label-position="isMobile ? 'top' : 'left'" style="max-width: 720px">
        <h3 class="sec">基本信息</h3>
        <el-form-item label="广告活动名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.state">
            <el-radio value="启用">启用</el-radio>
            <el-radio value="已暂停">已暂停</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="广告类型">
          <el-tag>{{ form.type }} - {{ form.targetingType }} (不可改)</el-tag>
        </el-form-item>
        <el-form-item label="所属广告组合">
          <el-select v-model="form.portfolioId" style="width: 280px">
            <el-option label="无组合" value="" />
            <el-option v-for="p in portfolios" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>

        <h3 class="sec">预算与日期</h3>
        <el-form-item label="日预算 ($)">
          <el-input-number v-model="form.dailyBudget" :step="5" :min="1" />
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker v-model="form.startDate" type="date" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="form.endDate" type="date" placeholder="无结束日期" />
        </el-form-item>

        <h3 class="sec">竞价策略</h3>
        <el-form-item label="出价策略">
          <el-radio-group v-model="form.bidStrategy">
            <div class="bid-options">
              <el-radio value="动态竞价 - 仅降低">
                <strong>动态竞价 - 仅降低</strong>
                <div class="bid-desc">当不太可能转化时，Amazon 实时调低出价（推荐新品）</div>
              </el-radio>
              <el-radio value="动态竞价 - 提高和降低">
                <strong>动态竞价 - 提高和降低</strong>
                <div class="bid-desc">Amazon 在 ToS 位置最高可提高 100%，其他位置最高 50%</div>
              </el-radio>
              <el-radio value="固定竞价">
                <strong>固定竞价</strong>
                <div class="bid-desc">使用你的精确出价（推荐成熟品 + 已知 ACoS）</div>
              </el-radio>
            </div>
          </el-radio-group>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="save">保存设置</el-button>
          <el-button @click="form = defaultForm(); clearDraft();">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.sec {
  margin: 20px 0 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line-soft);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.bid-options { display: flex; flex-direction: column; gap: 8px; }
.bid-options strong { font-size: 13px; }
.bid-desc { font-size: 11px; color: var(--text-muted); margin: 2px 0 0 24px; line-height: 1.4; }
</style>
