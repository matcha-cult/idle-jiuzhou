import { Router, Request, Response } from 'express';
import { withRouteError } from '../middleware/routeError.js';
import { requireAuth } from '../middleware/auth.js';
import { getCharacterIdByUserId } from '../services/taskService.js';
import { equipTitle, getTitleList } from '../services/achievementService.js';
import { getGameServer } from '../game/GameServer.js';

const router = Router();


router.get('/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const data = await getTitleList(characterId);
    return res.json({ success: true, message: 'ok', data });
  } catch (error) {
    return withRouteError(res, 'titleRoutes 路由异常', error);
  }
});

router.post('/equip', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { titleId?: unknown; title_id?: unknown };
    const titleId =
      typeof body?.titleId === 'string'
        ? body.titleId
        : typeof body?.title_id === 'string'
          ? body.title_id
          : '';

    const result = await equipTitle(characterId, titleId);
    if (!result.success) return res.status(400).json(result);

    try {
      const gameServer = getGameServer();
      await gameServer.pushCharacterUpdate(userId);
    } catch {}

    return res.json(result);
  } catch (error) {
    return withRouteError(res, 'titleRoutes 路由异常', error);
  }
});

export default router;
