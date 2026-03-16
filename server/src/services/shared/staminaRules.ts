/**
 * 体力规则共享模块（纯函数）
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：统一维护“基础体力上限 + 悟道等级增量”的计算规则。
 * 2) 做什么：统一维护体力自然恢复的进度结算公式，让 DB 路径与缓存路径复用同一份恢复逻辑。
 * 3) 不做什么：不读写数据库、不直接访问 Redis，也不负责体力扣减事务。
 *
 * 输入/输出：
 * - 输入：悟道等级、当前体力、体力上限、恢复锚点、恢复间隔、月卡恢复速度窗口。
 * - 输出：角色体力上限，或恢复结算后的体力/恢复量/下次恢复锚点。
 *
 * 数据流/状态流：
 * staminaService / staminaCacheService / characterComputedService -> 调用本模块 ->
 * 统一得到体力上限与恢复结果，避免多处散落同样公式。
 *
 * 关键边界条件与坑点：
 * 1) 悟道等级统一按非负整数处理，非法值会被归一为 0。
 * 2) “恢复速度 +10%”按恢复进度速率放大，而不是直接修改整数恢复量，避免不同入口出现取整漂移。
 * 3) 月卡可能在一次恢复区间中途开始或结束，因此恢复锚点必须通过逆推公式回写，保证下一次结算继续正确累计。
 */
import { calcInsightStaminaBonusByLevel } from './insightRules.js';

export type StaminaRecoverySpeedWindow = {
  startAtMs: number | null;
  expireAtMs: number | null;
};

export type StaminaRecoveryStateInput = {
  stamina: number;
  maxStamina: number;
  recoverAtMs: number;
  nowMs: number;
  recoverPerTick: number;
  recoverIntervalMs: number;
  recoverySpeedRate: number;
  recoverySpeedWindow: StaminaRecoverySpeedWindow;
};

export type ResolvedStaminaRecoveryState = {
  stamina: number;
  recovered: number;
  nextRecoverAtMs: number;
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return v > 0 ? v : fallback;
};

const toNonNegativeInt = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const v = Math.floor(n);
  return v >= 0 ? v : 0;
};

const clampRecoverySpeedRate = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const getRecoverySpeedOverlapMs = (
  startMs: number,
  endMs: number,
  recoverySpeedWindow: StaminaRecoverySpeedWindow,
): number => {
  if (endMs <= startMs || recoverySpeedWindow.expireAtMs === null) return 0;

  const activeStartMs = recoverySpeedWindow.startAtMs ?? startMs;
  const overlapStartMs = Math.max(startMs, activeStartMs);
  const overlapEndMs = Math.min(endMs, recoverySpeedWindow.expireAtMs);
  return Math.max(0, overlapEndMs - overlapStartMs);
};

const calcEffectiveRecoveryElapsedMs = (
  startMs: number,
  endMs: number,
  recoverySpeedWindow: StaminaRecoverySpeedWindow,
  recoverySpeedRate: number,
): number => {
  if (endMs <= startMs) return 0;
  const realElapsedMs = endMs - startMs;
  const safeRecoverySpeedRate = clampRecoverySpeedRate(recoverySpeedRate);
  if (safeRecoverySpeedRate <= 0) return realElapsedMs;

  const overlapMs = getRecoverySpeedOverlapMs(startMs, endMs, recoverySpeedWindow);
  return realElapsedMs + overlapMs * safeRecoverySpeedRate;
};

const rewindRecoverAtMsByEffectiveElapsed = (
  nowMs: number,
  effectiveElapsedMs: number,
  recoverySpeedWindow: StaminaRecoverySpeedWindow,
  recoverySpeedRate: number,
): number => {
  const safeEffectiveElapsedMs = Math.max(0, effectiveElapsedMs);
  const safeRecoverySpeedRate = clampRecoverySpeedRate(recoverySpeedRate);
  if (safeEffectiveElapsedMs <= 0 || safeRecoverySpeedRate <= 0 || recoverySpeedWindow.expireAtMs === null) {
    return Math.round(nowMs - safeEffectiveElapsedMs);
  }

  const activeMultiplier = 1 + safeRecoverySpeedRate;
  let remainingEffectiveElapsedMs = safeEffectiveElapsedMs;
  let cursorMs = nowMs;

  if (cursorMs > recoverySpeedWindow.expireAtMs) {
    const inactiveAfterWindowMs = cursorMs - recoverySpeedWindow.expireAtMs;
    if (remainingEffectiveElapsedMs <= inactiveAfterWindowMs) {
      return Math.round(cursorMs - remainingEffectiveElapsedMs);
    }
    remainingEffectiveElapsedMs -= inactiveAfterWindowMs;
    cursorMs = recoverySpeedWindow.expireAtMs;
  }

  const activeStartMs = recoverySpeedWindow.startAtMs;
  if (activeStartMs === null || cursorMs > activeStartMs) {
    const activeRealDurationMs = activeStartMs === null ? Number.POSITIVE_INFINITY : cursorMs - activeStartMs;
    const activeEffectiveElapsedCapMs = activeRealDurationMs * activeMultiplier;
    if (remainingEffectiveElapsedMs <= activeEffectiveElapsedCapMs) {
      return Math.round(cursorMs - remainingEffectiveElapsedMs / activeMultiplier);
    }
    remainingEffectiveElapsedMs -= activeEffectiveElapsedCapMs;
    if (activeStartMs !== null) {
      cursorMs = activeStartMs;
    }
  }

  return Math.round(cursorMs - remainingEffectiveElapsedMs);
};

/**
 * 角色基础体力上限（不含悟道增量）。
 */
export const STAMINA_BASE_MAX = toPositiveInt(process.env.STAMINA_MAX, 100);

/**
 * 按悟道等级计算角色体力上限。
 * 规则：每 10 级悟道，体力上限 +1。
 */
export const calcCharacterStaminaMaxByInsightLevel = (insightLevel: number): number => {
  const safeInsightLevel = toNonNegativeInt(insightLevel);
  const bonus = calcInsightStaminaBonusByLevel(safeInsightLevel);
  return Math.max(1, STAMINA_BASE_MAX + bonus);
};

export const resolveStaminaRecoveryState = ({
  stamina,
  maxStamina,
  recoverAtMs,
  nowMs,
  recoverPerTick,
  recoverIntervalMs,
  recoverySpeedRate,
  recoverySpeedWindow,
}: StaminaRecoveryStateInput): ResolvedStaminaRecoveryState => {
  const safeMaxStamina = Math.max(1, Math.floor(maxStamina));
  const currentStamina = Math.max(0, Math.min(safeMaxStamina, Math.floor(stamina)));
  const safeRecoverAtMs = Number.isFinite(recoverAtMs) ? recoverAtMs : nowMs;
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : safeRecoverAtMs;
  const safeRecoverPerTick = Math.max(0, Math.floor(recoverPerTick));
  const safeRecoverIntervalMs = Math.max(0, Math.floor(recoverIntervalMs));

  if (currentStamina >= safeMaxStamina || safeRecoverPerTick <= 0 || safeRecoverIntervalMs <= 0 || safeNowMs <= safeRecoverAtMs) {
    return {
      stamina: currentStamina,
      recovered: 0,
      nextRecoverAtMs: safeRecoverAtMs,
    };
  }

  const effectiveElapsedMs = calcEffectiveRecoveryElapsedMs(
    safeRecoverAtMs,
    safeNowMs,
    recoverySpeedWindow,
    recoverySpeedRate,
  );
  const ticks = Math.floor(effectiveElapsedMs / safeRecoverIntervalMs);
  if (ticks <= 0) {
    return {
      stamina: currentStamina,
      recovered: 0,
      nextRecoverAtMs: safeRecoverAtMs,
    };
  }

  const recoveredTotal = ticks * safeRecoverPerTick;
  const nextStamina = Math.min(safeMaxStamina, currentStamina + recoveredTotal);
  const recovered = Math.max(0, nextStamina - currentStamina);

  if (nextStamina >= safeMaxStamina) {
    return {
      stamina: nextStamina,
      recovered,
      nextRecoverAtMs: safeNowMs,
    };
  }

  const leftoverEffectiveElapsedMs = effectiveElapsedMs - ticks * safeRecoverIntervalMs;
  return {
    stamina: nextStamina,
    recovered,
    nextRecoverAtMs: rewindRecoverAtMsByEffectiveElapsed(
      safeNowMs,
      leftoverEffectiveElapsedMs,
      recoverySpeedWindow,
      recoverySpeedRate,
    ),
  };
};
