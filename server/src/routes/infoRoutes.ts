import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getInfoTargetDetail } from '../services/infoTargetService.js';
import { buildGameItemTaxonomy } from '../services/itemTaxonomyService.js';
import { getSingleParam } from '../services/shared/httpParam.js';
import { sendSuccess } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';

const router = Router();

const isAllowedType = (value: string): value is 'npc' | 'monster' | 'item' | 'player' => {
  return value === 'npc' || value === 'monster' || value === 'item' || value === 'player';
};

router.get('/item-taxonomy', asyncHandler(async (_req, res) => {
  const taxonomy = buildGameItemTaxonomy();
  sendSuccess(res, { taxonomy });
}));

router.get('/:type/:id', asyncHandler(async (req, res) => {
  const type = getSingleParam(req.params.type);
  const id = getSingleParam(req.params.id);

  if (!type || !id || !isAllowedType(type)) {
    throw new BusinessError('参数错误');
  }

  const target = await getInfoTargetDetail(type, id);
  if (!target) {
    throw new BusinessError('对象不存在', 404);
  }

  sendSuccess(res, { target });
}));

export default router;
