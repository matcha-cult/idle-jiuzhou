/**
 * 创建任务互斥锁接入回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴招募与洞府研修的“创建任务”入口必须先拿角色级事务互斥锁。
 * 2. 做什么：验证接入互斥锁后，这两条链路不再依赖 `FOR UPDATE` 读取最新任务/冷却行。
 * 3. 不做什么：不执行真实创建逻辑，不连接数据库。
 *
 * 输入/输出：
 * - 输入：服务源码文本。
 * - 输出：关键互斥锁调用与无锁读取调用的断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 检查 create tx 是否先接入互斥锁 -> 检查原本的最新任务/冷却读取是否已切回无锁版本。
 *
 * 关键边界条件与坑点：
 * 1. 这里锁的是并发协议，防止以后有人删掉 advisory lock 后又把多张业务表 `FOR UPDATE` 加回来。
 * 2. 断言要同时覆盖“已接入互斥锁”和“读取改成 false/无锁”，否则优化可能只做了一半。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('创建任务入口应复用角色级事务互斥锁并改用无锁状态读取', () => {
  const partnerRecruitSource = readFileSync(
    new URL('../partnerRecruitService.ts', import.meta.url),
    'utf8',
  );
  const techniqueGenerationSource = readFileSync(
    new URL('../techniqueGenerationService.ts', import.meta.url),
    'utf8',
  );

  assert.match(partnerRecruitSource, /await lockPartnerRecruitCreationMutex\(characterId\)/u);
  assert.match(partnerRecruitSource, /loadLatestJobRow\(characterId,\s*false\)/u);
  assert.match(partnerRecruitSource, /loadLatestRecruitCooldownStartedAt\(characterId,\s*false\)/u);
  assert.match(partnerRecruitSource, /loadPartnerRecruitGeneratedNonHeavenCount\(characterId,\s*false\)/u);

  assert.match(techniqueGenerationSource, /await lockTechniqueResearchCreationMutex\(characterId\)/u);
  assert.match(techniqueGenerationSource, /loadLatestResearchCooldownStartedAt\(characterId,\s*false\)/u);
});
