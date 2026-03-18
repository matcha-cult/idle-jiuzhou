import type { BattleLogEntry, BattleState } from './types.js';

/**
 * 战斗日志增量流。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把战斗日志从 `BattleState` 中拆出来，改成 battleId 维度的独立增量队列，避免服务端长期持有整场全量日志。
 * 2. 做什么：维护“已产生总条数”和“待推送增量”两类游标，供 ticker / 结算 / 重连同步复用同一套日志协议。
 * 3. 不做什么：不负责 socket 发送、不负责战斗状态持久化，也不负责前端日志合并。
 *
 * 输入/输出：
 * - 输入：战斗 state（仅用于拿 battleId）和 BattleLogEntry 增量。
 * - 输出：日志增量快照 `{ logs, logStart, logDelta }` 或当前总游标。
 *
 * 数据流/状态流：
 * battleEngine / skill / buff 追加日志 -> 本模块暂存待推送日志
 * -> ticker / settlement 消费增量并发送
 * -> clearBattleLogStream 在战斗结束或清理时释放内存。
 *
 * 关键边界条件与坑点：
 * 1. 重连同步不能再回补历史全量日志，因此快照接口只暴露当前游标，不暴露旧历史数组。
 * 2. `consumeBattleLogDelta` 只能在真正全员广播的发送路径调用；单用户重连同步如果消费日志，会导致其他在线参与者丢日志。
 */

type BattleLogDeltaSnapshot = {
  logs: BattleLogEntry[];
  logStart: number;
  logDelta: true;
};

const pendingBattleLogsByBattleId = new Map<string, BattleLogEntry[]>();
const emittedBattleLogCountByBattleId = new Map<string, number>();
const totalBattleLogCountByBattleId = new Map<string, number>();

const getBattleId = (state: Pick<BattleState, 'battleId'>): string => {
  return String(state.battleId || '').trim();
};

export const appendBattleLog = (
  state: Pick<BattleState, 'battleId'>,
  log: BattleLogEntry,
): void => {
  const battleId = getBattleId(state);
  if (!battleId) return;
  const pendingLogs = pendingBattleLogsByBattleId.get(battleId) ?? [];
  pendingLogs.push(log);
  pendingBattleLogsByBattleId.set(battleId, pendingLogs);
  totalBattleLogCountByBattleId.set(
    battleId,
    (totalBattleLogCountByBattleId.get(battleId) ?? 0) + 1,
  );
};

export const appendBattleLogs = (
  state: Pick<BattleState, 'battleId'>,
  logs: BattleLogEntry[],
): void => {
  if (!Array.isArray(logs) || logs.length === 0) return;
  for (const log of logs) {
    appendBattleLog(state, log);
  }
};

export const consumeBattleLogDelta = (
  battleIdRaw: string,
): BattleLogDeltaSnapshot => {
  const battleId = String(battleIdRaw || '').trim();
  const emittedCount = emittedBattleLogCountByBattleId.get(battleId) ?? 0;
  const pendingLogs = pendingBattleLogsByBattleId.get(battleId) ?? [];
  const nextLogs = pendingLogs.slice();
  const nextEmittedCount = emittedCount + nextLogs.length;
  pendingBattleLogsByBattleId.set(battleId, []);
  emittedBattleLogCountByBattleId.set(battleId, nextEmittedCount);
  if (!totalBattleLogCountByBattleId.has(battleId)) {
    totalBattleLogCountByBattleId.set(battleId, nextEmittedCount);
  }
  return {
    logs: nextLogs,
    logStart: emittedCount,
    logDelta: true,
  };
};

export const getBattleLogCursor = (battleIdRaw: string): number => {
  const battleId = String(battleIdRaw || '').trim();
  return totalBattleLogCountByBattleId.get(battleId) ?? 0;
};

export const restoreBattleLogCursor = (
  battleIdRaw: string,
  cursorRaw: number,
): void => {
  const battleId = String(battleIdRaw || '').trim();
  if (!battleId) return;
  const cursor = Number.isFinite(cursorRaw) ? Math.max(0, Math.floor(cursorRaw)) : 0;
  pendingBattleLogsByBattleId.set(battleId, []);
  emittedBattleLogCountByBattleId.set(battleId, cursor);
  totalBattleLogCountByBattleId.set(battleId, cursor);
};

export const clearBattleLogStream = (battleIdRaw: string): void => {
  const battleId = String(battleIdRaw || '').trim();
  if (!battleId) return;
  pendingBattleLogsByBattleId.delete(battleId);
  emittedBattleLogCountByBattleId.delete(battleId);
  totalBattleLogCountByBattleId.delete(battleId);
};
