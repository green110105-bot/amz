import { http } from './client';

export const dashboardApi = {
  fetch: () => http.get('/api/v1/dashboard').then((r) => r.data),
  // W17: lightweight summary for top-bar badge polling (cardSummary + unreadCount,
  // same source as the full /api/v1/dashboard actionCards).
  summary: () => http.get('/api/v1/dashboard/summary').then((r) => r.data),
};
