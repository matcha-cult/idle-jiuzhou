/**
 * 装备解绑服务测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：验证装备解绑服务对“未绑定/已锁定/成功解绑”三类分支的校验与更新行为。
 * - 不做什么：不覆盖 itemService 的整条 useItem 编排，不触达真实数据库连接或事务装饰器。
 *
 * 输入/输出：
 * - 输入：目标装备实例 ID、角色 ID，以及注入式 queryRunner / 物品定义解析函数。
 * - 输出：解绑结果对象与数据库调用顺序。
 *
 * 数据流/状态流：
 * - 测试通过队列式 query mock 喂给查询结果；
 * - 服务读取目标装备实例 -> 校验装备与绑定状态 -> 自定义 runner 分支要求必须处于真实事务上下文。
 *
 * 关键边界条件与坑点：
 * 1) 目标装备已是未绑定时必须直接拒绝，避免错误消耗解绑道具。
 * 2) 目标装备被锁定时必须拒绝解绑，避免绕过背包锁的保护语义。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  unbindEquipmentBindingByInstanceId,
  type EquipmentUnbindQueryRunner,
} from '../inventory/equipmentUnbind.js';

type QueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number;
};

const createQueryRunner = (
  queue: QueryResult[],
): { calls: Array<{ sql: string; params: unknown[] }>; runner: EquipmentUnbindQueryRunner } => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const runner: EquipmentUnbindQueryRunner = async (sql, params) => {
    calls.push({ sql, params });
    const next = queue.shift();
    assert.ok(next, `query 调用次数超出预期: ${sql}`);
    return next;
  };
  return { calls, runner };
};

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('目标装备未绑定时应直接拒绝解绑', async () => {
  const { calls, runner } = createQueryRunner([
    {
      rows: [
        {
          id: 501,
          owner_character_id: 88,
          item_def_id: 'equip-weapon-001',
          bind_type: 'none',
          locked: false,
        },
      ],
    },
  ]);

  const result = await unbindEquipmentBindingByInstanceId({
    characterId: 88,
    itemInstanceId: 501,
    queryRunner: runner,
    resolveItemDef: () => ({ category: 'equipment' }),
  });

  assert.equal(result.success, false);
  assert.equal(result.message, '目标装备尚未绑定');
  assert.equal(calls.length, 1);
});

test('目标装备已锁定时不应允许解绑', async () => {
  const { calls, runner } = createQueryRunner([
    {
      rows: [
        {
          id: 502,
          owner_character_id: 88,
          item_def_id: 'equip-armor-001',
          bind_type: 'equip',
          locked: true,
        },
      ],
    },
  ]);

  const result = await unbindEquipmentBindingByInstanceId({
    characterId: 88,
    itemInstanceId: 502,
    queryRunner: runner,
    resolveItemDef: () => ({ category: 'equipment' }),
  });

  assert.equal(result.success, false);
  assert.equal(result.message, '目标装备已锁定');
  assert.equal(calls.length, 1);
});

test('自定义 queryRunner 成功解绑分支必须要求事务上下文', async () => {
  const { calls, runner } = createQueryRunner([
    {
      rows: [
        {
          id: 503,
          owner_character_id: 88,
          item_def_id: 'equip-ring-001',
          bind_type: 'pickup',
          locked: false,
        },
      ],
    },
  ]);

  const result = await unbindEquipmentBindingByInstanceId({
    characterId: 88,
    itemInstanceId: 503,
    queryRunner: runner,
    resolveItemDef: () => ({ category: 'equipment' }),
  });

  assert.equal(result.success, false);
  assert.equal(result.message, '自定义事务解绑必须在事务上下文中执行');
  assert.equal(calls.length, 1);
});

test('装备解绑源码不应再保留自定义 runner 分支的手写 UPDATE', () => {
  const source = readSource('../inventory/equipmentUnbind.ts');

  assert.match(source, /applyCharacterItemInstanceMutationsImmediately/u);
  assert.match(source, /hasUsableTransactionContext\(\)/u);
  assert.doesNotMatch(
    source,
    /UPDATE item_instance[\s\S]*SET bind_type = 'none'/u,
  );
});
