/**
 * 组队战斗离队钩子回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“队员离队后，battleParticipants 与攻击方玩家单位必须同步收缩”的行为。
 * 2. 做什么：验证离队成员恰好处于当前行动位时，战斗会推进到下一合法行动方，避免 currentUnitId 悬空卡死。
 * 3. 不做什么：不覆盖前端战斗页切换，也不覆盖队伍服务本身的入队/退队流程。
 *
 * 输入/输出：
 * - 输入：BattleEngine、battleParticipants 运行时映射、离队用户 ID。
 * - 输出：离队后的 participants 列表、攻击方单位列表，以及 currentTeam/currentUnitId 的推进结果。
 *
 * 数据流/状态流：
 * - 测试用例 -> onUserLeaveTeam -> teamHooks 收缩参战者 -> BattleEngine 同步收缩 attacker.units 并重排行动指针。
 *
 * 关键边界条件与坑点：
 * 1. 只删 participants 不删单位会让离队成员继续留在战斗里，随后手动放技能命中“无权操作此战斗”。
 * 2. 如果删除的是当前行动单位，只把 currentUnitId 置空会让 ticker 拿不到当前单位，整场战斗卡住不推进。
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleEngine } from '../../battle/battleEngine.js';
import * as gameServerModule from '../../game/gameServer.js';
import { onUserLeaveTeam } from '../battle/teamHooks.js';
import * as battleRuntimeState from '../battle/runtime/state.js';
import { createState, createUnit } from './battleTestUtils.js';

test('onUserLeaveTeam: 离队成员应同步移出参战名单与攻击方单位，并把回合推进到下一方', async (t) => {
  const battleId = 'battle-team-leave-test';
  const leader = createUnit({ id: 'player-1', name: '队长' });
  const member = createUnit({ id: 'player-2', name: '队员' });
  const monster = createUnit({ id: 'monster-1', name: '妖兽', type: 'monster' });
  const state = createState({
    attacker: [leader, member],
    defender: [monster],
  });
  state.battleId = battleId;
  state.firstMover = 'attacker';
  state.currentTeam = 'attacker';
  state.phase = 'action';
  state.currentUnitId = member.id;

  const engine = new BattleEngine(state);
  battleRuntimeState.activeBattles.set(battleId, engine);
  battleRuntimeState.battleParticipants.set(battleId, [1, 2]);

  t.after(() => {
    battleRuntimeState.activeBattles.delete(battleId);
    battleRuntimeState.battleParticipants.delete(battleId);
  });

  t.mock.method(battleRuntimeState, 'getUserIdByCharacterId', async (characterId: number) => {
    return characterId;
  });
  t.mock.method(gameServerModule, 'getGameServer', () => ({
    emitToUser: () => undefined,
  }) as never);

  await onUserLeaveTeam(2);

  const nextState = engine.getState();
  assert.deepEqual(battleRuntimeState.battleParticipants.get(battleId), [1]);
  assert.deepEqual(
    nextState.teams.attacker.units.map((unit) => unit.id),
    [leader.id],
  );
  assert.equal(nextState.currentTeam, 'defender');
  assert.equal(nextState.currentUnitId, monster.id);
});
