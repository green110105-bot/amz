// X-P1-09: 审计中心 KPI 影响金额分账计算
// 历史 bug: 旧实现对含正负值的 monthlySaving 做 reduce 净加,
// 把 "已节省"(正)与 "已投入/成本"(负) 互相抵消, 输出语义错乱的单一数字。
// 修复: 拆为两个分账字段, 正值归 saved(已节省), 负值取绝对值归 invested(已投入),
// 二者各自汇总, 禁止正负净加。
//
// 注意: 该数字来源为 mock 事前预估, Amazon 端从未真实发生,
// 因此对外文案必须带 "模拟/预估" 限定词(见 Audit.vue KPI 卡)。

/**
 * 按正负拆分 monthlySaving 为两个分账汇总。
 * @param {Array<{monthlySaving?: number}>} logs
 * @returns {{ saved: number, invested: number }}
 *   saved    - 已节省: 所有正值之和
 *   invested - 已投入: 所有负值的绝对值之和
 */
export function splitMonthlyImpact(logs) {
  let saved = 0;
  let invested = 0;
  for (const log of logs || []) {
    const v = Number(log && log.monthlySaving);
    if (!Number.isFinite(v) || v === 0) continue;
    if (v > 0) saved += v;
    else invested += -v;
  }
  return { saved, invested };
}
