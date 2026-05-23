// 三体集成 helper：在 AI 时间线 / 策略库 / 广告组合 (lx) 之间桥接
//
// 关键设计：所有跨表面查询统一从这里出，方便后期接真后端。

import { suggestions, manualChanges } from './mock-data-ads-timeline';
import { strategies, getStrategy } from './mock-data-strategies';
import { getPortfolio, getCampaign } from './mock-data-lx';

// ===== 建议 ↔ entity 关联 =====

// 给定 SKU 找待处理建议
export function suggestionsBySku(sku, { state } = {}) {
  return suggestions.filter((s) => {
    if (s.entity?.sku !== sku) return false;
    if (state && s.state !== state) return false;
    return true;
  });
}

// 给定 lx Campaign 找该 Campaign 相关的待处理建议（按 sku 匹配）
export function suggestionsByCampaign(campaignId, { state = 'pending' } = {}) {
  const cmp = getCampaign(campaignId);
  if (!cmp) return [];
  const portfolio = getPortfolio(cmp.portfolioId);
  if (!portfolio) return [];
  return suggestions.filter((s) => {
    if (state && s.state !== state) return false;
    return s.entity?.sku === portfolio.sku;
  });
}

// 给定 lx Portfolio 找该 Portfolio 相关的待处理建议
export function suggestionsByPortfolio(portfolioId, { state } = {}) {
  const p = getPortfolio(portfolioId);
  if (!p) return [];
  return suggestions.filter((s) => {
    if (state && s.state !== state) return false;
    return s.entity?.sku === p.sku;
  });
}

// 给定策略找它生成的所有建议
export function suggestionsByStrategy(strategyId) {
  return suggestions.filter((s) => s.sourceStrategyId === strategyId);
}

// ===== 策略 ↔ entity 关联 =====

// 给定 SKU 找绑定到该 SKU 范围的策略（账号级 + Portfolio级 + Campaign级模拟）
export function strategiesForSku(sku) {
  // mock: 80% 账号级始终生效 + 20% 模拟绑定到这个 SKU
  const accountLevel = strategies.filter((s) => s.scope === 'account' && s.enabled);
  const portfolioLevel = strategies.filter((s) => s.scope === 'portfolio' && s.enabled).slice(0, 2);
  const campaignLevel = strategies.filter((s) => s.scope === 'campaign' && s.bindingsCount > 0).slice(0, 2);
  return { account: accountLevel, portfolio: portfolioLevel, campaign: campaignLevel };
}

// 给定策略找绑定的 Campaign 列表（mock：从 lx mock 里选若干）
export function bindingsForStrategy(strategyId) {
  const strat = getStrategy(strategyId);
  if (!strat) return [];

  // 不同策略 mock 不同绑定
  // 用 strategyId 字符 hash 来稳定挑选
  const allCampaigns = ['cmp-001', 'cmp-002', 'cmp-003', 'cmp-007', 'cmp-021', 'cmp-031', 'cmp-041'];
  const hashSeed = strategyId.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const count = Math.min(strat.bindingsCount, allCampaigns.length);
  const start = hashSeed % allCampaigns.length;
  return Array.from({ length: count }, (_, i) => {
    const cmpId = allCampaigns[(start + i) % allCampaigns.length];
    const cmp = getCampaign(cmpId);
    return cmp ? { id: cmpId, name: cmp.name, portfolioId: cmp.portfolioId, type: cmp.type } : null;
  }).filter(Boolean);
}

// ===== 统计聚合 =====

// SKU 视角的 AI 总览
export function aiActivityForSku(sku) {
  const all = suggestionsBySku(sku);
  return {
    pending: all.filter((s) => s.state === 'pending').length,
    observing: all.filter((s) => s.state === 'observing').length,
    rejected: all.filter((s) => s.state === 'rejected').length,
    totalImpact: all
      .filter((s) => s.state === 'pending')
      .reduce((sum, s) => sum + ((s.impact?.saveMonthly || 0) + (s.impact?.gainMonthly || 0)), 0),
    topPending: all.filter((s) => s.state === 'pending').slice(0, 3),
  };
}

// Portfolio 视角的 AI 总览
export function aiActivityForPortfolio(portfolioId) {
  const p = getPortfolio(portfolioId);
  if (!p) return null;
  return aiActivityForSku(p.sku);
}

// Campaign 视角的 AI 总览
export function aiActivityForCampaign(campaignId) {
  const cmp = getCampaign(campaignId);
  if (!cmp) return null;
  const portfolio = getPortfolio(cmp.portfolioId);
  if (!portfolio) return null;
  return aiActivityForSku(portfolio.sku);
}

// 子 tab AI 信号（按 action type 聚合）
export function tabAiSignals(campaignId) {
  const cmp = getCampaign(campaignId);
  if (!cmp) return {};
  const portfolio = getPortfolio(cmp.portfolioId);
  if (!portfolio) return {};
  const subs = suggestionsBySku(portfolio.sku, { state: 'pending' });

  // 按 actionType label 分组
  return {
    negative: subs.filter((s) => s.actionType?.label?.includes('否')).length,
    promote: subs.filter((s) => s.actionType?.label?.includes('升手动') || s.actionType?.label?.includes('升精准')).length,
    bid: subs.filter((s) => s.actionType?.label?.includes('bid') || s.actionType?.label?.includes('出价')).length,
    budget: subs.filter((s) => s.actionType?.label?.includes('预算')).length,
    attack: subs.filter((s) => s.actionType?.label?.includes('攻击')).length,
    crossModule: subs.filter((s) => s.crossModule).length,
    total: subs.length,
  };
}
