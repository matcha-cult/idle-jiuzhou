/**
 * 功法被动数值预算共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中维护功法/伙伴共享的被动单层与累计预算，供 prompt 约束、生成校验与伙伴规则复用。
 * 2) 做什么：把“某个属性在某个品质下最多给多少”收敛成单一入口，避免 aura、被动、招募规则各写一套上限。
 * 3) 不做什么：不筛选允许的 passive key，不负责技能结构校验，也不处理战斗结算。
 *
 * 输入/输出：
 * - 输入：属性 key、品质。
 * - 输出：该 key 对应的 `{ mode, maxPerLayer, maxTotal }`；若 key 不支持功法被动则返回 null。
 *
 * 数据流/状态流：
 * characterAttrRegistry 的被动模式 -> 本模块预算表 -> 功法 prompt / 生成功法校验 / 伙伴规则共同消费。
 *
 * 关键边界条件与坑点：
 * 1) `multiply` 乘区属性在预算层统一视作 `percent`，否则 prompt 与校验会出现两套口径。
 * 2) 这里返回的是“单层/单项预算”，不是整本功法的最终总和；累计上限仍需要调用方按自己的结构去汇总。
 */
import { TECHNIQUE_PASSIVE_MODE_BY_KEY } from './characterAttrRegistry.js';

export type GeneratedTechniqueQuality = '黄' | '玄' | '地' | '天';
export type TechniquePassiveValueConstraint = {
  mode: 'percent' | 'flat';
  maxPerLayer: number;
  maxTotal: number;
};

export const TECHNIQUE_PASSIVE_DEFAULT_MAX_PER_LAYER_BY_MODE: Record<
  TechniquePassiveValueConstraint['mode'],
  Record<GeneratedTechniqueQuality, number>
> = {
  percent: {
    黄: 0.10,
    玄: 0.20,
    地: 0.30,
    天: 0.35,
  },
  flat: {
    黄: 10,
    玄: 20,
    地: 30,
    天: 40,
  },
};

export const TECHNIQUE_PASSIVE_DEFAULT_MAX_TOTAL_BY_MODE: Record<
  TechniquePassiveValueConstraint['mode'],
  Record<GeneratedTechniqueQuality, number>
> = {
  percent: {
    黄: 0.20,
    玄: 0.30,
    地: 0.40,
    天: 0.50,
  },
  flat: {
    黄: 20,
    玄: 40,
    地: 60,
    天: 80,
  },
};

export const getTechniquePassiveValueConstraint = (
  key: string,
  quality: GeneratedTechniqueQuality,
): TechniquePassiveValueConstraint | null => {
  const mode = TECHNIQUE_PASSIVE_MODE_BY_KEY[key];
  if (mode !== 'percent' && mode !== 'flat' && mode !== 'multiply') {
    return null;
  }
  const normalizedMode: TechniquePassiveValueConstraint['mode'] = mode === 'multiply' ? 'percent' : mode;
  return {
    mode: normalizedMode,
    maxPerLayer: TECHNIQUE_PASSIVE_DEFAULT_MAX_PER_LAYER_BY_MODE[normalizedMode][quality],
    maxTotal: TECHNIQUE_PASSIVE_DEFAULT_MAX_TOTAL_BY_MODE[normalizedMode][quality],
  };
};

export const getTechniquePassivePercentMaxPerLayer = (
  quality: GeneratedTechniqueQuality,
): number => {
  return TECHNIQUE_PASSIVE_DEFAULT_MAX_PER_LAYER_BY_MODE.percent[quality];
};
