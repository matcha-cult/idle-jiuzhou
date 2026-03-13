/**
 * 成员实时在线态共享逻辑测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定在线 ID 集合构建、接口离线时间合并、在线转离线打点三段共享逻辑。
 * 2. 做什么：确保队伍与宗门复用同一套纯函数后，在线态不会因为组件迁移出现行为漂移。
 * 3. 不做什么：不挂载 React Hook、不依赖真实 socket，也不验证具体 UI 组件样式。
 *
 * 输入/输出：
 * - 输入：在线玩家 DTO、成员种子列表、上一轮在线集合和离线时间索引。
 * - 输出：在线角色 ID 集合、离线时间索引变更结果。
 *
 * 数据流/状态流：
 * 广播/接口模拟数据 -> memberPresence 纯函数 -> 队伍/宗门组件可复用状态。
 *
 * 关键边界条件与坑点：
 * 1. 重复玩家 ID 必须去重，否则在线集合会产生无意义抖动。
 * 2. 离线时间只能在在线转离线边界更新，不能因为成员列表刷新被重置为更早时间。
 */

import { describe, expect, it } from 'vitest';
import {
  buildOnlineCharacterIdSet,
  mergeMemberOfflineTimestampMap,
  recordMemberOfflineTransitions,
} from '../memberPresence';

describe('memberPresence', () => {
  it('会把在线玩家广播构建为去重后的在线角色集合', () => {
    const result = buildOnlineCharacterIdSet([
      { id: 101, nickname: '青玄', title: '队长', realm: '炼气' },
      { id: 101, nickname: '青玄', title: '队长', realm: '炼气' },
      { id: 205, nickname: '流云', title: '队员', realm: '筑基' },
    ]);

    expect(Array.from(result).sort((left, right) => left - right)).toStrictEqual([101, 205]);
  });

  it('会合并接口离线时间并清理已移除成员的旧时间戳', () => {
    const previousMap = {
      1: Date.parse('2026-03-13T09:00:00.000Z'),
      3: Date.parse('2026-03-13T08:00:00.000Z'),
    };

    const result = mergeMemberOfflineTimestampMap(previousMap, [
      { characterId: 1, lastOfflineAt: '2026-03-13T10:00:00.000Z' },
      { characterId: 2, lastOfflineAt: '2026-03-13T07:30:00.000Z' },
    ]);

    expect(result).toStrictEqual({
      1: Date.parse('2026-03-13T10:00:00.000Z'),
      2: Date.parse('2026-03-13T07:30:00.000Z'),
    });
  });

  it('只会在成员从在线切到离线时记录新的离线时间', () => {
    const previousMap = {
      4: Date.parse('2026-03-13T06:00:00.000Z'),
    };
    const previousOnlineIds = new Set([4, 7]);
    const nextOnlineIds = new Set([7, 9]);
    const now = Date.parse('2026-03-13T11:00:00.000Z');

    const result = recordMemberOfflineTransitions(
      previousMap,
      new Set([4, 7, 9]),
      previousOnlineIds,
      nextOnlineIds,
      now,
    );

    expect(result).toStrictEqual({
      4: now,
    });
  });

  it('只会给当前成员列表里的角色写离线时间', () => {
    const result = recordMemberOfflineTransitions(
      {},
      new Set([7]),
      new Set([4, 7]),
      new Set([7]),
      Date.parse('2026-03-13T12:00:00.000Z'),
    );

    expect(result).toStrictEqual({});
  });
});
