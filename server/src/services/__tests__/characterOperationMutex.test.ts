import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lockPartnerRecruitCreationMutexByClient,
  lockTechniqueResearchCreationMutexByClient,
  lockWanderGenerationCreationMutexByClient,
} from '../shared/characterOperationMutex.js';

test('lockPartnerRecruitCreationMutexByClient: 应使用事务级 advisory xact lock 串行化同角色招募创建', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [{ locked: true }] };
    },
  };

  await lockPartnerRecruitCreationMutexByClient(client as never, 123);

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /pg_advisory_xact_lock/u);
  assert.doesNotMatch(calls[0]!.sql, /pg_try_advisory_xact_lock/u);
  assert.deepEqual(calls[0]!.params, [3102, 123]);
});

test('lockTechniqueResearchCreationMutexByClient: 应使用事务级 advisory xact lock 串行化同角色研修创建', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [{ locked: true }] };
    },
  };

  await lockTechniqueResearchCreationMutexByClient(client as never, 456);

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /pg_advisory_xact_lock/u);
  assert.doesNotMatch(calls[0]!.sql, /pg_try_advisory_xact_lock/u);
  assert.deepEqual(calls[0]!.params, [3103, 456]);
});

test('lockWanderGenerationCreationMutexByClient: 应使用事务级 advisory xact lock 串行化同角色云游生成', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [{ locked: true }] };
    },
  };

  await lockWanderGenerationCreationMutexByClient(client as never, 789);

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /pg_advisory_xact_lock/u);
  assert.doesNotMatch(calls[0]!.sql, /pg_try_advisory_xact_lock/u);
  assert.deepEqual(calls[0]!.params, [3104, 789]);
});
