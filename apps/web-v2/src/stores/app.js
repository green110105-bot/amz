import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarCollapsed: false,
    currentStore: { id: 'mock-store-us', name: 'Mock Store · US', region: 'US' },
    user: { id: 'demo', name: '演示用户', role: 'operator' },
    realWritesEnabled: false,
    auditRequired: true,
  }),
  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },
  },
});
