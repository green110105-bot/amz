<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import SearchTermReport from './SearchTermReport.vue';
import CampaignReport from './CampaignReport.vue';
import SqpReport from './SqpReport.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';

const { isMobile } = useViewport();
const mobileExportCols = [
  { prop: 'name', label: '文件名' },
  { prop: 'size', label: '大小' },
  { prop: 'date', label: '时间' },
  { prop: 'user', label: '人' },
];

const route = useRoute();
const router = useRouter();

// 通过 URL query 决定 tab
const activeTab = ref(route.query.tab || 'search-terms');

watch(() => route.query.tab, (v) => {
  activeTab.value = v || 'search-terms';
});

function switchTab(t) {
  activeTab.value = t;
  router.replace({ path: '/ads/reports', query: { tab: t } });
}

const tabs = [
  { id: 'search-terms', name: '搜索词报告', icon: 'Search', emoji: '🔍', badge: '核心', desc: '收割 + 否定 · Sponsored Ads 维度' },
  { id: 'campaigns', name: '广告活动报表', icon: 'Histogram', emoji: '📊', desc: 'Campaign 维度全指标 · 批量启停' },
  { id: 'sqp', name: 'SQP 份额', icon: 'PieChart', emoji: '🎯', badge: '差异化', desc: 'Brand Analytics · 漏斗诊断 + 机会发现' },
  { id: 'keywords', name: '关键词报表', icon: 'Discount', emoji: '🔑', desc: '已投关键词全量 · 建议出价区间' },
  { id: 'placements', name: '广告位报表', icon: 'Aim', emoji: '📍', desc: 'ToS / Product Pages / Rest 三段' },
  { id: 'asins', name: 'ASIN 表现', icon: 'Goods', emoji: '🏷', desc: '广告位 ASIN 表现 + 跨 ASIN 对比' },
  { id: 'custom', name: '自定义报表', icon: 'Operation', emoji: '⚙', desc: '自由组合维度 + 保存视图' },
];

const recentExports = [
  { name: '搜索词报告_2026-05-13.csv', size: '46 KB', date: '2026-05-13 14:32', user: 'admin' },
  { name: 'SQP_2026-W19.xlsx', size: '28 KB', date: '2026-05-13 11:20', user: 'admin' },
  { name: '广告活动报表_2026-05-12.xlsx', size: '12 KB', date: '2026-05-12 09:18', user: 'admin' },
  { name: '关键词报表_2026-05-11.csv', size: '8 KB', date: '2026-05-11 11:05', user: 'operator' },
];
</script>

<template>
  <MobileFallback
    v-if="isMobile"
    page-name="广告报表中心"
    reason="本页包含 7 类大数据表与日期范围筛选，建议在桌面端操作。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <h4 style="margin: 0 0 8px">7 类报表：</h4>
        <ul style="padding-left: 20px; line-height: 2; margin: 0">
          <li>搜索词报告 / 广告活动报表 / SQP 份额</li>
          <li>关键词报表 / 广告位报表 / ASIN 表现 / 自定义报表</li>
        </ul>
        <el-button type="primary" style="margin-top: 16px; width: 100%" @click="$router.push('/workbench')">返回工作台</el-button>
      </el-card>
    </template>
  </MobileFallback>
  <div v-else class="reports-center">
    <PageHeader
      title="广告报表中心"
      subtitle="7 类报表统一入口 · 搜索词 / 活动 / SQP 份额 / 关键词 / 广告位 / ASIN / 自定义"
    >
      <template #extra>
        <el-date-picker
          type="daterange"
          range-separator="-"
          size="default"
          style="width: 240px"
        />
        <el-button :icon="'Download'">最近导出</el-button>
        <el-button type="primary" :icon="'Refresh'">同步数据</el-button>
      </template>
    </PageHeader>

    <!-- Tabs 头 -->
    <div class="tab-strip">
      <div
        v-for="t in tabs"
        :key="t.id"
        class="tab-item"
        :class="{ active: activeTab === t.id }"
        @click="switchTab(t.id)"
      >
        <span class="tab-emoji">{{ t.emoji }}</span>
        <div class="tab-meta">
          <div class="tab-name">
            {{ t.name }}
            <el-tag v-if="t.badge" size="small" :type="t.badge === '差异化' ? 'success' : 'primary'" effect="dark" style="margin-left: 4px">{{ t.badge }}</el-tag>
          </div>
          <span class="tab-desc">{{ t.desc }}</span>
        </div>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="tab-content">
      <SearchTermReport v-if="activeTab === 'search-terms'" :embedded="true" />
      <CampaignReport v-else-if="activeTab === 'campaigns'" :embedded="true" />
      <SqpReport v-else-if="activeTab === 'sqp'" :embedded="true" />

      <!-- 其他 stub tabs -->
      <div v-else-if="activeTab === 'keywords'" class="stub">
        <el-icon :size="40"><Discount /></el-icon>
        <h3>关键词报表</h3>
        <p>已投关键词的全量表现 · Amazon 建议出价区间 · 实时排名位置</p>
        <p class="muted">深度版即将上线 · 当前可在 <a class="link" @click="router.push('/ads/keywords')">关键词与搜索词</a> 查看简版</p>
      </div>
      <div v-else-if="activeTab === 'placements'" class="stub">
        <el-icon :size="40"><Aim /></el-icon>
        <h3>广告位报表</h3>
        <p>Top of Search / Product Pages / Rest 三段独立报表 · 自动加成建议</p>
        <p class="muted">完整广告位分析见 <a class="link" @click="router.push('/ads/lx/portfolios')">广告组合详情 → Campaign → 广告位 子tab</a></p>
      </div>
      <div v-else-if="activeTab === 'asins'" class="stub">
        <el-icon :size="40"><Goods /></el-icon>
        <h3>ASIN 表现报表</h3>
        <p>我方 ASIN 在广告全维度的汇总（曝光 / 点击 / 转化 / 利润）</p>
        <p class="muted">即将上线</p>
      </div>
      <div v-else-if="activeTab === 'custom'" class="stub">
        <el-icon :size="40"><Operation /></el-icon>
        <h3>自定义报表</h3>
        <p>自由选维度（SKU / Campaign / 时间 / 关键词）+ 自定义列 + 保存视图 + 定时导出</p>
        <p class="muted">即将上线</p>
      </div>
    </div>

    <!-- 底部最近导出 -->
    <div v-if="activeTab === 'search-terms'" class="recent-exports">
      <h3 class="re-title">最近导出</h3>
      <ResponsiveTable :data="recentExports" :mobile-columns="mobileExportCols" stripe size="small" border>
        <el-table-column prop="name" label="文件名" />
        <el-table-column prop="size" label="大小" width="80" />
        <el-table-column prop="date" label="时间" width="170" />
        <el-table-column prop="user" label="人" width="80" />
        <el-table-column label="操作" width="100">
          <template #default><el-button link size="small" type="primary">重新下载</el-button></template>
        </el-table-column>
        <template #mobile-actions>
          <el-button size="small" type="primary">重新下载</el-button>
        </template>
      </ResponsiveTable>
    </div>
  </div>
</template>

<style scoped>
.reports-center { padding-bottom: 24px; }

.tab-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}
.tab-item {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  transition: all 0.15s;
  border-bottom: 3px solid transparent;
}
.tab-item:hover {
  border-color: var(--primary);
  transform: translateY(-1px);
}
.tab-item.active {
  border-color: var(--primary);
  border-bottom-color: var(--primary);
  background: #eff6ff;
}
.tab-emoji {
  font-size: 20px;
  line-height: 1.2;
  flex-shrink: 0;
}
.tab-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tab-name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-desc {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 1400px) {
  .tab-strip { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 767px) {
  .tab-strip { grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .tab-item { padding: 8px; }
  .tab-name { font-size: 11px; }
}

.tab-content {
  min-height: 400px;
}

.stub {
  background: #fafbfc;
  border: 1px dashed var(--line);
  border-radius: 8px;
  padding: 60px 32px;
  text-align: center;
  color: var(--text-muted);
}
.stub h3 {
  font-size: 16px;
  margin: 14px 0 6px;
  color: var(--text);
}
.stub p {
  margin: 4px 0;
  font-size: 13px;
}
.muted { color: var(--text-muted); font-size: 12px; }
.link {
  color: var(--primary);
  cursor: pointer;
}
.link:hover { text-decoration: underline; }

.recent-exports {
  margin-top: 24px;
}
.re-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  margin: 0 0 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
