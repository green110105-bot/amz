import { http } from './client';

export const monitorApi = {
  overview: () => http.get('/api/v1/monitor/overview').then((r) => r.data),
};
