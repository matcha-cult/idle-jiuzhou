import type { OnlinePlayerDto } from '../../../services/gameSocket';

/**
 * 成员在线态共享纯函数。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理“在线玩家广播 -> 在线角色集合”“成员离线时间合并”“在线转离线打点”这三段高频逻辑。
 * 2. 做什么：为队伍、宗门等成员列表提供统一的在线态计算基础，避免每个组件都重复操作 `Set`、时间戳和离线文案。
 * 3. 不做什么：不直接订阅 socket、不管理 React 状态，也不关心具体 UI 排版。
 *
 * 输入/输出：
 * - 输入：在线玩家 DTO 列表、成员种子列表、上一轮离线时间索引、上一轮/下一轮在线集合。
 * - 输出：在线角色 ID 集合、离线时间索引、离线时长文案。
 *
 * 数据流/状态流：
 * socket `game:onlinePlayers` -> 在线集合 -> 在线/离线边界检测 -> 离线时间索引 -> 组件展示文案。
 *
 * 关键边界条件与坑点：
 * 1. 成员列表刷新时必须清理已不存在成员的离线时间，否则旧数据会泄漏到别的列表项。
 * 2. 仅在“在线 -> 离线”边界写入当前时间，不能每次广播都覆盖，否则离线时长会一直重置。
 */

export interface PresenceMemberSeed {
  characterId: number;
  lastOfflineAt?: string | null;
}

export const OFFLINE_DURATION_TICK_MS = 60 * 1000;

const toPositiveInteger = (value: number): number | null => {
  if (!Number.isFinite(value)) return null;
  const next = Math.floor(value);
  return next > 0 ? next : null;
};

export const parsePresenceDateToTimestamp = (
  raw: string | null | undefined,
): number | null => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

export const buildOnlineCharacterIdSet = (
  players: readonly OnlinePlayerDto[],
): Set<number> => {
  const ids = new Set<number>();
  for (const player of players) {
    const characterId = toPositiveInteger(player.id);
    if (!characterId) continue;
    ids.add(characterId);
  }
  return ids;
};

export const mergeMemberOfflineTimestampMap = (
  previousMap: Readonly<Record<number, number>>,
  members: readonly PresenceMemberSeed[],
): Record<number, number> => {
  const nextMap: Record<number, number> = { ...previousMap };
  const memberIdSet = new Set<number>();

  for (const member of members) {
    const characterId = toPositiveInteger(member.characterId);
    if (!characterId) continue;
    memberIdSet.add(characterId);

    const apiTimestamp = parsePresenceDateToTimestamp(member.lastOfflineAt);
    if (apiTimestamp === null) continue;

    const previousTimestamp = nextMap[characterId];
    const mergedTimestamp = Number.isFinite(previousTimestamp)
      ? Math.max(previousTimestamp, apiTimestamp)
      : apiTimestamp;
    nextMap[characterId] = mergedTimestamp;
  }

  for (const rawKey of Object.keys(nextMap)) {
    const characterId = toPositiveInteger(Number(rawKey));
    if (!characterId) {
      delete nextMap[Number(rawKey)];
      continue;
    }
    if (memberIdSet.has(characterId)) continue;
    delete nextMap[characterId];
  }

  return nextMap;
};

export const recordMemberOfflineTransitions = (
  previousMap: Readonly<Record<number, number>>,
  trackedMemberIds: ReadonlySet<number>,
  previousOnlineIds: ReadonlySet<number>,
  nextOnlineIds: ReadonlySet<number>,
  now: number,
): Record<number, number> => {
  const nextMap: Record<number, number> = { ...previousMap };
  for (const characterId of previousOnlineIds) {
    if (!trackedMemberIds.has(characterId)) continue;
    if (nextOnlineIds.has(characterId)) continue;
    nextMap[characterId] = now;
  }
  return nextMap;
};

export const formatPresenceOfflineText = (durationMs: number): string => {
  const safeDuration = Math.max(0, Math.floor(durationMs));
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (safeDuration < minuteMs) return '1分钟前在线';
  if (safeDuration < hourMs) return `${Math.floor(safeDuration / minuteMs)}分钟前在线`;
  if (safeDuration < dayMs) return `${Math.floor(safeDuration / hourMs)}小时前在线`;
  return `${Math.floor(safeDuration / dayMs)}天前在线`;
};
