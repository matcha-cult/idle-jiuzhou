/**
 * 体力恢复规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“基础恢复 + 月卡恢复速度加成”共用同一套纯函数，避免 service 与 cache 各写一份公式。
 * 2. 做什么：验证月卡生效窗口跨越恢复过程时，恢复量与下一次计时锚点都按统一口径推进。
 * 3. 不做什么：不访问数据库、不验证 Redis 缓存读写，也不覆盖体力扣减事务。
 *
 * 输入/输出：
 * - 输入：当前体力、体力上限、恢复锚点、当前时间、恢复间隔、月卡速度加成与生效窗口。
 * - 输出：恢复后的体力值、恢复数量与新的恢复锚点时间戳。
 *
 * 数据流/状态流：
 * staminaService / staminaCacheService -> staminaRules 纯函数 -> 测试断言。
 *
 * 关键边界条件与坑点：
 * 1. “速度 +10%”按速率放大计算，等价于单位时间恢复进度乘以 1.1，而不是简单把整数恢复量直接改成 1.1。
 * 2. 月卡窗口可能在本次恢复区间中途开始或结束，新的恢复锚点必须能继续复用到下一次结算，不能只算本次恢复量。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStaminaRecoveryState } from '../shared/staminaRules.js';

test('月卡全程生效时体力恢复应快于基础间隔', () => {
  const result = resolveStaminaRecoveryState({
    stamina: 10,
    maxStamina: 100,
    recoverAtMs: 0,
    nowMs: 300_000,
    recoverPerTick: 1,
    recoverIntervalMs: 300_000,
    recoverySpeedRate: 0.1,
    recoverySpeedWindow: {
      startAtMs: 0,
      expireAtMs: 3_600_000,
    },
  });

  assert.equal(result.stamina, 11);
  assert.equal(result.recovered, 1);
  assert.equal(result.nextRecoverAtMs, 272_727);
});

test('月卡在恢复过程中途生效时应只放大生效后的恢复进度', () => {
  const result = resolveStaminaRecoveryState({
    stamina: 10,
    maxStamina: 100,
    recoverAtMs: 0,
    nowMs: 300_000,
    recoverPerTick: 1,
    recoverIntervalMs: 300_000,
    recoverySpeedRate: 0.1,
    recoverySpeedWindow: {
      startAtMs: 150_000,
      expireAtMs: 3_600_000,
    },
  });

  assert.equal(result.stamina, 11);
  assert.equal(result.recovered, 1);
  assert.equal(result.nextRecoverAtMs, 286_364);
});
