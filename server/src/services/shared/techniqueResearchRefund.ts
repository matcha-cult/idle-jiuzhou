/**
 * 洞府研修返还规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护洞府研修不同结果下的返还比例，并提供统一的返还数量计算函数。
 * 2. 做什么：把“草稿过期只返还一半”和“失败默认全额返还”收敛到单一规则源，避免 service 内散落倍率常量。
 * 3. 不做什么：不处理数据库写入、不负责物品发放，也不决定前端展示文案。
 *
 * 输入/输出：
 * - 输入：原始消耗 `costPoints` 与返还比例 `refundRate`。
 * - 输出：向下取整后的返还残页数量。
 *
 * 数据流/状态流：
 * technique_generation_job.cost_points -> techniqueResearchRefund -> techniqueGenerationService 退款流程。
 *
 * 关键边界条件与坑点：
 * 1. 消耗或比例异常时必须保守回退到非负整数，避免脏数据导致负数返还或小数入包。
 * 2. 过期草稿与生成失败共享同一计算入口，避免未来改倍率时只改一处造成口径漂移。
 */

export const TECHNIQUE_RESEARCH_FULL_REFUND_RATE = 1;
export const TECHNIQUE_RESEARCH_EXPIRED_DRAFT_REFUND_RATE = 0.5;

export const resolveTechniqueResearchRefundFragments = (
  costPoints: number,
  refundRate: number = TECHNIQUE_RESEARCH_FULL_REFUND_RATE,
): number => {
  const safeCostPoints = Math.max(0, Math.floor(Number(costPoints) || 0));
  const safeRefundRate = Math.max(0, Number(refundRate) || 0);
  return Math.max(0, Math.floor(safeCostPoints * safeRefundRate));
};
