import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { register, login, verifyTokenAndSession } from '../services/authService.js';
import { sendSuccess, sendResult } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';

const router = Router();

// 注册接口
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // 参数验证
  if (!username || !password) {
    throw new BusinessError('用户名和密码不能为空');
  }

  if (username.length < 2 || username.length > 20) {
    throw new BusinessError('用户名长度需在2-20个字符之间');
  }

  if (password.length < 6) {
    throw new BusinessError('密码长度至少6位');
  }

  const result = await register(username, password);
  sendResult(res, result);
}));

// 登录接口
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // 参数验证
  if (!username || !password) {
    throw new BusinessError('用户名和密码不能为空');
  }

  const result = await login(username, password);
  sendResult(res, result);
}));

// 验证会话接口（用于持久登录和单点登录检查）
router.get('/verify', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new BusinessError('登录状态无效，请重新登录', 401);
  }

  const token = authHeader.split(' ')[1];
  const result = await verifyTokenAndSession(token);

  if (!result.valid) {
    if (result.kicked) {
      res.status(401).json({ success: false, message: '账号已在其他设备登录', kicked: true });
    } else {
      throw new BusinessError('登录状态无效，请重新登录', 401);
    }
    return;
  }

  sendSuccess(res, { userId: result.decoded?.id });
}));

export default router;
