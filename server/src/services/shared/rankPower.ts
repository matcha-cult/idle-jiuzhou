/**
 * 排行榜战力口径共享模块。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一排行榜、竞技场、角色快照、伙伴快照共用的战力公式，避免多个模块各自维护一套权重。
 * 2. 做什么：按“主副攻防 + 生存资源 + 节奏恢复 + 比率副属性”分组结算，让所有关键战斗属性都能进入战力。
 * 3. 不做什么：不负责角色/伙伴属性来源计算，不替代战斗真实结算公式，也不在这里做榜单排序。
 *
 * 输入/输出：
 * - 输入：角色或伙伴的战斗相关面板属性；平面属性按非负整数收敛，比率属性按非负小数收敛。
 * - 输出：统一口径的综合战力整数。
 *
 * 数据流/状态流：
 * 上游角色面板 / 伙伴面板 -> 本模块按权重聚合战力 -> 角色快照 / 伙伴快照 / 竞技场展示复用同一结果。
 *
 * 复用设计说明：
 * 1. 所有权重集中在本模块常量里，后续继续调战力只改这里，不再去角色榜、伙伴榜、竞技场各改一遍。
 * 2. 比率属性基线也集中在这里，避免默认命中/暴伤这类通用基础值被多处重复扣减或遗漏。
 * 3. 攻防使用“主属性高权重 + 副属性低权重”规则，兼顾单修与双修面板，不需要在调用方重复判断职业流派。
 *
 * 关键边界条件与坑点：
 * 1. 命中、闪避、暴击、暴伤存在通用战斗基线；战力只统计高于基线的有效增益，避免默认值白送大量分数。
 * 2. 五行抗性是多维防御属性，单项收益不应压过基础攻防血量，所以这里只给单项中等权重并允许累加。
 */

export interface RankPowerSource {
  wugong?: number | null;
  fagong?: number | null;
  wufang?: number | null;
  fafang?: number | null;
  max_qixue?: number | null;
  max_lingqi?: number | null;
  sudu?: number | null;
  mingzhong?: number | null;
  shanbi?: number | null;
  zhaojia?: number | null;
  baoji?: number | null;
  baoshang?: number | null;
  jianbaoshang?: number | null;
  jianfantan?: number | null;
  kangbao?: number | null;
  zengshang?: number | null;
  zhiliao?: number | null;
  jianliao?: number | null;
  xixue?: number | null;
  lengque?: number | null;
  kongzhi_kangxing?: number | null;
  jin_kangxing?: number | null;
  mu_kangxing?: number | null;
  shui_kangxing?: number | null;
  huo_kangxing?: number | null;
  tu_kangxing?: number | null;
  qixue_huifu?: number | null;
  lingqi_huifu?: number | null;
}

type RankPowerFlatKey =
  | 'max_qixue'
  | 'max_lingqi'
  | 'sudu'
  | 'qixue_huifu'
  | 'lingqi_huifu';

type RankPowerRatioKey =
  | 'mingzhong'
  | 'shanbi'
  | 'zhaojia'
  | 'baoji'
  | 'baoshang'
  | 'jianbaoshang'
  | 'jianfantan'
  | 'kangbao'
  | 'zengshang'
  | 'zhiliao'
  | 'jianliao'
  | 'xixue'
  | 'lengque'
  | 'kongzhi_kangxing'
  | 'jin_kangxing'
  | 'mu_kangxing'
  | 'shui_kangxing'
  | 'huo_kangxing'
  | 'tu_kangxing';

interface RankPowerPairConfig {
  primaryWeight: number;
  secondaryWeight: number;
}

interface RankPowerRatioWeightConfig {
  weight: number;
  baseline: number;
}

const RATIO_PRECISION = 1_000_000;

const ATTACK_PAIR_CONFIG: RankPowerPairConfig = Object.freeze({
  primaryWeight: 2.15,
  secondaryWeight: 0.95,
});

const DEFENSE_PAIR_CONFIG: RankPowerPairConfig = Object.freeze({
  primaryWeight: 1.55,
  secondaryWeight: 0.85,
});

const RANK_POWER_FLAT_WEIGHT_BY_KEY: Readonly<Record<RankPowerFlatKey, number>> = Object.freeze({
  max_qixue: 0.24,
  max_lingqi: 0.3,
  sudu: 18,
  qixue_huifu: 26,
  lingqi_huifu: 32,
});

const RANK_POWER_RATIO_WEIGHT_BY_KEY: Readonly<Record<RankPowerRatioKey, RankPowerRatioWeightConfig>> = Object.freeze({
  mingzhong: { weight: 160, baseline: 0.9 },
  shanbi: { weight: 200, baseline: 0.05 },
  zhaojia: { weight: 220, baseline: 0.05 },
  baoji: { weight: 280, baseline: 0.1 },
  baoshang: { weight: 140, baseline: 1.5 },
  jianbaoshang: { weight: 200, baseline: 0 },
  jianfantan: { weight: 110, baseline: 0 },
  kangbao: { weight: 210, baseline: 0 },
  zengshang: { weight: 360, baseline: 0 },
  zhiliao: { weight: 300, baseline: 0 },
  jianliao: { weight: 240, baseline: 0 },
  xixue: { weight: 250, baseline: 0 },
  lengque: { weight: 420, baseline: 0 },
  kongzhi_kangxing: { weight: 220, baseline: 0 },
  jin_kangxing: { weight: 90, baseline: 0 },
  mu_kangxing: { weight: 90, baseline: 0 },
  shui_kangxing: { weight: 90, baseline: 0 },
  huo_kangxing: { weight: 90, baseline: 0 },
  tu_kangxing: { weight: 90, baseline: 0 },
});

const toSafeNonNegativeNumber = (value: number | null | undefined): number => {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, normalized);
};

const toSafeInt = (value: number | null | undefined): number => {
  return Math.floor(toSafeNonNegativeNumber(value));
};

const toSafeRatio = (value: number | null | undefined): number => {
  const normalized = toSafeNonNegativeNumber(value);
  return Math.round(normalized * RATIO_PRECISION) / RATIO_PRECISION;
};

const computePairScore = (
  leftRaw: number | null | undefined,
  rightRaw: number | null | undefined,
  config: RankPowerPairConfig,
): number => {
  const left = toSafeInt(leftRaw);
  const right = toSafeInt(rightRaw);
  const primary = Math.max(left, right);
  const secondary = Math.min(left, right);
  return primary * config.primaryWeight + secondary * config.secondaryWeight;
};

const computeWeightedFlatScore = (row: RankPowerSource): number => {
  let score = 0;
  const keys = Object.keys(RANK_POWER_FLAT_WEIGHT_BY_KEY) as RankPowerFlatKey[];
  for (const key of keys) {
    score += toSafeInt(row[key]) * RANK_POWER_FLAT_WEIGHT_BY_KEY[key];
  }
  return score;
};

const computeWeightedRatioScore = (row: RankPowerSource): number => {
  let score = 0;
  const keys = Object.keys(RANK_POWER_RATIO_WEIGHT_BY_KEY) as RankPowerRatioKey[];
  for (const key of keys) {
    const config = RANK_POWER_RATIO_WEIGHT_BY_KEY[key];
    const effectiveValue = Math.max(0, toSafeRatio(row[key]) - config.baseline);
    if (effectiveValue <= 0) continue;
    score += effectiveValue * config.weight;
  }
  return score;
};

export const normalizeRankPowerStat = (value: number | null | undefined): number => {
  return toSafeInt(value);
};

export const computeRankPower = (row: RankPowerSource): number => {
  const attackScore = computePairScore(row.wugong, row.fagong, ATTACK_PAIR_CONFIG);
  const defenseScore = computePairScore(row.wufang, row.fafang, DEFENSE_PAIR_CONFIG);
  const flatScore = computeWeightedFlatScore(row);
  const ratioScore = computeWeightedRatioScore(row);

  return Math.max(0, Math.round(attackScore + defenseScore + flatScore + ratioScore));
};
