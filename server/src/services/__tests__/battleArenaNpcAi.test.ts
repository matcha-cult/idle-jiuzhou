/**
 * 竞技场防守方 NPC 选技回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定竞技场防守方 `npc` 单位沿用玩家式“技能优先”选技，不再把普通攻击混进随机技能池。
 * 2. 做什么：覆盖 arena 快照对手的真实装配路径，避免只测裸 `makeAIDecision` 导致 defenderUnitType 回归漏检。
 * 3. 不做什么：不验证完整战斗回放、不验证 Socket 推送或竞技场结算。
 *
 * 输入/输出：
 * - 输入：`createPVPBattle(..., { defenderUnitType: 'npc' })` 生成的竞技场战斗状态，以及一个可正常释放的主动技能。
 * - 输出：AI 决策结果，要求优先选择主动技能而不是普通攻击。
 *
 * 数据流/状态流：
 * arena start -> createPVPBattle -> defender type=npc -> makeAIDecision -> 返回选中技能。
 *
 * 复用设计说明：
 * - 复用 battleFactory 的真实竞技场装配入口，避免测试里手写一套 NPC 单位结构导致和生产逻辑脱节。
 * - 复用 `battleTestUtils.createCharacterData` 统一角色样板，减少测试之间重复拼装角色属性。
 *
 * 关键边界条件与坑点：
 * 1. 测试显式把 `randomSeed` 设为会命中技能池首项的值，确保旧逻辑下稳定复现“随机普攻”，回归结果可重复。
 * 2. 主动技能必须零消耗、零冷却，否则会被 `getAvailableSkills` 正常过滤，导致误判为 AI 逻辑问题。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPVPBattle, type SkillData } from '../../battle/battleFactory.js';
import { makeAIDecision } from '../../battle/modules/ai.js';
import { createCharacterData } from './battleTestUtils.js';

const ACTIVE_SKILL: SkillData = {
  id: 'skill-arena-npc-active',
  name: '裂空斩',
  cost_lingqi: 0,
  cost_lingqi_rate: 0,
  cost_qixue: 0,
  cost_qixue_rate: 0,
  cooldown: 0,
  target_type: 'single_enemy',
  target_count: 1,
  damage_type: 'physical',
  element: 'jin',
  effects: [
    {
      type: 'damage',
      valueType: 'flat',
      value: 120,
      damageType: 'physical',
    },
  ],
  trigger_type: 'active',
  ai_priority: 80,
};

test('竞技场防守方 npc 有可用主动技能时不应随机普攻', () => {
  const state = createPVPBattle(
    'arena-battle-ai-regression',
    createCharacterData(1),
    [],
    createCharacterData(2),
    [ACTIVE_SKILL],
    { defenderUnitType: 'npc' },
  );
  const defender = state.teams.defender.units[0];
  assert.ok(defender, '应成功创建竞技场防守方单位');

  state.randomSeed = 0;
  state.randomIndex = 0;

  const decision = makeAIDecision(state, defender);
  assert.equal(decision.skill.id, ACTIVE_SKILL.id);
});
