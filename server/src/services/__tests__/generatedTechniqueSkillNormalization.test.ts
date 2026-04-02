/**
 * AI 生成功法技能冷却归一化回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定主动技能最小冷却为 1、被动技能冷却强制为 0 这条共享规则。
 * 2. 做什么：覆盖生成期清洗与加载期读取共同依赖的纯函数，避免两条链路再次分叉。
 * 3. 不做什么：不触发数据库读取、不覆盖完整功法 candidate 校验，也不验证战斗执行。
 *
 * 输入/输出：
 * - 输入：原始冷却值与技能触发类型。
 * - 输出：共享归一化函数返回的标准冷却值。
 *
 * 数据流/状态流：
 * 原始冷却字段 -> normalizeGeneratedTechniqueSkillCooldown -> candidate / 配置缓存 / 预览 DTO。
 *
 * 关键边界条件与坑点：
 * 1. 历史主动技能可能已经落成 0 冷却，读取链路必须在这里直接抬升，不能等到战斗或展示层临时补。
 * 2. 被动技能一旦被错误写入正数冷却，会和进场自动生效规则冲突，因此这里必须强制清零。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGeneratedTechniqueSkillCooldown } from '../shared/generatedTechniqueSkillNormalization.js';

test('normalizeGeneratedTechniqueSkillCooldown: 主动技能应把非正冷却抬升到 1', () => {
  assert.equal(normalizeGeneratedTechniqueSkillCooldown(0, 'active'), 1);
  assert.equal(normalizeGeneratedTechniqueSkillCooldown(-3, 'active'), 1);
  assert.equal(normalizeGeneratedTechniqueSkillCooldown(undefined, 'active'), 1);
});

test('normalizeGeneratedTechniqueSkillCooldown: 被动技能应始终归零', () => {
  assert.equal(normalizeGeneratedTechniqueSkillCooldown(0, 'passive'), 0);
  assert.equal(normalizeGeneratedTechniqueSkillCooldown(4, 'passive'), 0);
});
