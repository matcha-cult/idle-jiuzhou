/**
 * 境界突破奖励共享定义
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中定义境界突破里可累计的固定属性奖励、百分比属性奖励与展示文案，供突破预览与角色最终属性计算共用。
 * 2) 不做什么：不读取 seed、不执行属性结算、不负责突破事务落库。
 *
 * 输入 / 输出：
 * - 输入：各服务侧读取到的 `rewards` 配置对象。
 * - 输出：稳定的奖励 key 类型、奖励配置类型，以及前后端展示可复用的奖励标题定义。
 *
 * 数据流 / 状态流：
 * `realm_breakthrough.json` -> `RealmBreakthroughRewardsConfig` -> `realmService` 奖励预览 / `characterComputedService` 属性累计。
 *
 * 复用设计说明：
 * - 突破奖励 key 与标题只允许在这一处定义，避免预览层和结算层各维护一份映射，出现“显示有奖励、实际没生效”或相反的分叉。
 * - 这次新增固定 `max_qixue` 奖励后，后续如果扩到固定灵气、双攻双防，调用方只需要复用同一组定义，不需要再复制 switch / if 链。
 *
 * 关键边界条件与坑点：
 * 1) 数值奖励 key 必须与角色属性字段保持同名，否则预览文案与实际累计会错位。
 * 2) 这里只定义受支持的奖励字段，不做兜底兼容；seed 写入未定义 key 时，调用方应直接忽略该字段。
 */
export const BREAKTHROUGH_NUMERIC_REWARD_DEFS = [
  { key: 'max_qixue', title: '最大气血' },
  { key: 'max_lingqi', title: '最大灵气' },
  { key: 'wugong', title: '物攻' },
  { key: 'fagong', title: '法攻' },
  { key: 'wufang', title: '物防' },
  { key: 'fafang', title: '法防' },
] as const;

export type BreakthroughNumericRewardKey =
  (typeof BREAKTHROUGH_NUMERIC_REWARD_DEFS)[number]['key'];

export type BreakthroughFlatRewards = Partial<
  Record<BreakthroughNumericRewardKey, number>
>;

export type BreakthroughPctRewards = Partial<
  Record<BreakthroughNumericRewardKey, number>
>;

export const BREAKTHROUGH_ADD_PERCENT_REWARD_DEFS = [
  { key: 'kongzhi_kangxing', title: '控制抗性' },
] as const;

export type BreakthroughAddPercentRewardKey =
  (typeof BREAKTHROUGH_ADD_PERCENT_REWARD_DEFS)[number]['key'];

export type BreakthroughAddPercentRewards = Partial<
  Record<BreakthroughAddPercentRewardKey, number>
>;

export interface RealmBreakthroughRewardsConfig {
  attributePoints?: number;
  flat?: BreakthroughFlatRewards;
  pct?: BreakthroughPctRewards;
  addPercent?: BreakthroughAddPercentRewards;
}
