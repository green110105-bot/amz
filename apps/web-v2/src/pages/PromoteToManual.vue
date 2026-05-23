<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockAdTree, mockPromotionCandidates } from '../utils/mock-data-ads';
import { formatCurrency, formatPercent } from '../utils/format';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();
const mobileTermCols = [
  { prop: 'term', label: '搜索词' },
  { prop: 'orders30d', label: '订单(30d)' },
  { prop: 'sales30d', label: '销售(30d)', formatter: (v) => formatCurrency(v, 'USD') },
  { prop: 'cvr', label: 'CVR', formatter: (v) => formatPercent(v) },
  { prop: 'recommendBid', label: '推荐出价', formatter: (v) => '$' + v },
];
const mobileSummaryCols = [
  { prop: 'term', label: '关键词' },
];
const { submit } = useAudit();

const step = ref(0);
const sourceCampaign = ref('cmp-launch-sp');
const dateRange = ref(30);
const minOrders = ref(10);
const minCvr = ref(0.05);
const selectedTerms = ref([]);
const targetCampaignMode = ref('new'); // new / existing
const targetCampaignName = ref('SP Launch · 手动收割（自动生成）');
const targetExistingCampaign = ref('');
const matchType = ref('exact');
const bidStrategy = ref('recommended');
const customBid = ref(0.95);
const syncNegatives = ref(true);

const sourceCampaigns = computed(() => mockAdTree.filter((c) => c.targetingType === 'auto'));
const manualCampaigns = computed(() => mockAdTree.filter((c) => c.targetingType === 'manual'));

const filteredCandidates = computed(() => {
  return mockPromotionCandidates
    .filter((t) => t.sourceCampaign === sourceCampaign.value)
    .filter((t) => t.orders30d >= minOrders.value)
    .filter((t) => t.cvr >= minCvr.value);
});

function isSelected(term) {
  return selectedTerms.value.some((t) => t.term === term.term);
}
function toggleTerm(term) {
  const idx = selectedTerms.value.findIndex((t) => t.term === term.term);
  if (idx >= 0) selectedTerms.value.splice(idx, 1);
  else selectedTerms.value.push({ ...term });
}
function selectAll() {
  selectedTerms.value = filteredCandidates.value.map((t) => ({ ...t }));
}

function next() {
  if (step.value === 0 && filteredCandidates.value.length === 0) {
    ElMessage.warning('当前条件下无符合的搜索词，请调整阈值');
    return;
  }
  if (step.value === 1 && selectedTerms.value.length === 0) {
    ElMessage.warning('请至少选择 1 个搜索词');
    return;
  }
  step.value++;
}
function prev() {
  step.value--;
}
async function doSubmit() {
  await submit({
    sourceModule: 'M3',
    actionType: 'PROMOTE_TO_MANUAL',
    target: { type: 'campaign', id: sourceCampaign.value },
    payload: { termCount: selectedTerms.value.length, matchType: matchType.value, syncNegatives: syncNegatives.value, targetMode: targetCampaignMode.value },
    expectedImpact: { metric: 'monthly_sales_lift', change: Math.round(selectedTerms.value.reduce((s, t) => s + t.sales30d, 0) * 0.4) },
    description: `转化 ${selectedTerms.value.length} 个搜索词到手动 Campaign + 源端否定`,
  });
  step.value = 0;
  selectedTerms.value = [];
}
</script>

<template>
  <div>
    <PageHeader title="自动 → 手动 转化向导（GROWTH-1）" subtitle="从自动广告中收割高转化搜索词，迁移到手动精准 Campaign，源端同步否定">
      <template #extra>
        <el-tag type="primary" effect="plain">策略 GROWTH-1</el-tag>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <el-steps :active="step" finish-status="success" class="steps">
        <el-step title="1. 选源 Campaign" description="自动广告 + 时间窗口" />
        <el-step title="2. 选搜索词" description="按订单 / CVR 阈值筛选" />
        <el-step title="3. 配置目标 Campaign" description="新建或选已有手动" />
        <el-step title="4. 否词同步 + 确认" description="源端避免重复花费" />
      </el-steps>

      <!-- Step 1 -->
      <div v-if="step === 0" class="step-body">
        <h3>选源（自动广告）</h3>
        <el-form label-width="120px" label-position="left">
          <el-form-item label="源 Campaign">
            <el-select v-model="sourceCampaign" style="width: 360px">
              <el-option v-for="c in sourceCampaigns" :key="c.id" :label="`${c.name} · ${c.sku}`" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间窗口">
            <el-radio-group v-model="dateRange">
              <el-radio-button :value="14">14 天</el-radio-button>
              <el-radio-button :value="30">30 天（推荐）</el-radio-button>
              <el-radio-button :value="60">60 天</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="最小订单数">
            <el-input-number v-model="minOrders" :min="1" :max="100" />
            <span class="text-muted" style="margin-left: 12px; font-size: 12px">仅展示订单数 ≥ 此值的搜索词</span>
          </el-form-item>
          <el-form-item label="最小 CVR">
            <el-input-number v-model="minCvr" :min="0" :max="1" :step="0.01" :precision="2" />
            <span class="text-muted" style="margin-left: 12px; font-size: 12px">类目均值 ~ 9%</span>
          </el-form-item>
        </el-form>
        <div class="step-foot">
          <el-button type="primary" @click="next">下一步：选搜索词 ({{ filteredCandidates.length }})</el-button>
        </div>
      </div>

      <!-- Step 2 -->
      <div v-if="step === 1" class="step-body">
        <h3>选搜索词</h3>
        <p class="text-muted">来自 <strong>{{ sourceCampaigns.find((c) => c.id === sourceCampaign)?.name }}</strong> 过去 {{ dateRange }} 天 · 共 {{ filteredCandidates.length }} 个候选 · 已选 <strong class="text-primary">{{ selectedTerms.length }}</strong></p>

        <div class="bulk-bar">
          <el-button size="small" @click="selectAll">全选</el-button>
          <el-button size="small" @click="selectedTerms = []">清空</el-button>
        </div>

        <ResponsiveTable :data="filteredCandidates" :mobile-columns="mobileTermCols" stripe>
          <el-table-column label="" width="50">
            <template #default="{ row }">
              <el-checkbox :model-value="isSelected(row)" @change="toggleTerm(row)" />
            </template>
          </el-table-column>
          <el-table-column prop="term" label="搜索词" min-width="220" />
          <el-table-column label="订单 (30d)" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ row.orders30d }}</span></template></el-table-column>
          <el-table-column label="销售 (30d)" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.sales30d, 'USD') }}</span></template></el-table-column>
          <el-table-column label="点击" align="right" width="80"><template #default="{ row }"><span class="tnum">{{ row.clicks30d }}</span></template></el-table-column>
          <el-table-column label="CVR" align="right" width="80">
            <template #default="{ row }"><span class="tnum text-success">{{ formatPercent(row.cvr) }}</span></template>
          </el-table-column>
          <el-table-column label="推荐匹配" width="100">
            <template #default="{ row }"><el-tag size="small" effect="light">{{ row.recommendMatch }}</el-tag></template>
          </el-table-column>
          <el-table-column label="推荐出价" align="right" width="100">
            <template #default="{ row }"><span class="tnum">${{ row.recommendBid }}</span></template>
          </el-table-column>
          <el-table-column label="置信度" width="100" align="right">
            <template #default="{ row }">
              <span class="tnum">{{ Math.round(row.confidence * 100) }}%</span>
            </template>
          </el-table-column>
          <template #mobile-actions="{ row }">
            <el-button size="small" :type="isSelected(row) ? 'primary' : ''" @click="toggleTerm(row)">{{ isSelected(row) ? '已选' : '选择' }}</el-button>
          </template>
        </ResponsiveTable>

        <div class="step-foot">
          <el-button @click="prev">上一步</el-button>
          <el-button type="primary" :disabled="selectedTerms.length === 0" @click="next">下一步：配置目标</el-button>
        </div>
      </div>

      <!-- Step 3 -->
      <div v-if="step === 2" class="step-body">
        <h3>配置目标 Campaign</h3>
        <el-form label-width="140px" label-position="left">
          <el-form-item label="目标 Campaign">
            <el-radio-group v-model="targetCampaignMode">
              <el-radio value="new">新建（推荐）</el-radio>
              <el-radio value="existing">选已有手动</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="targetCampaignMode === 'new'" label="Campaign 名称">
            <el-input v-model="targetCampaignName" style="width: 360px" />
          </el-form-item>
          <el-form-item v-else label="选择现有 Campaign">
            <el-select v-model="targetExistingCampaign" placeholder="请选择" style="width: 360px">
              <el-option v-for="c in manualCampaigns" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>

          <el-form-item label="匹配方式">
            <el-radio-group v-model="matchType">
              <el-radio-button value="exact">精准（推荐）</el-radio-button>
              <el-radio-button value="phrase">词组</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="出价策略">
            <el-radio-group v-model="bidStrategy">
              <el-radio value="recommended">使用 AI 推荐出价（每词不同）</el-radio>
              <el-radio value="custom">统一自定义出价</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="bidStrategy === 'custom'" label="自定义出价">
            <el-input-number v-model="customBid" :min="0.1" :max="10" :step="0.05" :precision="2" />
            <span class="text-muted" style="margin-left: 12px; font-size: 12px">$</span>
          </el-form-item>
        </el-form>

        <h4 class="detail-title">将创建</h4>
        <ResponsiveTable :data="selectedTerms" :mobile-columns="mobileSummaryCols" stripe size="small">
          <el-table-column prop="term" label="关键词" />
          <el-table-column label="匹配" width="80">
            <template #default><el-tag size="small">{{ matchType }}</el-tag></template>
          </el-table-column>
          <el-table-column label="出价" align="right" width="80">
            <template #default="{ row }">
              <span class="tnum">${{ bidStrategy === 'custom' ? customBid : row.recommendBid }}</span>
            </template>
          </el-table-column>
        </ResponsiveTable>

        <div class="step-foot">
          <el-button @click="prev">上一步</el-button>
          <el-button type="primary" @click="next">下一步：否词同步</el-button>
        </div>
      </div>

      <!-- Step 4 -->
      <div v-if="step === 3" class="step-body">
        <h3>否词同步 + 确认</h3>
        <el-alert type="warning" :closable="false" show-icon>
          <template #title>
            <strong>同步否词到源 Campaign：</strong>{{ sourceCampaigns.find((c) => c.id === sourceCampaign)?.name }}
          </template>
          <template #default>
            为避免源 Campaign 继续在这些词上花钱（与新手动 Campaign 重复），系统会在源端自动添加 {{ selectedTerms.length }} 个否定词（exact 匹配）。
            <el-checkbox v-model="syncNegatives" style="margin-left: 8px"><strong>启用否词同步（强烈推荐）</strong></el-checkbox>
          </template>
        </el-alert>

        <h4 class="detail-title">摘要</h4>
        <el-descriptions :column="1" border size="default">
          <el-descriptions-item label="源 Campaign">{{ sourceCampaigns.find((c) => c.id === sourceCampaign)?.name }}</el-descriptions-item>
          <el-descriptions-item label="目标 Campaign">{{ targetCampaignMode === 'new' ? `新建：${targetCampaignName}` : manualCampaigns.find(c => c.id === targetExistingCampaign)?.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="搜索词数量">{{ selectedTerms.length }}</el-descriptions-item>
          <el-descriptions-item label="匹配方式">{{ matchType }}</el-descriptions-item>
          <el-descriptions-item label="出价策略">{{ bidStrategy === 'recommended' ? 'AI 推荐（每词不同）' : `统一 $${customBid}` }}</el-descriptions-item>
          <el-descriptions-item label="否词同步">{{ syncNegatives ? '✓ 启用（推荐）' : '✗ 不启用（不推荐）' }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="detail-title">预期影响</h4>
        <el-row :gutter="12">
          <el-col :xs="24" :sm="8"><div class="impact-cell">+ <strong class="tnum text-success">{{ Math.round(selectedTerms.reduce((s, t) => s + t.sales30d, 0) * 0.4) }}</strong> /月 销售提升<small>手动精准比自动效率高 30-50%</small></div></el-col>
          <el-col :xs="24" :sm="8"><div class="impact-cell">- <strong class="tnum text-success">${{ Math.round(selectedTerms.reduce((s, t) => s + t.clicks30d * 0.5, 0)) }}</strong> /月 浪费节省<small>源端否词后避免重复</small></div></el-col>
          <el-col :xs="24" :sm="8"><div class="impact-cell"><strong class="tnum">{{ selectedTerms.length }}</strong> 个新关键词<small>手动可控、可优化、可分时段</small></div></el-col>
        </el-row>

        <div class="step-foot">
          <el-button @click="prev">上一步</el-button>
          <el-button type="primary" :icon="'CircleCheckFilled'" @click="doSubmit">确认提交（进入审计中心）</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.steps { padding: 20px 0; border-bottom: 1px dashed var(--line-soft); }
.step-body { padding: 24px 12px; }
.step-body h3 { font-size: 18px; margin: 0 0 16px; }
.step-foot { margin-top: 24px; padding-top: 16px; border-top: 1px dashed var(--line-soft); display: flex; justify-content: flex-end; gap: 8px; }
.detail-title { font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 24px 0 12px; letter-spacing: 0.04em; text-transform: uppercase; }
.bulk-bar { display: flex; gap: 8px; padding: 8px 0; }
.text-primary { color: var(--primary); }
.impact-cell { padding: 16px; background: #f9fafb; border-radius: 6px; text-align: center; }
.impact-cell strong { display: block; font-size: 22px; margin: 4px 0; }
.impact-cell small { display: block; color: var(--text-muted); margin-top: 6px; font-size: 11px; }
</style>
