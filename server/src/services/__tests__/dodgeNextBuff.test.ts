/**
 * 下一次闪避 Buff 回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：验证 `dodge_next` 会在直接伤害命中前优先结算为 miss，并按层数逐次消耗。
 * 2) 不做什么：不覆盖 DOT/反伤/光环等非命中型伤害来源，也不测试前端文案展示。
 *
 * 输入/输出：
 * - 输入：带 `dodge_next` 的自增益技能、固定真伤攻击技能，以及默认 BattleState/BattleUnit。
 * - 输出：命中结果、受击方气血变化、Buff 层数递减结果。
 *
 * 数据流/状态流：
 * - 守方释放闪避 Buff -> ActiveBuff 挂载 dodgeNext 运行时效果
 * - 攻方执行直接伤害 -> damage.ts 命中前消费 dodgeNext -> 返回 miss
 * - 若 Buff 仍有剩余层数，则继续保留；否则立即移除
 *
 * 关键边界条件与坑点：
 * 1) 这里故意使用真伤与满命中，避免防御/随机命中率把断言噪音带进来。
 * 2) 升级后的多层闪避必须一次只消耗 1 层，否则“下两次闪避”会退化成“只闪一次”。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSkill } from '../../battle/modules/skill.js';
import type { BattleSkill } from '../../battle/types.js';
import { createState, createUnit } from './battleTestUtils.js';

function createDodgeNextSkill(stacks = 1): BattleSkill {
    return {
        id: 'skill-dodge-next',
        name: '流云步',
        source: 'technique',
        sourceId: 'tech-liuyun-bu',
        cost: {},
        cooldown: 0,
        targetType: 'self',
        targetCount: 1,
        damageType: 'physical',
        element: 'mu',
        effects: [
            {
                type: 'buff',
                duration: 2,
                stacks,
                buffKey: 'buff-dodge-next',
                buffKind: 'dodge_next',
            },
        ],
        triggerType: 'active',
        aiPriority: 60,
    };
}

function createGuaranteedStrikeSkill(damage = 180): BattleSkill {
    return {
        id: 'skill-guaranteed-strike',
        name: '定锋击',
        source: 'innate',
        cost: {},
        cooldown: 0,
        targetType: 'single_enemy',
        targetCount: 1,
        damageType: 'true',
        element: 'none',
        effects: [
            {
                type: 'damage',
                valueType: 'flat',
                value: damage,
                damageType: 'true',
                element: 'none',
            },
        ],
        triggerType: 'active',
        aiPriority: 70,
    };
}

test('dodge_next Buff 应使命中前首段直接伤害 miss 并立即移除', () => {
    const defender = createUnit({ id: 'player-1', name: '身法修士' });
    const attacker = createUnit({
        id: 'monster-1',
        name: '木桩妖',
        type: 'monster',
        attrs: { mingzhong: 1, shanbi: 0 },
    });
    const state = createState({ attacker: [defender], defender: [attacker] });

    const applyBuffResult = executeSkill(state, defender, createDodgeNextSkill());
    assert.equal(applyBuffResult.success, true);
    assert.equal(defender.buffs.length, 1);
    assert.equal(defender.buffs[0]?.dodgeNext?.guaranteedMiss, true);

    const attackResult = executeSkill(state, attacker, createGuaranteedStrikeSkill(), [defender.id]);
    assert.equal(attackResult.success, true);
    assert.equal(attackResult.log?.targets[0]?.hits[0]?.isMiss, true);
    assert.equal(defender.qixue, defender.currentAttrs.max_qixue);
    assert.equal(defender.buffs.length, 0);
});

test('dodge_next Buff 多层时应逐次消耗，耗尽后后续攻击恢复命中', () => {
    const defender = createUnit({ id: 'player-2', name: '幻身修士' });
    const attacker = createUnit({
        id: 'monster-2',
        name: '试刀木人',
        type: 'monster',
        attrs: { mingzhong: 1, shanbi: 0 },
    });
    const state = createState({ attacker: [defender], defender: [attacker] });

    const applyBuffResult = executeSkill(state, defender, createDodgeNextSkill(2));
    assert.equal(applyBuffResult.success, true);
    assert.equal(defender.buffs[0]?.stacks, 2);

    const firstAttack = executeSkill(state, attacker, createGuaranteedStrikeSkill(), [defender.id]);
    assert.equal(firstAttack.success, true);
    assert.equal(firstAttack.log?.targets[0]?.hits[0]?.isMiss, true);
    assert.equal(defender.buffs[0]?.stacks, 1);
    assert.equal(defender.qixue, defender.currentAttrs.max_qixue);

    const secondAttack = executeSkill(state, attacker, createGuaranteedStrikeSkill(), [defender.id]);
    assert.equal(secondAttack.success, true);
    assert.equal(secondAttack.log?.targets[0]?.hits[0]?.isMiss, true);
    assert.equal(defender.buffs.length, 0);
    assert.equal(defender.qixue, defender.currentAttrs.max_qixue);

    const thirdAttack = executeSkill(state, attacker, createGuaranteedStrikeSkill(), [defender.id]);
    assert.equal(thirdAttack.success, true);
    assert.equal(thirdAttack.log?.targets[0]?.hits[0]?.isMiss, false);
    assert.equal(thirdAttack.log?.targets[0]?.hits[0]?.damage, 180);
    assert.equal(defender.qixue, defender.currentAttrs.max_qixue - 180);
});
