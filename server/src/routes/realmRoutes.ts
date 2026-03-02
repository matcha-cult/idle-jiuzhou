import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { realmService } from '../services/realmService.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';

const router = Router();


router.use(requireAuth);

router.get('/overview', asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const result = await realmService.getOverview(userId);
  return res.status(result.success ? 200 : 400).json(result);
}));

router.post('/breakthrough', asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const body = (req.body ?? {}) as { direction?: unknown; targetRealm?: unknown };
  const targetRealm = typeof body.targetRealm === 'string' ? body.targetRealm : '';
  const direction = typeof body.direction === 'string' ? body.direction : '';

  const result = targetRealm
    ? await realmService.breakthroughToTargetRealm(userId, targetRealm)
    : direction === 'next' || !direction
      ? await realmService.breakthroughToNextRealm(userId)
      : { success: false, message: '突破方向无效' };

  if (result.success) {
    await safePushCharacterUpdate(userId);
  }

  return res.status(result.success ? 200 : 400).json(result);
}));

export default router;
