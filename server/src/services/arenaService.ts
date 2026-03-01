import { query } from '../config/database.js';
import {
  getCharacterComputedBatchByCharacterIds,
} from './characterComputedService.js';

const MAX_DAILY_CHALLENGES = 20;
const DEFAULT_RATING = 1000;

const computePower = (row: {
  wugong?: number;
  fagong?: number;
  wufang?: number;
  fafang?: number;
  max_qixue?: number;
  max_lingqi?: number;
  sudu?: number;
}): number => {
  const wugong = Number(row.wugong ?? 0) || 0;
  const fagong = Number(row.fagong ?? 0) || 0;
  const wufang = Number(row.wufang ?? 0) || 0;
  const fafang = Number(row.fafang ?? 0) || 0;
  const maxQixue = Number(row.max_qixue ?? 0) || 0;
  const maxLingqi = Number(row.max_lingqi ?? 0) || 0;
  const sudu = Number(row.sudu ?? 0) || 0;
  return wugong + fagong + wufang + fafang + maxQixue + maxLingqi + sudu;
};

const ensureRatingRow = async (characterId: number): Promise<void> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return;
  await query(
    `INSERT INTO arena_rating(character_id, rating)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO NOTHING`,
    [id, DEFAULT_RATING]
  );
};

const getTodayChallengeCount = async (characterId: number): Promise<number> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return 0;
  const res = await query(
    `
      SELECT COUNT(*)::int AS cnt
      FROM arena_battle
      WHERE challenger_character_id = $1
        AND created_at >= date_trunc('day', NOW())
    `,
    [id]
  );
  return Number(res.rows?.[0]?.cnt ?? 0) || 0;
};

export type ArenaStatus = {
  score: number;
  winCount: number;
  loseCount: number;
  todayUsed: number;
  todayLimit: number;
  todayRemaining: number;
};

export const getArenaStatus = async (
  characterId: number
): Promise<{ success: boolean; message: string; data?: ArenaStatus }> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

  await ensureRatingRow(id);
  const ratingRes = await query(
    `SELECT rating, win_count, lose_count FROM arena_rating WHERE character_id = $1`,
    [id]
  );
  if (ratingRes.rows.length === 0) return { success: false, message: '竞技场数据异常' };

  const row = ratingRes.rows[0] as any;
  const score = Number(row.rating ?? DEFAULT_RATING) || DEFAULT_RATING;
  const winCount = Number(row.win_count ?? 0) || 0;
  const loseCount = Number(row.lose_count ?? 0) || 0;

  const used = await getTodayChallengeCount(id);
  const remaining = Math.max(0, MAX_DAILY_CHALLENGES - used);

  return {
    success: true,
    message: 'ok',
    data: {
      score,
      winCount,
      loseCount,
      todayUsed: used,
      todayLimit: MAX_DAILY_CHALLENGES,
      todayRemaining: remaining,
    },
  };
};

export type ArenaOpponent = {
  id: number;
  name: string;
  realm: string;
  power: number;
  score: number;
};

/**
 * 获取竞技场匹配对手（基于积分的加权随机匹配）
 *
 * 匹配逻辑：
 * 1. 动态积分范围：±50 → ±100 → ±200 → ±400 → 无限制
 * 2. 加权随机选择：积分差距越小，被选中概率越高（线性衰减）
 * 3. 权重计算：weight = max(0, 1 - scoreDiff / maxRange)
 *
 * 复用点：此函数被 arenaRoutes 中的快速匹配接口调用
 */
export const getArenaOpponents = async (
  characterId: number,
  limit: number = 10
): Promise<{ success: boolean; message: string; data?: ArenaOpponent[] }> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

  const l = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));

  // 获取我的积分
  await ensureRatingRow(id);
  const myRatingRes = await query(
    `SELECT rating FROM arena_rating WHERE character_id = $1`,
    [id]
  );
  if (myRatingRes.rows.length === 0) return { success: false, message: '竞技场数据异常' };
  const myScore = Number(myRatingRes.rows[0].rating ?? DEFAULT_RATING) || DEFAULT_RATING;

  // 动态积分范围（保守型）
  const scoreRanges = [50, 100, 200, 400, Number.MAX_SAFE_INTEGER];

  // 查询所有对手的积分
  const rawOppRes = await query(
    `
      SELECT c.id, COALESCE(ar.rating, $2)::int AS score
      FROM characters c
      LEFT JOIN arena_rating ar ON ar.character_id = c.id
      WHERE c.id <> $1
    `,
    [id, DEFAULT_RATING],
  );
  
  type LightweightOpponent = { id: number; score: number };
  const candidateList: LightweightOpponent[] = [];
  for (const row of rawOppRes.rows as Array<{ id?: unknown; score?: unknown }>) {
    const cid = Number(row.id);
    if (!Number.isFinite(cid) || cid <= 0) continue;
    candidateList.push({
      id: cid,
      score: Number(row.score ?? DEFAULT_RATING) || DEFAULT_RATING,
    });
  }

  if (candidateList.length === 0) return { success: true, message: 'ok', data: [] };

  // 按积分范围逐级扩大搜索
  let matchedCandidates: LightweightOpponent[] = [];
  let currentRange = 0;

  for (const range of scoreRanges) {
    currentRange = range;
    matchedCandidates = candidateList.filter((opp) => {
      const scoreDiff = Math.abs(opp.score - myScore);
      return scoreDiff <= range;
    });

    if (matchedCandidates.length > 0) break;
  }

  if (matchedCandidates.length === 0) {
    return { success: true, message: 'ok', data: [] };
  }

  // 加权随机选择（线性衰减）
  const weightedCandidates = matchedCandidates.map((opp) => {
    const scoreDiff = Math.abs(opp.score - myScore);
    const weight = Math.max(0.01, 1 - scoreDiff / currentRange);
    return { opponent: opp, weight };
  });

  // 按权重排序后选择前 limit 个（权重高的优先，但保留随机性）
  const selectedLightweight: LightweightOpponent[] = [];
  const remaining = [...weightedCandidates];

  for (let i = 0; i < l && remaining.length > 0; i++) {
    const currentTotalWeight = remaining.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * currentTotalWeight;

    let selectedIndex = 0;
    for (let j = 0; j < remaining.length; j++) {
      random -= remaining[j].weight;
      if (random <= 0) {
        selectedIndex = j;
        break;
      }
    }

    selectedLightweight.push(remaining[selectedIndex].opponent);
    remaining.splice(selectedIndex, 1);
  }

  if (selectedLightweight.length === 0) {
    return { success: true, message: 'ok', data: [] };
  }

  const selectedIds = selectedLightweight.map((opp) => opp.id);
  const computedMap = await getCharacterComputedBatchByCharacterIds(selectedIds);
  
  const finalSelected: ArenaOpponent[] = [];
  for (const opp of selectedLightweight) {
    const snapshot = computedMap.get(opp.id);
    if (!snapshot) continue;
    finalSelected.push({
      id: snapshot.id,
      name: String(snapshot.nickname || `修士${snapshot.id}`),
      realm: String(snapshot.realm || '凡人'),
      power: Math.max(0, computePower(snapshot)),
      score: opp.score,
    });
  }

  return { success: true, message: 'ok', data: finalSelected };
};

export type ArenaRecord = {
  id: string;
  ts: number;
  opponentName: string;
  opponentRealm: string;
  opponentPower: number;
  result: 'win' | 'lose' | 'draw';
  deltaScore: number;
  scoreAfter: number;
};

export const getArenaRecords = async (
  characterId: number,
  limit: number = 50
): Promise<{ success: boolean; message: string; data?: ArenaRecord[] }> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

  const l = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));
  const res = await query(
    `
      SELECT
        ab.battle_id,
        ab.created_at,
        ab.result,
        ab.delta_score,
        ab.score_after,
        c.id AS opponent_id,
        c.nickname AS opponent_name,
        c.realm AS opponent_realm
      FROM arena_battle ab
      JOIN characters c ON c.id = ab.opponent_character_id
      WHERE ab.challenger_character_id = $1
        AND ab.status = 'finished'
      ORDER BY ab.created_at DESC
      LIMIT $2
    `,
    [id, l]
  );

  const opponentIds = (res.rows as Array<{ opponent_id?: unknown }>)
    .map((r) => Number(r.opponent_id))
    .filter((x) => Number.isFinite(x) && x > 0);
  const computedMap = await getCharacterComputedBatchByCharacterIds(opponentIds);

  const data: ArenaRecord[] = res.rows.map((r: any) => ({
    id: String(r.battle_id),
    ts: new Date(r.created_at).getTime(),
    opponentName: String(r.opponent_name ?? ''),
    opponentRealm: String(r.opponent_realm ?? '凡人'),
    opponentPower: (() => {
      const cid = Number(r.opponent_id);
      if (!Number.isFinite(cid) || cid <= 0) return 0;
      const computed = computedMap.get(cid);
      if (!computed) return 0;
      return Math.max(0, computePower(computed));
    })(),
    result: (r.result === 'win' || r.result === 'lose' || r.result === 'draw' ? r.result : 'draw') as any,
    deltaScore: Number(r.delta_score ?? 0) || 0,
    scoreAfter: Number(r.score_after ?? DEFAULT_RATING) || DEFAULT_RATING,
  }));

  return { success: true, message: 'ok', data };
};

export const canChallengeToday = async (
  characterId: number
): Promise<{ allowed: boolean; remaining: number }> => {
  const used = await getTodayChallengeCount(characterId);
  const remaining = Math.max(0, MAX_DAILY_CHALLENGES - used);
  return { allowed: remaining > 0, remaining };
};
