<script setup>
// Floating bottom action bar that appears when user selects rows in a table.
// Emits semantic actions; parent decides what to do (open modal / call API / etc).

const props = defineProps({
  selected: { type: Array, default: () => [] },
  // Which actions to show. Default = all common ad ops.
  actions: {
    type: Array,
    default: () => ['bid', 'state', 'budget', 'delete'],
  },
});

const emit = defineEmits([
  'action:bid',       // 批量调价
  'action:state',     // 批量启用 / 暂停
  'action:budget',    // 批量改预算（Campaign 用）
  'action:delete',    // 批量删除
  'action:export',
  'action:custom',
  'clear',
]);

const has = (a) => props.actions.includes(a);

function fire(name, payload) { emit('action:' + name, payload); }
</script>

<template>
  <transition name="slide-up">
    <div v-if="selected.length > 0" class="batch-bar">
      <div class="count">
        已选 <strong>{{ selected.length }}</strong> 条
        <el-link type="primary" :underline="false" @click="emit('clear')" class="clear-link">取消选择</el-link>
      </div>

      <div class="actions">
        <el-button v-if="has('bid')" type="primary" :icon="'Money'" @click="fire('bid')">
          批量调价
        </el-button>
        <el-button v-if="has('budget')" :icon="'Wallet'" @click="fire('budget')">
          批量改预算
        </el-button>
        <el-button-group v-if="has('state')">
          <el-button :icon="'CircleCheck'" @click="fire('state', { enabled: true })">批量启用</el-button>
          <el-button :icon="'CircleClose'" @click="fire('state', { enabled: false })">批量暂停</el-button>
        </el-button-group>
        <el-button v-if="has('export')" :icon="'Download'" @click="fire('export')">导出</el-button>
        <el-button v-if="has('delete')" type="danger" :icon="'Delete'" plain @click="fire('delete')">批量删除</el-button>
        <slot name="extra" :selected="selected" />
      </div>
    </div>
  </transition>
</template>

<style scoped>
.batch-bar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e4e7eb);
  border-radius: 999px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 1000;
  font-size: 13px;
}
.count { color: var(--text-muted); }
.count strong { color: var(--primary, #3b82f6); font-size: 15px; margin: 0 2px; }
.clear-link { margin-left: 8px; font-size: 12px; }
.actions { display: flex; align-items: center; gap: 8px; }

@media (max-width: 768px) {
  .batch-bar {
    width: calc(100% - 24px);
    border-radius: 12px;
    padding: 10px 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .actions { flex-wrap: wrap; }
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translate(-50%, 100%);
  opacity: 0;
}
</style>
