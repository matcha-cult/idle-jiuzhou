/**
 * 分解奖励文案格式化
 *
 * 作用（做什么 / 不做什么）：
 * - 做：统一把后端返回的分解奖励结构格式化成页面预览和成功提示可直接展示的短文案。
 * - 做：保证单件分解弹窗、桌面批量分解、移动端批量分解使用同一套奖励展示规则，避免同一份 rewards 在多处各自拼字符串。
 * - 不做：不请求接口，不推导奖励规则，不根据物品品质或类别做任何前端补算。
 *
 * 输入/输出：
 * - 输入：后端返回的 `InventoryDisassembleRewards`。
 * - 输出：形如 `淬灵石×1，银两×120` 的单行文案；若奖励为空则返回空字符串。
 *
 * 数据流/状态流：
 * - 分解预览接口 / 实际分解接口 -> rewards 数据 -> 本模块格式化 -> 弹窗文案 / message.success。
 *
 * 关键边界条件与坑点：
 * 1) 物品奖励顺序严格跟随后端返回顺序，不在前端二次排序，避免“预览顺序”和“实际结果顺序”漂移。
 * 2) 银两为 0 时不展示该片段，保持文案紧凑；若 rewards 本身为空则明确返回空字符串，由调用方决定占位文案。
 */
import type { InventoryDisassembleRewards } from '../../../../services/api';

export const formatDisassembleRewardsText = (
  rewards: InventoryDisassembleRewards | null | undefined,
): string => {
  if (!rewards) return '';
  const parts = rewards.items.map((item) => `${item.name}×${item.qty}`);
  if (rewards.silver > 0) {
    parts.push(`银两×${rewards.silver}`);
  }
  return parts.join('，');
};

export const formatDisassembleSuccessMessage = (
  messageText: string,
  rewards: InventoryDisassembleRewards | null | undefined,
): string => {
  const rewardsText = formatDisassembleRewardsText(rewards);
  if (!rewardsText) {
    return messageText;
  }
  return `${messageText}：${rewardsText}`;
};
