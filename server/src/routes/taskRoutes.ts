import { Router, Request, Response } from 'express';
import { withRouteError } from '../middleware/routeError.js';
import { requireAuth } from '../middleware/auth.js';
import {
  acceptTaskFromNpc,
  claimTaskReward,
  getCharacterIdByUserId,
  getBountyTaskOverview,
  getTaskOverview,
  npcTalk,
  setTaskTracked,
  submitTask,
  type TaskCategory,
} from '../services/taskService.js';
import { getGameServer } from '../game/GameServer.js';

const router = Router();


router.get('/overview', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const category = typeof req.query.category === 'string' ? (req.query.category as TaskCategory) : undefined;
    const data = await getTaskOverview(characterId, category);
    return res.json({ success: true, message: 'ok', data });
  } catch (error) {
    return withRouteError(res, 'taskRoutes 路由异常', error);
  }
});

router.get('/bounty/overview', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const data = await getBountyTaskOverview(characterId);
    return res.json({ success: true, message: 'ok', data });
  } catch (error) {
    return withRouteError(res, 'taskRoutes 路由异常', error);
  }
});

router.post('/track', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { taskId?: unknown; tracked?: unknown };
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const tracked = body?.tracked === true;

    const result = await setTaskTracked(characterId, taskId, tracked);
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    return withRouteError(res, 'taskRoutes 路由异常', error);
  }
});

router.post('/claim', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { taskId?: unknown };
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';

    const result = await claimTaskReward(userId, characterId, taskId);
    if (!result.success) return res.status(400).json(result);
    try {
      const gameServer = getGameServer();
      await gameServer.pushCharacterUpdate(userId);
    } catch {}
    return res.json(result);
  } catch (error) {
    return withRouteError(res, 'taskRoutes 路由异常', error);
  }
});

router.post('/npc/talk', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { npcId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const result = await npcTalk(characterId, npcId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return withRouteError(res, 'taskRoutes 路由异常', error);
  }
});

router.post('/npc/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { npcId?: unknown; taskId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const result = await acceptTaskFromNpc(characterId, taskId, npcId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return withRouteError(res, 'taskRoutes 路由异常', error);
  }
});

router.post('/npc/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { npcId?: unknown; taskId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const result = await submitTask(characterId, taskId, npcId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return withRouteError(res, 'taskRoutes 路由异常', error);
  }
});

export default router;
