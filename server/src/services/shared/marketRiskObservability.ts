/**
 * 坊市风控可观测性日志
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一记录坊市风控命中事件的结构化日志，覆盖 buyTicket 失效、灰度限速、短冷却、验证码触发/通过、风控后购买成功。
 * 2. 做什么：把日志字段命名、scope 与事件类型集中到单一模块，避免多个中间件各自拼对象导致口径漂移。
 * 3. 不做什么：不做 Redis 计数聚合、不落库、不引入外部监控系统，也不替代异常日志链路。
 *
 * 输入 / 输出：
 * - 输入：事件名与结构化字段。
 * - 输出：通过统一 scoped logger 输出 warn/info 级日志。
 *
 * 数据流 / 状态流：
 * - 风控中间件 / service 产生命中上下文 -> 调用本模块 -> pino 输出 `market.risk` 范围日志。
 *
 * 复用设计说明：
 * - 统一复用 `createScopedLogger('market.risk')`，与现有慢请求和慢操作日志保持同一条日志链路。
 * - 事件级 helper 保证 item / partner 两条坊市链用同一套字段，避免后续查询日志时出现口径分裂。
 * - 这里只做“命中才记”，不记录每次正常放行，避免高频列表与购买请求把日志淹没。
 *
 * 关键边界条件与坑点：
 * 1. 不记录验证码原文、买票原文等敏感字段，只记录是否存在与最小业务上下文。
 * 2. 事件日志必须区分 `warn`（拦截）与 `info`（状态变化），否则告警与审计价值会混在一起。
 */
import { createScopedLogger } from '../../utils/logger.js';
import type { MarketRiskReason } from './marketRiskRules.js';

export type MarketRiskLogScene = 'item' | 'partner' | 'unknown';

export type MarketBuyTicketInvalidReason =
  | 'missing_input'
  | 'expired'
  | 'scene_mismatch'
  | 'user_mismatch'
  | 'listing_mismatch'
  | 'missing_record'
  | 'malformed_record';

type MarketRiskLogBase = {
  kind: 'market_risk_event';
  logVersion: 1;
  scene: MarketRiskLogScene;
  route: string;
  userId: number;
  characterId?: number;
  listingId?: number;
  ip?: string;
};

export type MarketBuyTicketInvalidLogEntry = MarketRiskLogBase & {
  event: 'buy_ticket_invalid';
  ticketPresent: boolean;
  listingIdValid: boolean;
  reason: MarketBuyTicketInvalidReason;
};

export type MarketBuyAttemptBlockedLogEntry = MarketRiskLogBase & {
  event: 'buy_rate_limited' | 'buy_cooldown_active';
  activeClusterUserCount: number;
  isClustered?: boolean;
  userIpAttemptCount?: number;
  userAttemptCount?: number;
  ipAttemptCount?: number;
  userIpLimit?: number;
  userLimit?: number;
  ipLimit?: number;
  cooldownUserIpHit?: boolean;
  cooldownUserHit?: boolean;
  cooldownIpHit?: boolean;
};

export type MarketCaptchaRequiredLogEntry = MarketRiskLogBase & {
  event: 'captcha_required';
  riskScore: number;
  reasons: MarketRiskReason[];
  queryCount60s: number;
  queryCount5m: number;
  latestSignatureCount60s: number;
  recentPurchaseSuccessCount60s: number;
  averageIntervalMs: number | null;
  coefficientOfVariation: number | null;
};

export type MarketCaptchaVerifiedLogEntry = MarketRiskLogBase & {
  event: 'captcha_verified';
  passExpiresAt: number;
};

export type MarketRiskPurchaseSuccessLogEntry = MarketRiskLogBase & {
  event: 'risk_purchase_success';
  consumedCaptchaPass: boolean;
  sellerUserId?: number;
};

export type MarketRiskLogEntry =
  | MarketBuyTicketInvalidLogEntry
  | MarketBuyAttemptBlockedLogEntry
  | MarketCaptchaRequiredLogEntry
  | MarketCaptchaVerifiedLogEntry
  | MarketRiskPurchaseSuccessLogEntry;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const marketRiskLogger = createScopedLogger('market.risk');

export const resolveMarketBuyRoute = (scene: MarketRiskLogScene): string => {
  if (scene === 'partner') {
    return '/market/partner/buy';
  }
  return '/market/buy';
};

const buildEntry = <T extends MarketRiskLogEntry>(entry: T): T => {
  return {
    ...entry,
    kind: 'market_risk_event',
    logVersion: 1,
  };
};

export const logMarketRiskWarn = (entry: DistributiveOmit<MarketRiskLogEntry, 'kind' | 'logVersion'>): void => {
  marketRiskLogger.warn(buildEntry(entry as MarketRiskLogEntry), 'market risk blocked');
};

export const logMarketRiskInfo = (entry: DistributiveOmit<MarketRiskLogEntry, 'kind' | 'logVersion'>): void => {
  marketRiskLogger.info(buildEntry(entry as MarketRiskLogEntry), 'market risk state changed');
};

export const logMarketBuyTicketInvalid = (
  entry: DistributiveOmit<MarketBuyTicketInvalidLogEntry, 'kind' | 'logVersion'>,
): void => {
  logMarketRiskWarn(entry);
};

export const logMarketBuyAttemptBlocked = (
  entry: DistributiveOmit<MarketBuyAttemptBlockedLogEntry, 'kind' | 'logVersion'>,
): void => {
  logMarketRiskWarn(entry);
};

export const logMarketCaptchaRequired = (
  entry: DistributiveOmit<MarketCaptchaRequiredLogEntry, 'kind' | 'logVersion'>,
): void => {
  logMarketRiskWarn(entry);
};

export const logMarketCaptchaVerified = (
  entry: DistributiveOmit<MarketCaptchaVerifiedLogEntry, 'kind' | 'logVersion'>,
): void => {
  logMarketRiskInfo(entry);
};

export const logMarketRiskPurchaseSuccess = (
  entry: DistributiveOmit<MarketRiskPurchaseSuccessLogEntry, 'kind' | 'logVersion'>,
): void => {
  logMarketRiskInfo(entry);
};
