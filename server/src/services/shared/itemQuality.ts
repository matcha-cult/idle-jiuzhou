/**
 * 装备/物品品质常量（服务端共享）
 *
 * 作用：
 * - 统一品质顺序、正反向映射、品质倍率
 * - 避免各服务重复维护同一组“黄玄地天”规则
 */
export const QUALITY_ORDER = ['黄', '玄', '地', '天'] as const;

export type QualityName = (typeof QUALITY_ORDER)[number];

export const QUALITY_RANK_MAP: Record<QualityName, number> = {
  黄: 1,
  玄: 2,
  地: 3,
  天: 4,
};

export const QUALITY_BY_RANK: Record<number, QualityName> = {
  1: '黄',
  2: '玄',
  3: '地',
  4: '天',
};

export const QUALITY_MULTIPLIER_BY_RANK: Record<number, number> = {
  1: 1,
  2: 1.2,
  3: 1.45,
  4: 1.75,
};

export const isQualityName = (value: unknown): value is QualityName => {
  return value === '黄' || value === '玄' || value === '地' || value === '天';
};
