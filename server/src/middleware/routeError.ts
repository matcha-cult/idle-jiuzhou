/**
 * 路由层统一异常处理。
 * 输入：`res`、日志上下文、异常对象。
 * 输出：记录日志，并返回标准 500 响应。
 * 注意：
 * - 仅用于通用异常兜底；业务错误仍由各路由按原语义返回。
 */
import type { Response } from 'express';

export const withRouteError = (res: Response, context: string, error: unknown) => {
  console.error(`${context}:`, error);
  return res.status(500).json({ success: false, message: '服务器错误' });
};
