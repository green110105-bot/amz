// 领星 OpenAPI 签名算法 (Node 复刻, 已对真实 API 验证通过)
// sign = Base64( AES-ECB( key=app_id, PKCS7( MD5(sortedParams).toUpperCase() ) ) )
//
// 与领星官方 Python SDK (sign.py + aes.py) 完全等价:
//   canonical = sorted(k=v ...).join('&'); 空值跳过; dict/list 用无空格有序 JSON
//   md5 = MD5(canonical).hexdigest().upper()
//   sign = base64( AES-128-ECB(app_id, PKCS7(md5)) )
import crypto from 'node:crypto';

// 有序、无空格地序列化对象/数组 (等价 orjson OPT_SORT_KEYS, separators=(',',':'))
export function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',') + '}';
  }
  return JSON.stringify(v);
}

// 把参数对象格式化成 canonical query string (跳过空值, key 升序)
export function formatParams(params) {
  const keys = Object.keys(params || {})
    .filter((k) => params[k] !== '' && params[k] != null)
    .sort();
  return keys
    .map((k) => {
      const v = params[k];
      if (v && typeof v === 'object') return `${k}=${stableStringify(v)}`;
      return `${k}=${v}`;
    })
    .join('&');
}

// 生成签名。encryptKey 即 app_id(16字节, 用作 AES-128 密钥)。
export function generateSign(encryptKey, params) {
  const canonical = formatParams(params);
  const md5Upper = crypto.createHash('md5').update(canonical, 'utf8').digest('hex').toUpperCase();
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(encryptKey, 'utf8'), null);
  cipher.setAutoPadding(true); // PKCS7
  const enc = Buffer.concat([cipher.update(md5Upper, 'utf8'), cipher.final()]);
  return enc.toString('base64');
}
