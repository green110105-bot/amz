<script setup>
import { useRoute } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';

const route = useRoute();
</script>

<template>
  <div>
    <PageHeader :title="route.meta?.title || '功能页'" subtitle="此页面将在 W2-W4 实现，当前为占位" />
    <EmptyState
      title="即将上线"
      description="该模块的设计已在 PRD/模块文档中完整定义，前端 UI 将在后续 Sprint 实现。"
      :icon="route.meta?.icon || 'Tools'"
    >
      <el-button type="primary" plain @click="$router.push('/workbench')">返回工作台</el-button>
    </EmptyState>
  </div>
</template>
