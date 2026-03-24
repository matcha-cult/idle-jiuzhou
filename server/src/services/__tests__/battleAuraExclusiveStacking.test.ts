/**
 * 光环同类互斥回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住“场上存在多个相同光环效果时，只取最高值生效，不再叠加”的统一规则。
 * 2. 做什么：同时覆盖同类增益光环与同类减益光环，避免只修友方加成、敌方减益仍然叠加。
 * 3. 不做什么：不验证不同 buffKey 的光环是否可共存，也不覆盖 DOT/HOT/资源型光环明细。
 *
 * 输入/输出：
 * - 输入：多名携带同类 passive aura 的单位，以及一个受影响目标。
 * - 输出：战斗开场后目标属性仅按最高那条同类光环结算。
 *
 * 数据流/状态流：
 * passive aura skill -> BattleEngine.startBattle -> processPassiveSkills -> processRoundStart/processAuraEffect
 * -> aura_sub Buff 入表 -> collectEffectiveBuffs 聚合 -> currentAttrs 断言。
 *
 * 关键边界条件与坑点：
 * 1. 两条光环必须使用同一个 buffKey，才能证明“同类效果”确实走了统一分组，而不是靠 attrKey 偶然命中。
 * 2. 减益场景必须验证更大的负向幅度生效，否则很容易只按“数值更大”比较，导致 `-10` 错赢 `-30`。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { BattleEngine } from '../../battle/battleEngine.js';
import type { BattleSkill, SkillEffect } from '../../battle/types.js';
import { createState, createUnit } from './battleTestUtils.js';

const createPassiveAuraSkill = (
  id: string,
  auraTarget: 'all_ally' | 'all_enemy' | 'self',
  auraEffects: SkillEffect[],
): BattleSkill => ({
  id,
  name: id,
  triggerType: 'passive',
  source: 'technique',
  cost: {
    lingqi: 0,
    lingqiRate: 0,
    qixue: 0,
    qixueRate: 0,
  },
  cooldown: 0,
  targetType: 'self',
  targetCount: 1,
  damageType: undefined,
  element: 'none',
  effects: [{
    type: 'buff',
    buffKind: 'aura',
    buffKey: 'buff-aura',
    auraTarget,
    auraEffects,
  }],
  aiPriority: 100,
});

test('多个相同增益光环同时存在时，应只取最高值生效', () => {
  const target = createUnit({
    id: 'player-1',
    name: '主角',
    attrs: { fagong: 300 },
  });
  const weakerAuraCaster = createUnit({
    id: 'partner-1',
    name: '弱光环伙伴',
    type: 'partner',
  });
  const strongerAuraCaster = createUnit({
    id: 'partner-2',
    name: '强光环伙伴',
    type: 'partner',
  });
  const enemy = createUnit({
    id: 'monster-1',
    name: '敌人',
    type: 'monster',
  });

  weakerAuraCaster.skills = [createPassiveAuraSkill('skill-fagong-aura-weak', 'all_ally', [{
    type: 'buff',
    buffKind: 'attr',
    buffKey: 'buff-fagong-up',
    attrKey: 'fagong',
    applyType: 'percent',
    value: 0.1,
    duration: 1,
  }])];

  strongerAuraCaster.skills = [createPassiveAuraSkill('skill-fagong-aura-strong', 'all_ally', [{
    type: 'buff',
    buffKind: 'attr',
    buffKey: 'buff-fagong-up',
    attrKey: 'fagong',
    applyType: 'percent',
    value: 0.2,
    duration: 1,
  }])];

  const state = createState({
    attacker: [target, weakerAuraCaster, strongerAuraCaster],
    defender: [enemy],
  });
  const engine = new BattleEngine(state);

  engine.startBattle();

  assert.equal(target.currentAttrs.fagong, 360, '应只按 20% 强光环结算，不应叠加成 30%');
});

test('多个相同减益光环同时存在时，应只取减益幅度最高的那条', () => {
  const auraCasterA = createUnit({
    id: 'player-10',
    name: '寒锋甲',
  });
  const auraCasterB = createUnit({
    id: 'player-11',
    name: '寒锋乙',
  });
  const target = createUnit({
    id: 'monster-10',
    name: '山魈',
    type: 'monster',
    attrs: { sudu: 120 },
  });

  auraCasterA.skills = [createPassiveAuraSkill('skill-sudu-down-aura-weak', 'all_enemy', [{
    type: 'debuff',
    buffKind: 'attr',
    buffKey: 'debuff-sudu-down',
    attrKey: 'sudu',
    applyType: 'flat',
    value: 10,
    duration: 1,
  }])];

  auraCasterB.skills = [createPassiveAuraSkill('skill-sudu-down-aura-strong', 'all_enemy', [{
    type: 'debuff',
    buffKind: 'attr',
    buffKey: 'debuff-sudu-down',
    attrKey: 'sudu',
    applyType: 'flat',
    value: 30,
    duration: 1,
  }])];

  const state = createState({
    attacker: [auraCasterA, auraCasterB],
    defender: [target],
  });
  const engine = new BattleEngine(state);

  engine.startBattle();

  assert.equal(target.currentAttrs.sudu, 90, '应只按 30 点减速生效，不应叠加成 40 点');
});
