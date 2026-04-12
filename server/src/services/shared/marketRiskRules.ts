/**
 * 坊市购买行为风控纯规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一根据“列表访问频次、同签名重复次数、访问间隔稳定度”评估坊市购买前是否需要验证码。
 * 2. 做什么：把风险阈值和评分口径集中到纯函数，避免路由中间件和 Redis 读写逻辑各写一套判断。
 * 3. 不做什么：不访问 Redis、不生成验证码、不处理 HTTP 响应。
 *
 * 输入/输出：
 * - 输入：近 60 秒/5 分钟访问次数、最近同签名重复次数、最近查询时间戳序列。
 * - 输出：风险分、是否需要验证码、命中的风险原因与最近间隔统计。
 *
 * 数据流/状态流：
 * - 风控服务从 Redis 聚合访问指标 -> 本模块评分 -> 购买守卫根据结果决定放行或要求验证码。
 *
 * 关键边界条件与坑点：
 * 1. 当前坊市前端可能存在一次交互触发多次查询，因此阈值要比单纯“手点一次发一次”更宽松，避免误伤正常玩家。
 * 2. 只有在“次数偏高”或“同签名重复明显”基础上，再叠加稳定间隔特征时才快速拉高风险分，防止偶发快操作被误判为脚本。
 */

export type MarketRiskReason =
  | 'query-count-60s'
  | 'query-count-5m'
  | 'same-signature-60s'
  | 'regular-interval'
  | 'recent-purchase-success-60s';

export interface MarketPurchaseRiskInput {
  queryCount60s: number;
  queryCount5m: number;
  latestSignatureCount60s: number;
  recentPurchaseSuccessCount60s: number;
  recentQueryTimestamps: number[];
}

export interface MarketRiskIntervalStats {
  averageIntervalMs: number;
  coefficientOfVariation: number;
}

export interface MarketPurchaseRiskAssessment {
  score: number;
  requiresCaptcha: boolean;
  reasons: MarketRiskReason[];
  intervalStats: MarketRiskIntervalStats | null;
}

const MARKET_RISK_CAPTCHA_SCORE_THRESHOLD = 60;
const QUERY_COUNT_60S_LOW_THRESHOLD = 18;
const QUERY_COUNT_60S_HIGH_THRESHOLD = 30;
const QUERY_COUNT_5M_THRESHOLD = 90;
const SAME_SIGNATURE_60S_LOW_THRESHOLD = 10;
const SAME_SIGNATURE_60S_HIGH_THRESHOLD = 16;
const RECENT_PURCHASE_SUCCESS_60S_LOW_THRESHOLD = 1;
const RECENT_PURCHASE_SUCCESS_60S_HIGH_THRESHOLD = 2;
const REGULAR_INTERVAL_MAX_AVERAGE_MS = 1_800;
const REGULAR_INTERVAL_MAX_COEFFICIENT = 0.2;
const REGULAR_INTERVAL_MIN_POINTS = 8;

const clampToNonNegativeInteger = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const normalizeTimestamps = (timestamps: number[]): number[] => {
  return timestamps
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.floor(value))
    .sort((left, right) => left - right);
};

const calculateIntervalStats = (
  timestamps: number[],
): MarketRiskIntervalStats | null => {
  const normalized = normalizeTimestamps(timestamps);
  if (normalized.length < REGULAR_INTERVAL_MIN_POINTS) {
    return null;
  }

  const intervals: number[] = [];
  for (let index = 1; index < normalized.length; index += 1) {
    const interval = normalized[index] - normalized[index - 1];
    if (interval <= 0) {
      return null;
    }
    intervals.push(interval);
  }

  if (intervals.length < REGULAR_INTERVAL_MIN_POINTS - 1) {
    return null;
  }

  const averageIntervalMs =
    intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  if (averageIntervalMs <= 0) {
    return null;
  }

  const variance =
    intervals.reduce((sum, value) => {
      const delta = value - averageIntervalMs;
      return sum + delta * delta;
    }, 0) / intervals.length;
  const standardDeviation = Math.sqrt(variance);

  return {
    averageIntervalMs,
    coefficientOfVariation: standardDeviation / averageIntervalMs,
  };
};

export const assessMarketPurchaseRisk = (
  input: MarketPurchaseRiskInput,
): MarketPurchaseRiskAssessment => {
  const queryCount60s = clampToNonNegativeInteger(input.queryCount60s);
  const queryCount5m = clampToNonNegativeInteger(input.queryCount5m);
  const latestSignatureCount60s = clampToNonNegativeInteger(
    input.latestSignatureCount60s,
  );
  const recentPurchaseSuccessCount60s = clampToNonNegativeInteger(
    input.recentPurchaseSuccessCount60s,
  );
  const intervalStats = calculateIntervalStats(input.recentQueryTimestamps);
  const reasons: MarketRiskReason[] = [];
  let score = 0;

  if (queryCount60s >= QUERY_COUNT_60S_LOW_THRESHOLD) {
    score += 20;
    reasons.push('query-count-60s');
  }
  if (queryCount60s >= QUERY_COUNT_60S_HIGH_THRESHOLD) {
    score += 15;
  }

  if (queryCount5m >= QUERY_COUNT_5M_THRESHOLD) {
    score += 15;
    reasons.push('query-count-5m');
  }

  if (latestSignatureCount60s >= SAME_SIGNATURE_60S_LOW_THRESHOLD) {
    score += 20;
    reasons.push('same-signature-60s');
  }
  if (latestSignatureCount60s >= SAME_SIGNATURE_60S_HIGH_THRESHOLD) {
    score += 15;
  }

  if (recentPurchaseSuccessCount60s >= RECENT_PURCHASE_SUCCESS_60S_LOW_THRESHOLD) {
    score += 30;
    reasons.push('recent-purchase-success-60s');
  }
  if (recentPurchaseSuccessCount60s >= RECENT_PURCHASE_SUCCESS_60S_HIGH_THRESHOLD) {
    score += 15;
  }

  if (
    intervalStats &&
    intervalStats.averageIntervalMs <= REGULAR_INTERVAL_MAX_AVERAGE_MS &&
    intervalStats.coefficientOfVariation <= REGULAR_INTERVAL_MAX_COEFFICIENT
  ) {
    score += 25;
    reasons.push('regular-interval');
  }

  return {
    score,
    requiresCaptcha: score >= MARKET_RISK_CAPTCHA_SCORE_THRESHOLD,
    reasons,
    intervalStats,
  };
};
