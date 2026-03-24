import type { PoolClient, QueryResult } from 'pg';
import { getTransactionClient, isInTransaction } from '../../config/database.js';

/**
 * 角色操作互斥锁工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：为“同一角色的创建类操作”提供事务级 advisory xact lock，统一串行化入口。
 * 2. 做什么：把不同业务使用的 namespace 收口，避免各服务散落手写 `pg_advisory_xact_lock`。
 * 3. 不做什么：不负责事务开启、提交与重试，也不替代业务行锁。
 *
 * 输入/输出：
 * - `lockPartnerRecruitCreationMutex(characterId)`：串行化同一角色的伙伴招募创建。
 * - `lockTechniqueResearchCreationMutex(characterId)`：串行化同一角色的洞府研修创建。
 * - 均返回 `Promise<void>`，成功即表示当前事务已拿到互斥锁。
 *
 * 数据流/状态流：
 * 业务事务进入创建入口 -> 本模块从事务上下文提取 client -> 执行 `pg_advisory_xact_lock`
 * -> 当前事务提交/回滚后由 PostgreSQL 自动释放。
 *
 * 关键边界条件与坑点：
 * 1. 必须在事务上下文中使用，否则 xact lock 无法绑定到完整业务事务生命周期。
 * 2. namespace 一旦投产就应保持稳定，避免不同版本服务对同一业务拿到不一致的互斥锁。
 */
const PARTNER_RECRUIT_CREATION_MUTEX_NAMESPACE = 3102;
const TECHNIQUE_RESEARCH_CREATION_MUTEX_NAMESPACE = 3103;

type CharacterOperationMutexQueryRunner = Pick<PoolClient, 'query'>;

const lockCharacterOperationMutexByClient = async (
  client: CharacterOperationMutexQueryRunner,
  namespace: number,
  characterId: number,
): Promise<void> => {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error(`角色操作互斥锁参数错误: characterId=${String(characterId)}`);
  }
  await client.query(
    'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
    [namespace, characterId],
  ) as QueryResult;
};

const lockCharacterOperationMutex = async (
  namespace: number,
  characterId: number,
): Promise<void> => {
  if (!isInTransaction()) {
    throw new Error('角色操作互斥锁必须在事务上下文中获取，请通过 @Transactional 方法调用');
  }
  const client = getTransactionClient();
  if (!client) {
    throw new Error('角色操作互斥锁获取失败：事务连接不存在');
  }
  await lockCharacterOperationMutexByClient(client, namespace, characterId);
};

export const lockPartnerRecruitCreationMutexByClient = async (
  client: PoolClient,
  characterId: number,
): Promise<void> => {
  await lockCharacterOperationMutexByClient(client, PARTNER_RECRUIT_CREATION_MUTEX_NAMESPACE, characterId);
};

export const lockPartnerRecruitCreationMutex = async (characterId: number): Promise<void> => {
  await lockCharacterOperationMutex(PARTNER_RECRUIT_CREATION_MUTEX_NAMESPACE, characterId);
};

export const lockTechniqueResearchCreationMutexByClient = async (
  client: PoolClient,
  characterId: number,
): Promise<void> => {
  await lockCharacterOperationMutexByClient(client, TECHNIQUE_RESEARCH_CREATION_MUTEX_NAMESPACE, characterId);
};

export const lockTechniqueResearchCreationMutex = async (characterId: number): Promise<void> => {
  await lockCharacterOperationMutex(TECHNIQUE_RESEARCH_CREATION_MUTEX_NAMESPACE, characterId);
};
