/**
 * 秘境战斗重连恢复共享规则测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“哪些 battleId 需要触发秘境实例恢复”和“哪些实例快照允许接管当前战斗页”这两条共享规则。
 * 2. 做什么：避免 Game 页、socket 回调、后续其他入口各自复制秘境重连判定，导致恢复时机不一致。
 * 3. 不做什么：不请求真实接口、不挂载 React 组件，也不验证 BattleArea 的渲染细节。
 *
 * 输入/输出：
 * - 输入：battleId、当前已持有的秘境上下文，以及服务端返回的秘境实例快照。
 * - 输出：是否应发起恢复查询、是否应接受当前实例快照。
 *
 * 数据流/状态流：
 * socket battle:update -> 共享判定 -> 决定是否查询秘境实例 -> 校验实例快照 -> Game 页恢复 battle 视图。
 *
 * 关键边界条件与坑点：
 * 1. 普通地图战斗与竞技场战斗不能误触发秘境查询，否则会造成无意义请求与上下文串线。
 * 2. 只有“运行中且 currentBattleId 与当前 battleId 完全一致”的实例才能接管页面，避免把旧波次或已结束实例误恢复回来。
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDungeonBattleId,
  matchesDungeonReconnectInstance,
  shouldRestoreDungeonBattleContext,
} from '../dungeonBattleReconnect.js';

test('只有秘境 battleId 才应触发秘境恢复链路', () => {
  assert.equal(isDungeonBattleId('dungeon-battle-1001-1'), true);
  assert.equal(isDungeonBattleId('battle-1001-1'), false);
  assert.equal(isDungeonBattleId(''), false);
});

test('当前已持有同一 battleId 的完整秘境上下文时，不应重复恢复', () => {
  assert.equal(
    shouldRestoreDungeonBattleContext({
      battleId: 'dungeon-battle-1001-1',
      currentDungeonBattleId: 'dungeon-battle-1001-1',
      currentDungeonInstanceId: 'instance-1',
    }),
    false,
  );
});

test('缺少实例 ID 或 battleId 已切换时，应重新恢复秘境上下文', () => {
  assert.equal(
    shouldRestoreDungeonBattleContext({
      battleId: 'dungeon-battle-1001-2',
      currentDungeonBattleId: 'dungeon-battle-1001-1',
      currentDungeonInstanceId: 'instance-1',
    }),
    true,
  );

  assert.equal(
    shouldRestoreDungeonBattleContext({
      battleId: 'dungeon-battle-1001-1',
      currentDungeonBattleId: 'dungeon-battle-1001-1',
      currentDungeonInstanceId: null,
    }),
    true,
  );
});

test('只有运行中且 currentBattleId 与当前 battleId 一致的实例快照才允许接管', () => {
  assert.equal(
    matchesDungeonReconnectInstance('dungeon-battle-1001-3', {
      id: 'instance-3',
      status: 'running',
      currentBattleId: 'dungeon-battle-1001-3',
    }),
    true,
  );

  assert.equal(
    matchesDungeonReconnectInstance('dungeon-battle-1001-3', {
      id: 'instance-3',
      status: 'running',
      currentBattleId: 'dungeon-battle-1001-2',
    }),
    false,
  );

  assert.equal(
    matchesDungeonReconnectInstance('dungeon-battle-1001-3', {
      id: 'instance-3',
      status: 'cleared',
      currentBattleId: 'dungeon-battle-1001-3',
    }),
    false,
  );
});
