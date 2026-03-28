/**
 * BattleSession 投影恢复回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“服务重启后 BattleSession runtime 清空，但在线战斗 session 投影仍能恢复秘境会话”的关键恢复链路。
 * 2. 做什么：验证秘境 `waiting_transition` 从投影回填后，会重新挂起服务端自动推进，避免发布重启把下一波推进掐断。
 * 3. 不做什么：不覆盖 battle engine 的 Redis 恢复；该部分已有 battle lifecycle 独立负责。
 *
 * 输入/输出：
 * - 输入：在线战斗 session 投影、battleId、模拟的秘境下一波开战结果。
 * - 输出：BattleSession 查询成功、runtime 索引恢复成功，以及 waiting_transition 能自动切到下一波 battle。
 *
 * 数据流/状态流：
 * - 投影读取 -> BattleSession service 回填 runtime -> 查询 / 自动推进继续工作。
 *
 * 复用设计说明：
 * - 两个用例共用 BattleSession runtime 清理与投影构造，避免重复维护同一批 session 字段。
 * - 秘境恢复的高频变化点是 `waiting_transition -> running(next battle)`，因此专门单测这条状态迁移。
 *
 * 关键边界条件与坑点：
 * 1. 仅恢复 `running / waiting_transition` 会话；若误把终态会话重新挂回 runtime，会把旧秘境残留重新暴露给前端。
 * 2. 重启后的自动推进不能依赖旧进程里的定时器；测试必须验证新进程重新挂起了新的推进任务。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import * as battleQueriesModule from '../battle/queries.js';
import * as dungeonCombatModule from '../dungeon/combat.js';
import * as gameServerModule from '../../game/gameServer.js';
import type { OnlineBattleSessionSnapshot } from '../onlineBattleProjectionService.js';
import * as projectionModule from '../onlineBattleProjectionService.js';
import {
  getBattleSessionDetailByBattleId,
  recoverBattleSessionsFromProjection,
} from '../battleSession/service.js';
import {
  battleSessionById,
  battleSessionIdByBattleId,
} from '../battleSession/runtime.js';

const createProjection = (
  overrides?: Partial<OnlineBattleSessionSnapshot>,
): OnlineBattleSessionSnapshot => ({
  sessionId: 'projection-session-1',
  type: 'dungeon',
  ownerUserId: 1,
  participantUserIds: [1, 2],
  currentBattleId: 'projection-battle-1',
  status: 'running',
  nextAction: 'none',
  canAdvance: false,
  lastResult: null,
  context: { instanceId: 'projection-instance-1' },
  createdAt: 1_710_000_000_000,
  updatedAt: 1_710_000_000_000,
  ...overrides,
});

test('getBattleSessionDetailByBattleId: runtime 丢失后应从在线战斗投影恢复会话', async (t) => {
  const projection = createProjection();

  t.after(() => {
    battleSessionById.clear();
    battleSessionIdByBattleId.clear();
  });

  t.mock.method(
    projectionModule,
    'getOnlineBattleSessionProjectionByBattleId',
    async (battleId: string) => {
      assert.equal(battleId, projection.currentBattleId);
      return projection;
    },
  );
  t.mock.method(
    battleQueriesModule,
    'getBattleState',
    async (battleId: string) => {
      assert.equal(battleId, projection.currentBattleId);
      return {
        success: true as const,
        data: {
          state: {
            battleId,
            phase: 'action',
            roundCount: 1,
          },
        },
      };
    },
  );

  const result = await getBattleSessionDetailByBattleId(1, 'projection-battle-1');

  assert.equal(result.success, true);
  if (!result.success) {
    assert.fail('按 battleId 查询应成功恢复投影会话');
  }
  assert.equal(result.data.session.sessionId, projection.sessionId);
  assert.equal(result.data.session.currentBattleId, projection.currentBattleId);
  assert.equal(battleSessionById.get(projection.sessionId)?.currentBattleId, projection.currentBattleId);
  assert.equal(battleSessionIdByBattleId.get('projection-battle-1'), projection.sessionId);
});

test('recoverBattleSessionsFromProjection: 秘境 waiting_transition 恢复后应自动推进下一波', async (t) => {
  const waitingProjection = createProjection({
    sessionId: 'projection-session-auto-advance',
    currentBattleId: 'projection-battle-waiting',
    status: 'waiting_transition',
    nextAction: 'advance',
    canAdvance: true,
    lastResult: 'attacker_win',
    context: { instanceId: 'projection-instance-auto-advance' },
  });
  const nextBattleId = 'projection-battle-next';
  const emitted: Array<{ userId: number; event: string; payload: { battleId?: string; kind?: string } }> = [];
  let nextDungeonCallCount = 0;

  t.after(() => {
    battleSessionById.clear();
    battleSessionIdByBattleId.clear();
  });

  t.mock.method(
    projectionModule,
    'listOnlineBattleSessionProjections',
    async () => [waitingProjection],
  );
  t.mock.method(
    dungeonCombatModule,
    'nextDungeonInstance',
    async (
      userId: number,
      instanceId: string,
      options?: {
        onBattleRegistered?: (payload: { battleId: string; participantUserIds: number[] }) => void;
      },
    ) => {
      nextDungeonCallCount += 1;
      assert.equal(userId, 1);
      assert.equal(instanceId, 'projection-instance-auto-advance');
      options?.onBattleRegistered?.({
        battleId: nextBattleId,
        participantUserIds: [1, 2],
      });
      return {
        success: true as const,
        data: {
          instanceId,
          status: 'running' as const,
          battleId: nextBattleId,
          state: {
            battleId: nextBattleId,
            phase: 'action',
            roundCount: 1,
          },
        },
      };
    },
  );
  t.mock.method(gameServerModule, 'getGameServer', () => ({
    emitToUser: (userId: number, event: string, payload: { battleId?: string; kind?: string }) => {
      emitted.push({ userId, event, payload });
    },
  }) as never);

  const recoveredCount = await recoverBattleSessionsFromProjection();
  assert.equal(recoveredCount, 1);
  assert.equal(battleSessionById.get(waitingProjection.sessionId)?.status, 'waiting_transition');

  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 260);
  });

  const restored = battleSessionById.get(waitingProjection.sessionId);
  assert.equal(nextDungeonCallCount, 1);
  assert.ok(restored);
  assert.equal(restored?.status, 'running');
  assert.equal(restored?.currentBattleId, nextBattleId);
  assert.equal(restored?.canAdvance, false);
  assert.equal(battleSessionIdByBattleId.get(nextBattleId), waitingProjection.sessionId);
  assert.deepEqual(emitted.map((entry) => entry.userId), [1, 2]);
  for (const entry of emitted) {
    assert.equal(entry.event, 'battle:update');
    assert.equal(entry.payload.kind, 'battle_started');
    assert.equal(entry.payload.battleId, nextBattleId);
  }
});
