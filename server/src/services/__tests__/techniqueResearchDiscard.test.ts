/**
 * 洞府研修主动放弃测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证主动放弃待抄写草稿时，会严格复用“草稿过期”的退款与状态流，避免 service 里再分叉一套放弃规则。
 * 2. 做什么：确认 `GENERATION_EXPIRED` 错误码与 `refunded` 状态会一起落库，确保前端结果展示与冷却口径保持一致。
 * 3. 不做什么：不连接真实数据库、不覆盖前端按钮渲染，也不验证自然过期扫描任务。
 *
 * 输入/输出：
 * - 输入：数据库查询 mock、背包入包 mock，以及角色 ID / 生成任务 ID。
 * - 输出：放弃接口返回结果与任务表更新参数。
 *
 * 数据流/状态流：
 * discardGeneratedTechniqueDraft -> 查询当前草稿 -> 复用统一退款入口 -> 更新任务为 refunded。
 *
 * 关键边界条件与坑点：
 * 1. 主动放弃必须按“过期草稿”处理，不能改写成新的错误码或状态，否则前端结果语义会和自然过期分叉。
 * 2. 任务最终状态必须是 `refunded`，这样冷却计算才能继续复用现有“退款后仍保留冷却”的单一入口。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import * as database from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { techniqueGenerationService, type ServiceResult } from '../techniqueGenerationService.js';

type SqlValue = boolean | Date | number | string | null;
type TechniqueResearchDiscardService = {
  discardGeneratedTechniqueDraft: (
    characterId: number,
    generationId: string,
  ) => Promise<ServiceResult<{ generationId: string }>>;
};

type MockTransactionState = {
  clientId: number;
  depth: number;
  released: boolean;
  rollbackCause: null;
  rollbackOnly: boolean;
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
          : typeof firstArg === 'object' && firstArg !== null && 'text' in firstArg
            ? String(firstArg.text)
            : '';
      const secondArg = queryArgs[1];
      const params = Array.isArray(secondArg) ? (secondArg as readonly SqlValue[]) : undefined;

      if (sql === 'BEGIN') {
        txState.depth = 1;
        return createQueryResult([]);
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        txState.depth = 0;
        return createQueryResult([]);
      }

      return await handler(sql, params);
    }) as PoolClient['query'],
    release: () => undefined,
  };

  return client as PoolClient;
};

test('discardGeneratedTechniqueDraft: 主动放弃草稿应按过期规则半额返还并标记为 refunded', async (t) => {
  redis.disconnect();

  const updateCalls: Array<{ sql: string; params: unknown[] | undefined }> = [];

  t.mock.method(
    database.pool,
    'connect',
    async () => createMockPoolClient(async (sql, params) => {
      if (
        sql.includes('FROM technique_generation_job')
        && sql.includes("status = 'generated_draft'")
        && sql.includes('draft_expire_at <= NOW()')
      ) {
        return createQueryResult([]);
      }

      if (
        sql.includes('FROM technique_generation_job')
        && sql.includes('WHERE id = $1 AND character_id = $2')
        && sql.includes('FOR UPDATE')
      ) {
        return createQueryResult([
          {
            status: 'generated_draft',
            cost_points: 1,
          },
        ]);
      }

      if (sql.includes('UPDATE technique_generation_job') && sql.includes('SET status = $2')) {
        updateCalls.push({ sql, params: params as unknown[] | undefined });
        return createQueryResult([]);
      }

      throw new Error(`未覆盖的 SQL: ${sql}`);
    }),
  );

  const discardService = techniqueGenerationService as TechniqueResearchDiscardService;
  const result = await discardService.discardGeneratedTechniqueDraft(2712, 'research-job-1');

  assert.equal(result.success, true);
  assert.equal(result.data?.generationId, 'research-job-1');
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0]?.params, [
    'research-job-1',
    'refunded',
    'GENERATION_EXPIRED',
    '草稿已过期，系统已自动返还一半功法残页',
  ]);
});
