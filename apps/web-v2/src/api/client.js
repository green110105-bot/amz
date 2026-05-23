import axios from 'axios';

const apiBase = import.meta.env.VITE_API_BASE || '';
const TOKEN_KEY = 'amz_auth_token';
const STORE_KEY = 'amz_current_store_id';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
export function clearToken() { setToken(''); }

export function getCurrentStoreId() {
  try { return localStorage.getItem(STORE_KEY) || ''; } catch { return ''; }
}
export function setCurrentStoreId(id) {
  try {
    if (id) localStorage.setItem(STORE_KEY, id);
    else localStorage.removeItem(STORE_KEY);
  } catch {}
}

export const http = axios.create({
  baseURL: apiBase,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const sid = getCurrentStoreId();
  if (sid) config.headers['X-Store-Id'] = sid;
  return config;
});

http.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.error || err.message;
    if (status === 401) {
      try { localStorage.removeItem(TOKEN_KEY); } catch {}
    }
    return Promise.reject(Object.assign(new Error(detail), { status, raw: err.response?.data }));
  },
);
