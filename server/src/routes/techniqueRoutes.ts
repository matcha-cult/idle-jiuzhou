import { Router, Request, Response } from 'express';
import { withRouteError } from '../middleware/routeError.js';
import { getEnabledTechniqueDefs, getTechniqueDetailById } from '../services/techniqueService.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const techniques = await getEnabledTechniqueDefs();
    res.json({ success: true, data: { techniques } });
  } catch (error) {
    return withRouteError(res, 'techniqueRoutes 路由异常', error);
  }
});

router.get('/:techniqueId', async (req: Request, res: Response) => {
  try {
    const techniqueIdParam = req.params.techniqueId;
    const techniqueId = Array.isArray(techniqueIdParam) ? techniqueIdParam[0] : techniqueIdParam;
    const detail = await getTechniqueDetailById(techniqueId);
    if (!detail) {
      res.status(404).json({ success: false, message: '未找到功法' });
      return;
    }
    res.json({ success: true, data: detail });
  } catch (error) {
    return withRouteError(res, 'techniqueRoutes 路由异常', error);
  }
});

export default router;
