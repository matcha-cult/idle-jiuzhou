import type { WanderEpisodeDto, WanderStoryDto } from '../../../../services/api';

/**
 * 云游弹窗主展示幕次判定
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一决定“当前缘法”面板优先展示哪一幕，优先使用服务端明确给出的 `currentEpisode`，否则回退到故事流里最近一幕的已结算结果。
 * 2. 做什么：把“最近一幕已结算后仍应继续显示在上方”的布局规则集中到纯函数，避免 `WanderModal` 和测试各写一遍分支。
 * 3. 不做什么：不推导生成任务状态，不负责冷却按钮显隐，也不改写服务端幕次数据。
 *
 * 输入 / 输出：
 * - 输入：当前概览中的 `currentEpisode` 与用于故事回顾的 `storyForHistory`。
 * - 输出：应显示在“当前缘法”面板顶部的单个幕次；若不存在符合规则的幕次则返回 `null`。
 *
 * 数据流 / 状态流：
 * - `WanderModal` 先读取 overview 中的 `currentEpisode` 与 `storyForHistory`
 * - 本模块按统一优先级收敛成单个主展示幕次
 * - 组件只消费这一个结果完成顶部剧情与结果渲染
 *
 * 复用设计说明：
 * 1. “主展示幕次”规则属于高频展示变化点，独立出来后，后续若首页、日志页也需要沿用相同口径，可直接复用，避免重复维护。
 * 2. 测试直接命中本模块，能把“服务端未显式返回 currentEpisode 时，最近已结算幕次仍应置顶展示”的规则锁在单一入口。
 *
 * 关键边界条件与坑点：
 * 1. 最近一幕若仍在待选或结算中，不能误判为已完成结果；否则会把未完成剧情提前挪到顶部完成态展示。
 * 2. 仅允许复用故事流中的最后一幕；不能从更早幕次中倒序捞结果，否则会让上方展示和当前故事进度错位。
 */

const getLatestStoryEpisode = (story: WanderStoryDto | null): WanderEpisodeDto | null => {
  if (!story || story.episodes.length === 0) {
    return null;
  }

  return story.episodes[story.episodes.length - 1];
};

export const isResolvedWanderEpisode = (episode: WanderEpisodeDto | null): episode is WanderEpisodeDto => {
  return episode !== null && episode.chosenOptionIndex !== null && episode.chosenAt !== null;
};

export const resolveWanderPrimaryEpisode = (params: {
  currentEpisode: WanderEpisodeDto | null;
  storyForHistory: WanderStoryDto | null;
}): WanderEpisodeDto | null => {
  if (params.currentEpisode) {
    return params.currentEpisode;
  }

  const latestStoryEpisode = getLatestStoryEpisode(params.storyForHistory);
  return isResolvedWanderEpisode(latestStoryEpisode) ? latestStoryEpisode : null;
};
