import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getEnabledTechniqueDefs, getTechniqueDetailById } from '../services/techniqueService.js';
import { getSingleParam } from '../services/shared/httpParam.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const techniques = await getEnabledTechniqueDefs();
  res.json({ success: true, data: { techniques } });
}));

router.get('/:techniqueId', asyncHandler(async (req, res) => {
  const techniqueId = getSingleParam(req.params.techniqueId);
  const detail = await getTechniqueDetailById(techniqueId);
  if (!detail) {
    res.status(404).json({ success: false, message: '未找到功法' });
    return;
  }
  res.json({ success: true, data: detail });
}));

export default router;
