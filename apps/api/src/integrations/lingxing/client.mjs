// 领星 OpenAPI 客户端 — access-token 获取/缓存 + 签名请求。
// 凭证来自 env: LINGXING_APP_ID / LINGXING_APP_SECRET / LINGXING_HOST。
// 安全: 不在日志/审计中输出 app_secret 或 access_token 明文。
import { generateSign } from './sign.mjs';

const DEFAULT_HOST = 'https://openapi.lingxing.com';

export function lingxingConfig() {
  return {
    host: process.env.LINGXING_HOST || DEFAULT_HOST,
    appId: process.env.LINGXING_APP_ID || '',
    appSecret: process.env.LINGXING_APP_SECRET || '',
  };
}

export function isLingxingConfigured() {
  const c = lingxingConfig();
  return Boolean(c.appId && c.appSecret);
}

// 进程内 access_token 缓存 (单实例足够; 过期前 60s 续)。
let _tokenCache = { token: null, expiresAt: 0 };

export function _resetTokenCacheForTest() { _tokenCache = { token: null, expiresAt: 0 }; }

async function fetchAccessToken() {
  const { host, appId, appSecret } = lingxingConfig();
  if (!appId || !appSecret) throw new Error('lingxing_credentials_missing');
  const body = new URLSearchParams({ appId, appSecret });
  const r = await fetch(`${host}/api/auth-server/oauth/access-token`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (String(j.code) !== '200' || !j.data?.access_token) {
    throw new Error('lingxing_token_failed: ' + String(j.msg || j.message || j.code || 'unknown'));
  }
  const expiresIn = Number(j.data.expires_in || 3600);
  return { token: j.data.access_token, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
}

export async function getAccessToken({ force = false } = {}) {
  if (!force && _tokenCache.token && Date.now() < _tokenCache.expiresAt) return _tokenCache.token;
  _tokenCache = await fetchAccessToken();
  return _tokenCache.token;
}

// 已签名请求。route 例: /basicOpen/platformStatisticsV2/saleStat/pageList
export async function signedRequest(route, { method = 'POST', query = {}, body = null } = {}) {
  const { host, appId } = lingxingConfig();
  const token = await getAccessToken();
  const signParams = { app_key: appId, access_token: token, timestamp: `${Math.floor(Date.now() / 1000)}` };
  // 签名覆盖 body + query + signParams (领星: req_body 深拷贝后 update query, 再 update signParams)
  const all = { ...(body || {}), ...query, ...signParams };
  const sign = generateSign(appId, all);
  const qs = new URLSearchParams({ ...signParams, sign, ...stringifyQuery(query) });
  const url = `${host}${route}?${qs.toString()}`;
  const init = { method, headers: {} };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(url, init);
  return await r.json().catch(() => ({ code: -1, message: 'invalid_json_response' }));
}

function stringifyQuery(query) {
  const out = {};
  for (const [k, v] of Object.entries(query || {})) {
    out[k] = v && typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}
