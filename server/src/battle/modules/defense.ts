/**
 * 作用：
 * - 统一封装战斗中的防御减伤计算，避免各模块重复实现“按伤害类型读取正确防御并换算倍率”的逻辑。
 * - 仅负责“减伤率”计算，不处理命中、暴击、招架、五行等其它伤害环节。
 *
 * 输入/输出：
 * - 输入：受击方、伤害类型（physical | magic）。
 * - 输出：减伤率（0~1 之间的小数，表示最终伤害需乘以 1 - 减伤率）。
 *
 * 数据流/状态流：
 * - 从 BattleUnit.currentAttrs 读取 wufang / fafang -> 套用统一公式 -> 返回纯函数结果给 damage 模块消费。
 * - 不修改 BattleState/BattleUnit，不产生副作用。
 *
 * 关键边界条件与坑点：
 * - 防御最低按 0 处理（防止异常负值导致反向增伤）。
 * - 物理与法术共用同一套 K 常量，但必须按 damageType 严格分流到 wufang / fafang，避免混读属性。
 * - 这里只返回减伤率，真正落地成“攻击 × K / (防御 + K)”由 damage.ts 统一乘到基础伤害上，避免公式在多处散落。
 */

import type { BattleUnit } from '../types.js';
import { BATTLE_CONSTANTS } from '../types.js';

type DefenseDamageType = 'physical' | 'magic';

function readDefenseByDamageType(unit: BattleUnit, damageType: DefenseDamageType): number {
  const rawDefense = damageType === 'physical'
    ? unit.currentAttrs.wufang
    : unit.currentAttrs.fafang;
  return Math.max(0, rawDefense);
}

export function calculateDefenseReductionRate(
  defender: BattleUnit,
  damageType: DefenseDamageType,
  ignoreRate = 0,
): number {
  const defense = readDefenseByDamageType(defender, damageType);
  const safeIgnoreRate = Math.max(0, Math.min(1, ignoreRate));
  const effectiveDefense = defense * (1 - safeIgnoreRate);
  const denominator = effectiveDefense + BATTLE_CONSTANTS.DEFENSE_DAMAGE_K;

  if (denominator <= 0) return 0;
  return effectiveDefense / denominator;
}

/**
 * 作用：
 * - 把“原始伤害值乘以防御减伤倍率”的过程收敛到统一纯函数，避免光环直伤、反应伤害与主伤害链路各自重复拼公式。
 * - 只负责套用防御减伤倍率，不处理命中、暴击、护盾、取整与最小伤害规则。
 *
 * 输入/输出：
 * - 输入：原始伤害值、受击方、伤害类型、可选破防比例。
 * - 输出：套用防御减伤后的伤害值；真实伤害原样返回。
 *
 * 数据流/状态流：
 * - 调用方给出已确定的原始伤害 -> 本函数读取统一减伤率 -> 返回减伤后的数值 -> 再由各模块按自身语义取整或落地。
 * - 不修改 BattleUnit，不产生副作用。
 *
 * 关键边界条件与坑点：
 * - `true` 伤害必须直接透传，不能误读防御属性。
 * - 本函数不做最小 1 点兜底，是否允许减到 0 必须由调用方显式决定。
 */
export function calculateDamageAfterDefenseReduction(
  damage: number,
  defender: BattleUnit,
  damageType: 'physical' | 'magic' | 'true',
  ignoreRate = 0,
): number {
  if (damageType === 'true') return damage;
  const reductionRate = calculateDefenseReductionRate(defender, damageType, ignoreRate);
  return damage * (1 - reductionRate);
}
