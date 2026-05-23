<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { storeToRefs } from 'pinia';
import { useLocalStore } from '../composables/useLocalStore';
import { ElMessage } from 'element-plus';
import NotificationBell from '../components/NotificationBell.vue';
import { useViewport } from '../composables/useViewport';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const localStore = useLocalStore();
const { sidebarCollapsed, realWritesEnabled } = storeToRefs(appStore);
const { isMobile } = useViewport();
const mobileMenuOpen = ref(false);

// 路由切换时自动关抽屉
watch(() => route.path, () => {
  if (mobileMenuOpen.value) mobileMenuOpen.value = false;
});
const user = computed(() => localStore.user || { id: '', name: '...', email: '', role: 'guest' });
const stores = computed(() => localStore.stores || []);
const currentStore = computed(() => localStore.currentStore || { id: '', name: '...', region: '' });

async function switchStore(id) {
  await localStore.switchStore(id);
}

async function logout() {
  await localStore.logout();
  ElMessage.success('已退出');
  router.push('/login');
}

const groups = [
  { id: 'main', label: '工作台' },
  { id: 'm1-main', label: '商品 · 主流程 (M1)' },
  { id: 'm1-resources', label: '商品 · 资源库' },
  { id: 'm2-profit', label: '利润 (M2)' },
  { id: 'm2-decisions', label: '库存与决策' },
  { id: 'm2-enterprise', label: '大卖 · 高级财务' },
  { id: 'm3-main', label: '广告 · 主入口 ⭐' },
  { id: 'm4-monitor', label: '监控与处置 (M4)' },
  { id: 'm4-review', label: 'Review 中心' },
  { id: 'm4-competitors', label: '竞品作战室' },
];

// 取所有 routes 并按 group 分组（用 router-instance 避免和 useRouter() 冲突）
import routerInstance from '../router';
const allRoutes = routerInstance.getRoutes().filter((r) => r.meta?.title && !r.meta?.public);
const grouped = computed(() =>
  groups.map((g) => ({
    ...g,
    items: allRoutes.filter((r) => r.meta.group === g.id),
  })).filter((g) => g.items.length > 0),
);

// 设置 / 审计放底部独立块
const bottomItems = computed(() =>
  allRoutes.filter((r) => ['/audit', '/settings'].includes(r.path)),
);

const search = ref('');
</script>

<template>
  <el-container class="layout">
    <el-aside
      v-if="!isMobile"
      :width="sidebarCollapsed ? '64px' : '220px'"
      class="sidebar"
    >
      <div class="brand">
        <span class="brand-logo">a</span>
        <span v-if="!sidebarCollapsed" class="brand-text">amz</span>
      </div>

      <el-dropdown v-if="!sidebarCollapsed" trigger="click" @command="switchStore" placement="bottom-start">
        <div class="store-card">
          <span class="store-dot" />
          <div class="store-info">
            <strong>{{ currentStore.name }}</strong>
            <small>{{ currentStore.region || '店铺切换' }} · 共 {{ stores.length }} 个</small>
          </div>
          <el-icon><CaretBottom /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="s in stores"
              :key="s.id"
              :command="s.id"
              :disabled="s.id === currentStore.id"
            >
              <el-icon style="margin-right: 6px"><component :is="s.id === currentStore.id ? 'Check' : 'OfficeBuilding'" /></el-icon>
              {{ s.name }} <span class="text-muted" style="margin-left: 6px">{{ s.region }}</span>
            </el-dropdown-item>
            <el-dropdown-item divided :icon="'Setting'" @click="router.push('/settings')">店铺管理</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-scrollbar class="nav-scroll">
        <div v-for="group in grouped" :key="group.id" class="nav-group">
          <div v-if="!sidebarCollapsed" class="nav-group-title">{{ group.label }}</div>
          <router-link
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: route.path === item.path }"
          >
            <el-icon class="nav-icon">
              <component :is="item.meta.icon || 'Document'" />
            </el-icon>
            <span v-if="!sidebarCollapsed">{{ item.meta.title }}</span>
          </router-link>
        </div>

        <div class="nav-group bottom">
          <router-link
            v-for="item in bottomItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: route.path === item.path }"
          >
            <el-icon class="nav-icon">
              <component :is="item.meta.icon || 'Setting'" />
            </el-icon>
            <span v-if="!sidebarCollapsed">{{ item.meta.title }}</span>
          </router-link>
        </div>
      </el-scrollbar>

      <div class="collapse-btn" @click="appStore.toggleSidebar()">
        <el-icon>
          <component :is="sidebarCollapsed ? 'DArrowRight' : 'DArrowLeft'" />
        </el-icon>
      </div>
    </el-aside>

    <el-drawer
      v-if="isMobile"
      v-model="mobileMenuOpen"
      direction="ltr"
      size="84%"
      :with-header="false"
      :append-to-body="true"
      class="mobile-nav-drawer"
    >
      <div class="sidebar mobile-sidebar">
        <div class="brand">
          <span class="brand-logo">a</span>
          <span class="brand-text">amz</span>
        </div>

        <el-dropdown trigger="click" @command="switchStore" placement="bottom-start">
          <div class="store-card">
            <span class="store-dot" />
            <div class="store-info">
              <strong>{{ currentStore.name }}</strong>
              <small>{{ currentStore.region || '店铺切换' }} · 共 {{ stores.length }} 个</small>
            </div>
            <el-icon><CaretBottom /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="s in stores"
                :key="s.id"
                :command="s.id"
                :disabled="s.id === currentStore.id"
              >
                <el-icon style="margin-right: 6px"><component :is="s.id === currentStore.id ? 'Check' : 'OfficeBuilding'" /></el-icon>
                {{ s.name }} <span class="text-muted" style="margin-left: 6px">{{ s.region }}</span>
              </el-dropdown-item>
              <el-dropdown-item divided :icon="'Setting'" @click="router.push('/settings')">店铺管理</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-scrollbar class="nav-scroll">
          <div v-for="group in grouped" :key="group.id" class="nav-group">
            <div class="nav-group-title">{{ group.label }}</div>
            <router-link
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              class="nav-item"
              :class="{ active: route.path === item.path }"
            >
              <el-icon class="nav-icon">
                <component :is="item.meta.icon || 'Document'" />
              </el-icon>
              <span>{{ item.meta.title }}</span>
            </router-link>
          </div>

          <div class="nav-group bottom">
            <router-link
              v-for="item in bottomItems"
              :key="item.path"
              :to="item.path"
              class="nav-item"
              :class="{ active: route.path === item.path }"
            >
              <el-icon class="nav-icon">
                <component :is="item.meta.icon || 'Setting'" />
              </el-icon>
              <span>{{ item.meta.title }}</span>
            </router-link>
          </div>
        </el-scrollbar>
      </div>
    </el-drawer>

    <el-container>
      <el-header class="topbar" :class="{ 'topbar--mobile': isMobile }">
        <div class="topbar-left">
          <el-button
            v-if="isMobile"
            class="hamburger-btn"
            text
            :icon="'Menu'"
            @click="mobileMenuOpen = true"
            aria-label="打开菜单"
          />
          <el-input
            v-else
            v-model="search"
            placeholder="搜索 SKU / ASIN / 关键词 / Campaign"
            :prefix-icon="'Search'"
            size="default"
            class="topbar-search"
            clearable
          />
        </div>
        <div class="topbar-right">
          <el-dropdown trigger="click" @command="switchStore" placement="bottom-end">
            <span class="store-chip">
              <el-icon><OfficeBuilding /></el-icon>
              <span class="store-chip-name">{{ currentStore.name }}</span>
              <el-tag size="small" effect="plain" type="info" round>{{ currentStore.region }}</el-tag>
              <el-icon><CaretBottom /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="s in stores"
                  :key="s.id"
                  :command="s.id"
                  :disabled="s.id === currentStore.id"
                >
                  <el-icon style="margin-right: 6px"><component :is="s.id === currentStore.id ? 'Check' : 'OfficeBuilding'" /></el-icon>
                  {{ s.name }} <span class="text-muted" style="margin-left: 6px">{{ s.region }}</span>
                </el-dropdown-item>
                <el-dropdown-item divided :icon="'Setting'" @click="router.push('/settings')">店铺管理</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-tag v-if="!realWritesEnabled" type="warning" effect="light" round size="small">
            <el-icon style="margin-right: 4px"><Lock /></el-icon>真实写入已关闭
          </el-tag>
          <el-tag type="success" effect="light" round size="small">
            <el-icon style="margin-right: 4px"><CircleCheck /></el-icon>Mock 数据已加载
          </el-tag>
          <NotificationBell class="topbar-bell" />
          <el-dropdown trigger="click">
            <span class="user-chip">
              <el-avatar :size="28" style="background: var(--primary)">{{ user.name.charAt(0) }}</el-avatar>
              <span class="user-name">{{ user.name }}</span>
              <el-icon><CaretBottom /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="'User'" @click="router.push('/settings')">个人设置</el-dropdown-item>
                <el-dropdown-item :icon="'SwitchButton'" divided @click="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main" :class="{ 'main--mobile': isMobile }">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}

.sidebar {
  position: relative;
  background: #ffffff;
  border-right: 1px solid var(--line);
  transition: width 0.2s ease;
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px;
  border-bottom: 1px solid var(--line-soft);
  height: 56px;
  flex-shrink: 0;
}
.brand-logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
}
.brand-text {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.04em;
}

.store-card {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px;
  padding: 8px 10px;
  background: #f9fafb;
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.store-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
}
.store-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.store-info strong {
  font-size: 13px;
}
.store-info small {
  color: var(--text-muted);
  font-size: 11px;
}

.nav-scroll {
  flex: 1;
}

.nav-group {
  padding: 8px 0;
}
.nav-group.bottom {
  border-top: 1px solid var(--line-soft);
  margin-top: 8px;
}
.nav-group-title {
  padding: 8px 16px 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-soft);
  text-transform: uppercase;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  color: var(--text);
  font-size: 13px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background 0.12s;
}
.nav-item:hover {
  background: var(--primary-soft);
}
.nav-item.active {
  background: var(--primary-soft);
  color: var(--primary);
  border-left-color: var(--primary);
  font-weight: 500;
}
.nav-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  border-top: 1px solid var(--line-soft);
  cursor: pointer;
  color: var(--text-muted);
  flex-shrink: 0;
}
.collapse-btn:hover {
  color: var(--primary);
  background: var(--primary-soft);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid var(--line);
  height: 56px;
  padding: 0 24px;
}
.topbar-left {
  flex: 1;
  max-width: 480px;
}
.topbar-search :deep(.el-input__wrapper) {
  background: var(--bg);
  box-shadow: none !important;
  border: 1px solid transparent;
}
.topbar-search :deep(.el-input__wrapper):hover,
.topbar-search :deep(.el-input__wrapper.is-focus) {
  border-color: var(--primary) !important;
  background: #fff;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.topbar-badge {
  margin-right: 4px;
}
.topbar-bell {
  margin-right: 4px;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.user-chip:hover {
  background: var(--bg);
}
.user-name {
  font-size: 13px;
}
.store-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bg);
  font-size: 13px;
  outline: none;
}
.store-chip:hover {
  background: #eef2ff;
}
.store-chip-name {
  font-weight: 600;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main {
  background: var(--bg);
  padding: 24px 24px 32px;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.hamburger-btn {
  font-size: 22px;
  padding: 6px 8px;
  margin-right: 4px;
  min-height: 36px;
}
:deep(.mobile-nav-drawer) .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
.mobile-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.topbar--mobile {
  padding: 0 12px;
}
.topbar--mobile .topbar-right {
  gap: 8px;
}
.main--mobile {
  padding: 12px 12px 24px;
}

/* 移动端响应 (legacy fallback) */
@media (max-width: 767px) {
  .topbar-search { display: none; }
  .store-chip,
  .user-name { display: none; }
  .topbar-right :deep(.el-tag) { display: none; }
}

</style>
