/**
 * 图片验证码请求体解析工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一解析并校验登录、注册、坊市验证码提交时共用的 `captchaId/captchaCode` 字段。
 * 2. 做什么：把“字段必填 + 去空格”的路由层规则收敛到单一入口，避免每个验证码接口都复制一份参数判断。
 * 3. 不做什么：不生成验证码，不校验验证码答案，也不处理具体业务成功后的后续动作。
 *
 * 输入/输出：
 * - 输入：包含 `captchaId`、`captchaCode` 的请求体对象。
 * - 输出：去掉首尾空格后的验证码载荷。
 *
 * 数据流/状态流：
 * - 路由层读取 `req.body` -> 本模块解析验证码字段 -> 调用验证码服务校验。
 *
 * 关键边界条件与坑点：
 * 1. 这里只做字段存在性校验，验证码是否正确必须继续交由服务端验证码服务判断。
 * 2. 统一在这里 trim，可以避免登录和坊市接口对空白字符出现不同口径。
 */
import { BusinessError } from '../middleware/BusinessError.js';

export interface CaptchaVerifyPayloadLike {
  captchaId?: string;
  captchaCode?: string;
}

export interface ParsedCaptchaVerifyPayload {
  captchaId: string;
  captchaCode: string;
}

export const parseCaptchaVerifyPayload = (
  payload: CaptchaVerifyPayloadLike,
): ParsedCaptchaVerifyPayload => {
  const captchaId = payload.captchaId?.trim() ?? '';
  const captchaCode = payload.captchaCode?.trim() ?? '';

  if (!captchaId || !captchaCode) {
    throw new BusinessError('图片验证码不能为空');
  }

  return { captchaId, captchaCode };
};
