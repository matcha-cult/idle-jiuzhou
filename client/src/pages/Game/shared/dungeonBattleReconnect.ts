/**
 * 秘境战斗重连恢复共享规则。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中判定某个 battleId 是否属于秘境战斗，以及当前是否需要补查秘境实例来恢复上下文。
 * 2. 做什么：统一校验服务端返回的秘境实例快照是否仍然指向当前 battleId，避免 Game 页重复散落同一套判断。
 * 3. 不做什么：不发请求、不直接改 React state，也不处理普通地图/竞技场的战斗恢复。
 *
 * 输入/输出：
 * - 输入：battleId、当前已持有的秘境实例 ID/战斗 ID、服务端实例快照。
 * - 输出：布尔判定，供 Game 页决定是否发起恢复请求、是否接管当前战斗页。
 *
 * 数据流/状态流：
 * socket battle:update -> shouldRestoreDungeonBattleContext ->
 * getDungeonInstanceByBattleId -> matchesDungeonReconnectInstance -> Game 页恢复 battle 视图。
 *
 * 关键边界条件与坑点：
 * 1. 只有 `dungeon-battle-` 前缀的 battleId 才允许走秘境恢复链路，避免普通地图/PVP 误触发秘境查询。
 * 2. 只有运行中且 `currentBattleId` 与当前 battleId 完全一致的实例快照才能接管页面，避免旧波次/已结束实例串线。
 */

export interface DungeonReconnectInstanceSnapshot {
  id: string;
  status: 'preparing' | 'running' | 'cleared' | 'failed' | 'abandoned';
  currentBattleId: string | null;
}

const DUNGEON_BATTLE_ID_PREFIX = 'dungeon-battle-';

export const isDungeonBattleId = (battleId: string | null | undefined): boolean => {
  const normalizedBattleId = String(battleId || '').trim();
  return normalizedBattleId.startsWith(DUNGEON_BATTLE_ID_PREFIX);
};

export const shouldRestoreDungeonBattleContext = (params: {
  battleId: string;
  currentDungeonBattleId: string | null;
  currentDungeonInstanceId: string | null;
}): boolean => {
  if (!isDungeonBattleId(params.battleId)) return false;
  if (params.currentDungeonBattleId !== params.battleId) return true;
  return params.currentDungeonInstanceId === null;
};

export const matchesDungeonReconnectInstance = (
  battleId: string,
  instance: DungeonReconnectInstanceSnapshot | null | undefined,
): boolean => {
  if (!instance) return false;
  if (instance.status !== 'running') return false;
  return instance.currentBattleId === battleId;
};
