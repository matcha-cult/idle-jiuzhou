/**
 * BattleArea 战斗结束后的自动推进策略。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：定义 BattleArea 战斗结束后的显式推进模式，禁止组件再根据 `externalBattleId/onNext` 自行推断。
 * 2. 做什么：把普通野外自动连战、会话自动推进、等待外部接管拆成明确枚举，避免普通 PVE 被误判成“显示继续按钮”的外部模式。
 * 3. 不做什么：不负责设置定时器、不读写 React state，也不直接调用 onNext。
 *
 * 输入/输出：
 * - 输入：无，本模块只输出推进模式类型，具体模式由上层显式传入。
 * - 输出：`BattleAdvanceMode`，供调用方决定后续动作。
 *
 * 数据流/状态流：
 * - Game 页根据 owned session / 观战上下文 -> 计算 BattleAdvanceMode -> BattleArea 收到 finished state 后按模式推进。
 *
 * 关键边界条件与坑点：
 * 1. 普通野外自动连战必须显式标成 `auto_local_retry`，不能再靠 `onNext` 是否存在来猜。
 * 2. 处于队友观战/重连接管时只能是 `wait_external`，避免 BattleArea 擅自续战。
 */

export type BattleAdvanceMode =
  | 'none'
  | 'wait_external'
  | 'auto_session'
  | 'auto_session_cooldown'
  | 'manual_session'
  | 'auto_local_retry';

/**
 * 是否属于“需要等待战斗冷却结束后再自动推进”的模式。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一收口普通地图自动重开与 PVE 会话自动继续两种冷却推进模式，避免 BattleArea 多处手写字符串判断。
 * 2. 不做什么：不决定推进动作本身，具体是 `startBattle` 还是 `onNext` 由调用方处理。
 *
 * 关键边界条件与坑点：
 * 1. 只有真正会发起下一场战斗的模式才应返回 true；`return_to_map` 一类会话推进不能误归类。
 * 2. 新增推进模式时必须同步更新这里，否则 BattleArea 的冷却等待会出现口径漂移。
 */
export const isCooldownDrivenAdvanceMode = (mode: BattleAdvanceMode): boolean => {
  return mode === 'auto_local_retry' || mode === 'auto_session_cooldown';
};
