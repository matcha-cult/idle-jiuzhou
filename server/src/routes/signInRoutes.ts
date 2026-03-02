import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { signInService } from '../services/signInService.js';

const router = Router();


router.get('/overview', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const monthRaw = typeof req.query.month === 'string' ? req.query.month : '';
  const now = new Date();
  const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = monthRaw || fallbackMonth;

  const result = await signInService.getOverview(userId, month);
  res.status(result.success ? 200 : 400).json(result);
}));

router.post('/do', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const result = await signInService.doSignIn(userId);
  res.status(result.success ? 200 : 400).json(result);
}));

export default router;
