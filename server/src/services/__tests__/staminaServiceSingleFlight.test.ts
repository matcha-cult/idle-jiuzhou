/**
 * 体力恢复单飞回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证同一角色在体力缓存未命中时，并发读取只会共享一条恢复 SQL 链路，避免重复更新 `characters`。
 * 2. 做什么：锁定体力恢复公共入口的并发协议，避免后续重构把“同角色单飞”删掉后又把登录风暴打回数据库。
 * 3. 不做什么：不连接真实 Redis / PostgreSQL，不验证体力恢复公式细节；公式正确性由 staminaRules 测试覆盖。
 *
 * 输入/输出：
 * - 输入：同一个 characterId 的两次并发 `applyStaminaRecoveryByCharacterId` 调用，以及模拟的 DB/Redis 响应。
 * - 输出：两次调用返回相同恢复结果，且底层 select/update 只执行一次。
 *
 * 数据流/状态流：
 * 清理指定角色缓存 -> Redis miss -> 两个并发请求同时进入体力恢复入口 -> 共享同一个 in-flight Promise
 * -> 仅首个请求查库并写回 -> 两个调用一起拿到同一份结果。
 *
 * 关键边界条件与坑点：
 * 1. 这里必须显式验证“并发 miss 只打一条 SQL”，否则只测返回值会掩盖数据库已被重复击穿的问题。
 * 2. 测试前后都要清理同一角色缓存，避免模块级内存缓存命中后把单飞分支短路掉。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { applyStaminaRecoveryByCharacterId } from '../staminaService.js';
import { invalidateStaminaCache } from '../staminaCacheService.js';

test('applyStaminaRecoveryByCharacterId: 同角色并发 miss 应共享一条恢复链路', async (t) => {
  const characterId = 7788;
  let selectCount = 0;
  let updateCount = 0;
  const recoverAt = new Date(Date.now() - 10 * 60 * 1_000).toISOString();

  t.mock.method(redis, 'get', async () => null);
  t.mock.method(redis, 'set', async () => 'OK');
  t.mock.method(redis, 'del', async () => 1);

  t.mock.method(database, 'query', async (sql: string) => {
    if (sql.includes('FROM characters c') && sql.includes('WHERE c.id = $1')) {
      selectCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        rows: [{
          id: characterId,
          stamina: 10,
          stamina_recover_at: recoverAt,
          insight_level: 0,
          month_card_start_at: null,
          month_card_expire_at: null,
        }],
      };
    }

    if (sql.includes('UPDATE characters SET stamina = $2')) {
      updateCount += 1;
      return { rows: [] };
    }

    if (sql.includes('UPDATE characters SET stamina_recover_at = $2')) {
      updateCount += 1;
      return { rows: [] };
    }

    throw new Error(`未处理的 SQL: ${sql}`);
  });

  await invalidateStaminaCache(characterId);

  const [first, second] = await Promise.all([
    applyStaminaRecoveryByCharacterId(characterId),
    applyStaminaRecoveryByCharacterId(characterId),
  ]);

  assert.notEqual(first, null);
  assert.notEqual(second, null);
  assert.deepEqual(first, second);
  assert.equal(selectCount, 1);
  assert.equal(updateCount, 1);

  await invalidateStaminaCache(characterId);
});
