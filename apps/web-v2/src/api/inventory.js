// inventory.js — DEPRECATED 薄封装，请改用 ../api/m2 中的 reorderApi
// 保留是为了让旧代码 import 不至于编译失败
import { reorderApi } from './m2';

export const inventoryApi = {
  // legacy: 返回 { decisions: [...] }
  decisions: () => reorderApi.list().then((r) => (r?.decisions ? r : { decisions: r?.items || r || [] })),
};
