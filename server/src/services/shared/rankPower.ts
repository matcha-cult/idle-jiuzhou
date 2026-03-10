/**
 * 排行榜战力口径共享模块。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一排行榜相关场景使用的战力汇总公式，避免 rank/arena/snapshot 各写一份。
 * 2. 做什么：统一把输入数值收敛为整数，保证快照与查询展示口径一致。
 * 3. 不做什么：不负责角色属性的来源计算，不替代 `characterComputedService` 的面板构建。
 *
 * 输入/输出：
 * - 输入：`wugong/fagong/wufang/fafang/max_qixue/max_lingqi/sudu` 这些排行榜关心的属性。
 * - 输出：排行榜综合战力整数。
 *
 * 数据流/状态流：
 * - 上游角色计算服务产出属性 -> 本模块汇总为排行战力 -> 快照表/竞技场/排行榜服务复用同一公式。
 *
 * 关键边界条件与坑点：
 * 1. 输入可能来自数据库、运行时计算或快照，存在 `undefined/null/NaN`；这里统一按 0 处理，避免三处各自兜底。
 * 2. 这个公式是排行榜口径，不代表战斗真实伤害模型；未来若业务要改榜单权重，应只改这里这一处。
 */

export interface RankPowerSource {
  wugong?: number | null;
  fagong?: number | null;
  wufang?: number | null;
  fafang?: number | null;
  max_qixue?: number | null;
  max_lingqi?: number | null;
  sudu?: number | null;
}

const toSafeInt = (value: number | null | undefined): number => {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.floor(normalized));
};

export const normalizeRankPowerStat = (value: number | null | undefined): number => {
  return toSafeInt(value);
};

export const computeRankPower = (row: RankPowerSource): number => {
  return (
    toSafeInt(row.wugong)
    + toSafeInt(row.fagong)
    + toSafeInt(row.wufang)
    + toSafeInt(row.fafang)
    + toSafeInt(row.max_qixue)
    + toSafeInt(row.max_lingqi)
    + toSafeInt(row.sudu)
  );
};
