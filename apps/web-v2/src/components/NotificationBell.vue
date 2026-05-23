<script setup>
// NotificationBell.vue — 顶栏右上角通知铃铛
// - 红点显示 unreadCount
// - 点击下拉显示最近 10 条
// - 点击条目：标记已读 + router.push(link)
// - 底部"查看全部"跳 /notifications
// 移动端：popover max-width 92vw + max-height 70vh + 单条 ≥ 56px + sticky footer
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationsBus } from '../composables/useNotificationsBus';
import { useViewport } from '../composables/useViewport';

const router = useRouter();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

onMounted(() => {
  bus.startPolling(10000);
});
onBeforeUnmount(() => {
  // 注意：单例 bus，不在组件销毁时关闭 polling（仅在切店时关）
  // 但若希望切布局时关闭，可在此 stopPolling
});

const recent = computed(() => bus.list.value.slice(0, 10));
const badge = computed(() => bus.unreadCount.value);

const popoverWidth = computed(() => (isMobile.value ? '92vw' : 380));
const popoverClass = computed(() => (isMobile.value ? 'notif-bell-popper notif-bell-popper--mobile' : 'notif-bell-popper'));

function severityType(s) {
  return { P0: 'danger', P1: 'warning', P2: 'info' }[s] || 'info';
}
function chanLabel(c) {
  return { in_app: '站内', email: '邮件', wechat: '微信', wecom: '企微' }[c] || c;
}

async function onClickItem(n) {
  if (!n.readAt) await bus.markRead(n.id);
  if (n.link) {
    try { router.push(n.link); } catch (_) { /* ignore */ }
  }
}

function goAll() {
  router.push('/notifications');
}

async function readAll() {
  await bus.markAllRead();
}
</script>

<template>
  <el-popover trigger="click" placement="bottom-end" :width="popoverWidth" :popper-class="popoverClass">
    <template #reference>
      <el-badge :value="badge" :max="99" :hidden="badge === 0" class="bell-badge">
        <el-button :icon="'Bell'" circle plain size="default" />
      </el-badge>
    </template>

    <div class="bell-panel" :class="{ 'bell-panel--mobile': isMobile }">
      <div class="bell-head">
        <strong>通知</strong>
        <span class="text-muted bell-head-count">
          未读 <b class="tnum">{{ badge }}</b>
        </span>
        <el-button v-if="badge > 0 && !isMobile" size="small" link @click="readAll">全部已读</el-button>
      </div>

      <div v-if="recent.length === 0" class="bell-empty">
        <el-icon :size="28" color="#cbd5e1"><Bell /></el-icon>
        <p>暂无通知</p>
      </div>

      <div v-else class="bell-list">
        <div
          v-for="n in recent"
          :key="n.id"
          class="bell-row"
          :class="{ unread: !n.readAt }"
          @click="onClickItem(n)"
        >
          <el-tag :type="severityType(n.severity)" size="small" effect="dark" class="sev">
            {{ n.severity }}
          </el-tag>
          <div class="row-body">
            <div class="row-head">
              <strong class="row-title">{{ n.title }}</strong>
              <span class="row-src text-muted">{{ n.sourceModule || n.source || 'M4' }}</span>
            </div>
            <p class="row-text">{{ n.body }}</p>
            <div class="row-foot">
              <span class="text-muted tnum">{{ (n.createdAt || '').slice(0, 16).replace('T', ' ') }}</span>
              <span class="row-channels">
                <el-tag v-for="(c, i) in (n.channels || ['in_app'])" :key="i" size="small" effect="plain">
                  {{ chanLabel(c) }}
                </el-tag>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="bell-foot">
        <el-button v-if="isMobile && badge > 0" size="default" type="warning" plain @click="readAll">全部已读</el-button>
        <el-button size="default" type="primary" link @click="goAll">查看全部 →</el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.bell-badge { margin-right: 4px; }

.bell-panel { padding: 4px 0; max-height: 480px; display: flex; flex-direction: column; }
.bell-panel--mobile { max-height: 70vh; }

.bell-head {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--line-soft);
}
.bell-head strong { font-size: 14px; }
.bell-head-count { margin-left: auto; font-size: 12px; }

.bell-empty {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 36px 0;
  color: var(--text-muted); font-size: 13px;
}
.bell-empty p { margin: 0; }

.bell-list { overflow-y: auto; flex: 1; max-height: 360px; }
.bell-panel--mobile .bell-list { max-height: calc(70vh - 110px); }

.bell-row {
  display: grid; grid-template-columns: 36px 1fr; gap: 8px;
  padding: 10px 12px;
  min-height: 56px;
  border-bottom: 1px dashed var(--line-soft);
  cursor: pointer;
  transition: background 0.12s;
  align-items: flex-start;
}
.bell-row:hover { background: #f9fafb; }
.bell-row:active { background: #f1f5f9; }
.bell-row.unread { background: rgba(37, 99, 235, 0.04); }

.sev { margin-top: 2px; align-self: flex-start; }

.row-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.row-head { display: flex; gap: 6px; align-items: center; }
.row-title {
  font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 230px;
}
.row-src { font-size: 11px; }
.row-text {
  margin: 2px 0; font-size: 12px; color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.row-foot { display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: 2px; }
.row-channels { display: flex; gap: 4px; }

.bell-foot {
  border-top: 1px solid var(--line-soft);
  padding: 8px 12px;
  text-align: center;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.bell-panel--mobile .bell-foot {
  position: sticky;
  bottom: 0;
  background: #fff;
  z-index: 2;
  padding: 10px 12px;
}

@media (max-width: 767px) {
  .row-title { max-width: 60vw; }
  .bell-row { min-height: 60px; padding: 12px; }
}
</style>

<style>
.notif-bell-popper { padding: 0 !important; }
.notif-bell-popper--mobile { max-width: 92vw !important; }
</style>
