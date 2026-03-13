/**
 * 查询缓存版本号管理器（Redis + 进程内短缓存）
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：为“查询结果缓存”提供统一版本号，支持通过 bump 一次性让旧查询键全部失效。
 * 2. 做什么：把 Redis 版本键读取与进程内短缓存收敛到单一模块，避免坊市/搜索/大厅列表各写一套。
 * 3. 不做什么：不缓存业务数据本身；具体数据仍由 `createCacheLayer` 等上层缓存承载。
 *
 * 输入/输出：
 * - 输入：命名空间 `namespace`、查询基础键 `baseKey`。
 * - 输出：带版本号的缓存键字符串；或在写路径中递增版本号。
 *
 * 数据流/状态流：
 * - 读：buildVersionedKey -> 读取内存版本 -> Redis 版本 -> 组合成 versioned key
 * - 写：bumpVersion -> Redis INCR -> 更新内存版本 -> 后续读自然切换到新版本
 *
 * 关键边界条件与坑点：
 * 1. Redis 不可用时退化为本进程版本号，跨进程不会立刻同步，因此应配合较短 TTL 使用。
 * 2. 旧版本缓存不会被物理批量删除，而是依赖 TTL 自然过期，换取失效实现简单且稳定。
 */

import { redis } from '../../config/redis.js';

type VersionState = {
  value: number;
  expiresAt: number;
};

export interface CacheVersionManager {
  buildVersionedKey: (baseKey: string) => Promise<string>;
  bumpVersion: () => Promise<number>;
}

const DEFAULT_MEMORY_TTL_MS = 3_000;

const normalizeVersion = (raw: unknown): number => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return 1;
  return parsed;
};

const serializeVersionedKey = (version: number, baseKey: string): string => {
  return JSON.stringify({ version, baseKey });
};

export const parseVersionedCacheBaseKey = <T>(versionedKey: string): T | null => {
  try {
    const parsed = JSON.parse(versionedKey) as { version?: unknown; baseKey?: unknown };
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Number.isInteger(Number(parsed.version)) || Number(parsed.version) <= 0) return null;
    if (typeof parsed.baseKey !== 'string') return null;
    return JSON.parse(parsed.baseKey) as T;
  } catch {
    return null;
  }
};

export const createCacheVersionManager = (
  namespace: string,
  memoryTtlMs: number = DEFAULT_MEMORY_TTL_MS,
): CacheVersionManager => {
  const trimmedNamespace = namespace.trim();
  if (!trimmedNamespace) {
    throw new Error('缓存版本命名空间不能为空');
  }

  const versionRedisKey = `cache:version:${trimmedNamespace}`;
  let memoryState: VersionState | null = null;

  const readVersion = async (): Promise<number> => {
    const now = Date.now();
    if (memoryState && memoryState.expiresAt > now) {
      return memoryState.value;
    }

    let nextVersion = memoryState?.value ?? 1;
    try {
      const raw = await redis.get(versionRedisKey);
      if (raw === null) {
        await redis.set(versionRedisKey, '1');
        nextVersion = 1;
      } else {
        nextVersion = normalizeVersion(raw);
      }
    } catch {
      nextVersion = memoryState?.value ?? 1;
    }

    memoryState = {
      value: nextVersion,
      expiresAt: now + memoryTtlMs,
    };
    return nextVersion;
  };

  const buildVersionedKey = async (baseKey: string): Promise<string> => {
    const version = await readVersion();
    return serializeVersionedKey(version, baseKey);
  };

  const bumpVersion = async (): Promise<number> => {
    let nextVersion = (memoryState?.value ?? 1) + 1;
    try {
      const result = await redis.incr(versionRedisKey);
      nextVersion = normalizeVersion(result);
    } catch {
      nextVersion = normalizeVersion(nextVersion);
    }

    memoryState = {
      value: nextVersion,
      expiresAt: Date.now() + memoryTtlMs,
    };
    return nextVersion;
  };

  return {
    buildVersionedKey,
    bumpVersion,
  };
};
