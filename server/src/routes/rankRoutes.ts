import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { getArenaRanks, getRankOverview, getRealmRanks, getSectRanks, getWealthRanks } from '../services/rankService.js';

const router = Router();


router.use(requireAuth);

router.get('/overview', asyncHandler(async (req, res) => {
  const limitPlayers = typeof req.query.limitPlayers === 'string' ? Number(req.query.limitPlayers) : undefined;
  const limitSects = typeof req.query.limitSects === 'string' ? Number(req.query.limitSects) : undefined;
  const result = await getRankOverview(limitPlayers, limitSects);
  return res.status(result.success ? 200 : 400).json(result);
}));

router.get('/realm', asyncHandler(async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const result = await getRealmRanks(limit);
  return res.status(result.success ? 200 : 400).json(result);
}));

router.get('/sect', asyncHandler(async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const result = await getSectRanks(limit);
  return res.status(result.success ? 200 : 400).json(result);
}));

router.get('/wealth', asyncHandler(async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const result = await getWealthRanks(limit);
  return res.status(result.success ? 200 : 400).json(result);
}));

router.get('/arena', asyncHandler(async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const result = await getArenaRanks(limit);
  return res.status(result.success ? 200 : 400).json(result);
}));

export default router;
