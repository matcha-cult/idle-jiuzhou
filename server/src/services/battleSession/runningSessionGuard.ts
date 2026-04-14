/**
 * BattleSession 运行中会话自愈守卫。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一识别“session 仍是 running，但底层 battle 已经不存在”的脏会话，并在读取链路上做幂等清理。
 * 2. 做什么：把 BattleSession runtime 与在线投影删除收口到单一入口，避免 battleSession、tower、battle lifecycle 各写一套残留清理逻辑。
 * 3. 不做什么：不处理 waiting_transition 的合法中间态，不清理千层塔 run 进度，也不改写普通 PVE 的续战意图。
 *
 * 输入 / 输出：
 * - 输入：一条 BattleSession runtime 记录，可为 null。
 * - 输出：若会话仍有效则原样返回；若判定为 stale running session，则删除后返回 null。
 *
 * 数据流 / 状态流：
 * - battleSession 查询 / tower 入口 / battle 过期清理 -> 本模块校验 battle 是否仍权威存在 -> 保留或删除 session。
 *
 * 复用设计说明：
 * - “running 但 battle miss” 是本次线上卡死问题的单一业务规则，集中到这里后，多个入口可以共享同一判定，避免未来规则漂移。
 * - tower 入口和 battleSession 当前会话查询都会命中该规则，把它抽到独立模块能避免 `tower/service.ts` 反向依赖 `battleSession/service.ts`。
 *
 * 关键边界条件与坑点：
 * 1. 只对 `status === 'running'` 且 `currentBattleId` 非空的会话做 battle 权威性校验；`waiting_transition` 允许 battle 已结束但 session 仍合法存在，绝不能误删。
 * 2. 只有在 `getBattleState` 明确返回失败时才删除；成功但没有 `state` 的场景可能是已结束缓存或过渡态，不能按 stale 处理。
 */

import { createScopedLogger } from '../../utils/logger.js';
import { getBattleState } from '../battle/queries.js';
import { deleteBattleSessionRecord } from './runtime.js';
import type { BattleSessionRecord } from './types.js';

const runningSessionGuardLogger = createScopedLogger('battle.session.running-guard');

export const pruneStaleRunningBattleSession = async (
  session: BattleSessionRecord | null,
): Promise<BattleSessionRecord | null> => {
  if (!session || session.status !== 'running' || !session.currentBattleId) {
    return session;
  }

  const battleState = await getBattleState(session.currentBattleId);
  if (battleState.success) {
    return session;
  }

  deleteBattleSessionRecord(session.sessionId);
  runningSessionGuardLogger.warn({
    sessionId: session.sessionId,
    sessionType: session.type,
    ownerUserId: session.ownerUserId,
    battleId: session.currentBattleId,
    battleMessage: battleState.message,
  }, '检测到 battle 已失效，已自愈清理 stale running session');
  return null;
};
