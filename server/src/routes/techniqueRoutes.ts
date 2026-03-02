import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getEnabledTechniqueDefs, getTechniqueDetailById } from '../services/techniqueService.js';
import { getSingleParam } from '../services/shared/httpParam.js';
import { sendSuccess } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const techniques = await getEnabledTechniqueDefs();
  sendSuccess(res, { techniques });
}));

router.get('/:techniqueId', asyncHandler(async (req, res) => {
  const techniqueId = getSingleParam(req.params.techniqueId);
  const detail = await getTechniqueDetailById(techniqueId);
  if (!detail) {
    throw new BusinessError('未找到功法', 404);
  }
  sendSuccess(res, detail);
}));

export default router;
