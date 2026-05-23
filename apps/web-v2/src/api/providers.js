// Provider 接口 — LLM / 图像生成 / SP-API / Ads API
// 当前为 mock fallback；真接时替换 backend 实现并设置 VITE_USE_REAL=true

import { http } from './client';

const useReal = import.meta.env.VITE_USE_REAL === 'true';

// ===== LLM Provider =====
export const llmProvider = {
  available: useReal,
  async generate(promptId, context) {
    if (useReal) {
      return await http.post('/api/v1/ai/generate', { promptId, context }).then((r) => r.data);
    }
    await sleep(400);
    return mockLlmFallback(promptId, context);
  },
};

function mockLlmFallback(promptId, _context) {
  if (promptId.startsWith('P-M1-PROPOSE')) {
    return {
      proposals: [
        { id: 'A', angle: '材质工艺', text: 'Military-Grade Drop Protection Phone Case — TPU+PC Dual Layer · MIL-STD-810G Certified · Survives 12ft Drops' },
        { id: 'B', angle: '场景使用', text: 'Designed for Active Lifestyle — Anti-Slip Grip · Ridged Edges · Hiking & Sports Approved' },
        { id: 'C', angle: '数据实证', text: '360° Protection · Tested 50,000 Drops · 4-Corner Reinforced · 1-Year Warranty' },
      ],
      _source: 'mock_fallback',
      _hint: '设置 VITE_USE_REAL=true + 后端配置 LLM_PROVIDER 即可走真实 LLM',
    };
  }
  if (promptId.startsWith('P-M1-DIAGNOSE')) {
    return { totalScore: 67, _source: 'mock_fallback' };
  }
  return { _source: 'mock_fallback', message: '未配置真实 LLM Provider，返回 mock' };
}

// ===== 图像生成 Provider =====
export const imageProvider = {
  available: useReal,
  async generate({ type, prompt, referenceImageUrl, brandSettings }) {
    if (useReal) {
      return await http.post('/api/v1/ai/image/generate', { type, prompt, referenceImageUrl, brandSettings }).then((r) => r.data);
    }
    await sleep(800);
    return {
      candidates: [
        { id: 'A', style: 'top-left-badge', imageUrl: '', desc: '左上角"3 YEAR WARRANTY"角标 / 白底', compliance: { white_bg: true, product_ratio: 0.87 } },
        { id: 'B', style: 'right-bottom-circle', imageUrl: '', desc: '右下圆形徽章 / 白底', compliance: { white_bg: true, product_ratio: 0.86 } },
        { id: 'C', style: 'dual-badge', imageUrl: '', desc: '双角标方案 / 信息密度高', compliance: { white_bg: true, product_ratio: 0.85, warning: '稍显拥挤' } },
      ],
      _source: 'mock_fallback',
      _hint: '设置 VITE_USE_REAL=true + 后端配置 IMAGE_PROVIDER (DALL-E / Imagen / SD) 即可',
    };
  },
};

// ===== SP-API Provider =====
export const spApiProvider = {
  available: useReal,
  async getOrders() {
    if (useReal) return await http.get('/api/v1/spapi/orders').then((r) => r.data);
    return { orders: [], _source: 'mock_fallback', _hint: '需要 SP-API OAuth 凭证（refresh_token）' };
  },
  async patchListing(asin, patch) {
    if (useReal) return await http.post('/api/v1/spapi/listings/' + asin, patch).then((r) => r.data);
    return { success: false, blocked: true, _source: 'mock_fallback', reason: 'real_writes_disabled' };
  },
};

// ===== Ads API Provider =====
export const adsApiProvider = {
  available: useReal,
  async listCampaigns() {
    if (useReal) return await http.get('/api/v1/ads/campaigns').then((r) => r.data);
    return { campaigns: [], _source: 'mock_fallback' };
  },
  async updateBid(campaignId, keywordId, bid) {
    if (useReal) return await http.post('/api/v1/ads/keywords/' + keywordId + '/bid', { bid, campaignId }).then((r) => r.data);
    return { success: false, blocked: true, _source: 'mock_fallback' };
  },
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
