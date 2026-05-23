<script setup>
// Notifications — 通知中心
// M4 真后端 · 复用 useNotificationsBus（已带 poll + markRead/markAllRead）
// T1 移动一等公民：项 ≥ 56px / 红点保留 / mark-all-read prominent
import { computed, onMounted, ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import { useNotificationsBus } from '../composables/useNotificationsBus';
import { useViewport } from '../composables/useViewport';

const bus = useNotificationsBus();
const { isMobile } = useViewport();

const tab = ref('unread');

onMounted(() => {
  // 触发立即刷新；铃铛 startPolling 通常在 layout 已启动，但保险起见拉一次
  bus.refresh();
});

const list = computed(() => bus.list.value || []);

const filtered = computed(() => {
  if (tab.value === 'all') return list.value;
  if (tab.value === 'unread') return list.value.filter((n) => !n.readAt);
  if (tab.value === 'read') return list.value.filter((n) => n.readAt);
  return list.value;
});

const summary = computed(() => ({
  unread: list.value.filter((n) => !n.readAt).length,
  p0: list.value.filter((n) => n.severity === 'P0' && !n.readAt).length,
  p1: list.value.filter((n) => n.severity === 'P1' && !n.readAt).length,
}));

function severityType(s) {
  return { P0: 'danger', P1: 'warning', P2: 'info' }[s] || '';
}

function fmtTime(s) {
  if (!s) return '';
  // bus 中是 ISO；显示成 YYYY-MM-DD HH:mm
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (_) { return s; }
}

async function markRead(n) {
  if (!n.readAt) await bus.markRead(n.id);
}
async function markAllRead() {
  await bus.markAllRead();
}
</script>

<template>
  <div v-loading="bus.loading.value">
    <PageHeader title="通知中心" subtitle="站内 + 邮件 + 微信 多通道 · 静默时段 · 按严重度路由">
      <template #extra>
        <el-button v-if="summary.unread > 0" type="primary" plain @click="markAllRead">全部已读</el-button>
        <el-button :icon="'Setting'" @click="$router.push('/settings')">通知设置</el-button>
      </template>
    </PageHeader>

    <!-- Mobile: prominent mark-all-read sticky bar at top -->
    <div v-if="isMobile && summary.unread > 0" class="mobile-mark-bar">
      <span class="mobile-mark-info">未读 <strong class="tnum">{{ summary.unread }}</strong></span>
      <el-button type="primary" size="default" @click="markAllRead">全部已读</el-button>
    </div>

    <el-card shadow="never">
      <el-tabs v-model="tab">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane :label="`未读 (${summary.unread})`" name="unread" />
        <el-tab-pane label="已读" name="read" />
      </el-tabs>
      <div v-if="filtered.length === 0" class="empty-tip">暂无通知</div>
      <div v-for="n in filtered" :key="n.id" class="notif-row" :class="{ unread: !n.readAt }" @click="markRead(n)">
        <el-tag :type="severityType(n.severity)" size="small" effect="dark" class="sev-tag">{{ n.severity }}</el-tag>
        <div class="notif-body">
          <div class="notif-head">
            <strong>{{ n.title }}</strong>
            <span class="text-muted">{{ n.source || n.sourceModule }}</span>
          </div>
          <p class="notif-text">{{ n.body }}</p>
          <div class="notif-foot">
            <span class="text-muted tnum">{{ fmtTime(n.createdAt) }}</span>
            <span class="channels">
              <el-tag v-for="(c, i) in (n.channels || [])" :key="i" size="small" effect="plain" style="margin-left: 4px">{{ ({ in_app: '站内', email: '邮件', wechat: '微信', wecom: '企微' })[c] || c }}</el-tag>
            </span>
          </div>
        </div>
        <span v-if="!n.readAt" class="dot-unread" />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.mobile-mark-bar {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; margin-bottom: 12px;
  background: #fff7ed; border-radius: 8px; border: 1px solid #fed7aa;
}
.mobile-mark-info { font-size: 14px; color: #c2410c; }
.mobile-mark-info strong { color: #ea580c; font-size: 18px; margin: 0 4px; }

.empty-tip { padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }

.notif-row {
  display: grid;
  grid-template-columns: 60px 1fr 16px;
  gap: 12px;
  padding: 14px 16px;
  min-height: 56px;
  border-bottom: 1px dashed var(--line-soft);
  cursor: pointer;
  align-items: flex-start;
  transition: background 0.15s;
}
.notif-row:hover { background: #f9fafb; }
.notif-row.unread { background: rgba(37, 99, 235, 0.03); }
.sev-tag { margin-top: 2px; }
.notif-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.notif-text { margin: 4px 0; font-size: 13px; color: var(--text-muted); }
.notif-foot { display: flex; justify-content: space-between; align-items: center; font-size: 11px; flex-wrap: wrap; gap: 4px; }
.channels { display: flex; gap: 0; }
.dot-unread { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); margin-top: 8px; }

@media (max-width: 767px) {
  .notif-row {
    grid-template-columns: 48px 1fr;
    padding: 14px 10px;
    min-height: 60px;
  }
  .dot-unread { display: none; }
  .notif-row.unread { border-left: 3px solid var(--primary); }
  .notif-head strong { font-size: 14px; }
  .notif-text { font-size: 12px; }
}
</style>
