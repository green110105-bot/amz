<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useKwGrabbing } from '../../../composables/useLxState';
import { useAudit } from '../../../composables/useAudit';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';
import ResponsiveDialog from '../../../components/ResponsiveDialog.vue';

const mobileCols = [
  { prop: 'term', label: '关键词' },
  { prop: 'targetPos', label: '目标位' },
  { prop: 'currentPos', label: '当前位', formatter: (v) => v ? '#' + v.toFixed(1) : '--' },
  { prop: 'currentBid', label: '当前 bid', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'suggestedBid', label: '建议 bid', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
];

const router = useRouter();
const { submit } = useAudit();
const props = defineProps({ campaign: Object });

const { list: rows, fetch, create, applyBid: applyBidApi, update } = useKwGrabbing(props.campaign.id);

onMounted(() => { fetch(); });

const showAdd = ref(false);
const newKw = ref({ term: '', targetPos: 'top3' });

async function addKwGrab() {
  if (!newKw.value.term) return ElMessage.warning('请输入关键词');
  await create({
    campaignId: props.campaign.id,
    term: newKw.value.term,
    matchType: 'phrase',
    currentPos: null,
    targetPos: newKw.value.targetPos,
    currentBid: 0.5,
    suggestedBid: 1.0,
    trend: [null, null, null, null, null, null, null],
    state: 'pending',
    successProb: null,
  });
  showAdd.value = false;
  newKw.value = { term: '', targetPos: 'top3' };
}

async function applyBid(row) {
  await submit({
    sourceModule: 'M3',
    actionType: 'KEYWORD_RANK_GRABBING',
    target: { type: 'keyword', term: row.term, sku: props.campaign.id },
    payload: {
      term: row.term,
      oldBid: row.currentBid,
      newBid: row.suggestedBid,
      targetPos: row.targetPos,
    },
    description: `关键词抢位调价：${row.term} bid $${row.currentBid} → $${row.suggestedBid}（目标 ${row.targetPos}）`,
  });
  await applyBidApi(row);
}

async function pauseGrabbing(row) {
  const next = row.state === 'paused' ? 'active' : 'paused';
  await update(row, { state: next });
  ElMessage.success(next === 'paused' ? '已暂停抢位' : '已恢复抢位');
}

const stateMeta = {
  active: { label: '抢位中', color: '#3b82f6' },
  pending: { label: '观察中', color: '#f59e0b' },
  paused: { label: '已暂停', color: '#94a3b8' },
  achieved: { label: '已达成', color: '#10b981' },
};

// sparkline
function trendPath(trend) {
  if (!trend?.length) return '';
  const valid = trend.filter(v => v !== null && v !== undefined);
  if (!valid.length) return '';
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const range = max - min || 1;
  const points = trend.map((v, i) => {
    if (v === null || v === undefined) return null;
    const x = (i / (trend.length - 1)) * 80;
    const y = 20 - ((v - min) / range) * 16;
    return `${x},${y}`;
  }).filter(Boolean);
  return 'M ' + points.join(' L ');
}

const targetPosLabel = (t) => ({ top1: '第 1 位', top3: 'top 3', top10: '前 10', topPage1: '首页' })[t] || t;
</script>

<template>
  <!-- AI 引导横幅 -->
  <div class="ai-hint">
    <span class="ai-icon">🎯</span>
    <div class="ai-text">
      <strong>关键词抢位 · 领星灵魂功能</strong>
      <span>指定目标页位 (top 1 / top 3 / 首页 / 前 10) · AI 算出该位置需要的 bid · 14 天评估成功率</span>
    </div>
    <el-button size="small" type="primary" @click="showAdd = true">+ 添加抢位词</el-button>
  </div>

  <div class="kpi-row">
    <div class="kpi-cell">
      <span class="kl">抢位中</span>
      <strong class="kv">{{ rows.filter(r => r.state === 'active').length }}</strong>
    </div>
    <div class="kpi-cell">
      <span class="kl">已达成</span>
      <strong class="kv good">{{ rows.filter(r => r.state === 'achieved').length }}</strong>
    </div>
    <div class="kpi-cell">
      <span class="kl">观察中</span>
      <strong class="kv">{{ rows.filter(r => r.state === 'pending').length }}</strong>
    </div>
    <div class="kpi-cell">
      <span class="kl">已暂停</span>
      <strong class="kv">{{ rows.filter(r => r.state === 'paused').length }}</strong>
    </div>
    <div class="kpi-cell">
      <span class="kl">平均成功概率</span>
      <strong class="kv">
        {{ rows.filter(r => r.successProb).length
          ? Math.round(rows.filter(r => r.successProb).reduce((s, r) => s + r.successProb, 0) / rows.filter(r => r.successProb).length * 100)
          : 0 }}%
      </strong>
    </div>
  </div>

  <ResponsiveTable :data="rows" :mobile-columns="mobileCols" stripe border size="small">
    <el-table-column label="状态" width="80">
      <template #default="{ row }">
        <el-tag size="small" :style="{ background: (stateMeta[row.state]?.color || '#94a3b8') + '20', color: stateMeta[row.state]?.color, borderColor: 'transparent' }">
          {{ stateMeta[row.state]?.label || row.state }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="关键词" min-width="220">
      <template #default="{ row }">
        <strong>{{ row.term }}</strong>
        <span style="font-size: 11px; color: var(--text-muted); margin-left: 6px">{{ row.matchType }}</span>
      </template>
    </el-table-column>
    <el-table-column label="目标位" width="100">
      <template #default="{ row }">
        <el-tag size="small" type="info" effect="plain">🎯 {{ targetPosLabel(row.targetPos) }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="当前位" width="90" align="right">
      <template #default="{ row }">
        <strong v-if="row.currentPos">#{{ row.currentPos.toFixed(1) }}</strong>
        <span v-else class="text-muted">—</span>
      </template>
    </el-table-column>
    <el-table-column label="14d 趋势" width="100">
      <template #default="{ row }">
        <svg viewBox="0 0 80 20" style="width: 80px; height: 20px">
          <path :d="trendPath(row.trend)" stroke="#3b82f6" stroke-width="1.5" fill="none" />
        </svg>
      </template>
    </el-table-column>
    <el-table-column label="当前 bid" width="90" align="right">
      <template #default="{ row }">${{ (row.currentBid ?? 0).toFixed(2) }}</template>
    </el-table-column>
    <el-table-column label="建议 bid" width="100" align="right">
      <template #default="{ row }">
        <strong class="suggested">${{ (row.suggestedBid ?? 0).toFixed(2) }}</strong>
        <span class="delta" v-if="row.currentBid">{{ ((row.suggestedBid / row.currentBid - 1) * 100).toFixed(0) }}%</span>
      </template>
    </el-table-column>
    <el-table-column label="成功概率" width="100" align="right">
      <template #default="{ row }">
        <span v-if="row.successProb" :class="row.successProb > 0.7 ? 'good' : row.successProb > 0.5 ? 'warn' : 'danger'">
          {{ Math.round(row.successProb * 100) }}%
        </span>
        <span v-else class="text-muted">—</span>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="180" fixed="right">
      <template #default="{ row }">
        <el-button v-if="row.state !== 'achieved'" size="small" link type="primary" @click="applyBid(row)">应用建议</el-button>
        <el-button size="small" link @click="pauseGrabbing(row)">{{ row.state === 'paused' ? '恢复' : '暂停' }}</el-button>
      </template>
    </el-table-column>
    <template #mobile-actions="{ row }">
      <el-button v-if="row.state !== 'achieved'" size="small" type="primary" @click="applyBid(row)">应用建议</el-button>
      <el-button size="small" @click="pauseGrabbing(row)">{{ row.state === 'paused' ? '恢复' : '暂停' }}</el-button>
    </template>
  </ResponsiveTable>

  <ResponsiveDialog v-model="showAdd" title="添加抢位关键词" width="500px">
    <el-form label-width="100px">
      <el-form-item label="关键词">
        <el-input v-model="newKw.term" placeholder="如：ice cream maker" />
      </el-form-item>
      <el-form-item label="目标位置">
        <el-radio-group v-model="newKw.targetPos">
          <el-radio value="top1">第 1 位</el-radio>
          <el-radio value="top3">前 3 位</el-radio>
          <el-radio value="topPage1">首页</el-radio>
          <el-radio value="top10">前 10 位</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAdd = false">取消</el-button>
      <el-button type="primary" @click="addKwGrab">添加并开始抢位</el-button>
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.ai-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(90deg, #fef3c7 0%, #fce7f3 100%);
  border: 1px solid #fcd34d;
  border-radius: 6px;
  margin-bottom: 14px;
}
.ai-icon { font-size: 24px; }
.ai-text { flex: 1; }
.ai-text strong { display: block; font-size: 13px; margin-bottom: 2px; }
.ai-text span { font-size: 12px; color: var(--text-muted); }

.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
@media (max-width: 767px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .ai-hint { flex-direction: column; align-items: stretch; gap: 8px; }
}
.kpi-cell {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 10px 14px;
}
.kl { font-size: 11px; color: var(--text-muted); display: block; }
.kv { font-size: 22px; font-weight: 700; font-family: ui-monospace, monospace; display: block; }
.kv.good { color: #10b981; }

.suggested { color: var(--primary); font-weight: 700; }
.delta { font-size: 10px; color: var(--text-muted); margin-left: 4px; }
.good { color: #10b981; }
.warn { color: #f59e0b; }
.danger { color: #ef4444; }
.text-muted { color: var(--text-muted); }
</style>
