<script setup>
import { computed, ref, markRaw, provide } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useStrategies, useSuggestions } from '../composables/useAdsState';
import { useCampaigns } from '../composables/useLxState';
import { strategiesApi } from '../api/ads-strategies';
import TabDaily from './ad-drawer-tabs/TabDaily.vue';
import TabHistory from './ad-drawer-tabs/TabHistory.vue';
import TabCompare from './ad-drawer-tabs/TabCompare.vue';

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

// M3-P1-15: refreshKey provide/inject so child tabs re-fetch on demand (bumping the key
// forces a real re-fetch in each lazy tab, instead of the old no-op refresh).
const refreshKey = ref(0);
provide('drawerRefreshKey', refreshKey);
function refreshTabs() { refreshKey.value++; }

// M3-P2-22 / adanalysisdrawer-lazy: the analysis tabs are rendered lazily — only the
// active tab's component is mounted (no v-for over all panels), so a heavy tab is not
// built until selected. currentTab is a single computed object, never an array.
const tabs = [
  { key: 'daily', label: '天数据', component: markRaw(TabDaily) },
  { key: 'compare', label: '对比', component: markRaw(TabCompare) },
  { key: 'history', label: '历史', component: markRaw(TabHistory) },
];
const activeTab = ref('daily');
const currentTab = computed(() => tabs.find(t => t.key === activeTab.value) || null);

// M3-P1-15: each mock tab carries a '示例数据' watermark — driven by source meta below.

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

// M3-P2-22: match the lx Campaign by a real id only. The old name-keyword portfolioGuess
// (CASE/CABLE/LAMP -> pf-xxx) was dead/unfounded and is removed. If there is no
// campaignId match we return null and the UI shows a降级 placeholder (no fabricated link).
const targetCampaign = computed(() => {
  const campaignId = s.value?.entity?.campaignId;
  if (!campaignId) return null;
  return getCampaignById(campaignId) || null;
});
// Whether we have a campaign reference at all (drives the placeholder vs. preview).
const hasCampaignRef = computed(() => !!s.value?.entity?.campaignId);

// X-P0-06: a real-write origin record may NOT be auto-reverted. The drawer reflects this
// by gating the action copy (real-write -> '申请人工回滚' blocked state).
const isRealWriteRecord = computed(() => {
  const at = s.value?.actionType?.value || s.value?.actionType || '';
  return s.value?.status === 'real_write_success' || at === 'ACTION_QUEUE_REAL_WRITE';
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

// M3-P2-22: muteStrategy must hit a real backend endpoint (no local-only fake success).
// If the strategy mute endpoint is not available, surface the failure honestly instead of
// claiming success.
const muteSupported = computed(() => typeof strategiesApi?.mute === 'function');
async function muteStrategy() {
  if (!muteSupported.value) {
    ElMessage.info('静音功能即将上线');
    return;
  }
  const id = sourceStrategy.value?.id;
  if (!id) return;
  try {
    await strategiesApi.mute(id, { days: 7 });
    ElMessage.success(`已静音"${sourceStrategy.value?.name}" 7 天`);
  } catch (e) {
    ElMessage.error('静音失败：' + (e?.message || e));
  }
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

function gotoEvidence(ref) {
  if (!ref?.routePath) {
    ElMessage.warning('该证据暂未映射到可跳转页面');
    return;
  }
  router.push({ path: ref.routePath, query: ref.routeQuery || {} });
  close();
}

const signalColor = {
  good: '#10b981',
  bad: '#ef4444',
  info: '#6b7280',
};

const typedAction = computed(() => s.value?.typedAction || null);
const evidenceRefs = computed(() => s.value?.evidenceRefs || []);
const guardrail = computed(() => s.value?.guardrail || null);
const rollback = computed(() => s.value?.rollback || s.value?.rollbackPlan || null);
const sourceMeta = computed(() => s.value?.sourceMeta || null);
const confidenceBreakdown = computed(() => s.value?.confidenceBreakdown || null);

// AUTH-15(b): drive real-vs-mock rendering from source meta, NOT readiness.
// When sourceMeta.source is 'mock'/'fixture' (or real writes are disabled), this
// is fixture data — show a warning + "数据来源: Mock Fixture" tag and never a
// real-data green badge.
const isMockSource = computed(() => {
  const src = String(sourceMeta.value?.source || '').toLowerCase();
  if (src === 'mock' || src === 'fixture') return true;
  if (sourceMeta.value && sourceMeta.value.realWriteEnabled === false && (src === '' || src === 'lx-ui' || src === 'lx-route')) return true;
  return false;
});
const sourceLabel = computed(() => (isMockSource.value ? '数据来源: Mock Fixture' : '数据来源: 真实同步'));

// X-P1-01: when source/freshness are absent we must NOT poison-default to a mock
// label (that would falsely brand real-but-unlabeled data as mock). The honest
// default is 'unknown' — "来源未知，真假不可断言" — rendered with a warning-orange badge.
const sourceDisplay = computed(() => sourceMeta.value?.adapter || sourceMeta.value?.source || 'unknown');
const freshnessDisplay = computed(() => sourceMeta.value?.freshness || 'unknown');
const isUnknownSource = computed(() => !isMockSource.value && (
  !sourceMeta.value || (!sourceMeta.value.freshness && !sourceMeta.value.source && !sourceMeta.value.adapter)
));

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return Math.round(Number(v) * 100) + '%';
}

function guardrailTagType(status) {
  return ({ passed: 'success', needs_review: 'warning', blocked: 'danger' })[status] || 'info';
}

function compactJson(v) {
  try { return JSON.stringify(v || {}); } catch { return '{}'; }
}
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

      <!-- M3-P2-22 / adanalysisdrawer-lazy: lazy analysis tabs — only the active tab's
           component is mounted (no v-for over all panels). -->
      <section class="section analysis-tabs">
        <div class="at-nav">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="at-tab"
            :class="{ active: activeTab === t.key }"
            @click="activeTab = t.key"
          >{{ t.label }}</button>
          <span class="spacer" />
          <el-button size="small" link :icon="'Refresh'" @click="refreshTabs">刷新</el-button>
        </div>
        <div v-if="currentTab" class="at-panel">
          <component :is="currentTab.component" :entity="s?.entity || {}" :key="activeTab + '-' + refreshKey" />
        </div>
      </section>

      <!-- X-P0-06: real-write origin records can NOT be auto-reverted -->
      <div v-if="isRealWriteRecord" class="realwrite-revert-notice">
        <el-button size="small" type="danger" plain disabled>申请人工回滚</el-button>
        <span class="rw-note">真实写记录不支持一键自动回滚,请走人工回滚工单</span>
      </div>

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

      <!-- Strategy OS execution contract -->
      <section class="section contract-section">
        <h3 class="sh">🧭 标准动作契约</h3>
        <div class="contract-grid">
          <div class="contract-box">
            <span class="ck">TypedAction</span>
            <strong>{{ typedAction?.actionPrimitiveLabel || typedAction?.actionPrimitive || s.actionType?.label }}</strong>
            <p>{{ typedAction?.executionMode || 'sandbox_audit_first' }} · dry-run={{ typedAction?.dryRun ? 'true' : 'false' }}</p>
          </div>
          <div class="contract-box">
            <span class="ck">Guardrail</span>
            <strong>
              <el-tag size="small" :type="guardrailTagType(guardrail?.status)" effect="light">
                {{ guardrail?.statusLabel || guardrail?.status || '待复核' }}
              </el-tag>
            </strong>
            <p>{{ guardrail?.automationLevel || 'L2' }} · maxRisk={{ guardrail?.maxRisk || 'medium' }} · 真写={{ sourceMeta?.realWriteEnabled ? '开启' : '关闭' }}</p>
          </div>
          <div class="contract-box">
            <span class="ck">Rollback</span>
            <strong>{{ rollback?.methodLabel || rollback?.method || '待生成' }}</strong>
            <p>{{ rollback?.reversible ? `${rollback.windowDays} 天窗口` : '无需回滚' }} · {{ rollback?.auditTrail || 'audit_logs' }}</p>
          </div>
        </div>
        <div v-if="typedAction" class="typed-detail">
          <div><span>实体路径</span><code>{{ compactJson(typedAction.entityPath) }}</code></div>
          <div><span>当前值</span><code>{{ compactJson(typedAction.currentValue) }}</code></div>
          <div><span>建议值</span><code>{{ compactJson(typedAction.recommendedValue) }}</code></div>
          <div><span>变化量</span><code>{{ compactJson(typedAction.delta) }}</code></div>
        </div>
        <div v-if="guardrail?.reasonLabels?.length" class="guardrail-reasons">
          <el-tag v-for="r in guardrail.reasonLabels" :key="r" size="small" effect="plain" type="warning">{{ r }}</el-tag>
        </div>
      </section>

      <section class="section">
        <h3 class="sh">🧾 EvidenceRef（{{ evidenceRefs.length }} 条，可映射领星/Ads API）</h3>
        <div class="eref-list">
          <div v-for="ref in evidenceRefs" :key="ref.id" class="eref-row">
            <div>
              <strong>{{ ref.surfaceKey }} / {{ ref.tabKey }}</strong>
              <span>{{ ref.entityKind }} · {{ ref.entityKey || '全局' }}</span>
            </div>
            <div class="eref-metrics">
              <el-tag v-for="m in ref.metricKeys" :key="m" size="small" effect="plain">{{ m }}</el-tag>
              <el-button v-if="ref.routePath" size="small" type="primary" link @click="gotoEvidence(ref)">跳到证据</el-button>
            </div>
          </div>
        </div>
      </section>

      <section class="section source-confidence">
        <h3 class="sh">📡 来源与置信度</h3>
        <el-alert
          v-if="isMockSource"
          class="mock-source-alert"
          type="warning"
          :closable="false"
          show-icon
          title="数据来源: Mock Fixture"
          description="当前数据来自本地 Mock 固件，非 Amazon 真实同步。请勿据此执行真实写操作。"
        />
        <el-tag
          v-if="!isUnknownSource"
          class="source-mode-tag"
          size="small"
          effect="dark"
          :type="isMockSource ? 'warning' : 'success'"
        >{{ sourceLabel }}</el-tag>
        <!-- X-P1-01: unknown source -> warning-orange badge, '来源未知不可断言真假' -->
        <el-tag
          v-else
          class="source-mode-tag source-unknown-tag"
          size="small"
          effect="dark"
          type="warning"
        >数据来源: unknown（未知 · 不可断言真假）</el-tag>
        <div class="source-grid">
          <div><span>来源</span><strong>{{ sourceDisplay }}</strong></div>
          <div><span>新鲜度</span><strong>{{ freshnessDisplay }}</strong></div>
          <div><span>数据</span><strong>{{ fmtPct(confidenceBreakdown?.data) }}</strong></div>
          <div><span>规则</span><strong>{{ fmtPct(confidenceBreakdown?.rule) }}</strong></div>
          <div><span>影响</span><strong>{{ fmtPct(confidenceBreakdown?.impact) }}</strong></div>
          <div><span>回滚</span><strong>{{ fmtPct(confidenceBreakdown?.reversibility) }}</strong></div>
          <div><span>护栏</span><strong>{{ fmtPct(confidenceBreakdown?.guardrail) }}</strong></div>
          <div><span>最终</span><strong>{{ fmtPct(confidenceBreakdown?.final ?? s.confidence) }}</strong></div>
        </div>
      </section>

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
        <!-- X-P0-07 (B方案/纯 mock 坦白): the action is a dry-run / audit-first sandbox
             step, never a real Amazon write. Copy must not promise a real side-effect. -->
        <el-button size="large" type="primary" @click="emit('execute', s); close()">
          <el-icon><Check /></el-icon>采纳首选方案（dry-run · 模拟）
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

.contract-section {
  padding: 12px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
}
.contract-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.contract-box {
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.contract-box .ck {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 5px;
}
.contract-box strong {
  display: block;
  min-height: 22px;
  font-size: 13px;
}
.contract-box p {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.45;
}
.typed-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.typed-detail div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 6px;
}
.typed-detail span {
  font-size: 11px;
  color: var(--text-muted);
}
.typed-detail code {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: #0f172a;
}
.guardrail-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.eref-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.eref-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.eref-row strong {
  display: block;
  font-size: 12px;
  color: #0f172a;
}
.eref-row span {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
}
.eref-metrics {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
}
.source-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.source-grid div {
  padding: 9px;
  background: #f9fafb;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
}
.source-grid span {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
}
.source-grid strong {
  display: block;
  margin-top: 4px;
  font-size: 12px;
}

@media (max-width: 767px) {
  .contract-grid,
  .typed-detail,
  .source-grid {
    grid-template-columns: 1fr;
  }
  .eref-row {
    grid-template-columns: 1fr;
  }
  .eref-metrics {
    justify-content: flex-start;
  }
}
</style>
