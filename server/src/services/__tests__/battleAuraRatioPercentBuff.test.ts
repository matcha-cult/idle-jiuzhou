/**
 * 比率属性光环百分比加成回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住伙伴/角色光环对 `baoji`、`zengshang` 这类比率属性使用百分比加成时，不得把原有小数值截断成 0。
 * 2. 做什么：复现线上 `all_ally + 百分比法攻/暴击/增伤` 光环配置，确保玩家主角进入战斗后不会因光环而伤害变低。
 * 3. 不做什么：不覆盖完整伤害公式、不测试 UI 文案展示，也不验证数据库配置读取链路。
 *
 * 输入/输出：
 * - 输入：一名带小数型 `baoji/zengshang` 基础属性的主角、一名携带被动光环的伙伴、以及一个最小怪物目标。
 * - 输出：战斗开场后主角当前属性应保留小数比率，并按百分比正确放大。
 *
 * 数据流/状态流：
 * passive aura skill -> BattleEngine.startBattle -> processPassiveSkills -> roundStart/processAuraEffect -> addBuff/recalculateUnitAttrs。
 *
 * 关键边界条件与坑点：
 * 1. `baoji/zengshang` 在战斗内是 0~1 的小数比例，若统一走 `Math.floor` 会直接被截成 0，症状就是“带了光环反而伤害更低”。
 * 2. 测试同时保留 `fagong` 整数属性断言，避免只修小数分支时误伤原有整数百分比 Buff 行为。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { BattleEngine } from '../../battle/battleEngine.js';
import type { BattleSkill } from '../../battle/types.js';
import { createState, createUnit } from './battleTestUtils.js';

const PARTNER_ALLY_AURA_SKILL: BattleSkill = {
  id: 'skill-partner-all-ally-aura',
  name: '曜续灵幕',
  source: 'technique',
  cost: {},
  cooldown: 0,
  targetType: 'self',
  targetCount: 1,
  damageType: 'magic',
  element: 'jin',
  effects: [
    {
      type: 'buff',
      buffKey: 'buff-aura',
      buffKind: 'aura',
      auraTarget: 'all_ally',
      auraEffects: [
        {
          type: 'buff',
          value: 0.04,
          attrKey: 'fagong',
          buffKey: 'buff-fagong-up',
          buffKind: 'attr',
          applyType: 'percent',
        },
        {
          type: 'buff',
          value: 0.03,
          attrKey: 'baoji',
          buffKey: 'buff-baoji-up',
          buffKind: 'attr',
          applyType: 'percent',
        },
        {
          type: 'buff',
          value: 0.03,
          attrKey: 'zengshang',
          buffKey: 'buff-zengshang-up',
          buffKind: 'attr',
          applyType: 'percent',
        },
      ],
    },
  ],
  triggerType: 'passive',
  aiPriority: 10,
};

test('全体友方百分比光环不应把主角现有暴击与增伤截断为 0', () => {
  const player = createUnit({
    id: 'player-1',
    name: '主角',
    type: 'player',
    attrs: {
      fagong: 260,
      baoji: 0.25,
      zengshang: 0.12,
    },
  });
  const partner = createUnit({
    id: 'partner-1',
    name: '伙伴',
    type: 'partner',
    attrs: {
      fagong: 300,
      baoji: 0.1,
      zengshang: 0.05,
    },
  });
  const enemy = createUnit({
    id: 'monster-1',
    name: '敌人',
    type: 'monster',
  });

  partner.skills = [PARTNER_ALLY_AURA_SKILL];

  const state = createState({
    attacker: [player, partner],
    defender: [enemy],
  });

  const engine = new BattleEngine(state);
  engine.startBattle();

  assert.equal(player.currentAttrs.fagong, Math.floor(player.baseAttrs.fagong * 1.04));
  assert.equal(player.currentAttrs.baoji, 0.2575);
  assert.equal(player.currentAttrs.zengshang, 0.1236);
});
