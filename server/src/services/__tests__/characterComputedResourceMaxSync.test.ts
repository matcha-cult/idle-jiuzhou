/**
 * 角色共享资源上限同步回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证战斗外共享角色状态在 `max_qixue/max_lingqi` 变化时，会按 delta 同步 `qixue/lingqi`，而不是只做 clamp。
 * 2. 做什么：同时锁定单角色入口与批量入口，避免 `ensureResourceState` 与 `ensureResourceStateMap` 规则分叉。
 * 3. 不做什么：不覆盖战斗内 `isAlive` 状态机，也不验证在线投影的整份快照刷新调度。
 *
 * 输入/输出：
 * - 输入：同一角色在不同成长阶段的基础属性、共享资源缓存中的当前资源值。
 * - 输出：`getCharacterComputedByCharacterId/getCharacterComputedBatchByCharacterIds` 返回的 `qixue/lingqi` 应按上限差值同步。
 *
 * 数据流/状态流：
 * 基础行查询 -> 静态属性重算 -> 读取上一次 static max -> ensureResourceState* 做 delta 同步 -> 输出 computed row。
 *
 * 复用设计说明：
 * - Redis 使用轻量内存 mock，复用真实静态缓存与资源缓存读写路径，避免单测自己模拟内部状态机。
 * - 基础角色行构造集中在本文件 helper，成长变化只通过 `jing/qi/shen` 切换，减少无关字段噪声。
 *
 * 关键边界条件与坑点：
 * 1. 首次无资源缓存时仍应保留“满血、零灵气”初始化语义，不能误把首次构建当成一次 delta 同步。
 * 2. 战斗外共享状态允许 `qixue/lingqi` 降到 0，但不能引入战斗内死亡/复活语义。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import { redis } from '../../config/redis.js';
import {
  clearCharacterRuntimeResourceCache,
  getCharacterComputedBatchByCharacterIds,
  getCharacterComputedByCharacterId,
  setCharacterResourcesByCharacterId,
} from '../characterComputedService.js';
import * as characterGlobalBuffService from '../shared/characterGlobalBuff.js';
import * as monthCardBenefits from '../shared/monthCardBenefits.js';
import * as characterSettlementResourceDeltaService from '../shared/characterSettlementResourceDeltaService.js';
import * as characterItemInstanceMutationService from '../shared/characterItemInstanceMutationService.js';
import * as titleDefinitionService from '../titleDefinitionService.js';

type ResourcePhase = 'low' | 'high';

type RedisMultiMock = {
  set: (key: string, value: string) => RedisMultiMock;
  exec: () => Promise<[]>;
};

const createRedisMultiMock = (store: Map<string, string>): RedisMultiMock => {
  const queued: Array<{ key: string; value: string }> = [];
  const multiMock: RedisMultiMock = {
    set: (key: string, value: string) => {
      queued.push({ key, value });
      return multiMock;
    },
    exec: async () => {
      for (const entry of queued) {
        store.set(entry.key, entry.value);
      }
      return [];
    },
  };
  return multiMock;
};

const buildBaseRow = (characterId: number, phase: ResourcePhase) => ({
  id: characterId,
  user_id: characterId + 1000,
  nickname: `角色${characterId}`,
  title: '散修',
  gender: 'male',
  avatar: null,
  auto_cast_skills: true,
  auto_disassemble_enabled: false,
  auto_disassemble_rules: [],
  dungeon_no_stamina_cost: false,
  spirit_stones: 0,
  silver: 0,
  stamina: 30,
  realm: '凡人',
  sub_realm: null,
  exp: 0,
  insight_level: 0,
  attribute_points: 0,
  jing: phase === 'high' ? 48 : 24,
  qi: phase === 'high' ? 72 : 36,
  shen: phase === 'high' ? 60 : 30,
  attribute_type: 'physical',
  attribute_element: 'none',
  current_map_id: 'map-qingyun-village',
  current_room_id: 'room-village-center',
});

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

test('单角色共享资源在最大气血与最大灵气变化后应按 delta 同步', async (t) => {
  const redisStore = new Map<string, string>();
  let phase: ResourcePhase = 'low';
  const characterId = 4101;

  t.mock.method(redis, 'get', async (key: string) => redisStore.get(key) ?? null);
  t.mock.method(redis, 'mget', async (...keys: string[]) => keys.map((key) => redisStore.get(key) ?? null));
  t.mock.method(redis, 'set', async (key: string, value: string) => {
    redisStore.set(key, value);
    return 'OK';
  });
  t.mock.method(redis, 'del', async (key: string) => {
    return redisStore.delete(key) ? 1 : 0;
  });
  t.mock.method(redis, 'multi', () => createRedisMultiMock(redisStore));

  t.mock.method(database, 'query', async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes('WHERE c.id = $1')) {
      assert.deepEqual(params, [characterId]);
      return { rows: [buildBaseRow(characterId, phase)] };
    }
    if (sql.includes('FROM character_technique')) {
      return { rows: [] };
    }
    if (sql.includes('FROM character_title')) {
      return { rows: [] };
    }
    throw new Error(`未覆盖的 SQL: ${sql}`);
  });

  t.mock.method(monthCardBenefits, 'getMonthCardActiveMapByCharacterIds', async () => new Map());
  t.mock.method(characterGlobalBuffService, 'loadActiveCharacterGlobalBuffValuesByCharacterIds', async () => new Map());
  t.mock.method(characterSettlementResourceDeltaService, 'loadCharacterSettlementResourceDeltaMap', async () => new Map());
  t.mock.method(characterSettlementResourceDeltaService, 'loadCharacterSettlementCurrencyExactDeltaMap', async () => new Map());
  t.mock.method(characterItemInstanceMutationService, 'loadProjectedCharacterItemInstancesByLocation', async () => []);
  t.mock.method(titleDefinitionService, 'listTitleDefinitionsByIds', async () => new Map());

  await clearCharacterRuntimeResourceCache(characterId);

  const lowComputed = await getCharacterComputedByCharacterId(characterId);
  assert.ok(lowComputed);
  assert.ok(lowComputed.max_qixue > 0);
  assert.ok(lowComputed.max_lingqi >= 0);

  const seeded = await setCharacterResourcesByCharacterId(characterId, {
    qixue: Math.max(0, lowComputed.max_qixue - 180),
    lingqi: Math.max(0, lowComputed.max_lingqi - 12),
  });
  assert.ok(seeded);

  phase = 'high';
  const highComputed = await getCharacterComputedByCharacterId(characterId);
  assert.ok(highComputed);
  assert.ok(highComputed.max_qixue > lowComputed.max_qixue);
  assert.ok(highComputed.max_lingqi > lowComputed.max_lingqi);
  assert.equal(
    highComputed.qixue,
    clamp(seeded.qixue + (highComputed.max_qixue - lowComputed.max_qixue), 0, highComputed.max_qixue),
  );
  assert.equal(
    highComputed.lingqi,
    clamp(seeded.lingqi + (highComputed.max_lingqi - lowComputed.max_lingqi), 0, highComputed.max_lingqi),
  );

  const reseeded = await setCharacterResourcesByCharacterId(characterId, {
    qixue: Math.max(0, highComputed.max_qixue - 150),
    lingqi: Math.max(0, highComputed.max_lingqi - 10),
  });
  assert.ok(reseeded);

  phase = 'low';
  const returnedComputed = await getCharacterComputedByCharacterId(characterId);
  assert.ok(returnedComputed);
  assert.equal(returnedComputed.max_qixue, lowComputed.max_qixue);
  assert.equal(returnedComputed.max_lingqi, lowComputed.max_lingqi);
  assert.equal(
    returnedComputed.qixue,
    clamp(reseeded.qixue + (returnedComputed.max_qixue - highComputed.max_qixue), 0, returnedComputed.max_qixue),
  );
  assert.equal(
    returnedComputed.lingqi,
    clamp(reseeded.lingqi + (returnedComputed.max_lingqi - highComputed.max_lingqi), 0, returnedComputed.max_lingqi),
  );
});

test('批量共享资源入口在最大资源变化后也应按 delta 同步', async (t) => {
  const redisStore = new Map<string, string>();
  let phase: ResourcePhase = 'low';
  const targetCharacterId = 4102;
  const otherCharacterId = 4103;

  t.mock.method(redis, 'get', async (key: string) => redisStore.get(key) ?? null);
  t.mock.method(redis, 'mget', async (...keys: string[]) => keys.map((key) => redisStore.get(key) ?? null));
  t.mock.method(redis, 'set', async (key: string, value: string) => {
    redisStore.set(key, value);
    return 'OK';
  });
  t.mock.method(redis, 'del', async (key: string) => {
    return redisStore.delete(key) ? 1 : 0;
  });
  t.mock.method(redis, 'multi', () => createRedisMultiMock(redisStore));

  t.mock.method(database, 'query', async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes('WHERE c.id = ANY($1)')) {
      const ids = (params?.[0] as number[]) ?? [];
      return {
        rows: ids.map((id) => buildBaseRow(id, id === targetCharacterId ? phase : 'low')),
      };
    }
    if (sql.includes('WHERE c.id = $1')) {
      const id = Number(params?.[0] ?? 0);
      return { rows: [buildBaseRow(id, id === targetCharacterId ? phase : 'low')] };
    }
    if (sql.includes('FROM character_technique')) {
      return { rows: [] };
    }
    if (sql.includes('FROM character_title')) {
      return { rows: [] };
    }
    throw new Error(`未覆盖的 SQL: ${sql}`);
  });

  t.mock.method(monthCardBenefits, 'getMonthCardActiveMapByCharacterIds', async () => new Map());
  t.mock.method(characterGlobalBuffService, 'loadActiveCharacterGlobalBuffValuesByCharacterIds', async () => new Map());
  t.mock.method(characterSettlementResourceDeltaService, 'loadCharacterSettlementResourceDeltaMap', async () => new Map());
  t.mock.method(characterSettlementResourceDeltaService, 'loadCharacterSettlementCurrencyExactDeltaMap', async () => new Map());
  t.mock.method(characterItemInstanceMutationService, 'loadProjectedCharacterItemInstancesByLocation', async () => []);
  t.mock.method(titleDefinitionService, 'listTitleDefinitionsByIds', async () => new Map());

  await clearCharacterRuntimeResourceCache(targetCharacterId);
  await clearCharacterRuntimeResourceCache(otherCharacterId);

  const lowBatch = await getCharacterComputedBatchByCharacterIds([targetCharacterId, otherCharacterId]);
  const lowComputed = lowBatch.get(targetCharacterId);
  assert.ok(lowComputed);

  const seeded = await setCharacterResourcesByCharacterId(targetCharacterId, {
    qixue: Math.max(0, lowComputed.max_qixue - 160),
    lingqi: Math.max(0, lowComputed.max_lingqi - 8),
  });
  assert.ok(seeded);

  phase = 'high';
  const highBatch = await getCharacterComputedBatchByCharacterIds([targetCharacterId, otherCharacterId]);
  const highComputed = highBatch.get(targetCharacterId);
  assert.ok(highComputed);
  assert.ok(highComputed.max_qixue > lowComputed.max_qixue);
  assert.ok(highComputed.max_lingqi > lowComputed.max_lingqi);
  assert.equal(
    highComputed.qixue,
    clamp(seeded.qixue + (highComputed.max_qixue - lowComputed.max_qixue), 0, highComputed.max_qixue),
  );
  assert.equal(
    highComputed.lingqi,
    clamp(seeded.lingqi + (highComputed.max_lingqi - lowComputed.max_lingqi), 0, highComputed.max_lingqi),
  );
});
