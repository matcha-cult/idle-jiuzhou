import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getInfoTargetDetail } from '../services/infoTargetService.js';
import { buildGameItemTaxonomy } from '../services/itemTaxonomyService.js';
import { getSingleParam } from '../services/shared/httpParam.js';

const router = Router();

const isAllowedType = (value: string): value is 'npc' | 'monster' | 'item' | 'player' => {
  return value === 'npc' || value === 'monster' || value === 'item' || value === 'player';
};

router.get('/item-taxonomy', asyncHandler(async (_req, res) => {
  const taxonomy = buildGameItemTaxonomy();
  res.json({ success: true, data: { taxonomy } });
}));

router.get('/:type/:id', asyncHandler(async (req, res) => {
  const type = getSingleParam(req.params.type);
  const id = getSingleParam(req.params.id);

  if (!type || !id || !isAllowedType(type)) {
    res.status(400).json({ success: false, message: '参数错误' });
    return;
  }

  const target = await getInfoTargetDetail(type, id);
  if (!target) {
    res.status(404).json({ success: false, message: '对象不存在' });
    return;
  }

  res.json({ success: true, data: { target } });
}));

export default router;
