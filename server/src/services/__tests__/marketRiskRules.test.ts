/**
 * 坊市行为风控规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定坊市“持续刷列表 -> 购买前要求验证码”的评分口径，避免阈值判断散落在路由和服务里。
 * 2. 做什么：验证普通访问、高频重复访问、稳定脚本节奏三类行为在同一规则模块中的判定结果。
 * 3. 不做什么：不连接 Redis，不验证 HTTP 中间件，只测试纯评分函数。
 *
 * 输入/输出：
 * - 输入：近 60 秒/5 分钟查询次数、最近同签名查询次数、最近查询时间戳序列。
 * - 输出：风险分、是否需要验证码、命中的风险原因。
 *
 * 数据流/状态流：
 * - 测试用例 -> `assessMarketPurchaseRisk` -> 返回统一风险结果 -> 断言评分与命中原因。
 *
 * 关键边界条件与坑点：
 * 1. 规则必须对当前前端可能存在的重复查询保留余量，普通打开坊市/翻页不能轻易误判。
 * 2. 同样的高频次数，如果还伴随“同签名重复 + 稳定间隔”，风险分必须明显更高，避免脚本压在单一路由 QPS 下绕过。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assessMarketPurchaseRisk } from '../shared/marketRiskRules.js';

test('assessMarketPurchaseRisk: 正常浏览坊市列表时不应触发验证码', () => {
  const result = assessMarketPurchaseRisk({
    queryCount60s: 8,
    queryCount5m: 22,
    latestSignatureCount60s: 4,
    recentPurchaseSuccessCount60s: 0,
    recentQueryTimestamps: [
      1_000,
      8_000,
      16_000,
      29_000,
      37_000,
      48_000,
      57_000,
    ],
  });

  assert.equal(result.requiresCaptcha, false);
  assert.equal(result.score, 0);
  assert.deepEqual(result.reasons, []);
});

test('assessMarketPurchaseRisk: 高频重复刷新同一筛选条件时应要求验证码', () => {
  const result = assessMarketPurchaseRisk({
    queryCount60s: 34,
    queryCount5m: 108,
    latestSignatureCount60s: 19,
    recentPurchaseSuccessCount60s: 0,
    recentQueryTimestamps: [
      2_000,
      4_000,
      6_000,
      8_000,
      10_000,
      12_000,
      14_000,
      16_000,
      18_000,
      20_000,
      22_000,
      24_000,
    ],
  });

  assert.equal(result.requiresCaptcha, true);
  assert.ok(result.score >= 60);
  assert.ok(result.reasons.includes('query-count-60s'));
  assert.ok(result.reasons.includes('same-signature-60s'));
});

test('assessMarketPurchaseRisk: 稳定脚本节奏访问时应抬高风险分', () => {
  const result = assessMarketPurchaseRisk({
    queryCount60s: 20,
    queryCount5m: 72,
    latestSignatureCount60s: 11,
    recentPurchaseSuccessCount60s: 0,
    recentQueryTimestamps: [
      1_800,
      3_600,
      5_400,
      7_200,
      9_000,
      10_800,
      12_600,
      14_400,
      16_200,
      18_000,
      19_800,
      21_600,
    ],
  });

  assert.equal(result.requiresCaptcha, true);
  assert.ok(result.reasons.includes('regular-interval'));
});

test('assessMarketPurchaseRisk: 验证后短时连续买成会抬高再次验证风险', () => {
  const result = assessMarketPurchaseRisk({
    queryCount60s: 18,
    queryCount5m: 40,
    latestSignatureCount60s: 10,
    recentPurchaseSuccessCount60s: 1,
    recentQueryTimestamps: [
      2_000,
      4_200,
      6_500,
      9_100,
      11_700,
      14_400,
      17_000,
      19_300,
      21_700,
      24_200,
      26_500,
      29_000,
    ],
  });

  assert.equal(result.requiresCaptcha, true);
  assert.ok(result.reasons.includes('recent-purchase-success-60s'));
});
