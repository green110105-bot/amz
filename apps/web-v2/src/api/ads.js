import { http } from './client';

export const adsApi = {
  suggestions: () => http.get('/api/v1/ads/suggestions').then((r) => r.data),
};
