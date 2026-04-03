/**
 * 云游弹窗主展示幕次回归测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“当前缘法”顶部展示幕次的选择规则，避免非终幕结算完成后结果只剩故事回顾区可见。
 * 2. 做什么：直接验证 `resolveWanderPrimaryEpisode` 这个唯一入口，防止组件 JSX 再次散落同类判定。
 * 3. 不做什么：不挂载弹窗组件，不校验 antd 行为，也不覆盖接口请求流程。
 *
 * 输入 / 输出：
 * - 输入：构造的 `currentEpisode` 与 `WanderStoryDto`。
 * - 输出：应显示在“当前缘法”顶部的单个幕次或 `null`。
 *
 * 数据流 / 状态流：
 * - 测试数据 -> `resolveWanderPrimaryEpisode` -> 断言返回幕次 id。
 *
 * 复用设计说明：
 * 1. 顶部结果展示口径集中在 `primaryEpisode` 纯函数，测试直接锁住单一入口，避免组件和测试各写一套判断。
 * 2. 后续若服务端 `currentEpisode` 暴露规则继续变化，只需要同步这里即可覆盖前端顶部展示语义。
 *
 * 关键边界条件与坑点：
 * 1. 最近一幕若仍未选择或仍在结算中，不能被当作顶部完成态结果返回。
 * 2. 只允许复用故事里的最后一幕；若故事前几幕已结算但最后一幕未完成，也必须返回 `null`。
 */

import { describe, expect, it } from 'vitest';
import type { WanderEpisodeDto, WanderStoryDto } from '../../../../services/api';
import { resolveWanderPrimaryEpisode } from '../WanderModal/primaryEpisode';

const buildEpisode = (overrides: Partial<WanderEpisodeDto> = {}): WanderEpisodeDto => ({
  id: 'wander-episode-1',
  dayKey: '2026-04-03',
  dayIndex: 1,
  title: '桥下窥影',
  opening: '夜雨压桥，你在断桥前看见两股气息对峙。',
  options: [
    { index: 0, text: '先稳住桥势' },
    { index: 1, text: '先逼问来客' },
    { index: 2, text: '先探桥下暗潮' },
  ],
  chosenOptionIndex: 0,
  chosenOptionText: '先稳住桥势',
  summary: '你先稳住桥势，再将暗潮与来客一并压回河中。',
  isEnding: false,
  endingType: 'none',
  rewardTitleName: null,
  rewardTitleDesc: null,
  rewardTitleColor: null,
  rewardTitleEffects: {},
  createdAt: '2026-04-03T00:00:00.000Z',
  chosenAt: '2026-04-03T00:05:00.000Z',
  ...overrides,
});

const buildStory = (episodes: WanderEpisodeDto[]): WanderStoryDto => ({
  id: 'wander-story-1',
  status: 'active',
  theme: '雨夜借灯',
  premise: '你在断桥与旧祠之间卷入一场奇异缘法。',
  summary: '',
  episodeCount: episodes.length,
  rewardTitleId: null,
  finishedAt: null,
  createdAt: '2026-04-03T00:00:00.000Z',
  updatedAt: '2026-04-03T00:00:00.000Z',
  episodes,
});

describe('resolveWanderPrimaryEpisode', () => {
  it('存在 currentEpisode 时应优先使用当前幕', () => {
    const currentEpisode = buildEpisode({ id: 'current-episode', chosenOptionIndex: null, chosenOptionText: null, chosenAt: null });
    const storyForHistory = buildStory([buildEpisode({ id: 'history-episode' })]);

    const result = resolveWanderPrimaryEpisode({
      currentEpisode,
      storyForHistory,
    });

    expect(result?.id).toBe('current-episode');
  });

  it('currentEpisode 缺失时应回退到最近一幕的已结算结果', () => {
    const storyForHistory = buildStory([
      buildEpisode({ id: 'episode-1' }),
      buildEpisode({
        id: 'episode-2',
        dayIndex: 2,
        summary: '你在第二幕镇住桥下暗潮，余波仍在夜雨里翻涌。',
      }),
    ]);

    const result = resolveWanderPrimaryEpisode({
      currentEpisode: null,
      storyForHistory,
    });

    expect(result?.id).toBe('episode-2');
    expect(result?.summary).toContain('镇住桥下暗潮');
  });

  it('最近一幕未完成时不应错误展示顶部完成态结果', () => {
    const storyForHistory = buildStory([
      buildEpisode({ id: 'episode-1' }),
      buildEpisode({
        id: 'episode-2',
        dayIndex: 2,
        chosenOptionIndex: 1,
        chosenOptionText: '先逼问来客',
        chosenAt: null,
      }),
    ]);

    const result = resolveWanderPrimaryEpisode({
      currentEpisode: null,
      storyForHistory,
    });

    expect(result).toBeNull();
  });
});
