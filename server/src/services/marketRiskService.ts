/**
 * 坊市行为风控服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：记录坊市列表访问行为，按 userId 聚合最近访问频次与签名重复度，并在购买前判断是否需要验证码。
 * 2. 做什么：统一管理坊市验证码生成/校验与短时购买放行凭证，避免路由层重复拼 Redis key 与规则。
 * 3. 不做什么：不处理 HTTP 响应，不直接执行坊市购买，也不引入 IP/UA 维度。
 *
 * 输入/输出：
 * - 输入：userId、characterId、查询签名、验证码载荷。
 * - 输出：风险评估结果、验证码挑战、验证码通过后的购买放行过期时间。
 *
 * 数据流/状态流：
 * - 列表路由记录查询事件 -> Redis 保存最近访问轨迹；
 * - 购买守卫读取 Redis 指标 -> 纯规则评分；
 * - 若命中风险则要求坊市验证码 -> 验证成功后写入短时放行凭证 -> 后续购买路由放行。
 *
 * 关键边界条件与坑点：
 * 1. 列表查询接口当前只要求登录，不强制角色上下文，因此行为轨迹按 userId 聚合；购买放行凭证再按 userId + characterId 限定范围。
 * 2. 放行凭证是短时复用而不是永久放行，避免验证码通过后长时间绕过风控；同时也避免一次验证后因上架已售罄而立刻再次弹验证码。
 */
import { createHash, randomUUID } from 'node:crypto';

import { redis } from '../config/redis.js';
import {
  createCaptcha,
  type CaptchaChallenge,
} from './captchaService.js';
import {
  assessMarketPurchaseRisk,
  type MarketPurchaseRiskInput,
  type MarketPurchaseRiskAssessment,
} from './shared/marketRiskRules.js';
import {
  logMarketCaptchaVerified,
  logMarketRiskPurchaseSuccess,
  type MarketBuyTicketInvalidReason,
  resolveMarketBuyRoute,
} from './shared/marketRiskObservability.js';
import { verifyCaptchaByProvider } from '../shared/verifyCaptchaByProvider.js';
import type {
  CaptchaVerifyPayloadLike,
  TencentCaptchaVerifyPayloadLike,
} from '../shared/captchaVerifyPayload.js';

const MARKET_RISK_QUERY_SHORT_WINDOW_MS = 60_000;
const MARKET_RISK_QUERY_LONG_WINDOW_MS = 300_000;
const MARKET_RISK_QUERY_TRACK_TTL_MS = 900_000;
const MARKET_RISK_RECENT_TIMESTAMP_COUNT = 12;
const MARKET_RISK_PURCHASE_PASS_TTL_MS = 60_000;
const MARKET_RISK_PURCHASE_PASS_MAX_USES = 1;
const MARKET_RISK_PURCHASE_SUCCESS_WINDOW_MS = 60_000;
const MARKET_RISK_PURCHASE_SUCCESS_TRACK_TTL_MS = 300_000;
const MARKET_BUY_TICKET_TTL_MS = 60_000;
const MARKET_BUY_ATTEMPT_WINDOW_MS = 15_000;
const MARKET_BUY_SHORT_COOLDOWN_MS = 8_000;
const MARKET_BUY_CLUSTER_WINDOW_MS = 300_000;
const MARKET_BUY_CLUSTER_TRACK_TTL_MS = 600_000;
const MARKET_BUY_CLUSTER_ACTIVE_USER_THRESHOLD = 3;
const MARKET_BUY_USER_IP_LIMIT = 3;
const MARKET_BUY_USER_LIMIT = 4;
const MARKET_BUY_IP_LIMIT = 8;
const MARKET_BUY_CLUSTERED_USER_IP_LIMIT = 2;
const MARKET_BUY_CLUSTERED_USER_LIMIT = 3;
const MARKET_BUY_CLUSTERED_IP_LIMIT = 4;

export type MarketBuyScene = 'item' | 'partner';

const buildScopeKey = (userId: number): string => {
  return `market:risk:user:${String(userId)}`;
};

const buildQueryEventsKey = (userId: number): string => {
  return `${buildScopeKey(userId)}:queries`;
};

const buildSignatureEventsKey = (
  userId: number,
  signatureHash: string,
): string => {
  return `${buildScopeKey(userId)}:signature:${signatureHash}`;
};

const buildLastSignatureKey = (userId: number): string => {
  return `${buildScopeKey(userId)}:last-signature`;
};

const buildPurchasePassKey = (userId: number, characterId: number): string => {
  return `market:risk:pass:${String(userId)}:${String(characterId)}`;
};

const buildPurchaseSuccessEventsKey = (userId: number, characterId: number): string => {
  return `market:risk:purchase-success:${String(userId)}:${String(characterId)}`;
};

const buildMarketBuyTicketKey = (scene: MarketBuyScene, buyTicket: string): string => {
  return `market:${scene}:buy-ticket:${buyTicket}`;
};

const normalizeRiskIp = (requestIp: string): string => {
  const normalizedIp = requestIp.trim();
  if (!normalizedIp) {
    throw new Error('请求 IP 不能为空');
  }
  return encodeURIComponent(normalizedIp);
};

const buildMarketBuyAttemptScopeKey = (userId: number): string => {
  return `market:risk:buy-attempt:${String(userId)}`;
};

const buildMarketBuyAttemptUserIpKey = (userId: number, requestIp: string): string => {
  return `${buildMarketBuyAttemptScopeKey(userId)}:user-ip:${normalizeRiskIp(requestIp)}`;
};

const buildMarketBuyAttemptUserKey = (userId: number): string => {
  return `${buildMarketBuyAttemptScopeKey(userId)}:user`;
};

const buildMarketBuyAttemptIpKey = (requestIp: string): string => {
  return `market:risk:buy-attempt:ip:${normalizeRiskIp(requestIp)}`;
};

const buildMarketBuyCooldownUserIpKey = (userId: number, requestIp: string): string => {
  return `market:risk:buy-cooldown:user-ip:${String(userId)}:${normalizeRiskIp(requestIp)}`;
};

const buildMarketBuyCooldownUserKey = (userId: number): string => {
  return `market:risk:buy-cooldown:user:${String(userId)}`;
};

const buildMarketBuyCooldownIpKey = (requestIp: string): string => {
  return `market:risk:buy-cooldown:ip:${normalizeRiskIp(requestIp)}`;
};

const buildMarketBuyClusterUsersKey = (requestIp: string): string => {
  return `market:risk:buy-cluster:ip:${normalizeRiskIp(requestIp)}:users`;
};

const hashSignature = (signature: string): string => {
  return createHash('sha1').update(signature).digest('hex');
};

const buildEventMember = (occurredAt: number): string => {
  return `${String(occurredAt)}:${randomUUID()}`;
};

const parseSortedSetScores = (values: string[]): number[] => {
  const scores: number[] = [];
  for (let index = 1; index < values.length; index += 2) {
    const score = Number(values[index]);
    if (Number.isFinite(score)) {
      scores.push(Math.floor(score));
    }
  }
  return scores;
};

export interface RecordMarketRiskQueryAccessInput {
  userId: number;
  signature: string;
  occurredAt?: number;
}

export interface VerifyMarketPurchaseCaptchaInput {
  scene?: MarketBuyScene;
  userId: number;
  characterId: number;
  listingId?: number;
  payload: CaptchaVerifyPayloadLike & TencentCaptchaVerifyPayloadLike;
  userIp: string;
}

export interface MarketPurchaseCaptchaVerifyResult {
  passExpiresAt: number;
}

interface StoredMarketPurchasePassRecord {
  remainingUses: number;
  verifiedAt: number;
  expiresAt: number;
}

export interface RecordMarketPurchaseSuccessInput {
  scene: MarketBuyScene;
  userId: number;
  characterId: number;
  listingId?: number;
  sellerUserId?: number;
  consumedCaptchaPass: boolean;
  occurredAt?: number;
}

interface StoredPartnerMarketBuyTicketRecord {
  scene: MarketBuyScene;
  userId: number;
  listingId: number;
  issuedAt: number;
  expiresAt: number;
  source: 'listings' | 'partner-listings';
}

export interface IssueMarketBuyTicketsInput {
  scene: MarketBuyScene;
  userId: number;
  listingIds: number[];
  issuedAt?: number;
}

export interface ValidateMarketBuyTicketInput {
  scene: MarketBuyScene;
  userId: number;
  listingId: number;
  buyTicket: string;
  nowMs?: number;
}

export interface ValidateMarketBuyTicketResult {
  valid: boolean;
  reason: MarketBuyTicketInvalidReason;
}

export interface EvaluateMarketPurchaseAttemptInput {
  userId: number;
  requestIp: string;
  nowMs?: number;
}

export interface EvaluateMarketPurchaseAttemptResult {
  allowed: boolean;
  code: 'MARKET_BUY_RATE_LIMITED' | 'MARKET_BUY_COOLDOWN_ACTIVE' | null;
  message: string | null;
  activeClusterUserCount: number;
  isClustered: boolean;
  userIpAttemptCount: number;
  userAttemptCount: number;
  ipAttemptCount: number;
  userIpLimit: number;
  userLimit: number;
  ipLimit: number;
  cooldownUserIpHit: boolean;
  cooldownUserHit: boolean;
  cooldownIpHit: boolean;
}

export interface MarketPurchaseRiskAssessmentResult extends MarketPurchaseRiskAssessment {
  inputs: Pick<
    MarketPurchaseRiskInput,
    | 'queryCount60s'
    | 'queryCount5m'
    | 'latestSignatureCount60s'
    | 'recentPurchaseSuccessCount60s'
  >;
}

const normalizeBuyTicketReason = (
  record: StoredPartnerMarketBuyTicketRecord,
  input: ValidateMarketBuyTicketInput,
  nowMs: number,
): MarketBuyTicketInvalidReason => {
  if (record.expiresAt <= nowMs) {
    return 'expired';
  }
  if (record.scene !== input.scene) {
    return 'scene_mismatch';
  }
  if (record.userId !== input.userId) {
    return 'user_mismatch';
  }
  if (record.listingId !== input.listingId) {
    return 'listing_mismatch';
  }
  return 'malformed_record';
};

const parseMarketPurchasePassRecord = (
  raw: string | null,
): StoredMarketPurchasePassRecord | null => {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const remainingUses = Number(record.remainingUses);
  const verifiedAt = Number(record.verifiedAt);
  const expiresAt = Number(record.expiresAt);
  if (
    !Number.isFinite(remainingUses)
    || !Number.isFinite(verifiedAt)
    || !Number.isFinite(expiresAt)
  ) {
    return null;
  }
  return {
    remainingUses: Math.max(0, Math.floor(remainingUses)),
    verifiedAt: Math.floor(verifiedAt),
    expiresAt: Math.floor(expiresAt),
  };
};

const parsePartnerMarketBuyTicketRecord = (
  raw: string | null,
): StoredPartnerMarketBuyTicketRecord | null => {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const userId = Number(record.userId);
  const listingId = Number(record.listingId);
  const issuedAt = Number(record.issuedAt);
  const expiresAt = Number(record.expiresAt);
  const scene = record.scene;
  if (
    !Number.isFinite(userId)
    || !Number.isFinite(listingId)
    || !Number.isFinite(issuedAt)
    || !Number.isFinite(expiresAt)
    || (scene !== 'item' && scene !== 'partner')
    || (record.source !== 'listings' && record.source !== 'partner-listings')
  ) {
    return null;
  }
  return {
    scene,
    userId: Math.floor(userId),
    listingId: Math.floor(listingId),
    issuedAt: Math.floor(issuedAt),
    expiresAt: Math.floor(expiresAt),
    source: record.source,
  };
};

export const recordMarketRiskQueryAccess = async (
  input: RecordMarketRiskQueryAccessInput,
): Promise<void> => {
  const occurredAt = Number.isFinite(input.occurredAt)
    ? Math.floor(input.occurredAt ?? 0)
    : Date.now();
  const signatureHash = hashSignature(input.signature);
  const eventMember = buildEventMember(occurredAt);
  const queryEventsKey = buildQueryEventsKey(input.userId);
  const signatureEventsKey = buildSignatureEventsKey(
    input.userId,
    signatureHash,
  );
  const minScoreToKeep = occurredAt - MARKET_RISK_QUERY_LONG_WINDOW_MS;
  const transaction = redis.multi();

  transaction.zadd(queryEventsKey, occurredAt, eventMember);
  transaction.zremrangebyscore(queryEventsKey, 0, minScoreToKeep);
  transaction.pexpire(queryEventsKey, MARKET_RISK_QUERY_TRACK_TTL_MS);
  transaction.zadd(signatureEventsKey, occurredAt, eventMember);
  transaction.zremrangebyscore(signatureEventsKey, 0, minScoreToKeep);
  transaction.pexpire(signatureEventsKey, MARKET_RISK_QUERY_TRACK_TTL_MS);
  transaction.set(
    buildLastSignatureKey(input.userId),
    signatureHash,
    'PX',
    MARKET_RISK_QUERY_TRACK_TTL_MS,
  );

  await transaction.exec();
};

export const getMarketPurchaseRiskAssessment = async (params: {
  userId: number;
  characterId?: number;
  nowMs?: number;
}): Promise<MarketPurchaseRiskAssessmentResult> => {
  const nowMs = Number.isFinite(params.nowMs)
    ? Math.floor(params.nowMs ?? 0)
    : Date.now();
  const queryEventsKey = buildQueryEventsKey(params.userId);
  const purchaseSuccessEventsKey = Number.isFinite(params.characterId)
    ? buildPurchaseSuccessEventsKey(params.userId, Math.floor(params.characterId ?? 0))
    : null;
  const lastSignatureHash = await redis.get(buildLastSignatureKey(params.userId));
  const lastSignatureEventsKey = lastSignatureHash
    ? buildSignatureEventsKey(params.userId, lastSignatureHash)
    : null;

  const [
    queryCount60sRaw,
    queryCount5mRaw,
    latestSignatureCount60sRaw,
    recentPurchaseSuccessCount60sRaw,
    recentQueryWithScores,
  ] = await Promise.all([
    redis.zcount(
      queryEventsKey,
      nowMs - MARKET_RISK_QUERY_SHORT_WINDOW_MS,
      nowMs,
    ),
    redis.zcount(
      queryEventsKey,
      nowMs - MARKET_RISK_QUERY_LONG_WINDOW_MS,
      nowMs,
    ),
    lastSignatureEventsKey
      ? redis.zcount(
        lastSignatureEventsKey,
        nowMs - MARKET_RISK_QUERY_SHORT_WINDOW_MS,
        nowMs,
      )
      : Promise.resolve(0),
    purchaseSuccessEventsKey
      ? redis.zcount(
        purchaseSuccessEventsKey,
        nowMs - MARKET_RISK_PURCHASE_SUCCESS_WINDOW_MS,
        nowMs,
      )
      : Promise.resolve(0),
    redis.zrange(
      queryEventsKey,
      -MARKET_RISK_RECENT_TIMESTAMP_COUNT,
      -1,
      'WITHSCORES',
    ),
  ]);

  const inputs = {
    queryCount60s: Number(queryCount60sRaw),
    queryCount5m: Number(queryCount5mRaw),
    latestSignatureCount60s: Number(latestSignatureCount60sRaw),
    recentPurchaseSuccessCount60s: Number(recentPurchaseSuccessCount60sRaw),
    recentQueryTimestamps: parseSortedSetScores(recentQueryWithScores),
  };
  const assessment = assessMarketPurchaseRisk(inputs);
  return {
    ...assessment,
    inputs: {
      queryCount60s: inputs.queryCount60s,
      queryCount5m: inputs.queryCount5m,
      latestSignatureCount60s: inputs.latestSignatureCount60s,
      recentPurchaseSuccessCount60s: inputs.recentPurchaseSuccessCount60s,
    },
  };
};

export const hasValidMarketPurchaseCaptchaPass = async (params: {
  userId: number;
  characterId: number;
}): Promise<boolean> => {
  const raw = await redis.get(
    buildPurchasePassKey(params.userId, params.characterId),
  );
  const record = parseMarketPurchasePassRecord(raw);
  if (!record) {
    return false;
  }
  return record.remainingUses > 0 && record.expiresAt > Date.now();
};

export const createMarketPurchaseCaptchaChallenge =
  async (): Promise<CaptchaChallenge> => {
    return createCaptcha('market-risk');
  };

export const verifyMarketPurchaseCaptcha = async (
  input: VerifyMarketPurchaseCaptchaInput,
): Promise<MarketPurchaseCaptchaVerifyResult> => {
  await verifyCaptchaByProvider({
    body: input.payload,
    userIp: input.userIp,
    scene: 'market-risk',
  });
  const passExpiresAt = Date.now() + MARKET_RISK_PURCHASE_PASS_TTL_MS;
  const passRecord: StoredMarketPurchasePassRecord = {
    remainingUses: MARKET_RISK_PURCHASE_PASS_MAX_USES,
    verifiedAt: Date.now(),
    expiresAt: passExpiresAt,
  };
  await redis.set(
    buildPurchasePassKey(input.userId, input.characterId),
    JSON.stringify(passRecord),
    'PX',
    MARKET_RISK_PURCHASE_PASS_TTL_MS,
  );
  logMarketCaptchaVerified({
    event: 'captcha_verified',
    scene: input.scene ?? 'unknown',
    route: resolveMarketBuyRoute(input.scene ?? 'unknown'),
    userId: input.userId,
    characterId: input.characterId,
    listingId: input.listingId,
    passExpiresAt,
  });
  return { passExpiresAt };
};

export const issueMarketBuyTickets = async (
  input: IssueMarketBuyTicketsInput,
): Promise<Map<number, string>> => {
  const issuedAt = Number.isFinite(input.issuedAt)
    ? Math.floor(input.issuedAt ?? 0)
    : Date.now();
  const expiresAt = issuedAt + MARKET_BUY_TICKET_TTL_MS;
  const normalizedListingIds = [...new Set(
    input.listingIds
      .map((listingId) => Math.floor(listingId))
      .filter((listingId) => Number.isInteger(listingId) && listingId > 0),
  )];
  const ticketByListingId = new Map<number, string>();

  if (normalizedListingIds.length <= 0) {
    return ticketByListingId;
  }

  const transaction = redis.multi();
  normalizedListingIds.forEach((listingId) => {
    const buyTicket = randomUUID();
    const ticketRecord: StoredPartnerMarketBuyTicketRecord = {
      scene: input.scene,
      userId: input.userId,
      listingId,
      issuedAt,
      expiresAt,
      source: input.scene === 'item' ? 'listings' : 'partner-listings',
    };
    ticketByListingId.set(listingId, buyTicket);
    transaction.set(
      buildMarketBuyTicketKey(input.scene, buyTicket),
      JSON.stringify(ticketRecord),
      'PX',
      MARKET_BUY_TICKET_TTL_MS,
    );
  });

  await transaction.exec();
  return ticketByListingId;
};

export const validateMarketBuyTicket = async (
  input: ValidateMarketBuyTicketInput,
): Promise<ValidateMarketBuyTicketResult> => {
  const normalizedBuyTicket = input.buyTicket.trim();
  if (!normalizedBuyTicket) {
    return {
      valid: false,
      reason: 'missing_input',
    };
  }
  const nowMs = Number.isFinite(input.nowMs)
    ? Math.floor(input.nowMs ?? 0)
    : Date.now();
  const raw = await redis.get(buildMarketBuyTicketKey(input.scene, normalizedBuyTicket));
  const record = parsePartnerMarketBuyTicketRecord(raw);
  if (!record) {
    return {
      valid: false,
      reason: raw ? 'malformed_record' : 'missing_record',
    };
  }
  const valid = record.expiresAt > nowMs
    && record.scene === input.scene
    && record.userId === input.userId
    && record.listingId === input.listingId;
  return {
    valid,
    reason: valid ? 'missing_input' : normalizeBuyTicketReason(record, input, nowMs),
  };
};

export const hasValidMarketBuyTicket = async (
  input: ValidateMarketBuyTicketInput,
): Promise<boolean> => {
  const result = await validateMarketBuyTicket(input);
  return result.valid;
};

export const consumeMarketBuyTicket = async (scene: MarketBuyScene, buyTicket: string): Promise<void> => {
  const normalizedBuyTicket = buyTicket.trim();
  if (!normalizedBuyTicket) {
    return;
  }
  await redis.del(buildMarketBuyTicketKey(scene, normalizedBuyTicket));
};

export const issuePartnerMarketBuyTickets = async (
  input: Omit<IssueMarketBuyTicketsInput, 'scene'>,
): Promise<Map<number, string>> => {
  return issueMarketBuyTickets({
    ...input,
    scene: 'partner',
  });
};

export const hasValidPartnerMarketBuyTicket = async (
  input: Omit<ValidateMarketBuyTicketInput, 'scene'>,
): Promise<boolean> => {
  return hasValidMarketBuyTicket({
    ...input,
    scene: 'partner',
  });
};

export const consumePartnerMarketBuyTicket = async (buyTicket: string): Promise<void> => {
  await consumeMarketBuyTicket('partner', buyTicket);
};

export const evaluateMarketPurchaseAttempt = async (
  input: EvaluateMarketPurchaseAttemptInput,
): Promise<EvaluateMarketPurchaseAttemptResult> => {
  const nowMs = Number.isFinite(input.nowMs)
    ? Math.floor(input.nowMs ?? 0)
    : Date.now();
  const requestIp = input.requestIp.trim();
  const cooldownUserIpKey = buildMarketBuyCooldownUserIpKey(input.userId, requestIp);
  const cooldownUserKey = buildMarketBuyCooldownUserKey(input.userId);
  const cooldownIpKey = buildMarketBuyCooldownIpKey(requestIp);
  const [userIpCooldown, userCooldown, ipCooldown] = await Promise.all([
    redis.exists(cooldownUserIpKey),
    redis.exists(cooldownUserKey),
    redis.exists(cooldownIpKey),
  ]);
  if (userIpCooldown > 0 || userCooldown > 0 || ipCooldown > 0) {
    return {
      allowed: false,
      code: 'MARKET_BUY_COOLDOWN_ACTIVE',
      message: '当前网络购买过快，请稍候几秒再试',
      activeClusterUserCount: 0,
      isClustered: false,
      userIpAttemptCount: 0,
      userAttemptCount: 0,
      ipAttemptCount: 0,
      userIpLimit: MARKET_BUY_USER_IP_LIMIT,
      userLimit: MARKET_BUY_USER_LIMIT,
      ipLimit: MARKET_BUY_IP_LIMIT,
      cooldownUserIpHit: userIpCooldown > 0,
      cooldownUserHit: userCooldown > 0,
      cooldownIpHit: ipCooldown > 0,
    };
  }

  const userIpKey = buildMarketBuyAttemptUserIpKey(input.userId, requestIp);
  const userKey = buildMarketBuyAttemptUserKey(input.userId);
  const ipKey = buildMarketBuyAttemptIpKey(requestIp);
  const clusterUsersKey = buildMarketBuyClusterUsersKey(requestIp);
  const minScoreToKeep = nowMs - MARKET_BUY_ATTEMPT_WINDOW_MS;
  const minClusterScoreToKeep = nowMs - MARKET_BUY_CLUSTER_WINDOW_MS;
  const eventMember = buildEventMember(nowMs);
  const transaction = redis.multi();

  transaction.zadd(userIpKey, nowMs, eventMember);
  transaction.zremrangebyscore(userIpKey, 0, minScoreToKeep);
  transaction.pexpire(userIpKey, MARKET_BUY_ATTEMPT_WINDOW_MS * 2);
  transaction.zadd(userKey, nowMs, eventMember);
  transaction.zremrangebyscore(userKey, 0, minScoreToKeep);
  transaction.pexpire(userKey, MARKET_BUY_ATTEMPT_WINDOW_MS * 2);
  transaction.zadd(ipKey, nowMs, eventMember);
  transaction.zremrangebyscore(ipKey, 0, minScoreToKeep);
  transaction.pexpire(ipKey, MARKET_BUY_ATTEMPT_WINDOW_MS * 2);
  transaction.zadd(clusterUsersKey, nowMs, String(input.userId));
  transaction.zremrangebyscore(clusterUsersKey, 0, minClusterScoreToKeep);
  transaction.pexpire(clusterUsersKey, MARKET_BUY_CLUSTER_TRACK_TTL_MS);

  await transaction.exec();

  const [userIpAttemptCount, userAttemptCount, ipAttemptCount, activeClusterUserCount] = await Promise.all([
    redis.zcount(userIpKey, nowMs - MARKET_BUY_ATTEMPT_WINDOW_MS, nowMs),
    redis.zcount(userKey, nowMs - MARKET_BUY_ATTEMPT_WINDOW_MS, nowMs),
    redis.zcount(ipKey, nowMs - MARKET_BUY_ATTEMPT_WINDOW_MS, nowMs),
    redis.zcount(clusterUsersKey, nowMs - MARKET_BUY_CLUSTER_WINDOW_MS, nowMs),
  ]);

  const isClustered = Number(activeClusterUserCount) >= MARKET_BUY_CLUSTER_ACTIVE_USER_THRESHOLD;
  const userIpLimit = isClustered ? MARKET_BUY_CLUSTERED_USER_IP_LIMIT : MARKET_BUY_USER_IP_LIMIT;
  const userLimit = isClustered ? MARKET_BUY_CLUSTERED_USER_LIMIT : MARKET_BUY_USER_LIMIT;
  const ipLimit = isClustered ? MARKET_BUY_CLUSTERED_IP_LIMIT : MARKET_BUY_IP_LIMIT;
  const exceeded = Number(userIpAttemptCount) > userIpLimit
    || Number(userAttemptCount) > userLimit
    || Number(ipAttemptCount) > ipLimit;

  if (!exceeded) {
    return {
      allowed: true,
      code: null,
      message: null,
      activeClusterUserCount: Number(activeClusterUserCount),
      isClustered,
      userIpAttemptCount: Number(userIpAttemptCount),
      userAttemptCount: Number(userAttemptCount),
      ipAttemptCount: Number(ipAttemptCount),
      userIpLimit,
      userLimit,
      ipLimit,
      cooldownUserIpHit: false,
      cooldownUserHit: false,
      cooldownIpHit: false,
    };
  }

  await Promise.all([
    redis.psetex(cooldownUserIpKey, MARKET_BUY_SHORT_COOLDOWN_MS, '1'),
    redis.psetex(cooldownUserKey, MARKET_BUY_SHORT_COOLDOWN_MS, '1'),
    redis.psetex(cooldownIpKey, MARKET_BUY_SHORT_COOLDOWN_MS, '1'),
  ]);

  return {
    allowed: false,
    code: 'MARKET_BUY_RATE_LIMITED',
    message: '坊市购买过于频繁，请稍后再试',
    activeClusterUserCount: Number(activeClusterUserCount),
    isClustered,
    userIpAttemptCount: Number(userIpAttemptCount),
    userAttemptCount: Number(userAttemptCount),
    ipAttemptCount: Number(ipAttemptCount),
    userIpLimit,
    userLimit,
    ipLimit,
    cooldownUserIpHit: false,
    cooldownUserHit: false,
    cooldownIpHit: false,
  };
};

export const recordMarketPurchaseSuccess = async (
  input: RecordMarketPurchaseSuccessInput,
): Promise<void> => {
  const occurredAt = Number.isFinite(input.occurredAt)
    ? Math.floor(input.occurredAt ?? 0)
    : Date.now();
  const purchaseSuccessEventsKey = buildPurchaseSuccessEventsKey(
    input.userId,
    input.characterId,
  );
  const minScoreToKeep = occurredAt - MARKET_RISK_PURCHASE_SUCCESS_WINDOW_MS;
  const transaction = redis.multi();

  transaction.zadd(
    purchaseSuccessEventsKey,
    occurredAt,
    buildEventMember(occurredAt),
  );
  transaction.zremrangebyscore(purchaseSuccessEventsKey, 0, minScoreToKeep);
  transaction.pexpire(
    purchaseSuccessEventsKey,
    MARKET_RISK_PURCHASE_SUCCESS_TRACK_TTL_MS,
  );

  if (input.consumedCaptchaPass) {
    transaction.del(buildPurchasePassKey(input.userId, input.characterId));
  }

  await transaction.exec();
  logMarketRiskPurchaseSuccess({
    event: 'risk_purchase_success',
    scene: input.scene,
    route: input.scene === 'item' ? '/market/buy' : '/market/partner/buy',
    userId: input.userId,
    characterId: input.characterId,
    listingId: input.listingId,
    sellerUserId: input.sellerUserId,
    consumedCaptchaPass: input.consumedCaptchaPass,
  });
};
