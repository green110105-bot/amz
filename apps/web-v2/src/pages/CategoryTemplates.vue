<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import { useRouter } from 'vue-router';
import { useViewport } from '../composables/useViewport';
import { mockCategoryTemplates } from '../utils/mock-data-extras';

const { isMobile } = useViewport();

const router = useRouter();
const templates = ref([...mockCategoryTemplates]);

function applyToSku(t) {
  ElMessage.success(`使用 ${t.name} 模板，跳转到优化室`);
  router.push({ path: '/listings/optimize', query: { template: t.id } });
}
</script>

<template>
  <div>
    <PageHeader title="类目模板" subtitle="不同类目的评分权重 · 必备元素 · 标题模板">
      <template #extra><el-button type="primary" :icon="'Plus'">新建类目</el-button></template>
    </PageHeader>

    <el-row :gutter="16">
      <el-col v-for="t in templates" :key="t.id" :xs="24" :sm="24" :md="12" :lg="12">
        <el-card shadow="never" class="tpl-card">
          <div class="tpl-head">
            <div>
              <h3 class="tpl-name">{{ t.name }}</h3>
              <span class="text-muted">关联 {{ t.skuCount }} 个 SKU</span>
            </div>
            <el-tag :type="t.isActive ? 'success' : 'info'" size="small">{{ t.isActive ? '启用' : '禁用' }}</el-tag>
          </div>

          <h4 class="block-label">评分权重（与默认不同）</h4>
          <div class="weights">
            <div v-for="(w, k) in t.weights" :key="k" class="weight-cell">
              <span>{{ k }}</span>
              <strong class="tnum">{{ Math.round(w * 100) }}%</strong>
            </div>
          </div>

          <h4 class="block-label">必备元素</h4>
          <div class="must-have">
            <el-tag v-for="(m, i) in t.mustHave" :key="i" size="small" type="warning" effect="plain" style="margin: 0 4px 4px 0">{{ m }}</el-tag>
          </div>

          <h4 class="block-label">标题模板</h4>
          <code class="title-tpl">{{ t.titleTemplate }}</code>

          <div class="tpl-foot">
            <el-button size="small" type="primary" plain @click="applyToSku(t)">用此模板新建 SKU</el-button>
            <el-button size="small">编辑</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.tpl-card { margin-bottom: 16px; }
.tpl-head { display: flex; justify-content: space-between; align-items: flex-start; }
.tpl-name { font-size: 18px; margin: 0 0 4px; }
.block-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin: 14px 0 6px; }
.weights { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
@media (max-width: 767px) {
  .weights { grid-template-columns: repeat(3, 1fr); }
  .tpl-foot { flex-wrap: wrap; }
}
.weight-cell { padding: 8px 6px; background: #f9fafb; border-radius: 4px; text-align: center; }
.weight-cell span { font-size: 11px; color: var(--text-muted); display: block; }
.weight-cell strong { font-size: 14px; }
.must-have { padding: 4px 0; }
.title-tpl { display: block; padding: 8px 12px; background: #0d1230; color: #cbd5ff; border-radius: 4px; font-size: 12px; font-family: ui-monospace, monospace; }
.tpl-foot { display: flex; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line-soft); }
</style>
