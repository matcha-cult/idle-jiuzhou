/**
 * 签到奖励规则回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定签到奖励统一由 `signInService` 计算，避免“基础奖励 + 连签增量 + 30 天封顶”在别处重复实现。
 * 2. 做什么：验证连续签到奖励只在服务端事务链路内生效，前端仅消费结果，不额外复制数值规则。
 * 3. 不做什么：不连接真实数据库，不覆盖签到概览读取或节日展示逻辑。
 *
 * 输入/输出：
 * - 输入：用户 ID、模拟的数据库查询结果、不同长度的连续签到历史。
 * - 输出：`doSignIn` 返回的签到奖励，以及写入 `sign_in_records` 的 reward 数值。
 *
 * 数据流/状态流：
 * - 测试先把 `withTransaction` 改成直通，避免误触真实事务；
 * - 再按 SQL 语义模拟角色校验、今日重复校验、历史签到查询、签到插入与角色灵石更新；
 * - 最后断言签到结果与落库 reward 完全一致。
 *
 * 关键边界条件与坑点：
 * 1. 连续签到天数计算以“今天签到后”的连续天数为准，因此第 1 天仍是基础奖励，第 5 天才会多出 400 灵石。
 * 2. 奖励加成最多只按 30 天计算；即使历史连续签到超过 30 天，也不能继续叠加，避免数值无限增长。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import * as database from '../../config/database.js';
import { signInService } from '../signInService.js';

type SqlValue = boolean | Date | number | string | null;
type MockTransactionState = {
  clientId: number;
  depth: number;
  released: boolean;
  rollbackCause: null;
  rollbackOnly: boolean;
};

const createDateDaysAgo = (daysAgo: number): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const createStreakRows = (daysBeforeToday: number): Array<{ sign_date: Date }> => {
  return Array.from({ length: daysBeforeToday }, (_, index) => ({
    sign_date: createDateDaysAgo(index + 1),
  }));
};

const createQueryResult = <TRow extends QueryResultRow>(rows: TRow[]): QueryResult<TRow> => {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    rows,
    fields: [],
  };
};

const isSqlConfigArg = (
  value: string | readonly SqlValue[] | { text: string } | undefined,
): value is { text: string } => {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'text' in value;
};

const createMockPoolClient = (
  handler: (sql: string, params?: readonly SqlValue[]) => Promise<QueryResult<QueryResultRow>>,
): PoolClient => {
  const txState: MockTransactionState = {
    clientId: 1,
    depth: 0,
    released: false,
    rollbackCause: null,
    rollbackOnly: false,
  };

  const client: Partial<PoolClient> & { __txState: MockTransactionState } = {
    __txState: txState,
    query: (async (...queryArgs: Array<string | readonly SqlValue[] | { text: string }>) => {
      const firstArg = queryArgs[0];
      const sql =
        typeof firstArg === 'string'
          ? firstArg
          : isSqlConfigArg(firstArg)
            ? firstArg.text
            : '';
      const secondArg = queryArgs[1];
      const params = Array.isArray(secondArg) ? (secondArg as readonly SqlValue[]) : undefined;

      if (sql === 'BEGIN') {
        txState.depth = 1;
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        txState.depth = 0;
      }
      return await handler(sql, params);
    }) as PoolClient['query'],
    release: () => undefined,
  };

  return client as PoolClient;
};

test('连续签到第5天应在基础奖励上增加400灵石', async (t) => {
  const insertedRewards: number[] = [];

  t.mock.method(database.pool, 'connect', async () =>
    createMockPoolClient(async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return createQueryResult([]);
      }

      if (sql.includes('SELECT id FROM characters')) {
        return createQueryResult([{ id: 9001 }]);
      }

      if (sql.includes('SELECT id FROM sign_in_records') && sql.includes('LIMIT 1')) {
        return createQueryResult([]);
      }

      if (sql.includes('SELECT sign_date') && sql.includes('ORDER BY sign_date DESC')) {
        return createQueryResult(createStreakRows(4));
      }

      if (sql.includes('INSERT INTO sign_in_records')) {
        const rewardParam = params?.[2];
        insertedRewards.push(typeof rewardParam === 'number' ? rewardParam : Number(rewardParam));
        return createQueryResult([]);
      }

      if (sql.includes('UPDATE characters SET spirit_stones = spirit_stones +')) {
        return createQueryResult([{ spirit_stones: 6900 }]);
      }

      throw new Error(`未处理的 SQL: ${sql}`);
    }),
  );

  const result = await signInService.doSignIn(1001);

  assert.equal(result.success, true);
  assert.equal(result.data?.reward, 1900);
  assert.equal(result.data?.spiritStones, 6900);
  assert.deepEqual(insertedRewards, [1900]);
});

test('连续签到超过30天后奖励加成应封顶', async (t) => {
  const insertedRewards: number[] = [];

  t.mock.method(database.pool, 'connect', async () =>
    createMockPoolClient(async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return createQueryResult([]);
      }

      if (sql.includes('SELECT id FROM characters')) {
        return createQueryResult([{ id: 9002 }]);
      }

      if (sql.includes('SELECT id FROM sign_in_records') && sql.includes('LIMIT 1')) {
        return createQueryResult([]);
      }

      if (sql.includes('SELECT sign_date') && sql.includes('ORDER BY sign_date DESC')) {
        return createQueryResult(createStreakRows(45));
      }

      if (sql.includes('INSERT INTO sign_in_records')) {
        const rewardParam = params?.[2];
        insertedRewards.push(typeof rewardParam === 'number' ? rewardParam : Number(rewardParam));
        return createQueryResult([]);
      }

      if (sql.includes('UPDATE characters SET spirit_stones = spirit_stones +')) {
        return createQueryResult([{ spirit_stones: 14400 }]);
      }

      throw new Error(`未处理的 SQL: ${sql}`);
    }),
  );

  const result = await signInService.doSignIn(1002);

  assert.equal(result.success, true);
  assert.equal(result.data?.reward, 4400);
  assert.equal(result.data?.spiritStones, 14400);
  assert.deepEqual(insertedRewards, [4400]);
});
