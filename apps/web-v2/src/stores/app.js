import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarCollapsed: false,
    // W5/X-P1-03: currentStore is no longer a hard-coded mock constant. The real
    // store identity comes from useLocalStore (DB-backed). This holds only a UI
    // placeholder until provider status is loaded.
    user: { id: 'demo', name: '演示用户', role: 'operator' },
    // W5/W6/X-P1-03: sourceMeta is the single source of truth for the top-bar trust
    // anchors. It is populated from backend responses (dashboard sourceMeta and/or
    // /provider/status) — never hard-coded. realWritesEnabled mirrors the backend
    // gate state (honest readback only; it does NOT itself open any write path).
    //   sourceMode: 'mock' | 'real' | 'hybrid' | 'db' | 'unknown'
    sourceMeta: {
      source: 'unknown',
      mock: null,            // null = unknown; true = mock; false = real
      realWritesEnabled: false,
      sourceMode: 'unknown',
    },
    auditRequired: true,
  }),
  getters: {
    // W5: realWritesEnabled is derived from sourceMeta (single truth source), no
    // longer a setter-less dead constant.
    realWritesEnabled: (state) => state.sourceMeta.realWritesEnabled === true,
  },
  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },
    // W5: write-back point for dashboard responses & /provider/status. Accepts a
    // partial patch so callers can pass {sourceMode}, {realWritesEnabled}, {mock}…
    setSourceMeta(patch = {}) {
      this.sourceMeta = { ...this.sourceMeta, ...(patch || {}) };
    },
  },
});
