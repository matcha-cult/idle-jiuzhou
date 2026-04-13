/**
 * 角色软进度 Delta 存储回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证任务软进度的 claim/finalize/restore 协议在存在遗留 inflight key 时能够自动恢复，避免单角色长期卡死无法继续 flush。
 * 2. 做什么：把 Redis inflight 恢复语义收敛到共享存储层测试里，避免任务服务、主线服务各自重复兜底。
 * 3. 不做什么：不连接真实 Redis，不验证任务事件匹配与数据库落库，只聚焦 Redis 键状态转换。
 *
 * 输入/输出：
 * - 输入：模拟的 Redis hash / set / string 状态，以及 `bufferCharacterProgressDeltaFields`、`claimCharacterProgressDelta`、`finalizeClaimedCharacterProgressDelta`。
 * - 输出：claim 是否成功、Redis 主 hash / inflight hash / dirty index / meta key 的最终状态。
 *
 * 数据流/状态流：
 * 先写入角色主 Delta -> 制造遗留 inflight -> 调用 claim
 * -> 自动把遗留 inflight 合并回主 hash 并重新 claim
 * -> finalize 后清理 inflight/meta 并保留 dirty 状态一致性。
 *
 * 复用设计说明：
 * 1. 共享存储层直接覆盖“历史遗留 inflight 卡死”问题，任务、主线、成就三条软进度链路都自动受益，不需要在各业务入口重复补丁。
 * 2. Redis mock 用统一内存态结构表达 hash/set/string 三类键，后续若其他 soft-delta 存储也采用相同协议，可直接复用这套断言方式。
 *
 * 关键边界条件与坑点：
 * 1. 历史遗留 inflight key 可能没有 meta key；测试必须显式覆盖该兼容路径，否则无法锁定本次线上缺陷。
 * 2. finalize 之后若主 key 不存在，dirty index 应被移除；否则 flush loop 会无意义重复 claim。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { redis } from '../../config/redis.js';
import {
  bufferCharacterProgressDeltaFields,
  claimCharacterProgressDelta,
  finalizeClaimedCharacterProgressDelta,
  loadClaimedCharacterProgressDeltaHash,
} from '../shared/characterProgressDeltaStore.js';

type RedisHashStore = Map<string, Map<string, number>>;
type RedisSetStore = Map<string, Set<string>>;
type RedisStringStore = Map<string, string>;

const DIRTY_INDEX_KEY = 'character:progress-delta:index';
const MAIN_KEY = (characterId: number): string => `character:progress-delta:${characterId}`;
const INFLIGHT_KEY = (characterId: number): string => `character:progress-delta:inflight:${characterId}`;
const INFLIGHT_META_KEY = (characterId: number): string => `character:progress-delta:inflight-meta:${characterId}`;

const ensureHash = (store: RedisHashStore, key: string): Map<string, number> => {
  const existing = store.get(key);
  if (existing) return existing;
  const created = new Map<string, number>();
  store.set(key, created);
  return created;
};

const cloneHashToRecord = (store: RedisHashStore, key: string): Record<string, string> => {
  const hash = store.get(key);
  if (!hash) return {};
  return Object.fromEntries([...hash.entries()].map(([field, value]) => [field, String(value)]));
};

test('claimCharacterProgressDelta: 应自动恢复无 meta 的遗留 inflight 并重新 claim', async (t) => {
  const hashStore: RedisHashStore = new Map();
  const setStore: RedisSetStore = new Map();
  const stringStore: RedisStringStore = new Map();

  t.mock.method(redis, 'multi', () => ({
    hincrby(key: string, field: string, increment: number) {
      const hash = ensureHash(hashStore, key);
      hash.set(field, (hash.get(field) ?? 0) + increment);
      return this;
    },
    sadd(key: string, member: string) {
      const targetSet = setStore.get(key) ?? new Set<string>();
      targetSet.add(member);
      setStore.set(key, targetSet);
      return this;
    },
    async exec() {
      return [];
    },
  }));

  t.mock.method(redis, 'eval', async (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => {
    const keys = args.slice(0, keyCount);
    const argv = args.slice(keyCount);

    if (script.includes("redis.call('SET', inflightMetaKey")) {
      const [dirtyIndexKey, mainKey, inflightKey, inflightMetaKey] = keys;
      const [characterId] = argv;
      const inflightHash = hashStore.get(inflightKey);
      if (inflightHash && !stringStore.has(inflightMetaKey)) {
        const mainHash = ensureHash(hashStore, mainKey);
        for (const [field, value] of inflightHash.entries()) {
          mainHash.set(field, (mainHash.get(field) ?? 0) + value);
        }
        hashStore.delete(inflightKey);
      } else if (inflightHash) {
        return 0;
      }

      const mainHash = hashStore.get(mainKey);
      if (!mainHash || mainHash.size <= 0) {
        setStore.get(dirtyIndexKey)?.delete(characterId ?? '');
        return 0;
      }

      hashStore.set(inflightKey, new Map(mainHash));
      hashStore.delete(mainKey);
      stringStore.set(inflightMetaKey, '123456');
      return 1;
    }

    if (script.includes("redis.call('DEL', inflightMetaKey)")) {
      const [dirtyIndexKey, mainKey, inflightKey, inflightMetaKey] = keys;
      const [characterId] = argv;
      hashStore.delete(inflightKey);
      stringStore.delete(inflightMetaKey);
      if (hashStore.has(mainKey)) {
        const targetSet = setStore.get(dirtyIndexKey) ?? new Set<string>();
        targetSet.add(characterId ?? '');
        setStore.set(dirtyIndexKey, targetSet);
      } else {
        setStore.get(dirtyIndexKey)?.delete(characterId ?? '');
      }
      return 1;
    }

    throw new Error(`未处理的 redis.eval 脚本: ${script}`);
  });

  t.mock.method(redis, 'hgetall', async (key: string) => cloneHashToRecord(hashStore, key));

  await bufferCharacterProgressDeltaFields([
    { characterId: 4701, field: 'kill_monster:{"monsterId":"wolf-a"}', increment: 2 },
  ]);

  hashStore.set(INFLIGHT_KEY(4701), new Map([['collect:{"itemId":"herb-a"}', 3]]));

  const claimed = await claimCharacterProgressDelta(4701);
  assert.equal(claimed, true);
  assert.deepEqual(hashStore.get(MAIN_KEY(4701)), undefined);
  assert.deepEqual(cloneHashToRecord(hashStore, INFLIGHT_KEY(4701)), {
    'kill_monster:{"monsterId":"wolf-a"}': '2',
    'collect:{"itemId":"herb-a"}': '3',
  });
  assert.equal(stringStore.get(INFLIGHT_META_KEY(4701)), '123456');

  const claimedHash = await loadClaimedCharacterProgressDeltaHash(4701);
  assert.deepEqual(claimedHash, {
    'kill_monster:{"monsterId":"wolf-a"}': '2',
    'collect:{"itemId":"herb-a"}': '3',
  });

  await finalizeClaimedCharacterProgressDelta(4701);
  assert.deepEqual(cloneHashToRecord(hashStore, INFLIGHT_KEY(4701)), {});
  assert.equal(stringStore.has(INFLIGHT_META_KEY(4701)), false);
  assert.equal(setStore.get(DIRTY_INDEX_KEY)?.has('4701') ?? false, false);
});

test('claimCharacterProgressDelta: 活跃 inflight 存在有效 meta 时不应重复 claim', async (t) => {
  const hashStore: RedisHashStore = new Map();
  const stringStore: RedisStringStore = new Map();

  t.mock.method(redis, 'eval', async (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => {
    const keys = args.slice(0, keyCount);

    if (!script.includes("redis.call('SET', inflightMetaKey")) {
      throw new Error(`未处理的 redis.eval 脚本: ${script}`);
    }

    const [, , inflightKey, inflightMetaKey] = keys;
    if (hashStore.has(inflightKey) && stringStore.has(inflightMetaKey)) {
      return 0;
    }
    return 1;
  });

  hashStore.set(INFLIGHT_KEY(4701), new Map([['kill_monster:{"monsterId":"wolf-a"}', 1]]));
  stringStore.set(INFLIGHT_META_KEY(4701), '999999');

  const claimed = await claimCharacterProgressDelta(4701);
  assert.equal(claimed, false);
});
