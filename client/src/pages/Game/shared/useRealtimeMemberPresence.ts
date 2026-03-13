import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameSocket } from '../../../services/gameSocket';
import {
  buildOnlineCharacterIdSet,
  formatPresenceOfflineText,
  mergeMemberOfflineTimestampMap,
  OFFLINE_DURATION_TICK_MS,
  recordMemberOfflineTransitions,
  type PresenceMemberSeed,
} from './memberPresence';

/**
 * 成员实时在线态 Hook。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把 socket 在线玩家广播统一收敛成成员列表可直接消费的在线判定与离线文案。
 * 2. 做什么：让队伍、宗门等多个成员列表共用一套状态流，减少组件内部重复订阅和时间戳维护。
 * 3. 不做什么：不参与成员排序、不拼装业务视图模型，也不回写服务端数据。
 *
 * 输入/输出：
 * - 输入：成员种子列表（`characterId` + 可选 `lastOfflineAt`）。
 * - 输出：在线角色 ID 集合、是否在线判定、离线文案读取函数。
 *
 * 数据流/状态流：
 * 成员种子列表 -> 合并接口离线时间 -> 订阅 `gameSocket.onOnlinePlayersUpdate` -> 生成在线集合/离线打点 -> 组件渲染。
 *
 * 关键边界条件与坑点：
 * 1. 首次挂载时若 socket 已缓存在线名单，监听器会立即收到当前快照，避免登录后还要等下一轮广播。
 * 2. 没有接口离线时间的列表项只提供在线布尔值；若离线且缺少时间戳，离线文案统一退回“较早前在线”。
 */
export const useRealtimeMemberPresence = (
  members: readonly PresenceMemberSeed[],
) => {
  const trackedMemberIds = useMemo(() => {
    const ids = new Set<number>();
    for (const member of members) {
      const characterId = Math.floor(member.characterId);
      if (!Number.isFinite(characterId) || characterId <= 0) continue;
      ids.add(characterId);
    }
    return ids;
  }, [members]);
  const [onlineCharacterIds, setOnlineCharacterIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [lastOfflineAtByCharacterId, setLastOfflineAtByCharacterId] = useState<
    Record<number, number>
  >({});
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const previousOnlineIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setLastOfflineAtByCharacterId((previousMap) =>
      mergeMemberOfflineTimestampMap(previousMap, members),
    );
  }, [members]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, OFFLINE_DURATION_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = gameSocket.onOnlinePlayersUpdate((payload) => {
      const now = Date.now();
      const nextOnlineIds = buildOnlineCharacterIdSet(payload.players);
      const trackedOnlineIds = new Set<number>();
      for (const characterId of nextOnlineIds) {
        if (!trackedMemberIds.has(characterId)) continue;
        trackedOnlineIds.add(characterId);
      }
      setOnlineCharacterIds(nextOnlineIds);
      setLastOfflineAtByCharacterId((previousMap) =>
        recordMemberOfflineTransitions(
          previousMap,
          trackedMemberIds,
          previousOnlineIdsRef.current,
          nextOnlineIds,
          now,
        ),
      );
      previousOnlineIdsRef.current = trackedOnlineIds;
    });
    return unsubscribe;
  }, [trackedMemberIds]);

  const onlineCharacterIdsSnapshot = useMemo(
    () => onlineCharacterIds,
    [onlineCharacterIds],
  );

  const isCharacterOnline = useCallback(
    (characterId: number): boolean => onlineCharacterIdsSnapshot.has(characterId),
    [onlineCharacterIdsSnapshot],
  );

  const getOfflineText = useCallback(
    (characterId: number): string => {
      if (isCharacterOnline(characterId)) return '在线';
      const lastOfflineAt = lastOfflineAtByCharacterId[characterId];
      if (!Number.isFinite(lastOfflineAt)) return '较早前在线';
      return formatPresenceOfflineText(nowTs - lastOfflineAt);
    },
    [isCharacterOnline, lastOfflineAtByCharacterId, nowTs],
  );

  return {
    onlineCharacterIds: onlineCharacterIdsSnapshot,
    isCharacterOnline,
    getOfflineText,
  };
};

export type RealtimeMemberPresence = ReturnType<typeof useRealtimeMemberPresence>;
