/**
 * 九州修仙录 - 组队系统路由
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getCharacterTeam,
  createTeam,
  disbandTeam,
  leaveTeam,
  applyToTeam,
  getTeamApplications,
  handleApplication,
  kickMember,
  transferLeader,
  updateTeamSettings,
  getNearbyTeams,
  getLobbyTeams,
  inviteToTeam,
  getReceivedInvitations,
  handleInvitation,
  getTeamById
} from '../services/teamService.js';

const router = Router();

// 获取角色当前队伍
router.get('/my', asyncHandler(async (req, res) => {
    const characterId = parseInt(req.query.characterId as string);
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getCharacterTeam(characterId);
    res.json(result);
}));

// 获取队伍详情
router.get('/:teamId', asyncHandler(async (req, res) => {
    const teamId = String(req.params.teamId);
    const result = await getTeamById(teamId);
    res.json(result);
}));


// 创建队伍
router.post('/create', asyncHandler(async (req, res) => {
    const { characterId, name, goal } = req.body;
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await createTeam(characterId, name, goal);
    res.json(result);
}));

// 解散队伍
router.post('/disband', asyncHandler(async (req, res) => {
    const { characterId, teamId } = req.body;
    if (!characterId || !teamId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await disbandTeam(characterId, teamId);
    res.json(result);
}));

// 离开队伍
router.post('/leave', asyncHandler(async (req, res) => {
    const { characterId } = req.body;
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await leaveTeam(characterId);
    res.json(result);
}));

// 申请加入队伍
router.post('/apply', asyncHandler(async (req, res) => {
    const { characterId, teamId, message } = req.body;
    if (!characterId || !teamId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await applyToTeam(characterId, teamId, message);
    res.json(result);
}));

// 获取队伍申请列表
router.get('/applications/:teamId', asyncHandler(async (req, res) => {
    const teamId = String(req.params.teamId);
    const characterId = parseInt(req.query.characterId as string);
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getTeamApplications(teamId, characterId);
    res.json(result);
}));

// 处理入队申请
router.post('/application/handle', asyncHandler(async (req, res) => {
    const { characterId, applicationId, approve } = req.body;
    if (!characterId || !applicationId || approve === undefined) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await handleApplication(characterId, applicationId, approve);
    res.json(result);
}));

// 踢出成员
router.post('/kick', asyncHandler(async (req, res) => {
    const { leaderId, targetCharacterId } = req.body;
    if (!leaderId || !targetCharacterId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await kickMember(leaderId, targetCharacterId);
    res.json(result);
}));

// 转让队长
router.post('/transfer', asyncHandler(async (req, res) => {
    const { currentLeaderId, newLeaderId } = req.body;
    if (!currentLeaderId || !newLeaderId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await transferLeader(currentLeaderId, newLeaderId);
    res.json(result);
}));

// 更新队伍设置
router.post('/settings', asyncHandler(async (req, res) => {
    const { characterId, teamId, settings } = req.body;
    if (!characterId || !teamId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await updateTeamSettings(characterId, teamId, settings);
    res.json(result);
}));

// 获取附近队伍
router.get('/nearby/list', asyncHandler(async (req, res) => {
    const characterId = parseInt(req.query.characterId as string);
    const mapId = req.query.mapId as string | undefined;
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getNearbyTeams(characterId, mapId);
    res.json(result);
}));

// 获取队伍大厅
router.get('/lobby/list', asyncHandler(async (req, res) => {
    const characterId = parseInt(req.query.characterId as string);
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getLobbyTeams(characterId, search, limit);
    res.json(result);
}));

// 邀请玩家入队
router.post('/invite', asyncHandler(async (req, res) => {
    const { inviterId, inviteeId, message } = req.body;
    if (!inviterId || !inviteeId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await inviteToTeam(inviterId, inviteeId, message);
    res.json(result);
}));

// 获取收到的邀请
router.get('/invitations/received', asyncHandler(async (req, res) => {
    const characterId = parseInt(req.query.characterId as string);
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getReceivedInvitations(characterId);
    res.json(result);
}));

// 处理入队邀请
router.post('/invitation/handle', asyncHandler(async (req, res) => {
    const { characterId, invitationId, accept } = req.body;
    if (!characterId || !invitationId || accept === undefined) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await handleInvitation(characterId, invitationId, accept);
    res.json(result);
}));

export default router;
