/**
 * 洞府研修解锁规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证洞府研修统一解锁境界固定为“炼炁化神·结胎期”，并校验不同境界输入下的解锁结果。
 * 2. 不做什么：不覆盖数据库查询、状态接口与任务创建事务，只验证共享纯函数。
 *
 * 输入/输出：
 * - 输入：角色当前主境界与小境界。
 * - 输出：解锁境界常量与 `unlocked` 判断结果。
 *
 * 数据流/状态流：
 * 角色境界文本 -> buildTechniqueResearchUnlockState -> 研修状态接口 / 创建任务校验。
 *
 * 关键边界条件与坑点：
 * 1. 主境界与小境界分列时也必须正确识别，避免数据库存储格式变化导致门槛失效。
 * 2. 刚好达到结胎期应视为已解锁，不能错误要求更高境界。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTechniqueResearchUnlockState,
  TECHNIQUE_RESEARCH_UNLOCK_REALM,
} from '../shared/techniqueResearchUnlock.js';

test('TECHNIQUE_RESEARCH_UNLOCK_REALM: 应固定为炼炁化神·结胎期', () => {
  assert.equal(TECHNIQUE_RESEARCH_UNLOCK_REALM, '炼炁化神·结胎期');
});

test('buildTechniqueResearchUnlockState: 采药期时未解锁', () => {
  const state = buildTechniqueResearchUnlockState('炼炁化神', '采药期');

  assert.equal(state.unlockRealm, '炼炁化神·结胎期');
  assert.equal(state.unlocked, false);
});

test('buildTechniqueResearchUnlockState: 结胎期时应解锁', () => {
  const state = buildTechniqueResearchUnlockState('炼炁化神·结胎期', null);

  assert.equal(state.unlockRealm, '炼炁化神·结胎期');
  assert.equal(state.unlocked, true);
});

test('buildTechniqueResearchUnlockState: 更高境界时应保持已解锁', () => {
  const state = buildTechniqueResearchUnlockState('炼神返虚', '养神期');

  assert.equal(state.unlockRealm, '炼炁化神·结胎期');
  assert.equal(state.unlocked, true);
});
