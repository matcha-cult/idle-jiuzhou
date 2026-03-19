/**
 * 角色战斗技能装配回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证战斗技能装配会保留主动技能槽顺序，同时自动带入 passive/counter/chase 等非手动技能。
 * 2. 做什么：锁定“手动可配置技能集合”和“战斗应携带技能集合”分离后的合并口径，避免后续再次把被动技能过滤掉。
 * 3. 不做什么：不连接数据库，不验证技能定义转 BattleSkill，也不覆盖具体光环数值结算。
 *
 * 输入/输出：
 * - 输入：已装备主动技能顺序、当前已解锁技能明细。
 * - 输出：战斗装配阶段最终携带的 `{ skillId, upgradeLevel }[]`。
 *
 * 数据流/状态流：
 * - 技能槽顺序作为主动技能唯一顺序来源；
 * - 当前已解锁技能明细提供 triggerType 与 upgradeLevel；
 * - mergeCharacterBattleSkillEntries 合并后给 battle/shared/skills 继续组装 SkillData。
 *
 * 关键边界条件与坑点：
 * 1. 未上槽的主动技能不能被自动追加，否则会让面板配置与实战不一致。
 * 2. passive/counter/chase 等非手动技能必须被自动追加，否则光环、反击等效果会在进场前就丢失。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeCharacterBattleSkillEntries } from '../shared/characterBattleSkills.js';
import type { CharacterAvailableSkillEntry } from '../shared/characterAvailableSkills.js';

const createUnlockedSkillEntry = (
  overrides: Partial<CharacterAvailableSkillEntry>,
): CharacterAvailableSkillEntry => {
  return {
    skillId: 'skill-default',
    techniqueId: 'tech-default',
    techniqueName: '默认功法',
    triggerType: 'active',
    upgradeLevel: 0,
    skillName: '默认技能',
    skillIcon: '',
    description: null,
    costLingqi: 0,
    costLingqiRate: 0,
    costQixue: 0,
    costQixueRate: 0,
    cooldown: 0,
    targetType: 'self',
    targetCount: 1,
    damageType: 'none',
    element: 'none',
    effects: [],
    ...overrides,
  };
};

test('mergeCharacterBattleSkillEntries: 应保留主动技能槽顺序，并自动追加被动光环', () => {
  const result = mergeCharacterBattleSkillEntries({
    equippedSkillIds: ['skill-active-b', 'skill-active-a', 'skill-expired'],
    unlockedSkillEntries: [
      createUnlockedSkillEntry({
        skillId: 'skill-active-a',
        triggerType: 'active',
        upgradeLevel: 3,
      }),
      createUnlockedSkillEntry({
        skillId: 'skill-passive-aura',
        triggerType: 'passive',
        upgradeLevel: 2,
        effects: [{ type: 'buff', buffKind: 'aura' }],
      }),
      createUnlockedSkillEntry({
        skillId: 'skill-active-b',
        triggerType: 'active',
        upgradeLevel: 1,
      }),
    ],
  });

  assert.deepEqual(result, [
    { skillId: 'skill-active-b', upgradeLevel: 1 },
    { skillId: 'skill-active-a', upgradeLevel: 3 },
    { skillId: 'skill-passive-aura', upgradeLevel: 2 },
  ]);
});

test('mergeCharacterBattleSkillEntries: 未上槽主动技能不应被自动带入，但反击/追击类技能应带入', () => {
  const result = mergeCharacterBattleSkillEntries({
    equippedSkillIds: ['skill-active-a'],
    unlockedSkillEntries: [
      createUnlockedSkillEntry({
        skillId: 'skill-active-a',
        triggerType: 'active',
        upgradeLevel: 1,
      }),
      createUnlockedSkillEntry({
        skillId: 'skill-active-b',
        triggerType: 'active',
        upgradeLevel: 9,
      }),
      createUnlockedSkillEntry({
        skillId: 'skill-counter',
        triggerType: 'counter',
        upgradeLevel: 4,
      }),
      createUnlockedSkillEntry({
        skillId: 'skill-chase',
        triggerType: 'chase',
        upgradeLevel: 5,
      }),
    ],
  });

  assert.deepEqual(result, [
    { skillId: 'skill-active-a', upgradeLevel: 1 },
    { skillId: 'skill-counter', upgradeLevel: 4 },
    { skillId: 'skill-chase', upgradeLevel: 5 },
  ]);
});
