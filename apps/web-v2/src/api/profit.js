// profit.js — DEPRECATED 薄封装，请改用 ../api/m2 中的 profitApi 等
// 保留是为了让旧代码 import 不至于编译失败；新代码请直接 import 自 './m2'
import { profitApi as m2ProfitApi } from './m2';

export const profitApi = {
  overview: (range = '30d') => m2ProfitApi.overview(range),
  recompute: (body = {}) => m2ProfitApi.recompute(body),
};
