<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePortfolios, useCampaigns } from '../../composables/useLxState';
import { campaignsApi } from '../../api/lx';
import AiActivityBanner from '../../components/AiActivityBanner.vue';
import MobileFallback from '../../components/MobileFallback.vue';
import { useViewport } from '../../composables/useViewport';

const { isMobile } = useViewport();

import LxTabAdGroups from './tabs/LxTabAdGroups.vue';
import LxTabAds from './tabs/LxTabAds.vue';
import LxTabPlacements from './tabs/LxTabPlacements.vue';
import LxTabKwGrabbing from './tabs/LxTabKwGrabbing.vue';
import LxTabTargeting from './tabs/LxTabTargeting.vue';
import LxTabNegative from './tabs/LxTabNegative.vue';
import LxTabSearchTerms from './tabs/LxTabSearchTerms.vue';
import LxTabSettings from './tabs/LxTabSettings.vue';
import LxTabOpLog from './tabs/LxTabOpLog.vue';
import LxTabDaily from './tabs/LxTabDaily.vue';
import LxTabStrategy from './tabs/LxTabStrategy.vue';
import LxTabAmc from './tabs/LxTabAmc.vue';

const route = useRoute();
const router = useRouter();

const { list: portfolios, fetch: fetchPortfolios, getById: getPortfolio } = usePortfolios();
const { getById: getCampaignFromCache } = useCampaigns();

const campaign = ref(null);

async function loadCampaign(id) {
  if (!id) { campaign.value = null; return; }
  // 优先从缓存取
  const cached = getCampaignFromCache(id);
  if (cached) {
    campaign.value = cached;
    return;
  }
  try {
    const c = await campaignsApi.get(id);
    campaign.value = c;
  } catch {
    campaign.value = null;
  }
}

const portfolio = computed(() => campaign.value ? getPortfolio(campaign.value.portfolioId) : null);

const activeTab = computed(() => route.query.g || 'ad-groups');

const tabComponent = computed(() => {
  return {
    'ad-groups': LxTabAdGroups,
    'ads': LxTabAds,
    'placements': LxTabPlacements,
    'kw-grabbing': LxTabKwGrabbing,
    'amc-audiences': LxTabAmc,
    'targeting': LxTabTargeting,
    'negative': LxTabNegative,
    'search-terms': LxTabSearchTerms,
    'settings': LxTabSettings,
    'op-log': LxTabOpLog,
    'daily': LxTabDaily,
    'strategy': LxTabStrategy,
  }[activeTab.value];
});

onMounted(async () => {
  await fetchPortfolios();
  await loadCampaign(route.params.id);
});

watch(() => route.params.id, (id) => { loadCampaign(id); });

function back() {
  if (portfolio.value) router.push(`/ads/lx/portfolios/${portfolio.value.id}`);
  else router.push('/ads/lx/portfolios');
}
</script>

<template>
  <div v-if="campaign" class="lx-cmp-detail">
    <!-- 面包屑 -->
    <div class="crumb-bar">
      <a class="crumb-link" @click="back">{{ campaign.type }}广告</a>
      <el-icon><Right /></el-icon>
      <span class="crumb-cur">
        <el-tag size="small" effect="dark" type="success" style="margin-right: 6px">●</el-tag>
        <span class="cmp-name">[{{ campaign.targetingType }}]{{ campaign.name }}</span>
        <el-icon class="copy"><CopyDocument /></el-icon>
        <el-icon class="external"><Right /></el-icon>
      </span>
    </div>

    <!-- AI 活动 banner -->
    <AiActivityBanner v-if="portfolio" :sku="portfolio.sku" scope="campaign" />

    <!-- 移动端 fallback（T3：复杂多 tab） -->
    <MobileFallback v-if="isMobile" page-name="广告活动详情" reason="此页面含 12 个子 tab 的复杂多列表格，建议桌面端使用以获得完整体验。">
      <template #readonly>
        <div class="mobile-summary">
          <div class="ms-row"><span class="ms-l">广告类型</span><strong>{{ campaign.type }} · {{ campaign.targetingType }}</strong></div>
          <div class="ms-row"><span class="ms-l">日预算</span><strong>${{ (campaign.dailyBudget ?? 0).toFixed(2) }}</strong></div>
          <div class="ms-row"><span class="ms-l">花费</span><strong>${{ (campaign.spend ?? 0).toFixed(2) }}</strong></div>
          <div class="ms-row"><span class="ms-l">销售额</span><strong>${{ (campaign.sales ?? 0).toFixed(2) }}</strong></div>
          <div class="ms-row"><span class="ms-l">ACoS</span><strong>{{ campaign.acos ? (campaign.acos * 100).toFixed(2) + '%' : '--' }}</strong></div>
          <div class="ms-row"><span class="ms-l">订单</span><strong>{{ campaign.orders ?? 0 }}</strong></div>
        </div>
      </template>
    </MobileFallback>

    <!-- 桌面：子 tab 内容 -->
    <component v-else :is="tabComponent" :campaign="campaign" :portfolio="portfolio" />
  </div>
  <div v-else style="padding: 40px; color: #9ca3af">活动不存在</div>
</template>

<style scoped>
.lx-cmp-detail { background: #fff; border-radius: 4px; padding: 12px 14px; }

.crumb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 0 0 10px;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 12px;
}
.crumb-link {
  color: var(--primary);
  cursor: pointer;
}
.crumb-link:hover { text-decoration: underline; }
.crumb-cur {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cmp-name { font-weight: 600; }
.copy, .external { cursor: pointer; color: var(--text-muted); }
.copy:hover, .external:hover { color: var(--primary); }

.mobile-summary { display: flex; flex-direction: column; gap: 8px; padding: 12px; text-align: left; }
.ms-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #ebeef5; font-size: 14px; }
.ms-l { color: #909399; }
.ms-row strong { color: #303133; font-family: ui-monospace, monospace; }

@media (max-width: 767px) {
  .lx-cmp-detail { padding: 8px; }
  .crumb-bar { flex-wrap: wrap; }
  .cmp-name { font-size: 12px; word-break: break-all; }
}
</style>
