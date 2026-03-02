import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import {
  checkCharacter,
  createCharacter,
  getCharacter,
  updateCharacterAutoCastSkills,
  updateCharacterAutoDisassembleSettings,
  updateCharacterPosition,
} from '../domains/character/index.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';

const router = Router();

// 检查是否有角色
router.get('/check', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const result = await checkCharacter(userId);
  res.json(result);
}));

// 创建角色
router.post('/create', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const { nickname, gender } = req.body;

  // 参数验证
  if (!nickname || !gender) {
    res.status(400).json({ success: false, message: '道号和性别不能为空' });
    return;
  }

  if (nickname.length < 2 || nickname.length > 12) {
    res.status(400).json({ success: false, message: '道号长度需在2-12个字符之间' });
    return;
  }

  if (!['male', 'female'].includes(gender)) {
    res.status(400).json({ success: false, message: '性别参数错误' });
    return;
  }

  const result = await createCharacter(userId, nickname, gender);
  res.status(result.success ? 200 : 400).json(result);
}));

// 获取角色信息
router.get('/info', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const result = await getCharacter(userId);
  res.json(result);
}));

// 更新玩家位置
router.post('/updatePosition', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const { currentMapId, currentRoomId } = req.body as { currentMapId?: string; currentRoomId?: string };

  const result = await updateCharacterPosition(userId, currentMapId ?? '', currentRoomId ?? '');

  if (result.success) {
    await safePushCharacterUpdate(userId);
  }

  res.status(result.success ? 200 : 400).json(result);
}));

router.post('/updateAutoCastSkills', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const enabled = Boolean((req.body as { enabled?: unknown })?.enabled);

  const result = await updateCharacterAutoCastSkills(userId, enabled);

  if (result.success) {
    await safePushCharacterUpdate(userId);
  }

  res.status(result.success ? 200 : 400).json(result);
}));

router.post('/updateAutoDisassemble', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const body = req.body as { enabled?: unknown; rules?: unknown };

  const enabled = Boolean(body?.enabled);
  const parsedRules = body?.rules;

  if (parsedRules !== undefined && !Array.isArray(parsedRules)) {
    return res.status(400).json({ success: false, message: 'rules参数错误，需为数组' });
  }
  if (
    Array.isArray(parsedRules) &&
    parsedRules.some((rule) => rule === null || typeof rule !== 'object' || Array.isArray(rule))
  ) {
    return res.status(400).json({ success: false, message: 'rules参数错误，规则项需为对象' });
  }

  const result = await updateCharacterAutoDisassembleSettings(userId, enabled, parsedRules);

  if (result.success) {
    await safePushCharacterUpdate(userId);
  }

  return res.status(result.success ? 200 : 400).json(result);
}));

export default router;
