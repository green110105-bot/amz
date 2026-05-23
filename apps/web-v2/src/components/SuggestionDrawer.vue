<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useStrategies, useSuggestions } from '../composables/useAdsState';
import { useCampaigns } from '../composables/useLxState';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  suggestion: { type: Object, default: null },
});
const emit = defineEmits(['update:modelValue', 'execute', 'reject']);
const router = useRouter();

const { getById: getStrategy } = useStrategies();
const { list: suggestions } = useSuggestions();
const { getById: getCampaignById } = useCampaigns();

const s = computed(() => props.suggestion);

// 来源策略详情
const sourceStrategy = computed(() => {
  if (!s.value?.sourceStrategyId) return null;
  return getStrategy(s.value.sourceStrategyId);
});

// 同策略最近 5 条建议
const sameStrategyHistory = computed(() => {
  if (!s.value?.sourceStrategyId) return [];
  return suggestions.value
    .filter((x) => x.sourceStrategyId === s.value.sourceStrategyId && x.id !== s.value.id)
    .slice(0, 5);
});

// 找到对应的 lx Campaign (按 SKU 匹配)
const targetCampaign = computed(() => {
  const sku = s.value?.entity?.sku;
  if (!sku) return null;
  // 通过 campaign 名字关键词推断匹配 — 失败则取第一个有缓存的 campaign
  const campaignName = s.value?.entity?.campaign || '';
  const portfolioGuess = campaignName.includes('CASE') ? 'pf-001'
    : campaignName.includes('CABLE') ? 'pf-003'
    : (campaignName.includes('LAMP') || campaignName.toLowerCase().includes('lamp')) ? 'pf-004'
    : null;
  // 先尝试通过 entity.campaign id 直接查
  if (s.value?.entity?.campaignId) {
    return getCampaignById(s.value.entity.campaignId);
  }
  return null;
});

function close() { emit('update:modelValue', false); }

function gotoSourceStrategy() {
  router.push({ path: '/ads/strategies', query: { focus: s.value.sourceStrategyId } });
  close();
}

function gotoLxCampaign() {
  if (!targetCampaign.value) {
    ElMessage.warning('未匹配到对应的 lx Campaign');
    return;
  }
  router.push(`/ads/lx/campaigns/${targetCampaign.value.id}?g=ad-groups`);
  close();
}

function muteStrategy() {
  ElMessage.success(`已静音"${sourceStrategy.value?.name}" 7 天 · 期间不再触发同类建议`);
}

function jumpToTarget(alt) {
  if (alt.target === 'M1') {
    router.push('/listings/optimize');
    close();
  } else if (alt.target === 'M2') {
    router.push('/inventory/slow-moving');
    close();
  } else {
    emit('execute', { ...s.value, chosenAlternative: alt });
  }
}

const signalColor = {
  good: '#10b981',
  bad: '#ef4444',
  info: '#6b7280',
};
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    direction="rtl"
    size="640px"
    :with-header="false"
  >
    <div v-if="s" class="drawer">
      <!-- 头 -->
      <div class="dh">
        <div class="dh-left">
          <el-tag size="small" effect="dark" :style="{ background: s.severity?.color, borderColor: s.severity?.color }">
            {{ s.severity?.label }}
          </el-tag>
          <el-tag size="small" effect="plain" :style="{ color: s.actionType?.color, borderColor: s.actionType?.color }">
            <el-icon v-if="s.actionType?.icon" style="margin-right: 4px"><component :is="s.actionType.icon" /></el-icon>{{ s.actionType?.label }}
          </el-tag>
          <el-tag v-if="s.crossModule" size="small" type="warning" effect="dark">🔗 跨 {{ s.crossModule }}</el-tag>
        </div>
        <el-button :icon="'Close'" circle plain size="small" @click="close" />
      </div>

      <h2 class="dt-title">{{ s.title }}</h2>
      <p class="dt-summary">{{ s.detail }}</p>

      <!-- 来源策略嵌入区块 -->
      <section v-if="sourceStrategy" class="strategy-block">
        <div class="sb-head">
          <el-tag size="small" effect="dark" style="background: #8b5cf6; border-color: #8b5cf6">🔮 来源策略</el-tag>
          <strong>{{ sourceStrategy.name }}</strong>
          <span class="spacer" />
          <el-tag size="small" :style="{ background: sourceStrategy.categoryColor + '20', color: sourceStrategy.categoryColor, borderColor: 'transparent' }">
            {{ sourceStrategy.categoryEmoji }} {{ (sourceStrategy.categoryLabel || '').split(' · ')[1] }}
          </el-tag>
          <el-tag size="small" effect="plain">{{ ({ manual: '手动', semi: '半自动', auto: '全自动' })[sourceStrategy.sovereignty] }}</el-tag>
        </div>
        <div class="sb-stats">
          <span>该策略累计触发 <strong>{{ sourceStrategy.triggerCount || 0 }}</strong> 次</span>
          <span v-if="sourceStrategy.successRate !== null && sourceStrategy.successRate !== undefined">· 成功率 <strong :style="{ color: sourceStrategy.successRate > 0.7 ? '#10b981' : '#f59e0b' }">{{ Math.round(sourceStrategy.successRate * 100) }}%</strong></span>
          <span>· 已绑定 <strong>{{ sourceStrategy.bindingsCount || 0 }}</strong> 实体</span>
        </div>
        <div class="sb-actions">
          <el-button size="small" link type="primary" :icon="'Right'" @click="gotoSourceStrategy">查看策略详情</el-button>
          <el-button size="small" link :icon="'Mute'" @click="muteStrategy">7 天内静音该策略</el-button>
        </div>
      </section>

      <!-- 实体身份卡 -->
      <div class="id-card">
        <div v-if="s.entity?.sku" class="id-row">
          <span class="id-k">SKU</span>
          <strong>{{ s.entity.sku }}</strong>
          <span class="id-asin">{{ s.entity.asin }}</span>
        </div>
        <div v-if="s.entity?.keyword && s.entity.keyword !== '—'" class="id-row">
          <span class="id-k">关键词</span>
          <strong><i>"{{ s.entity.keyword }}"</i></strong>
        </div>
        <div v-if="s.entity?.campaign && s.entity.campaign !== 'multi-campaign' && s.entity.campaign !== '新建'" class="id-row">
          <span class="id-k">Campaign</span>
          <strong>{{ s.entity.campaign }}</strong>
          <span v-if="s.entity.adGroup" class="id-ag">/ {{ s.entity.adGroup }}</span>
        </div>
        <div class="id-row">
          <span class="id-k">三轴</span>
          <el-tag size="small" type="primary" effect="plain">阶段 · {{ s.lifecycle }}</el-tag>
          <el-tag size="small" effect="plain">类目 · {{ s.category }}</el-tag>
          <el-tag v-for="t in (s.strategicTags || [])" :key="t" size="small" type="warning" effect="plain">标签 · {{ t }}</el-tag>
          <el-tag v-if="!(s.strategicTags || []).length" size="small" effect="plain" type="info">无战略标签</el-tag>
        </div>
      </div>

      <!-- 证据链 -->
      <section class="section">
        <h3 class="sh">📋 证据链（{{ s.evidence?.length || 0 }} 条）</h3>
        <div class="evidence">
          <div v-for="(e, i) in (s.evidence || [])" :key="i" class="ev-row">
            <span class="ev-dot" :style="{ background: signalColor[e.signal] }" />
            <span class="ev-label">{{ e.label }}</span>
            <strong class="ev-value" :style="{ color: signalColor[e.signal] }">{{ e.value }}</strong>
            <span class="ev-baseline" v-if="e.baseline">{{ e.baseline }}</span>
          </div>
        </div>
      </section>

      <!-- 跨模块 / 替代建议（按价值排序） -->
      <section v-if="(s.alternatives || []).length" class="section">
        <h3 class="sh">🎯 行动方案（按价值排序）</h3>
        <div class="alts">
          <div
            v-for="(alt, i) in s.alternatives"
            :key="i"
            class="alt-row"
            :class="{ primary: alt.primary, 'cross-m': alt.target }"
          >
            <div class="alt-rank">{{ i + 1 }}</div>
            <div class="alt-body">
              <div class="alt-h">
                <strong>{{ alt.label }}</strong>
                <el-tag v-if="alt.target" size="small" type="warning" effect="dark">→ 跳 {{ alt.target }}</el-tag>
                <el-tag v-if="alt.primary" size="small" type="success" effect="dark">首选</el-tag>
              </div>
              <div class="alt-meta">
                <span class="alt-impact">{{ alt.impact }}</span>
                <span v-if="alt.risk" class="alt-risk">⚠ {{ alt.risk }}</span>
              </div>
            </div>
            <el-button
              :type="alt.primary ? 'primary' : 'default'"
              size="small"
              @click="jumpToTarget(alt)"
            >
              {{ alt.target ? '跳到 ' + alt.target : '执行' }}
            </el-button>
          </div>
        </div>
      </section>

      <!-- 跨页跳转：去广告组合查看 (内嵌 mini-data 预览) -->
      <section v-if="targetCampaign" class="section">
        <h3 class="sh">📦 在广告组合中的实时状态（就地预览）</h3>
        <div class="lx-preview">
          <div class="lx-head">
            <div class="lx-name">
              <el-tag size="small" effect="plain">{{ targetCampaign.type }} - {{ targetCampaign.targetingType }}</el-tag>
              <strong>{{ targetCampaign.name }}</strong>
            </div>
            <div class="lx-status">
              <span :style="{ color: targetCampaign.serviceStateColor || '#10b981' }">●</span>
              {{ targetCampaign.serviceState }}
            </div>
          </div>

          <!-- mini-table 4 列 -->
          <div class="lx-grid">
            <div class="lx-cell">
              <span class="cl">日预算</span>
              <strong>${{ targetCampaign.dailyBudget }}</strong>
            </div>
            <div class="lx-cell">
              <span class="cl">7d 花费</span>
              <strong>${{ (targetCampaign.spend ?? 0).toFixed(2) }}</strong>
            </div>
            <div class="lx-cell">
              <span class="cl">7d ACoS</span>
              <strong :class="targetCampaign.acos > 0.5 ? 'danger' : targetCampaign.acos < 0.3 ? 'good' : ''">
                {{ targetCampaign.acos ? (targetCampaign.acos * 100).toFixed(1) + '%' : '—' }}
              </strong>
            </div>
            <div class="lx-cell">
              <span class="cl">7d ROAS</span>
              <strong>{{ targetCampaign.roas?.toFixed(2) ?? '—' }}</strong>
            </div>
            <div class="lx-cell">
              <span class="cl">7d 订单</span>
              <strong>{{ targetCampaign.orders ?? 0 }}</strong>
            </div>
            <div class="lx-cell">
              <span class="cl">CTR</span>
              <strong>{{ targetCampaign.ctr ? (targetCampaign.ctr * 100).toFixed(2) + '%' : '—' }}</strong>
            </div>
            <div class="lx-cell">
              <span class="cl">CVR</span>
              <strong>{{ targetCampaign.cvr ? (targetCampaign.cvr * 100).toFixed(1) + '%' : '—' }}</strong>
            </div>
            <div class="lx-cell">
              <span class="cl">CPC</span>
              <strong>${{ targetCampaign.cpc?.toFixed(2) ?? '—' }}</strong>
            </div>
          </div>

          <div class="lx-foot">
            <span class="text-muted">↑ 这是该 Campaign 的实时数据 · 不离开就能判断</span>
            <el-button type="primary" size="small" :icon="'Right'" @click="gotoLxCampaign">
              进入 lx3 完整查看
            </el-button>
          </div>
        </div>
      </section>

      <!-- 同策略最近建议 -->
      <section v-if="sameStrategyHistory.length" class="section">
        <h3 class="sh">📚 同策略最近 {{ sameStrategyHistory.length }} 条建议</h3>
        <div class="hist-list">
          <div v-for="h in sameStrategyHistory" :key="h.id" class="hist-row">
            <el-tag size="small" effect="dark" :style="{ background: h.severity?.color, borderColor: h.severity?.color, fontSize: '10px' }">{{ h.severity?.label }}</el-tag>
            <span class="hist-time">{{ new Date(h.timeBucket).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</span>
            <span class="hist-title">{{ (h.title || '').replace('建议：', '').replace('已采纳：', '').replace('已忽略：', '') }}</span>
            <el-tag size="small" :type="({ pending: 'warning', observing: 'primary', rejected: 'info', accepted: 'success' })[h.state]" effect="light">
              {{ ({ pending: '待处理', observing: '观察中', rejected: '已忽略', accepted: '已采纳' })[h.state] }}
            </el-tag>
          </div>
        </div>
      </section>

      <!-- 状态机 -->
      <section class="section">
        <h3 class="sh">🔄 状态机</h3>
        <el-steps :active="s.state === 'pending' ? 0 : s.state === 'observing' ? 1 : 2" finish-status="success" simple>
          <el-step title="提议" :description="`待你决定`" />
          <el-step title="观察期" :description="`${s.observationWindowHours}h 内不重复触发`" />
          <el-step title="效果反馈" description="数据回流后判定" />
        </el-steps>
        <div class="state-info">
          <p>· 同实体观察期内 AI 不会重复出同类建议</p>
          <p>· 冷却期：{{ s.cooldownHours }}h；观察期：{{ s.observationWindowHours }}h</p>
          <p v-if="s.state === 'observing' && s.acceptedAt">· 采纳于 {{ new Date(s.acceptedAt).toLocaleString('zh-CN') }}</p>
        </div>
      </section>

      <!-- 底部固定动作 -->
      <div v-if="s.state === 'pending'" class="drawer-foot">
        <el-button size="large" plain @click="emit('reject', s); close()">忽略</el-button>
        <el-button size="large" type="primary" @click="emit('execute', s); close()">
          <el-icon><Check /></el-icon>立即采纳首选方案
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer {
  padding: 4px 20px 80px;
}
.dh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.dh-left { display: flex; gap: 6px; }
.dt-title { font-size: 18px; margin: 0 0 6px; font-weight: 600; }
.dt-summary { margin: 0 0 16px; font-size: 13px; color: var(--text-muted); line-height: 1.6; }

.id-card {
  background: #f9fafb;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 18px;
}
.id-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  flex-wrap: wrap;
}
.id-k {
  color: var(--text-muted);
  font-size: 11px;
  min-width: 60px;
}
.id-asin {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--text-muted);
}
.id-ag {
  color: var(--text-muted);
  font-size: 12px;
}

.section {
  margin-bottom: 22px;
}
.sh {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 10px;
  color: var(--text);
}

.evidence {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ev-row {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  background: #f9fafb;
  border-radius: 4px;
  font-size: 13px;
}
.ev-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.ev-label { color: var(--text); }
.ev-value { font-weight: 600; }
.ev-baseline {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

.alts { display: flex; flex-direction: column; gap: 8px; }
.alt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.alt-row.primary { border-color: var(--primary); background: #eff6ff; }
.alt-row.cross-m { background: #fffbeb; }
.alt-rank {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--text-muted);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.alt-row.primary .alt-rank { background: var(--primary); }
.alt-body { flex: 1; }
.alt-h {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.alt-h strong { font-size: 13px; }
.alt-meta { font-size: 12px; }
.alt-impact { color: #10b981; font-weight: 600; }
.alt-risk { color: var(--text-muted); margin-left: 8px; }

.state-info {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.7;
}
.state-info p { margin: 0; }

.drawer-foot {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 20px;
  background: #fff;
  border-top: 1px solid var(--line);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.strategy-block {
  margin-bottom: 18px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #ede9fe 0%, #eef2ff 100%);
  border: 1px solid #c7d2fe;
  border-radius: 8px;
}
.sb-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.sb-head strong {
  font-size: 13px;
  color: var(--text);
}
.sb-head .spacer { flex: 1; }
.sb-stats {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.sb-stats strong {
  color: var(--text);
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.sb-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px dashed #c7d2fe;
}

.lx-preview {
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  overflow: hidden;
}
.lx-head {
  padding: 10px 14px;
  background: linear-gradient(90deg, #eff6ff 0%, #dbeafe 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.lx-name {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.lx-name strong {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lx-status {
  font-size: 12px;
  color: var(--text-muted);
}
.lx-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid #bfdbfe;
}
.lx-cell {
  padding: 10px 12px;
  border-right: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lx-cell:nth-child(4n) { border-right: none; }
.lx-cell:nth-last-child(-n+4) { border-bottom: none; }
.lx-cell .cl { font-size: 11px; color: var(--text-muted); }
.lx-cell strong {
  font-size: 14px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
.lx-cell strong.danger { color: #ef4444; }
.lx-cell strong.good { color: #10b981; }
.lx-foot {
  padding: 10px 14px;
  background: #fafbfc;
  border-top: 1px solid var(--line-soft);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.text-muted { color: var(--text-muted); font-size: 11px; }

.hist-list { display: flex; flex-direction: column; gap: 4px; }
.hist-row {
  display: grid;
  grid-template-columns: 36px 100px 1fr 70px;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  background: #fafbfc;
  border-radius: 4px;
  font-size: 12px;
}
.hist-time {
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.hist-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
