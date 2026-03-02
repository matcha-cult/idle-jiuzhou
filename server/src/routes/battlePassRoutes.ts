import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { battlePassService } from '../services/battlePassService.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';

const router = Router();


router.get('/tasks', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const seasonId = typeof req.query.seasonId === 'string' ? req.query.seasonId : undefined;
  const data = await battlePassService.getBattlePassTasksOverview(userId, seasonId);
  return res.json({ success: true, message: 'ok', data });
}));

router.post('/tasks/:taskId/complete', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const taskId = typeof req.params.taskId === 'string' ? req.params.taskId : '';
  if (!taskId.trim()) {
    return res.status(400).json({ success: false, message: '任务ID无效' });
  }
  const result = await battlePassService.completeBattlePassTask(userId, taskId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
}));

router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const data = await battlePassService.getBattlePassStatus(userId);
  if (!data) return res.status(404).json({ success: false, message: '战令数据不存在' });
  return res.json({ success: true, message: 'ok', data });
}));

router.get('/rewards', requireAuth, asyncHandler(async (req, res) => {
  const seasonId = typeof req.query.seasonId === 'string' ? req.query.seasonId : undefined;
  const data = await battlePassService.getBattlePassRewards(seasonId);
  return res.json({ success: true, message: 'ok', data });
}));

router.post('/claim', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const { level, track } = req.body as { level?: number; track?: 'free' | 'premium' };
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1) {
    return res.status(400).json({ success: false, message: '等级参数无效' });
  }
  if (track !== 'free' && track !== 'premium') {
    return res.status(400).json({ success: false, message: '奖励轨道参数无效' });
  }
  const result = await battlePassService.claimBattlePassReward(userId, level, track);
  if (!result.success) {
    return res.status(400).json(result);
  }
  await safePushCharacterUpdate(userId);
  return res.json(result);
}));

export default router;
