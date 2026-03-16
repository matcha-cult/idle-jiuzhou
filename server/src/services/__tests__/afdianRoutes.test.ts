/**
 * 爱发电 webhook 路由测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定爱发电后台测试请求与正式 webhook 入口的协议行为，避免测试探活请求被正式订单回查链路误判后直接报错。
 * 2. 做什么：验证路由层会把“非订单回调”提前收口为成功应答，避免测试兼容逻辑散落到 service 与数据库层。
 * 3. 不做什么：不验证真实爱发电签名、不触发数据库入库，也不覆盖正式订单处理后的业务副作用。
 *
 * 输入/输出：
 * - 输入：仅挂载爱发电 webhook 路由的最小 Express 应用，以及 GET/空 POST 请求。
 * - 输出：爱发电协议要求的 `{ ec, em }` JSON 应答。
 *
 * 数据流/状态流：
 * 测试请求 -> afdianRoutes 路由层 -> 测试请求直接成功返回，不进入正式订单处理链。
 *
 * 关键边界条件与坑点：
 * 1. 爱发电后台的测试请求不保证带有正式订单字段，因此必须在路由层先识别，而不是让 service 里出现 `trim/type` 运行时异常。
 * 2. 正式 webhook 仍然只允许 `POST` 进入业务链，测试兼容不能改写正式订单回查核验规则。
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express, { type Express } from 'express';

import afdianRoutes from '../../routes/afdianRoutes.js';

type AfdianWebhookResponse = {
  ec: number;
  em: string;
};

const createAfdianTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use('/api/afdian', afdianRoutes);
  return app;
};

const startServer = async (app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
};

const readWebhookResponse = async (response: Response): Promise<AfdianWebhookResponse> => {
  return await response.json() as AfdianWebhookResponse;
};

test('爱发电 webhook 测试探活请求应返回成功应答', async () => {
  const app = createAfdianTestApp();
  const server = await startServer(app);

  try {
    const getResponse = await fetch(`${server.baseUrl}/api/afdian/webhook`);
    assert.equal(getResponse.status, 200);
    assert.deepEqual(await readWebhookResponse(getResponse), { ec: 200, em: '' });

    const postResponse = await fetch(`${server.baseUrl}/api/afdian/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(postResponse.status, 200);
    assert.deepEqual(await readWebhookResponse(postResponse), { ec: 200, em: '' });
  } finally {
    await server.close();
  }
});

test('爱发电正式订单回调缺少必要字段时应返回明确错误', async () => {
  const app = createAfdianTestApp();
  const server = await startServer(app);

  try {
    const response = await fetch(`${server.baseUrl}/api/afdian/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'order',
          order: {},
        },
      }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await readWebhookResponse(response), {
      ec: 400,
      em: '爱发电 webhook 缺少必要字段：out_trade_no',
    });
  } finally {
    await server.close();
  }
});
