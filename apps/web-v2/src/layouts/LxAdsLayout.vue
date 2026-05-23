<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useViewport } from '../composables/useViewport';
import MobileFallback from '../components/MobileFallback.vue';

const router = useRouter();
const route = useRoute();
const { isMobile } = useViewport();

// 二级导航（左侧竖排，对应 lx1 中弹出的子菜单）
const secondaryNav = [
  { id: 'portfolios', label: '广告组合', route: '/ads/lx/portfolios', icon: 'OfficeBuilding' },
  { id: 'all-campaigns', label: '全部活动', route: '/ads/lx/all-campaigns', icon: 'DataAnalysis' },
  { id: 'sp', label: 'SP广告', route: '/ads/lx/sp', icon: 'Document', tag: 'SP' },
  { id: 'sb', label: 'SB广告', route: '/ads/lx/sb', icon: 'PictureFilled', tag: 'SB' },
  { id: 'sd', label: 'SD广告', route: '/ads/lx/sd', icon: 'VideoCameraFilled', tag: 'SD' },
  { id: 'st', label: 'ST广告', route: '/ads/lx/st', icon: 'Histogram', tag: 'ST' },
  { id: 'purchased', label: '已购商品', route: '/ads/lx/purchased', icon: 'Goods' },
  { id: 'op-log', label: '操作日志', route: '/ads/lx/op-log', icon: 'Reading' },
  { id: 'download', label: '下载中心', route: '/ads/lx/download', icon: 'Download' },
];

// 顶部横向粒度 tabs (lx1 顶部那个)
const granularityTabs = computed(() => {
  // 在不同上下文显示不同 tabs
  if (route.path.includes('/campaigns/')) {
    return [
      { id: 'ad-groups', label: '广告组' },
      { id: 'ads', label: '广告' },
      { id: 'placements', label: '广告位' },
      { id: 'kw-grabbing', label: '关键词抢位 ⭐' },
      { id: 'amc-audiences', label: 'AMC人群包' },
      { id: 'targeting', label: '投放' },
      { id: 'negative', label: '否定投放' },
      { id: 'search-terms', label: '用户搜索词' },
      { id: 'settings', label: '修改Campaign设置' },
      { id: 'op-log', label: '操作日志' },
      { id: 'daily', label: '天数据' },
      { id: 'strategy', label: '广告策略' },
    ];
  }
  if (route.path.includes('/portfolios/') || route.path.endsWith('/all-campaigns')) {
    return [
      { id: 'campaigns', label: '广告' },
      { id: 'ad-groups', label: '广告组' },
      { id: 'ads', label: '广告' },
      { id: 'targeting', label: '投放' },
      { id: 'search-terms', label: '用户搜索词' },
    ];
  }
  return [];
});

const activeSecondary = computed(() => {
  for (const n of secondaryNav) {
    if (route.path.startsWith(n.route)) return n.id;
  }
  return 'portfolios';
});

function gotoSec(item) { router.push(item.route); }

const currentGranularity = computed(() => {
  return route.query.g || 'campaigns';
});
function setGranularity(g) {
  router.push({ path: route.path, query: { ...route.query, g } });
}

// 面包屑（页面顶端用）
const breadcrumb = computed(() => {
  const meta = route.meta;
  return meta?.breadcrumb || [];
});
</script>

<template>
  <!-- Mobile: 整个 lx 模块只读 fallback (11 子页含复杂表格/二级 nav/12 tab) -->
  <MobileFallback
    v-if="isMobile"
    page-name="广告组合管理 (领星等价)"
    reason="11 子页含复杂表格、二级导航与多 tab，建议在桌面端操作。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <h4 style="margin: 0 0 8px">该模块包含 11 个子页面：</h4>
        <ul style="padding-left: 20px; line-height: 2; margin: 0">
          <li>广告组合 / 全部活动 / SP / SB / SD / ST 广告</li>
          <li>已购商品 / 操作日志 / 下载中心</li>
          <li>组合详情 / Campaign 详情 (12 子 tab)</li>
        </ul>
        <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 10px">
          <el-button type="primary" @click="$router.push('/workbench')">返回工作台</el-button>
          <el-button @click="$router.push('/ads')">前往广告总览 (移动可用)</el-button>
        </div>
      </el-card>
    </template>
  </MobileFallback>

  <!-- Desktop: 原有 layout 完全保留 -->
  <div v-else class="lx-layout">
    <!-- 左侧二级导航 -->
    <aside class="lx-sec-nav">
      <div class="store-bar">
        <span class="store-flag">🇺🇸</span>
        <div class="store-info">
          <strong>亚马逊-G店铺-US 美国</strong>
        </div>
        <el-icon><CaretBottom /></el-icon>
      </div>

      <nav class="sec-list">
        <a
          v-for="item in secondaryNav"
          :key="item.id"
          class="sec-item"
          :class="{ active: activeSecondary === item.id }"
          @click="gotoSec(item)"
        >
          <el-icon class="sec-icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <el-tag v-if="item.tag" size="small" effect="plain" type="info" style="margin-left: auto">{{ item.tag }}</el-tag>
        </a>
      </nav>

      <div class="sec-foot">
        <span>体验新版 → </span>
      </div>
    </aside>

    <!-- 主内容区 -->
    <section class="lx-content">
      <!-- 横向粒度 tabs（仅在有 granularity 上下文时显示） -->
      <div v-if="granularityTabs.length" class="g-tabs">
        <a
          v-for="(t, i) in granularityTabs"
          :key="t.id + i"
          class="g-tab"
          :class="{ active: currentGranularity === t.id }"
          @click="setGranularity(t.id)"
        >{{ t.label }}</a>
      </div>

      <!-- 路由内容 -->
      <div class="lx-page">
        <router-view />
      </div>
    </section>
  </div>
</template>

<style scoped>
.lx-layout {
  display: flex;
  min-height: calc(100vh - 56px);
  background: #f5f6f8;
  margin: -24px -24px -32px -24px; /* 撑出 main padding */
}

/* 左二级导航 */
.lx-sec-nav {
  width: 220px;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: calc(100vh - 56px);
  overflow-y: auto;
  flex-shrink: 0;
}

.store-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(90deg, #4f6ef7 0%, #6d83f9 100%);
  color: #fff;
  cursor: pointer;
}
.store-flag { font-size: 18px; }
.store-info { flex: 1; font-size: 13px; }
.store-info strong { color: #fff; font-weight: 600; }

.sec-list {
  flex: 1;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
}
.sec-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
  border-left: 3px solid transparent;
  transition: all 0.1s;
}
.sec-item:hover {
  background: #f3f4f6;
}
.sec-item.active {
  background: #eef2ff;
  color: #2563eb;
  border-left-color: #2563eb;
  font-weight: 600;
}
.sec-icon { font-size: 16px; }

.sec-foot {
  padding: 12px 16px;
  border-top: 1px solid var(--line-soft);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}

/* 主内容 */
.lx-content {
  flex: 1;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

/* 横向粒度 tabs */
.g-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 5;
}
.g-tab {
  padding: 12px 18px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.1s;
}
.g-tab:hover { color: #2563eb; }
.g-tab.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  font-weight: 600;
}

.lx-page {
  flex: 1;
  padding: 16px 20px 24px;
  overflow-x: auto;
}
</style>
