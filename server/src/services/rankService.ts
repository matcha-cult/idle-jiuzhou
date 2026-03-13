import { query } from '../config/database.js';
import { createCacheLayer } from './shared/cacheLayer.js';

const clampLimit = (limit?: number, fallback: number = 50): number => {
  const n = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : fallback;
  return Math.max(1, Math.min(200, n));
};

const RANK_CACHE_REDIS_TTL_SEC = 30;
const RANK_CACHE_MEMORY_TTL_MS = 5_000;

export type RealmRankRow = {
  rank: number;
  name: string;
  realm: string;
  power: number;
};

export type SectRankRow = {
  rank: number;
  name: string;
  level: number;
  leader: string;
  members: number;
  memberCap: number;
  power: number;
};

export type WealthRankRow = {
  rank: number;
  name: string;
  realm: string;
  spiritStones: number;
  silver: number;
};

export type ArenaRankRow = {
  rank: number;
  name: string;
  realm: string;
  score: number;
  winCount: number;
  loseCount: number;
};

type RealmRankQueryRow = {
  rank: number | string;
  name: string;
  realm: string;
  power: string | number;
};

type WealthRankQueryRow = {
  rank: number | string;
  name: string;
  realm: string;
  spiritStones: number | string;
  silver: number | string;
};

type SectRankQueryRow = {
  rank: number | string;
  name: string;
  level: number | string;
  leader: string;
  members: number | string;
  memberCap: number | string;
  power: number | string;
};

type ArenaRankQueryRow = {
  rank: number | string;
  name: string;
  realm: string;
  score: number | string;
  winCount: number | string;
  loseCount: number | string;
};

const loadRealmRanks = async (limit: number): Promise<RealmRankRow[]> => {
  const res = await query(
    `
      SELECT
        ROW_NUMBER() OVER (ORDER BY realm_rank DESC, power DESC, character_id ASC)::int AS rank,
        nickname AS name,
        realm,
        power
      FROM character_rank_snapshot
      WHERE nickname <> ''
      ORDER BY rank
      LIMIT $1
    `,
    [limit],
  );

  return (res.rows as RealmRankQueryRow[]).map((row) => ({
    rank: Number(row.rank),
    name: String(row.name),
    realm: String(row.realm),
    power: Number(row.power),
  }));
};

const loadWealthRanks = async (limit: number): Promise<WealthRankRow[]> => {
  const res = await query(
    `
      SELECT
        ROW_NUMBER() OVER (ORDER BY spirit_stones DESC, silver DESC, id ASC)::int AS rank,
        nickname AS name,
        realm,
        COALESCE(spirit_stones, 0)::int AS "spiritStones",
        COALESCE(silver, 0)::int AS silver
      FROM characters
      WHERE nickname IS NOT NULL AND nickname <> ''
      ORDER BY rank
      LIMIT $1
    `,
    [limit],
  );

  return (res.rows as WealthRankQueryRow[]).map((row) => ({
    rank: Number(row.rank),
    name: String(row.name),
    realm: String(row.realm),
    spiritStones: Number(row.spiritStones),
    silver: Number(row.silver),
  }));
};

const loadSectRanks = async (limit: number): Promise<SectRankRow[]> => {
  const res = await query(
    `
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY sd.level DESC, sd.member_count DESC, COALESCE(sd.reputation, 0) DESC, COALESCE(sd.funds, 0) DESC, sd.created_at ASC
        )::int AS rank,
        sd.name AS name,
        sd.level::int AS level,
        COALESCE(c.nickname, '—') AS leader,
        sd.member_count::int AS members,
        sd.max_members::int AS "memberCap",
        (
          sd.level::bigint * 100000
          + sd.member_count::bigint * 1000
          + COALESCE(sd.reputation, 0)::bigint
          + (COALESCE(sd.funds, 0)::bigint / 10)
        )::bigint AS power
      FROM sect_def sd
      LEFT JOIN characters c ON c.id = sd.leader_id
      ORDER BY rank
      LIMIT $1
    `,
    [limit],
  );

  return (res.rows as SectRankQueryRow[]).map((row) => ({
    rank: Number(row.rank),
    name: String(row.name),
    level: Number(row.level),
    leader: String(row.leader),
    members: Number(row.members),
    memberCap: Number(row.memberCap),
    power: Number(row.power),
  }));
};

const loadArenaRanks = async (limit: number): Promise<ArenaRankRow[]> => {
  const res = await query(
    `
      SELECT
        ROW_NUMBER() OVER (ORDER BY score DESC, win_count DESC, lose_count ASC, id ASC)::int AS rank,
        name,
        realm,
        score::int,
        win_count::int AS "winCount",
        lose_count::int AS "loseCount"
      FROM (
        SELECT
          c.id,
          COALESCE(NULLIF(c.nickname, ''), CONCAT('修士', c.id::text)) AS name,
          c.realm,
          COALESCE(ar.rating, 1000)::int AS score,
          COALESCE(ar.win_count, 0)::int AS win_count,
          COALESCE(ar.lose_count, 0)::int AS lose_count
        FROM characters c
        LEFT JOIN arena_rating ar ON ar.character_id = c.id
      ) t
      ORDER BY rank
      LIMIT $1
    `,
    [limit],
  );

  return (res.rows as ArenaRankQueryRow[]).map((row) => ({
    rank: Number(row.rank),
    name: String(row.name),
    realm: String(row.realm),
    score: Number(row.score),
    winCount: Number(row.winCount),
    loseCount: Number(row.loseCount),
  }));
};

const realmRankCache = createCacheLayer<number, RealmRankRow[]>({
  keyPrefix: 'rank:realm:',
  redisTtlSec: RANK_CACHE_REDIS_TTL_SEC,
  memoryTtlMs: RANK_CACHE_MEMORY_TTL_MS,
  loader: loadRealmRanks,
});

const wealthRankCache = createCacheLayer<number, WealthRankRow[]>({
  keyPrefix: 'rank:wealth:',
  redisTtlSec: RANK_CACHE_REDIS_TTL_SEC,
  memoryTtlMs: RANK_CACHE_MEMORY_TTL_MS,
  loader: loadWealthRanks,
});

const sectRankCache = createCacheLayer<number, SectRankRow[]>({
  keyPrefix: 'rank:sect:',
  redisTtlSec: RANK_CACHE_REDIS_TTL_SEC,
  memoryTtlMs: RANK_CACHE_MEMORY_TTL_MS,
  loader: loadSectRanks,
});

const arenaRankCache = createCacheLayer<number, ArenaRankRow[]>({
  keyPrefix: 'rank:arena:',
  redisTtlSec: RANK_CACHE_REDIS_TTL_SEC,
  memoryTtlMs: RANK_CACHE_MEMORY_TTL_MS,
  loader: loadArenaRanks,
});

export const getRealmRanks = async (
  limit?: number
): Promise<{ success: boolean; message: string; data?: RealmRankRow[] }> => {
  const l = clampLimit(limit, 50);
  const data = (await realmRankCache.get(l)) ?? [];
  return { success: true, message: 'ok', data };
};

export const getWealthRanks = async (
  limit?: number
): Promise<{ success: boolean; message: string; data?: WealthRankRow[] }> => {
  const l = clampLimit(limit, 50);
  const data = (await wealthRankCache.get(l)) ?? [];
  return { success: true, message: 'ok', data };
};

export const getSectRanks = async (
  limit?: number
): Promise<{ success: boolean; message: string; data?: SectRankRow[] }> => {
  const l = clampLimit(limit, 30);
  const data = (await sectRankCache.get(l)) ?? [];
  return { success: true, message: 'ok', data };
};

export const getArenaRanks = async (
  limit?: number
): Promise<{ success: boolean; message: string; data?: ArenaRankRow[] }> => {
  const l = clampLimit(limit, 50);
  const data = (await arenaRankCache.get(l)) ?? [];
  return { success: true, message: 'ok', data };
};

export const getRankOverview = async (
  limitPlayers?: number,
  limitSects?: number
): Promise<{
  success: boolean;
  message: string;
  data?: { realm: RealmRankRow[]; sect: SectRankRow[]; wealth: WealthRankRow[] };
}> => {
  const [realmRes, sectRes, wealthRes] = await Promise.all([
    getRealmRanks(limitPlayers),
    getSectRanks(limitSects),
    getWealthRanks(limitPlayers),
  ]);

  if (!realmRes.success) return { success: false, message: realmRes.message };
  if (!sectRes.success) return { success: false, message: sectRes.message };
  if (!wealthRes.success) return { success: false, message: wealthRes.message };

  return {
    success: true,
    message: 'ok',
    data: {
      realm: realmRes.data ?? [],
      sect: sectRes.data ?? [],
      wealth: wealthRes.data ?? [],
    },
  };
};
