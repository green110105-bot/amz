// store.js — 真后端 store / auth API 客户端
import { http } from './client';

export const authApi = {
  login: (email, password) => http.post('/api/v1/auth/login', { email, password }).then((r) => r.data),
  register: ({ email, password, name }) => http.post('/api/v1/auth/register', { email, password, name }).then((r) => r.data),
  forgotPassword: (email) => http.post('/api/v1/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: ({ token, newPassword }) => http.post('/api/v1/auth/reset-password', { token, newPassword }).then((r) => r.data),
  logout: () => http.post('/api/v1/auth/logout').then((r) => r.data),
  me: () => http.get('/api/v1/auth/me').then((r) => r.data),
};

export const storesApi = {
  list: () => http.get('/api/v1/store/stores').then((r) => r.data.items || []),
  add: (s) => http.post('/api/v1/store/stores', s).then((r) => r.data),
  update: (id, patch) => http.put(`/api/v1/store/stores/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`/api/v1/store/stores/${id}`).then((r) => r.data),
};

export const storeApi = {
  // Audit Logs
  listAuditLogs: () => http.get('/api/v1/store/audit-logs').then((r) => r.data.items || []),
  appendAuditLog: (log) => http.post('/api/v1/store/audit-logs', log).then((r) => r.data),
  revertAuditLog: (id, reason) => http.post(`/api/v1/store/audit-logs/${id}/revert`, { reason }).then((r) => r.data),

  // Keyword Library
  listKeywords: () => http.get('/api/v1/store/keywords').then((r) => r.data.items || []),
  addKeyword: (kw) => http.post('/api/v1/store/keywords', kw).then((r) => r.data),
  removeKeyword: (id) => http.delete(`/api/v1/store/keywords/${id}`).then((r) => r.data),

  // Custom Alerts
  listAlerts: () => http.get('/api/v1/store/alerts').then((r) => r.data.items || []),
  addAlert: (rule) => http.post('/api/v1/store/alerts', rule).then((r) => r.data),
  updateAlert: (id, patch) => http.put(`/api/v1/store/alerts/${id}`, patch).then((r) => r.data),
  removeAlert: (id) => http.delete(`/api/v1/store/alerts/${id}`).then((r) => r.data),

  // Notifications
  listNotificationsRead: () => http.get('/api/v1/store/notifications/read').then((r) => r.data.read || {}),
  markNotificationRead: (id) => http.post(`/api/v1/store/notifications/${id}/read`).then((r) => r.data),

  // Settings
  getSettings: () => http.get('/api/v1/store/settings').then((r) => r.data),
  updateSettings: (patch) => http.put('/api/v1/store/settings', patch).then((r) => r.data),

  // Sovereignty
  getSovereignty: () => http.get('/api/v1/store/sovereignty').then((r) => r.data),
  setSovereignty: (patch) => http.put('/api/v1/store/sovereignty', patch).then((r) => r.data),
};
