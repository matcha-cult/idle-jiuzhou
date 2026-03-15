/**
 * 坊市验证码场景隔离测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定登录验证码与坊市验证码使用独立 Redis key 空间，避免两个入口共用同一组记录。
 * 2. 做什么：验证坊市验证码只能按坊市场景校验，不能被默认登录场景误消费。
 * 3. 不做什么：不测试坊市购买流程与风控评分；这里只关注验证码场景隔离。
 *
 * 输入/输出：
 * - 输入：内存版 Redis 模拟、生成后的坊市验证码、不同场景的校验请求。
 * - 输出：不同场景下的校验成功/失败结果。
 *
 * 数据流/状态流：
 * - 测试先 mock Redis；
 * - 再调用 `createCaptcha('market-risk')` 生成坊市验证码；
 * - 最后分别用默认场景和坊市场景校验，断言只有目标场景可以通过。
 *
 * 关键边界条件与坑点：
 * 1. 场景隔离必须依赖服务端 key 前缀，不能靠前端额外传参“自觉区分”。
 * 2. 默认登录场景校验失败时，不应误删坊市场景下的验证码记录。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BusinessError } from '../../middleware/BusinessError.js';
import { redis } from '../../config/redis.js';
import { createCaptcha, verifyCaptcha } from '../captchaService.js';

type StoredCaptchaRecord = {
  answer: string;
  expiresAt: number;
  scene: 'auth' | 'market-risk';
};

const parseStoredCaptchaRecord = (raw: string | undefined): StoredCaptchaRecord => {
  assert.ok(raw, '应已写入验证码 Redis 记录');
  const parsed = JSON.parse(raw) as StoredCaptchaRecord;
  assert.equal(typeof parsed.answer, 'string');
  assert.equal(typeof parsed.expiresAt, 'number');
  return parsed;
};

test.after(() => {
  redis.disconnect();
});

test('verifyCaptcha: 坊市验证码只能在坊市场景下通过校验', async (t) => {
  const storage = new Map<string, string>();

  t.mock.method(redis, 'set', async (key: string, value: string) => {
    storage.set(key, value);
    return 'OK';
  });
  t.mock.method(redis, 'get', async (key: string) => storage.get(key) ?? null);
  t.mock.method(redis, 'del', async (...keys: string[]) => {
    let deleted = 0;
    keys.forEach((key) => {
      if (storage.delete(key)) {
        deleted += 1;
      }
    });
    return deleted;
  });

  const created = await createCaptcha('market-risk');
  const marketKey = `market:risk:captcha:${created.captchaId}`;
  const { answer } = parseStoredCaptchaRecord(storage.get(marketKey));

  await assert.rejects(
    verifyCaptcha(created.captchaId, answer),
    (error) =>
      error instanceof BusinessError && error.message === '图片验证码已失效，请重新获取',
  );

  assert.equal(storage.has(marketKey), true);

  await verifyCaptcha(created.captchaId, answer, 'market-risk');

  assert.equal(storage.has(marketKey), false);
});
