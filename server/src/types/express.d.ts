/**
 * 扩展 Express Request：
 * - `userId` 由统一鉴权中间件注入。
 * - 仅用于后端内部类型提示，不影响 HTTP 协议。
 */
declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export {};
