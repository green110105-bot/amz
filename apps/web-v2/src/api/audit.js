import { http } from './client';

export const auditApi = {
  mockExecute: (action) => http.post('/api/v1/audit/mock-execute', action).then((r) => r.data),
};
