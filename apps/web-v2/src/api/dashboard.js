import { http } from './client';

export const dashboardApi = {
  fetch: () => http.get('/api/v1/dashboard').then((r) => r.data),
};
