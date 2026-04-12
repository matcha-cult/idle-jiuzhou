/**
 * 坊市风控服务关键状态测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定坊市验证码 pass 的短时结构化存储、购买成功后消费，以及购买成功热度回流到风险评分的行为。
 * 2. 做什么：验证改造后的 Redis 状态机不会再出现“过一次码长时间连续扫货”的旧行为。
 * 3. 不做什么：不测试 HTTP 路由编排、不测试真实 Redis、不覆盖前端弹窗交互。
 *
 * 输入 / 输出：
 * - 输入：内存版 Redis mock、验证码校验 mock、用户/角色与时间戳。
 * - 输出：pass 是否有效、风险评估是否抬高、最近买成记录是否被统计。
 *
 * 数据流 / 状态流：
 * - verifyMarketPurchaseCaptcha 写入结构化 pass -> hasValidMarketPurchaseCaptchaPass 校验 ->
 *   recordMarketPurchaseSuccess 记录买成并消费 pass -> getMarketPurchaseRiskAssessment 合并买成热度。
 *
 * 复用设计说明：
 * - 测试直接覆盖 marketRiskService 的公开函数，避免把 Redis key 细节散落到多个路由级测试里重复断言。
 * - 通过内存版 sorted set 模拟查询与买成轨迹，后续物品坊市与伙伴坊市共用这套风控服务时都能复用同一批测试。
 * - “短时 pass”“成功即消费”“买成热度回流”都是高频安全变更点，集中锁在这里最不容易回归。
 *
 * 关键边界条件与坑点：
 * 1. Redis multi 需要同时覆盖 zset 与字符串 key，否则会把“记录买成但没消费 pass”这种回归漏掉。
 * 2. 评分测试必须显式控制时间戳，避免依赖 Date.now 造成不稳定断言。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { redis } from '../../config/redis.js';
import * as marketRiskService from '../marketRiskService.js';
import * as captchaVerifier from '../../shared/verifyCaptchaByProvider.js';

type SortedSetEntry = {
  member: string;
  score: number;
};

const sortSortedSetEntries = (entries: SortedSetEntry[]): SortedSetEntry[] => {
  return [...entries].sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }
    return left.member.localeCompare(right.member);
  });
};

test.after(() => {
  redis.disconnect();
});

test('marketRiskService: 验证成功后只允许短时单次放行，买成后立即消费', async (t) => {
  const stringStorage = new Map<string, string>();
  const sortedSetStorage = new Map<string, SortedSetEntry[]>();

  t.mock.method(captchaVerifier, 'verifyCaptchaByProvider', async () => undefined);
  t.mock.method(redis, 'get', async (key: string) => stringStorage.get(key) ?? null);
  t.mock.method(redis, 'set', async (key: string, value: string) => {
    stringStorage.set(key, value);
    return 'OK';
  });
  t.mock.method(redis, 'zcount', async (key: string, min: number, max: number) => {
    const entries = sortedSetStorage.get(key) ?? [];
    return entries.filter((entry) => entry.score >= min && entry.score <= max).length;
  });
  t.mock.method(redis, 'zrange', async (key: string, start: number, stop: number, withScores?: string) => {
    const entries = sortSortedSetEntries(sortedSetStorage.get(key) ?? []);
    const normalizedStart = start < 0 ? Math.max(entries.length + start, 0) : start;
    const normalizedStop = stop < 0 ? entries.length + stop : stop;
    const slice = entries.slice(normalizedStart, normalizedStop + 1);
    if (withScores === 'WITHSCORES') {
      return slice.flatMap((entry) => [entry.member, String(entry.score)]);
    }
    return slice.map((entry) => entry.member);
  });
  t.mock.method(redis, 'multi', () => {
    const operations: Array<() => void> = [];
    return {
      zadd(key: string, score: number, member: string) {
        operations.push(() => {
          const current = sortedSetStorage.get(key) ?? [];
          current.push({ member, score });
          sortedSetStorage.set(key, current);
        });
        return this;
      },
      zremrangebyscore(key: string, min: number, max: number) {
        operations.push(() => {
          const current = sortedSetStorage.get(key) ?? [];
          sortedSetStorage.set(
            key,
            current.filter((entry) => !(entry.score >= min && entry.score <= max)),
          );
        });
        return this;
      },
      pexpire() {
        return this;
      },
      set(key: string, value: string) {
        operations.push(() => {
          stringStorage.set(key, value);
        });
        return this;
      },
      del(key: string) {
        operations.push(() => {
          stringStorage.delete(key);
        });
        return this;
      },
      async exec() {
        operations.forEach((operation) => operation());
        return [];
      },
    };
  });

  const verified = await marketRiskService.verifyMarketPurchaseCaptcha({
    userId: 101,
    characterId: 202,
    payload: {
      captchaId: 'captcha-id',
      captchaCode: '1234',
    },
    userIp: '127.0.0.1',
  });

  assert.ok(verified.passExpiresAt > Date.now());
  assert.equal(
    await marketRiskService.hasValidMarketPurchaseCaptchaPass({
      userId: 101,
      characterId: 202,
    }),
    true,
  );

  await marketRiskService.recordMarketPurchaseSuccess({
    scene: 'item',
    userId: 101,
    characterId: 202,
    consumedCaptchaPass: true,
    occurredAt: 50_000,
  });

  assert.equal(
    await marketRiskService.hasValidMarketPurchaseCaptchaPass({
      userId: 101,
      characterId: 202,
    }),
    false,
  );
});

test('marketRiskService: 短时买成热度会参与再次验证评分', async (t) => {
  const stringStorage = new Map<string, string>();
  const sortedSetStorage = new Map<string, SortedSetEntry[]>();
  const queryKey = 'market:risk:user:301:queries';
  const lastSignatureKey = 'market:risk:user:301:last-signature';
  const signatureKey = 'market:risk:user:301:signature:signature-hash';
  const purchaseSuccessKey = 'market:risk:purchase-success:301:401';

  stringStorage.set(lastSignatureKey, 'signature-hash');
  sortedSetStorage.set(queryKey, [
    { member: 'q1', score: 2_000 },
    { member: 'q2', score: 4_200 },
    { member: 'q3', score: 6_500 },
    { member: 'q4', score: 9_100 },
    { member: 'q5', score: 11_700 },
    { member: 'q6', score: 14_400 },
    { member: 'q7', score: 17_000 },
    { member: 'q8', score: 19_300 },
    { member: 'q9', score: 21_700 },
    { member: 'q10', score: 24_200 },
    { member: 'q11', score: 26_500 },
    { member: 'q12', score: 29_000 },
    { member: 'q13', score: 31_200 },
    { member: 'q14', score: 33_600 },
    { member: 'q15', score: 36_000 },
    { member: 'q16', score: 38_400 },
    { member: 'q17', score: 40_800 },
    { member: 'q18', score: 43_200 },
  ]);
  sortedSetStorage.set(signatureKey, [
    { member: 's1', score: 2_000 },
    { member: 's2', score: 6_500 },
    { member: 's3', score: 11_700 },
    { member: 's4', score: 17_000 },
    { member: 's5', score: 21_700 },
    { member: 's6', score: 26_500 },
    { member: 's7', score: 31_200 },
    { member: 's8', score: 36_000 },
    { member: 's9', score: 40_800 },
    { member: 's10', score: 43_200 },
  ]);
  sortedSetStorage.set(purchaseSuccessKey, [
    { member: 'p1', score: 45_000 },
  ]);

  t.mock.method(redis, 'get', async (key: string) => stringStorage.get(key) ?? null);
  t.mock.method(redis, 'zcount', async (key: string, min: number, max: number) => {
    const entries = sortedSetStorage.get(key) ?? [];
    return entries.filter((entry) => entry.score >= min && entry.score <= max).length;
  });
  t.mock.method(redis, 'zrange', async (key: string, start: number, stop: number, withScores?: string) => {
    const entries = sortSortedSetEntries(sortedSetStorage.get(key) ?? []);
    const normalizedStart = start < 0 ? Math.max(entries.length + start, 0) : start;
    const normalizedStop = stop < 0 ? entries.length + stop : stop;
    const slice = entries.slice(normalizedStart, normalizedStop + 1);
    if (withScores === 'WITHSCORES') {
      return slice.flatMap((entry) => [entry.member, String(entry.score)]);
    }
    return slice.map((entry) => entry.member);
  });

  const assessment = await marketRiskService.getMarketPurchaseRiskAssessment({
    userId: 301,
    characterId: 401,
    nowMs: 60_000,
  });

  assert.equal(assessment.requiresCaptcha, true);
  assert.ok(assessment.reasons.includes('recent-purchase-success-60s'));
});

test('marketRiskService: 伙伴坊市 buyTicket 仅允许签发用户在有效期内购买对应挂单', async (t) => {
  const stringStorage = new Map<string, string>();

  t.mock.method(redis, 'set', async (key: string, value: string) => {
    stringStorage.set(key, value);
    return 'OK';
  });
  t.mock.method(redis, 'get', async (key: string) => stringStorage.get(key) ?? null);
  t.mock.method(redis, 'del', async (...keys: string[]) => {
    let deleted = 0;
    keys.forEach((key) => {
      if (stringStorage.delete(key)) {
        deleted += 1;
      }
    });
    return deleted;
  });
  t.mock.method(redis, 'multi', () => {
    const operations: Array<() => void> = [];
    return {
      set(key: string, value: string) {
        operations.push(() => {
          stringStorage.set(key, value);
        });
        return this;
      },
      async exec() {
        operations.forEach((operation) => operation());
        return [];
      },
    };
  });

  const ticketByListingId = await marketRiskService.issuePartnerMarketBuyTickets({
    userId: 501,
    listingIds: [901, 902],
    issuedAt: 10_000,
  });
  const buyTicket = ticketByListingId.get(901);

  assert.ok(buyTicket, '应为挂单签发购买凭证');
  assert.equal(
    await marketRiskService.hasValidPartnerMarketBuyTicket({
      userId: 501,
      listingId: 901,
      buyTicket: buyTicket!,
      nowMs: 20_000,
    }),
    true,
  );
  assert.equal(
    await marketRiskService.hasValidPartnerMarketBuyTicket({
      userId: 999,
      listingId: 901,
      buyTicket: buyTicket!,
      nowMs: 20_000,
    }),
    false,
  );
  assert.equal(
    await marketRiskService.hasValidPartnerMarketBuyTicket({
      userId: 501,
      listingId: 902,
      buyTicket: buyTicket!,
      nowMs: 20_000,
    }),
    false,
  );

  await marketRiskService.consumePartnerMarketBuyTicket(buyTicket!);
  assert.equal(
    await marketRiskService.hasValidPartnerMarketBuyTicket({
      userId: 501,
      listingId: 901,
      buyTicket: buyTicket!,
      nowMs: 20_000,
    }),
    false,
  );
});

test('marketRiskService: 物品坊市 buyTicket 仅允许签发用户在有效期内购买对应挂单', async (t) => {
  const stringStorage = new Map<string, string>();

  t.mock.method(redis, 'set', async (key: string, value: string) => {
    stringStorage.set(key, value);
    return 'OK';
  });
  t.mock.method(redis, 'get', async (key: string) => stringStorage.get(key) ?? null);
  t.mock.method(redis, 'del', async (...keys: string[]) => {
    let deleted = 0;
    keys.forEach((key) => {
      if (stringStorage.delete(key)) {
        deleted += 1;
      }
    });
    return deleted;
  });
  t.mock.method(redis, 'multi', () => {
    const operations: Array<() => void> = [];
    return {
      set(key: string, value: string) {
        operations.push(() => {
          stringStorage.set(key, value);
        });
        return this;
      },
      async exec() {
        operations.forEach((operation) => operation());
        return [];
      },
    };
  });

  const ticketByListingId = await marketRiskService.issueMarketBuyTickets({
    scene: 'item',
    userId: 601,
    listingIds: [1001],
    issuedAt: 12_000,
  });
  const buyTicket = ticketByListingId.get(1001);

  assert.ok(buyTicket, '应为物品挂单签发购买凭证');
  assert.equal(
    await marketRiskService.hasValidMarketBuyTicket({
      scene: 'item',
      userId: 601,
      listingId: 1001,
      buyTicket: buyTicket!,
      nowMs: 20_000,
    }),
    true,
  );
  assert.equal(
    await marketRiskService.hasValidMarketBuyTicket({
      scene: 'partner',
      userId: 601,
      listingId: 1001,
      buyTicket: buyTicket!,
      nowMs: 20_000,
    }),
    false,
  );

  await marketRiskService.consumeMarketBuyTicket('item', buyTicket!);
  assert.equal(
    await marketRiskService.hasValidMarketBuyTicket({
      scene: 'item',
      userId: 601,
      listingId: 1001,
      buyTicket: buyTicket!,
      nowMs: 20_000,
    }),
    false,
  );
});

test('marketRiskService: 同IP多账号高频购买会触发灰度短冷却', async (t) => {
  const stringStorage = new Map<string, string>();
  const sortedSetStorage = new Map<string, SortedSetEntry[]>();

  t.mock.method(redis, 'exists', async (...keys: string[]) => {
    const key = keys[0];
    return stringStorage.has(key) ? 1 : 0;
  });
  t.mock.method(redis, 'psetex', async (key: string, _ttl: number, value: string) => {
    stringStorage.set(key, value);
    return 'OK';
  });
  t.mock.method(redis, 'zcount', async (key: string, min: number, max: number) => {
    const entries = sortedSetStorage.get(key) ?? [];
    return entries.filter((entry) => entry.score >= min && entry.score <= max).length;
  });
  t.mock.method(redis, 'multi', () => {
    const operations: Array<() => void> = [];
    return {
      zadd(key: string, score: number, member: string) {
        operations.push(() => {
          const current = sortedSetStorage.get(key) ?? [];
          const withoutSameMember = current.filter((entry) => entry.member !== member);
          withoutSameMember.push({ member, score });
          sortedSetStorage.set(key, withoutSameMember);
        });
        return this;
      },
      zremrangebyscore(key: string, min: number, max: number) {
        operations.push(() => {
          const current = sortedSetStorage.get(key) ?? [];
          sortedSetStorage.set(
            key,
            current.filter((entry) => !(entry.score >= min && entry.score <= max)),
          );
        });
        return this;
      },
      pexpire() {
        return this;
      },
      async exec() {
        operations.forEach((operation) => operation());
        return [];
      },
    };
  });

  const first = await marketRiskService.evaluateMarketPurchaseAttempt({
    userId: 701,
    requestIp: '10.0.0.1',
    nowMs: 1_000,
  });
  const second = await marketRiskService.evaluateMarketPurchaseAttempt({
    userId: 702,
    requestIp: '10.0.0.1',
    nowMs: 2_000,
  });
  const third = await marketRiskService.evaluateMarketPurchaseAttempt({
    userId: 703,
    requestIp: '10.0.0.1',
    nowMs: 3_000,
  });
  const fourth = await marketRiskService.evaluateMarketPurchaseAttempt({
    userId: 701,
    requestIp: '10.0.0.1',
    nowMs: 4_000,
  });
  const fifth = await marketRiskService.evaluateMarketPurchaseAttempt({
    userId: 701,
    requestIp: '10.0.0.1',
    nowMs: 5_000,
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, true);
  assert.equal(fourth.allowed, true);
  assert.equal(fifth.allowed, false);
  assert.equal(fifth.code, 'MARKET_BUY_RATE_LIMITED');

  const cooldownHit = await marketRiskService.evaluateMarketPurchaseAttempt({
    userId: 701,
    requestIp: '10.0.0.1',
    nowMs: 5_500,
  });
  assert.equal(cooldownHit.allowed, false);
  assert.equal(cooldownHit.code, 'MARKET_BUY_COOLDOWN_ACTIVE');
});
