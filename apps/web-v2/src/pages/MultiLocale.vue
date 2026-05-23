<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockMultiLocale } from '../utils/mock-data-extras';
import { useAudit } from '../composables/useAudit';
const { submit } = useAudit();
const { isMobile } = useViewport();

const data = ref([...mockMultiLocale]);

function statusType(s) {
  return { live: 'success', translating: 'warning', pending: 'info', failed: 'danger' }[s] || '';
}
function statusLabel(s) {
  return { live: '已发布', translating: '翻译中', pending: '待翻译', failed: '失败' }[s] || s;
}

const mobileCols = [
  { prop: 'code', label: '国家站' },
  { prop: 'status', label: '状态', formatter: (v) => statusLabel(v) },
  { prop: 'score', label: '评分', formatter: (v) => (v != null ? v : '-') },
  { prop: 'lastSync', label: '上次同步', formatter: (v) => v || '-' },
];

async function syncFromMaster(item) {
  await submit({
    sourceModule: 'M1',
    actionType: 'MULTILOCALE_SYNC',
    target: { type: 'sku', id: item.sku },
    payload: { master: item.master, targetLocales: item.locales.filter((l) => !l.isMaster).map((l) => l.code) },
    description: `${item.sku} 母版（${item.master}）同步到所有非主语言`,
  });
}
async function publishOne(item, locale) {
  await submit({
    sourceModule: 'M1',
    actionType: 'MULTILOCALE_PUBLISH',
    target: { type: 'sku', id: item.sku },
    payload: { locale: locale.code },
    description: `${item.sku} 的 ${locale.code} 版翻译并应用`,
  });
}
</script>

<template>
  <div>
    <PageHeader title="多语言母版同步" subtitle="一国母版 → AI 翻译适配 → 多国家站独立审核">
      <template #extra><el-button :icon="'Refresh'">扫描更新</el-button></template>
    </PageHeader>

    <el-card v-for="item in data" :key="item.sku" shadow="never" class="sku-card">
      <div class="sku-head">
        <div>
          <h3 class="sku-name">{{ item.sku }}</h3>
          <span class="text-muted">母版：{{ item.master }}</span>
        </div>
        <el-button type="primary" :icon="'Connection'" :size="isMobile ? 'small' : 'default'" @click="syncFromMaster(item)">从母版同步</el-button>
      </div>

      <ResponsiveTable :data="item.locales" :mobile-columns="mobileCols" stripe size="default">
        <el-table-column label="国家站" width="120">
          <template #default="{ row }">
            <strong>{{ row.code }}</strong>
            <el-tag v-if="row.isMaster" type="primary" size="small" effect="dark" style="margin-left: 6px">母版</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="评分" width="100" align="right">
          <template #default="{ row }">
            <span v-if="row.score !== null" class="tnum">{{ row.score }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="上次同步" width="120">
          <template #default="{ row }"><span class="tnum text-muted">{{ row.lastSync || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" type="primary" plain @click="publishOne(item, row)">触发翻译</el-button>
            <el-button v-else-if="row.status === 'translating'" size="small" type="warning" plain disabled>翻译中...</el-button>
            <el-button v-else size="small" link>查看 Listing</el-button>
          </template>
        </el-table-column>
        <template #mobile-status="{ row, value }">
          <el-tag :type="statusType(row.status)" size="small">{{ value }}</el-tag>
        </template>
        <template #mobile-actions="{ row }">
          <el-button v-if="row.status === 'pending'" size="small" type="primary" @click.stop="publishOne(item, row)">触发翻译</el-button>
          <el-button v-else-if="row.status === 'translating'" size="small" type="warning" disabled>翻译中</el-button>
          <el-button v-else size="small" type="primary" plain>查看</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">同步规则</h2></template>
      <ul class="explain">
        <li>母版改动后，自动触发"是否同步到其他国家站"提示</li>
        <li>翻译保留品牌词、单位转换（lb ↔ kg / inch ↔ cm）、文化适配</li>
        <li>各国家站独立审核（亚马逊后台分别处理），可能有些通过有些被拒</li>
        <li>评分按各国家站<strong>本地</strong>关键词 + Review 计算（不是直接复制母版评分）</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.sku-card { margin-bottom: 16px; }
.sku-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.sku-name { font-size: 16px; margin: 0 0 4px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.explain { font-size: 13px; line-height: 1.8; padding-left: 18px; color: var(--text-muted); }
.explain strong { color: var(--text); }
</style>
