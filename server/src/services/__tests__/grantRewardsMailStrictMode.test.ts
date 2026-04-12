import assert from 'node:assert/strict';
import test from 'node:test';

import { grantSectionRewards } from '../mainQuest/grantRewards.js';
import type {
  GrantItemCreateFn,
  GrantItemCreateResult,
} from '../autoDisassembleRewardService.js';

type CreateCall = Parameters<GrantItemCreateFn>[0];

const createCreateItemMock = (
  queue: GrantItemCreateResult[],
): { calls: CreateCall[]; fn: GrantItemCreateFn } => {
  const calls: CreateCall[] = [];
  const fn: GrantItemCreateFn = async (params) => {
    calls.push(params);
    const next = queue.shift();
    assert.ok(next, `createItem 调用次数超出预期: ${JSON.stringify(params)}`);
    return next;
  };
  return { calls, fn };
};

test('grantSectionRewards 应支持注入同步物品创建函数', async () => {
  const { calls, fn } = createCreateItemMock([
    {
      success: true,
      message: 'ok',
      itemIds: [101, 102],
    },
  ]);

  const results = await grantSectionRewards(
    1,
    2,
    {
      items: [{ item_def_id: 'enhance-001', quantity: 2 }],
    },
    {
      obtainedFrom: 'mail',
      itemCreateFn: fn,
      failOnPendingMail: true,
    },
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    itemDefId: 'enhance-001',
    qty: 2,
    obtainedFrom: 'mail',
  });
  assert.equal(results.length, 1);
  if (results[0]?.type !== 'item') {
    assert.fail(`首个奖励类型异常: ${JSON.stringify(results[0])}`);
  }
  assert.equal(results[0].itemDefId, 'enhance-001');
  assert.equal(results[0].quantity, 2);
});

test('grantSectionRewards 在严格模式下命中待补发邮件时应直接失败', async () => {
  const { fn } = createCreateItemMock([
    {
      success: true,
      message: 'ok',
      itemIds: [201],
      equipment: { qualityRank: 2 },
    },
    {
      success: false,
      message: '背包已满',
    },
  ]);

  await assert.rejects(
    () => grantSectionRewards(
      1,
      2,
      {
        items: [{ item_def_id: 'equip-armor-001', quantity: 1 }],
      },
      {
        obtainedFrom: 'mail',
        itemCreateFn: fn,
        failOnPendingMail: true,
        autoDisassembleSetting: {
          enabled: true,
          rules: [
            {
              categories: ['equipment'],
              subCategories: [],
              excludedSubCategories: [],
              includeNameKeywords: [],
              excludeNameKeywords: [],
              maxQualityRank: 2,
            },
          ],
        },
      },
    ),
    /背包已满/,
  );
});
