<script setup>
import { computed, ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import { useViewport } from '../composables/useViewport';
import { mockKeywordHeatmap } from '../utils/mock-data-extras';

const { isMobile } = useViewport();

const data = ref({ ...mockKeywordHeatmap });

const summary = computed(() => {
  const total = data.value.keywords.length;
  const fully = data.value.keywords.filter((k) => k.covered.title && k.covered.bullets && k.covered.description && k.covered.a_plus).length;
  const fullyMissing = data.value.keywords.filter((k) => !k.covered.title && !k.covered.bullets && !k.covered.description && !k.covered.a_plus).length;
  const partial = total - fully - fullyMissing;
  return { total, fully, partial, fullyMissing };
});

function cellClass(covered) {
  return covered ? 'cell-yes' : 'cell-no';
}
</script>

<template>
  <div>
    <PageHeader :title="`关键词覆盖热力图 · ${data.sku}`" subtitle="D1.1 主词覆盖率详细可视 · 每个关键词在 标题/五点/描述/A+ 是否出现">
      <template #extra><el-tag type="primary" effect="plain">总词数 {{ summary.total }}</el-tag></template>
    </PageHeader>

    <el-row :gutter="16">
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><div class="stat stat-success"><span>4 处全覆盖</span><strong>{{ summary.fully }}</strong></div></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><div class="stat stat-warning"><span>部分覆盖</span><strong>{{ summary.partial }}</strong></div></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><div class="stat stat-danger"><span>完全缺失</span><strong>{{ summary.fullyMissing }}</strong></div></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><div class="stat"><span>覆盖率</span><strong class="tnum">{{ Math.round((summary.fully + summary.partial * 0.5) / summary.total * 100) }}%</strong></div></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">关键词覆盖矩阵</h2></template>
      <div class="heatmap-wrap">
      <table class="heatmap">
        <thead>
          <tr>
            <th class="th-kw">关键词</th>
            <th class="th-imp">月曝光</th>
            <th>标题</th>
            <th>五点</th>
            <th>描述</th>
            <th>A+</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in data.keywords" :key="k.term">
            <td class="td-kw">{{ k.term }}</td>
            <td class="td-imp tnum">{{ k.impressions.toLocaleString() }}</td>
            <td :class="cellClass(k.covered.title)">{{ k.covered.title ? '✓' : '✗' }}</td>
            <td :class="cellClass(k.covered.bullets)">{{ k.covered.bullets ? '✓' : '✗' }}</td>
            <td :class="cellClass(k.covered.description)">{{ k.covered.description ? '✓' : '✗' }}</td>
            <td :class="cellClass(k.covered.a_plus)">{{ k.covered.a_plus ? '✓' : '✗' }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">改进建议（按月曝光降序）</h2></template>
      <ul class="suggest">
        <li v-for="k in data.keywords.filter((x) => !x.covered.title || !x.covered.bullets || !x.covered.a_plus).slice(0, 5)" :key="k.term">
          <strong>{{ k.term }}</strong>
          <span class="text-muted">（月曝光 {{ k.impressions.toLocaleString() }}）</span>
          <span> — 建议添加到</span>
          <el-tag v-if="!k.covered.title" size="small" type="danger" effect="plain" style="margin-left: 4px">标题</el-tag>
          <el-tag v-if="!k.covered.bullets" size="small" type="danger" effect="plain" style="margin-left: 4px">五点</el-tag>
          <el-tag v-if="!k.covered.a_plus" size="small" type="danger" effect="plain" style="margin-left: 4px">A+</el-tag>
        </li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.stat { padding: 14px 16px; background: #fff; border: 1px solid var(--line); border-left-width: 3px; border-radius: 8px; }
.stat span { display: block; font-size: 12px; color: var(--text-muted); }
.stat strong { display: block; font-size: 24px; font-weight: 700; margin-top: 4px; }
.stat-success { border-left-color: var(--success); }
.stat-warning { border-left-color: var(--warning); }
.stat-danger { border-left-color: var(--danger); }

.heatmap { width: 100%; border-collapse: collapse; font-size: 13px; }
.heatmap th, .heatmap td { padding: 10px 12px; border: 1px solid var(--line-soft); text-align: center; }
.heatmap th { background: #f9fafb; color: var(--text-muted); font-weight: 500; font-size: 12px; }
.th-kw { text-align: left !important; width: 240px; }
.th-imp { width: 100px; }
.td-kw { text-align: left !important; font-weight: 500; }
.td-imp { color: var(--text-muted); }
.cell-yes { background: rgba(34, 211, 238, 0.15); color: var(--success); font-weight: 700; font-size: 16px; }
.cell-no { background: rgba(220, 38, 38, 0.08); color: var(--danger); font-weight: 700; font-size: 16px; }

.suggest { font-size: 13px; line-height: 1.9; padding-left: 18px; }
.suggest li { margin-bottom: 4px; }
.heatmap-wrap { width: 100%; overflow-x: auto; }
@media (max-width: 767px) {
  .stat { padding: 10px 12px; }
  .stat strong { font-size: 18px; }
  .heatmap { min-width: 600px; }
  .heatmap th, .heatmap td { padding: 6px 8px; font-size: 12px; }
  .th-kw { width: 160px; }
}
</style>
