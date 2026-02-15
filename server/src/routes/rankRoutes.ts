import { Router, Request, Response } from 'express';
import { withRouteError } from '../middleware/routeError.js';
import { requireAuth } from '../middleware/auth.js';
import { getArenaRanks, getRankOverview, getRealmRanks, getSectRanks, getWealthRanks } from '../services/rankService.js';

const router = Router();


router.use(requireAuth);

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const limitPlayers = typeof req.query.limitPlayers === 'string' ? Number(req.query.limitPlayers) : undefined;
    const limitSects = typeof req.query.limitSects === 'string' ? Number(req.query.limitSects) : undefined;
    const result = await getRankOverview(limitPlayers, limitSects);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return withRouteError(res, 'rankRoutes 路由异常', error);
  }
});

router.get('/realm', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getRealmRanks(limit);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return withRouteError(res, 'rankRoutes 路由异常', error);
  }
});

router.get('/sect', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getSectRanks(limit);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return withRouteError(res, 'rankRoutes 路由异常', error);
  }
});

router.get('/wealth', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getWealthRanks(limit);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return withRouteError(res, 'rankRoutes 路由异常', error);
  }
});

router.get('/arena', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getArenaRanks(limit);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return withRouteError(res, 'rankRoutes 路由异常', error);
  }
});

export default router;
