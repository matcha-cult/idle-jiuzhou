import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireCharacter } from '../middleware/auth.js';
import { equipTitle, getTitleList } from '../services/achievementService.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';

const router = Router();


router.get('/list', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const data = await getTitleList(characterId);
  return res.json({ success: true, message: 'ok', data });
}));

router.post('/equip', requireCharacter, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const body = req.body as { titleId?: unknown; title_id?: unknown };
  const titleId =
    typeof body?.titleId === 'string'
      ? body.titleId
      : typeof body?.title_id === 'string'
        ? body.title_id
        : '';

  const result = await equipTitle(characterId, titleId);
  if (!result.success) return res.status(400).json(result);

  await safePushCharacterUpdate(userId);

  return res.json(result);
}));

export default router;
