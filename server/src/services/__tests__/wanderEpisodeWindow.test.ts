/**
 * 云游奇遇目标幕数规划测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定云游故事的总幕数范围固定为 5 到 15 幕，并由程序按 `storySeed` 稳定决定。
 * 2. 做什么：确保同一个 `storySeed` 多次计算仍得到同一个目标幕数，避免跨天推进时故事长度漂移。
 * 3. 不做什么：不调用数据库，不生成剧情，也不覆盖 AI 输出内容。
 *
 * 输入/输出：
 * - 输入：若干固定 `storySeed`。
 * - 输出：对应的目标幕数与稳定性断言。
 *
 * 数据流/状态流：
 * `storySeed` -> `resolveWanderTargetEpisodeCount` -> service 用该结果决定每条故事何时允许/必须结局。
 *
 * 复用设计说明：
 * - 测试直接复用 `episodePlan` 纯函数模块，避免再去源码字符串里搜常量，保证业务规则和断言入口一致。
 * - 后续若调整幕数分布，只需要同步更新 `episodePlan` 与本测试，不会在 service 侧重复维护字符串断言。
 *
 * 关键边界条件与坑点：
 * 1. 最小和最大值必须精确落在 5 与 15，不能因为取模偏移写错成开区间。
 * 2. 同一 `storySeed` 必须稳定映射到同一结果，否则故事进行到一半会突然改总幕数。
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveWanderTargetEpisodeCount,
  WANDER_MAX_TARGET_EPISODE_COUNT,
  WANDER_MIN_TARGET_EPISODE_COUNT,
} from '../wander/episodePlan.js';

test('wander episode plan: 云游故事目标幕数范围应为 5 到 15 幕', () => {
  assert.equal(WANDER_MIN_TARGET_EPISODE_COUNT, 5);
  assert.equal(WANDER_MAX_TARGET_EPISODE_COUNT, 15);
});

test('wander episode plan: 同一 storySeed 应稳定映射到固定目标幕数', () => {
  const storySeed = 123456789;
  const targetEpisodeCount = resolveWanderTargetEpisodeCount(storySeed);

  assert.equal(targetEpisodeCount, resolveWanderTargetEpisodeCount(storySeed));
  assert.ok(targetEpisodeCount >= WANDER_MIN_TARGET_EPISODE_COUNT);
  assert.ok(targetEpisodeCount <= WANDER_MAX_TARGET_EPISODE_COUNT);
});
