import type { BattleSessionSnapshotDto } from '../../../services/api';
import type { BattleRealtimePayload } from '../../../services/battleRealtime';

/**
 * BattleSession 恢复期的战斗视图判定。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一判断某个 session 变更到达时，Game 页是否应该立刻切进 battle 视图，避免初始化、socket 重连、battleId 反查各写一套条件。
 * 2. 做什么：把 `waiting_transition` 的终态恢复收口成单一规则，防止页面在“会话还没推进，但战斗快照已失效”时卡死在空战斗页。
 * 3. 不做什么：不直接读写 React state，不发请求，也不决定 session 后续推进行为。
 *
 * 输入/输出：
 * - 输入：BattleSession 快照，以及当前 battleId 对应的最近一条 realtime 消息。
 * - 输出：是否可以立即进入 battle 视图。
 *
 * 数据流/状态流：
 * - HTTP/socket 拿到 session -> 本模块判定是否已有可渲染战斗快照 -> Game 决定切 battle 视图还是仅保留 session 等待推进。
 *
 * 关键边界条件与坑点：
 * 1. `running` 会话即使暂时还没拿到快照，也必须允许进入 battle 视图，因为服务端会随后补发 battle_started。
 * 2. `waiting_transition` 只有在手里已经握有同 battleId 的 realtime 快照时才允许留在 battle 视图，否则刷新后会停在“无法继续也无法退出”的终态页面。
 */
export const shouldActivateBattleSessionView = (params: {
  session: BattleSessionSnapshotDto | null;
  realtime: BattleRealtimePayload | null;
}): boolean => {
  const { session, realtime } = params;
  const battleId = session?.currentBattleId ?? null;
  if (!session || !battleId) return false;
  if (session.status !== 'waiting_transition') {
    return true;
  }
  if (!realtime || realtime.battleId !== battleId) {
    return false;
  }
  return realtime.kind !== 'battle_abandoned';
};
