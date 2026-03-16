/**
 * 体力 Redis 缓存服务
 *
 * 作用：
 *   在 Redis 中维护角色体力的实时状态，供其他系统读取准确体力值。
 *
 * 不做的事：
 *   不替代 staminaService 的 DB 写入逻辑，DB 写入仍由各调用方负责。
 *
 * 数据流：
 *   读取：内存 → Redis → DB（applyStaminaRecoveryByCharacterId）→ 回填 Redis
 *   扣减：Lua 原子脚本直接操作 Redis JSON，同时更新内存
 *   校准：DB 写入后调用 setCachedStamina 用实际值刷新缓存
 *
 * 关键边界条件：
 *   1. Redis 不可用时所有函数返回 null，由调用方走 DB 路径。
 *   2. 缓存层与 DB 层必须共用同一份恢复纯函数，避免月卡恢复速度在两条链路出现漂移。
 *   3. 月卡恢复速度窗口要随缓存一起保存，保证后续读取能延续同一份恢复进度口径。
 */

import { redis } from '../config/redis.js';
import {
  STAMINA_MAX,
  STAMINA_RECOVER_INTERVAL_SEC,
  STAMINA_RECOVER_PER_TICK,
  type StaminaRecoveryState,
} from './staminaService.js';
import {
  getMonthCardStaminaRecoveryRate,
  normalizeMonthCardBenefitWindow,
  type MonthCardBenefitWindow,
} from './shared/monthCardBenefits.js';
import { resolveStaminaRecoveryState } from './shared/staminaRules.js';

const KEY_PREFIX = 'stamina:';
const CACHE_TTL_SEC = 600;
const MEMORY_TTL_MS = 5_000;

type MemoryCacheEntry = {
  stamina: number;
  recoverAtMs: number;
  maxStamina: number;
  recoverySpeedWindow: MonthCardBenefitWindow;
  expiresAt: number;
};

type SerializedStaminaCacheState = {
  stamina: number;
  recoverAtMs: number;
  maxStamina?: number;
  recoverySpeedWindow?: MonthCardBenefitWindow;
};

const memoryCache = new Map<number, MemoryCacheEntry>();

const cacheKey = (characterId: number): string => {
  return `${KEY_PREFIX}${characterId}`;
};

const resolveRecoverySpeedWindow = (
  recoverySpeedWindow: MonthCardBenefitWindow | null | undefined,
): MonthCardBenefitWindow => {
  return normalizeMonthCardBenefitWindow(
    recoverySpeedWindow?.startAtMs ?? null,
    recoverySpeedWindow?.expireAtMs ?? null,
  );
};

const applyRecovery = (
  stamina: number,
  recoverAtMs: number,
  nowMs: number,
  maxStamina: number,
  recoverySpeedWindow: MonthCardBenefitWindow,
): { stamina: number; recoverAtMs: number; maxStamina: number; recoverySpeedWindow: MonthCardBenefitWindow } => {
  const resolvedMaxStamina = Math.max(1, Math.floor(Number(maxStamina) || STAMINA_MAX));
  const recoveryResult = resolveStaminaRecoveryState({
    stamina,
    maxStamina: resolvedMaxStamina,
    recoverAtMs,
    nowMs,
    recoverPerTick: STAMINA_RECOVER_PER_TICK,
    recoverIntervalMs: STAMINA_RECOVER_INTERVAL_SEC * 1_000,
    recoverySpeedRate: getMonthCardStaminaRecoveryRate(),
    recoverySpeedWindow,
  });

  return {
    stamina: recoveryResult.stamina,
    recoverAtMs: recoveryResult.nextRecoverAtMs,
    maxStamina: resolvedMaxStamina,
    recoverySpeedWindow,
  };
};

const DECR_STAMINA_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end

local data = cjson.decode(raw)
local stamina = tonumber(data.stamina) or 0
local recoverAtMs = tonumber(data.recoverAtMs) or 0
local nowMs = tonumber(ARGV[2])
local maxStamina = tonumber(data.maxStamina) or tonumber(ARGV[3])
local perTick = tonumber(ARGV[4])
local intervalMs = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])
local delta = tonumber(ARGV[1])

if stamina < maxStamina and intervalMs > 0 and perTick > 0 then
  local elapsed = nowMs - recoverAtMs
  if elapsed < 0 then elapsed = 0 end
  local ticks = math.floor(elapsed / intervalMs)
  if ticks > 0 then
    local recovered = ticks * perTick
    stamina = math.min(maxStamina, stamina + recovered)
    if stamina >= maxStamina then
      recoverAtMs = nowMs
    else
      recoverAtMs = recoverAtMs + ticks * intervalMs
    end
  end
end

stamina = math.max(0, stamina - delta)

if stamina < maxStamina then
  recoverAtMs = nowMs
end

data.stamina = stamina
data.recoverAtMs = recoverAtMs
data.maxStamina = maxStamina
redis.call('SET', KEYS[1], cjson.encode(data), 'EX', ttl)
return stamina
`;

export interface StaminaCacheState {
  characterId: number;
  stamina: number;
  recoverAtMs: number;
  maxStamina: number;
  recoverySpeedWindow: MonthCardBenefitWindow;
}

export async function getCachedStamina(characterId: number): Promise<StaminaCacheState | null> {
  const cachedMemory = memoryCache.get(characterId);
  if (cachedMemory && cachedMemory.expiresAt > Date.now()) {
    const resolved = applyRecovery(
      cachedMemory.stamina,
      cachedMemory.recoverAtMs,
      Date.now(),
      cachedMemory.maxStamina,
      cachedMemory.recoverySpeedWindow,
    );
    return {
      characterId,
      stamina: resolved.stamina,
      recoverAtMs: resolved.recoverAtMs,
      maxStamina: resolved.maxStamina,
      recoverySpeedWindow: resolved.recoverySpeedWindow,
    };
  }

  try {
    const raw = await redis.get(cacheKey(characterId));
    if (!raw) return null;

    const payload = JSON.parse(raw) as SerializedStaminaCacheState;
    const recoverySpeedWindow = resolveRecoverySpeedWindow(payload.recoverySpeedWindow);
    const resolved = applyRecovery(
      payload.stamina,
      payload.recoverAtMs,
      Date.now(),
      Math.max(1, Math.floor(Number(payload.maxStamina) || STAMINA_MAX)),
      recoverySpeedWindow,
    );

    memoryCache.set(characterId, {
      stamina: resolved.stamina,
      recoverAtMs: resolved.recoverAtMs,
      maxStamina: resolved.maxStamina,
      recoverySpeedWindow: resolved.recoverySpeedWindow,
      expiresAt: Date.now() + MEMORY_TTL_MS,
    });

    return {
      characterId,
      stamina: resolved.stamina,
      recoverAtMs: resolved.recoverAtMs,
      maxStamina: resolved.maxStamina,
      recoverySpeedWindow: resolved.recoverySpeedWindow,
    };
  } catch {
    return null;
  }
}

export async function setCachedStamina(
  characterId: number,
  stamina: number,
  recoverAt: Date,
  maxStamina: number,
  recoverySpeedWindow: MonthCardBenefitWindow,
): Promise<void> {
  const normalizedRecoverySpeedWindow = resolveRecoverySpeedWindow(recoverySpeedWindow);
  const resolvedMaxStamina = Math.max(1, Math.floor(Number(maxStamina) || STAMINA_MAX));
  const recoverAtMs = recoverAt.getTime();
  const payload = JSON.stringify({
    stamina,
    recoverAtMs,
    maxStamina: resolvedMaxStamina,
    recoverySpeedWindow: normalizedRecoverySpeedWindow,
  });

  memoryCache.set(characterId, {
    stamina,
    recoverAtMs,
    maxStamina: resolvedMaxStamina,
    recoverySpeedWindow: normalizedRecoverySpeedWindow,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });

  try {
    await redis.set(cacheKey(characterId), payload, 'EX', CACHE_TTL_SEC);
  } catch {
    // Redis 不可用时仅保留内存缓存
  }
}

export async function decrCachedStamina(characterId: number, delta: number): Promise<number | null> {
  const intervalMs = STAMINA_RECOVER_INTERVAL_SEC * 1_000;

  try {
    const result = await redis.eval(
      DECR_STAMINA_LUA,
      1,
      cacheKey(characterId),
      delta,
      Date.now(),
      STAMINA_MAX,
      STAMINA_RECOVER_PER_TICK,
      intervalMs,
      CACHE_TTL_SEC,
    ) as number;

    if (result === -1) return null;

    const previousEntry = memoryCache.get(characterId);
    memoryCache.set(characterId, {
      stamina: result,
      recoverAtMs: Date.now(),
      maxStamina: previousEntry?.maxStamina ?? STAMINA_MAX,
      recoverySpeedWindow: previousEntry?.recoverySpeedWindow ?? resolveRecoverySpeedWindow(undefined),
      expiresAt: Date.now() + MEMORY_TTL_MS,
    });

    return result;
  } catch {
    return null;
  }
}

export async function invalidateStaminaCache(characterId: number): Promise<void> {
  memoryCache.delete(characterId);
  try {
    await redis.del(cacheKey(characterId));
  } catch {
    // 忽略
  }
}

export async function clearAllStaminaCache(): Promise<void> {
  memoryCache.clear();
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // 忽略
  }
}

export function toRecoveryState(cache: StaminaCacheState): StaminaRecoveryState {
  return {
    characterId: cache.characterId,
    stamina: cache.stamina,
    maxStamina: cache.maxStamina,
    recovered: 0,
    changed: false,
    staminaRecoverAt: new Date(cache.recoverAtMs),
    recoverySpeedWindow: cache.recoverySpeedWindow,
  };
}
