import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { register, login, verifyTokenAndSession } from '../services/authService.js';

const router = Router();

// 注册接口
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // 参数验证
  if (!username || !password) {
    res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    return;
  }

  if (username.length < 2 || username.length > 20) {
    res.status(400).json({ success: false, message: '用户名长度需在2-20个字符之间' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ success: false, message: '密码长度至少6位' });
    return;
  }

  const result = await register(username, password);
  res.status(result.success ? 200 : 400).json(result);
}));

// 登录接口
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // 参数验证
  if (!username || !password) {
    res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    return;
  }

  const result = await login(username, password);
  res.status(result.success ? 200 : 400).json(result);
}));

// 验证会话接口（用于持久登录和单点登录检查）
router.get('/verify', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: '登录状态无效，请重新登录' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const result = await verifyTokenAndSession(token);

  if (!result.valid) {
    if (result.kicked) {
      res.status(401).json({ success: false, message: '账号已在其他设备登录', kicked: true });
    } else {
      res.status(401).json({ success: false, message: '登录状态无效，请重新登录' });
    }
    return;
  }

  res.json({ success: true, message: '会话有效', data: { userId: result.decoded?.id } });
}));

export default router;
