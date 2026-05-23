<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useStrategies } from '../../../composables/useAdsState';
import { useCampaigns } from '../../../composables/useLxState';
import StrategyDetailDrawer from '../../../components/StrategyDetailDrawer.vue';
import { useViewport } from '../../../composables/useViewport';

const { isMobile } = useViewport();

const props = defineProps({ campaign: Object });
const router = useRouter();

const { list: allStrategies, fetch, toggle } = useStrategies();
const { getStrategies: fetchCampaignStrategies } = useCampaigns();

// 本 Campaign 真实绑定的策略（来自后端 /lx/campaigns/:id/strategies）
const realBindings = ref([]);

onMounted(async () => {
  await fetch();
  if (props.campaign?.id) {
    realBindings.value = await fetchCampaignStrategies(props.campaign.id);
  }
});

watch(() => props.campaign?.id, async (id) => {
  if (id) realBindings.value = await fetchCampaignStrategies(id);
});

// 三层级聚合：account / portfolio / campaign
// Campaign 级：优先使用真绑定数据（来自 strategy_bindings 表）
const data = computed(() => {
  const arr = allStrategies.value || [];
  const accountLevel = arr.filter((s) => s.scope === 'account' && s.enabled);
  const portfolioLevel = arr.filter((s) => s.scope === 'portfolio' && s.enabled).slice(0, 2);
  // Real bindings take priority; fall back to scope='campaign' + bindingsCount>0 for legacy display
  let campaignLevel = realBindings.value || [];
  if (!campaignLevel.length) {
    campaignLevel = arr.filter((s) => s.scope === 'campaign' && (s.bindingsCount || 0) > 0).slice(0, 3);
  }
  return { account: accountLevel, portfolio: portfolioLevel, campaign: campaignLevel };
});

const drawerOpen = ref(false);
const selectedStrategy = ref(null);

function viewDetail(s) {
  selectedStrategy.value = s;
  drawerOpen.value = true;
}

async function toggleStrategy(s) {
  await toggle(s);
}

function gotoLibrary() {
  router.push('/ads/strategies');
}

const sovColor = { manual: '#6b7280', semi: '#3b82f6', auto: '#10b981' };

// 触发统计
const stats = computed(() => {
  const all = [...data.value.account, ...data.value.portfolio, ...data.value.campaign];
  return {
    total: all.length,
    enabled: all.filter((s) => s.enabled).length,
    totalTriggered: all.reduce((sum, s) => sum + (s.triggerCount || 0), 0),
    auto: all.filter((s) => s.sovereignty === 'auto').length,
  };
});
</script>

<template>
  <!-- 顶部说明 + 统计 -->
  <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
    <template #title>
      <strong>本 Campaign 当前生效 {{ stats.total }} 条策略 · 启用 {{ stats.enabled }} 条 · 累计触发 {{ stats.totalTriggered }} 次 · {{ stats.auto }} 条全自动</strong>
    </template>
    <template #default>
      <span style="font-size: 12px">策略来自 3 个层级：账号级（全店共享）· Portfolio 级（同组合）· Campaign 级（仅本活动）。冲突时 Campaign > Portfolio > 账号。</span>
    </template>
  </el-alert>

  <div class="strategy-tab">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" :icon="'Plus'" @click="gotoLibrary">从策略库添加 →</el-button>
      <el-button :icon="'Connection'">应用策略模板</el-button>
      <span class="spacer" />
      <el-button :icon="'View'" link @click="gotoLibrary">查看完整策略库 →</el-button>
    </div>

    <!-- 账号级 -->
    <section class="scope-section">
      <div class="scope-head account">
        <el-icon><OfficeBuilding /></el-icon>
        <strong>账号级</strong>
        <span class="scope-desc">全店共享，本 Campaign 自动继承（{{ data.account.length }} 条）</span>
      </div>
      <div class="strat-list">
        <div
          v-for="s in data.account"
          :key="s.id"
          class="strat-row"
          :class="{ disabled: !s.enabled }"
          @click="viewDetail(s)"
        >
          <span class="state-dot" :class="s.enabled ? 'on' : 'off'" />
          <el-tag size="small" :style="{ background: s.categoryColor + '20', color: s.categoryColor, borderColor: 'transparent' }">
            {{ s.categoryEmoji }}
          </el-tag>
          <div class="strat-info">
            <strong>{{ s.name }}</strong>
            <span class="strat-desc">{{ s.description }}</span>
          </div>
          <el-tag size="small" effect="plain" :style="{ color: sovColor[s.sovereignty], borderColor: sovColor[s.sovereignty] }">
            {{ ({ manual: '手动', semi: '半自动', auto: '全自动' })[s.sovereignty] }}
          </el-tag>
          <span class="strat-fired">触发 <strong>{{ s.triggerCount || 0 }}</strong> 次</span>
          <el-switch :model-value="s.enabled" size="small" @click.stop @change="toggleStrategy(s)" />
        </div>
      </div>
    </section>

    <!-- Portfolio 级 -->
    <section class="scope-section" v-if="data.portfolio.length">
      <div class="scope-head portfolio">
        <el-icon><Files /></el-icon>
        <strong>Portfolio 级</strong>
        <span class="scope-desc">同组合下所有 Campaign 共享（{{ data.portfolio.length }} 条）</span>
      </div>
      <div class="strat-list">
        <div
          v-for="s in data.portfolio"
          :key="s.id"
          class="strat-row"
          :class="{ disabled: !s.enabled }"
          @click="viewDetail(s)"
        >
          <span class="state-dot" :class="s.enabled ? 'on' : 'off'" />
          <el-tag size="small" :style="{ background: s.categoryColor + '20', color: s.categoryColor, borderColor: 'transparent' }">
            {{ s.categoryEmoji }}
          </el-tag>
          <div class="strat-info">
            <strong>{{ s.name }}</strong>
            <span class="strat-desc">{{ s.description }}</span>
          </div>
          <el-tag size="small" effect="plain" :style="{ color: sovColor[s.sovereignty], borderColor: sovColor[s.sovereignty] }">
            {{ ({ manual: '手动', semi: '半自动', auto: '全自动' })[s.sovereignty] }}
          </el-tag>
          <span class="strat-fired">触发 <strong>{{ s.triggerCount || 0 }}</strong> 次</span>
          <el-switch :model-value="s.enabled" size="small" @click.stop @change="toggleStrategy(s)" />
        </div>
      </div>
    </section>

    <!-- Campaign 级 -->
    <section class="scope-section">
      <div class="scope-head campaign">
        <el-icon><Aim /></el-icon>
        <strong>Campaign 级</strong>
        <span class="scope-desc">仅本 Campaign 生效（{{ data.campaign.length }} 条 · 可覆盖账号级）</span>
      </div>
      <div v-if="data.campaign.length" class="strat-list">
        <div
          v-for="s in data.campaign"
          :key="s.id"
          class="strat-row"
          :class="{ disabled: !s.enabled }"
          @click="viewDetail(s)"
        >
          <span class="state-dot" :class="s.enabled ? 'on' : 'off'" />
          <el-tag size="small" :style="{ background: s.categoryColor + '20', color: s.categoryColor, borderColor: 'transparent' }">
            {{ s.categoryEmoji }}
          </el-tag>
          <div class="strat-info">
            <strong>{{ s.name }}</strong>
            <span class="strat-desc">{{ s.description }}</span>
          </div>
          <el-tag size="small" effect="plain" :style="{ color: sovColor[s.sovereignty], borderColor: sovColor[s.sovereignty] }">
            {{ ({ manual: '手动', semi: '半自动', auto: '全自动' })[s.sovereignty] }}
          </el-tag>
          <span class="strat-fired">触发 <strong>{{ s.triggerCount || 0 }}</strong> 次</span>
          <el-switch :model-value="s.enabled" size="small" @click.stop @change="toggleStrategy(s)" />
        </div>
      </div>
      <div v-else class="empty-campaign">
        <el-icon :size="24"><InfoFilled /></el-icon>
        <p>本 Campaign 未绑定专属策略</p>
        <el-button size="small" type="primary" link @click="gotoLibrary">+ 从策略库挑选绑定</el-button>
      </div>
    </section>

    <!-- 详情抽屉 -->
    <StrategyDetailDrawer
      v-model="drawerOpen"
      :strategy="selectedStrategy"
      @toggle="toggleStrategy"
    />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  padding: 0 0 14px;
  border-bottom: 1px dashed #e5e7eb;
  margin-bottom: 14px;
}
.spacer { flex: 1; }

.scope-section {
  margin-bottom: 22px;
}
.scope-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 6px 6px 0 0;
  font-size: 13px;
}
.scope-head.account { background: #fef3c7; color: #b45309; }
.scope-head.portfolio { background: #ddd6fe; color: #6d28d9; }
.scope-head.campaign { background: #dbeafe; color: #1d4ed8; }
.scope-head strong { font-weight: 700; }
.scope-desc { font-size: 11px; opacity: 0.85; margin-left: 4px; }

.strat-list {
  background: #fff;
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 6px 6px;
}
.strat-row {
  display: grid;
  grid-template-columns: 12px 38px 1fr 90px 90px 50px;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line-soft);
  cursor: pointer;
  transition: background 0.1s;
  font-size: 13px;
}
@media (max-width: 767px) {
  .strat-row { grid-template-columns: 12px 38px 1fr 50px; gap: 8px; }
  .strat-row .el-tag,
  .strat-fired { display: none; }
  .toolbar { flex-wrap: wrap; gap: 6px; }
}
.strat-row:last-child { border-bottom: none; }
.strat-row:hover { background: #f9fafb; }
.strat-row.disabled { opacity: 0.55; }

.state-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.state-dot.on { background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15); }
.state-dot.off { background: #d1d5db; }

.strat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.strat-info strong { font-size: 13px; }
.strat-desc {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.strat-fired {
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
}
.strat-fired strong {
  color: var(--text);
  font-family: ui-monospace, monospace;
}

.empty-campaign {
  background: #fff;
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 6px 6px;
  padding: 32px 20px;
  text-align: center;
  color: var(--text-muted);
}
.empty-campaign p { margin: 8px 0; font-size: 13px; }
</style>
