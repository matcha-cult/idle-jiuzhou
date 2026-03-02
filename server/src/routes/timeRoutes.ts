import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getGameTimeSnapshot } from '../services/gameTimeService.js';
import { sendSuccess } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const snap = getGameTimeSnapshot();
  if (!snap) {
    throw new BusinessError('游戏时间未初始化', 503);
  }
  sendSuccess(res, snap);
}));

export default router;
