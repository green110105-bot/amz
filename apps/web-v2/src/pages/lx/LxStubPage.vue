<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { operationLogs } from '../../utils/mock-data-lx';
import ResponsiveTable from '../../components/ResponsiveTable.vue';
import { useViewport } from '../../composables/useViewport';

const { isMobile } = useViewport();
const mobileLogCols = [
  { prop: 'time', label: '时间' },
  { prop: 'operator', label: '操作人' },
  { prop: 'source', label: '来源' },
  { prop: 'action', label: '动作' },
  { prop: 'detail', label: '详情' },
];
const mobileDownloadCols = [
  { prop: 'name', label: '文件名' },
  { prop: 'size', label: '大小' },
  { prop: 'time', label: '导出时间' },
];

const route = useRoute();

const stubs = {
  '/ads/lx/purchased': {
    title: '已购商品',
    desc: '展示广告带来的购买商品报表（其他商品 / 同 ASIN / 不同 ASIN）',
    columns: [
      { label: 'ASIN', value: 'B0RIVALX' },
      { label: '商品名', value: '竞品冰淇凌机' },
      { label: '关联广告', value: 'Sp-BQLJ-Manu-Phrase-4.10' },
      { label: '购买数', value: '3' },
      { label: '销售额', value: '$87.00' },
    ],
  },
  '/ads/lx/op-log': {
    title: '操作日志',
    desc: '账号级所有广告相关操作日志（含 AI 自动 + 人工 + Amazon 后台）',
    isLog: true,
    rows: operationLogs,
  },
  '/ads/lx/download': {
    title: '下载中心',
    desc: '历史导出的报表归档（保留 90 天）',
    columns: [
      { name: '广告活动报表_2026-05-13.csv', size: '46 KB', time: '2026-05-13 14:32' },
      { name: '搜索词报告_2026-05-12.xlsx', size: '12 KB', time: '2026-05-12 09:18' },
      { name: '关键词报表_2026-05-11.csv', size: '8 KB', time: '2026-05-11 11:05' },
    ],
  },
};

const config = computed(() => stubs[route.path] || stubs['/ads/lx/purchased']);
</script>

<template>
  <div class="stub-page">
    <h2 class="title">{{ config.title }}</h2>
    <p class="desc">{{ config.desc }}</p>

    <!-- 操作日志样式 -->
    <ResponsiveTable v-if="config.isLog" :data="config.rows" :mobile-columns="mobileLogCols" stripe border size="small">
      <el-table-column label="时间" prop="time" width="180" />
      <el-table-column label="操作人" prop="operator" width="140">
        <template #default="{ row }">
          <el-tag size="small" :type="row.operator.includes('AI') ? 'success' : 'info'">{{ row.operator }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="来源" prop="source" width="120" />
      <el-table-column label="动作" prop="action" width="140" />
      <el-table-column label="详情" prop="detail" min-width="300" />
    </ResponsiveTable>

    <!-- 已购商品 -->
    <el-table v-else-if="route.path === '/ads/lx/purchased'" :data="[config.columns]" stripe border size="small">
      <el-table-column v-for="(c, i) in config.columns" :key="i" :label="c.label">
        <template #default>{{ c.value }}</template>
      </el-table-column>
    </el-table>

    <!-- 下载中心 -->
    <ResponsiveTable v-else :data="config.columns" :mobile-columns="mobileDownloadCols" stripe border size="small">
      <el-table-column label="文件名" prop="name" />
      <el-table-column label="大小" prop="size" width="100" />
      <el-table-column label="导出时间" prop="time" width="180" />
      <el-table-column label="操作" width="120">
        <template #default><el-button link size="small" type="primary">重新下载</el-button></template>
      </el-table-column>
      <template #mobile-actions>
        <el-button size="small" type="primary">重新下载</el-button>
      </template>
    </ResponsiveTable>
  </div>
</template>

<style scoped>
.stub-page { background: #fff; border-radius: 4px; padding: 16px; }
.title { font-size: 15px; font-weight: 600; margin: 0 0 6px; }
.desc { font-size: 12px; color: var(--text-muted); margin: 0 0 16px; }
</style>
