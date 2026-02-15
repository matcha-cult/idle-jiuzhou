/**
 * 事务辅助工具。
 * - `safeRollback`：安全回滚，吞掉回滚阶段异常，避免覆盖原始错误。
 * - `rollbackAndReturn`：回滚后直接返回指定结果，减少重复模板。
 */
import type { PoolClient } from 'pg';

export const safeRollback = async (client: PoolClient): Promise<void> => {
  try {
    await client.query('ROLLBACK');
  } catch {
    // 回滚失败不再上抛，避免掩盖主错误
  }
};

export const rollbackAndReturn = async <T>(client: PoolClient, result: T): Promise<T> => {
  await safeRollback(client);
  return result;
};
