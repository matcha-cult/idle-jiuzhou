/**
 * 业务错误类。
 * 作用：区分可预期的业务异常（如"背包已满""任务未完成"）与不可预期的系统异常。
 * 输入：错误消息、可选的 HTTP 状态码（默认 400）。
 * 输出：被全局错误中间件捕获后，将 message 原样返回给客户端。
 *
 * 数据流：service 层 throw new BusinessError(...) -> 路由层 catch / asyncHandler -> 错误中间件 -> 标准响应
 *
 * 边界条件：
 * 1) message 会直接返回给客户端，不要放敏感信息（如 SQL、堆栈）。
 * 2) statusCode 默认 400，适用于绝大多数业务校验失败场景；如需 403/404 等可显式传入。
 */
export class BusinessError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
  }
}
