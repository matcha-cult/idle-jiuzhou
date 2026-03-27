/**
 * 角色排行榜快照服务。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把角色计算结果收敛为排行榜快照行，并负责写入/删除 `character_rank_snapshot`。
 * 2. 做什么：集中维护境界排序值与排行榜战力口径，避免查询时再全量计算。
 * 3. 不做什么：不替代角色实时属性服务，不在这里决定排行榜分页或 UI 展示结构。
 *
 * 输入/输出：
 * - 输入：角色计算结果或角色 ID。
 * - 输出：标准化后的快照行，或数据库 upsert/delete 结果。
 *
 * 数据流/状态流：
 * - `characterComputedService` 生成角色完整属性 -> 本服务提取排行榜字段 -> 写入快照表 ->
 *   `rankService` 后续只需要纯 SQL 读取快照表。
 *
 * 关键边界条件与坑点：
 * 1. 快照必须复用现有角色计算结果，不能再偷偷写第二套战力算法，否则详情页与排行榜会漂移。
 * 2. 角色不存在时要允许删除快照，避免脏数据继续留在榜单里。
 */
import { query } from '../config/database.js';
import type { CharacterComputedRow } from './characterComputedService.js';
import { getRealmRankZeroBased } from './shared/realmRules.js';
import { computeRankPower, normalizeRankPowerStat, type RankPowerSource } from './shared/rankPower.js';

export interface CharacterRankSnapshotRow {
  characterId: number;
  nickname: string;
  realm: string;
  realmRank: number;
  power: number;
  wugong: number;
  fagong: number;
  wufang: number;
  fafang: number;
  maxQixue: number;
  maxLingqi: number;
  sudu: number;
}

export interface CharacterRankSnapshotSource extends RankPowerSource {
  id: number;
  nickname: string;
  realm: string;
  sub_realm: string | null;
}

const normalizeCharacterId = (characterId: number): number => {
  const normalized = Math.floor(characterId);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return normalized;
};

export const buildCharacterRankSnapshotRow = (
  computedRow: CharacterRankSnapshotSource | CharacterComputedRow,
): CharacterRankSnapshotRow => {
  const realm = String(computedRow.realm ?? '').trim() || '凡人';
  const wugong = normalizeRankPowerStat(computedRow.wugong);
  const fagong = normalizeRankPowerStat(computedRow.fagong);
  const wufang = normalizeRankPowerStat(computedRow.wufang);
  const fafang = normalizeRankPowerStat(computedRow.fafang);
  const maxQixue = normalizeRankPowerStat(computedRow.max_qixue);
  const maxLingqi = normalizeRankPowerStat(computedRow.max_lingqi);
  const sudu = normalizeRankPowerStat(computedRow.sudu);

  return {
    characterId: normalizeCharacterId(computedRow.id),
    nickname: String(computedRow.nickname ?? '').trim(),
    realm,
    realmRank: getRealmRankZeroBased(computedRow.realm, computedRow.sub_realm),
    power: computeRankPower(computedRow),
    wugong,
    fagong,
    wufang,
    fafang,
    maxQixue,
    maxLingqi,
    sudu,
  };
};

export const upsertCharacterRankSnapshot = async (
  computedRow: CharacterRankSnapshotSource | CharacterComputedRow,
): Promise<CharacterRankSnapshotRow> => {
  const snapshot = buildCharacterRankSnapshotRow(computedRow);
  await query(
    `
      INSERT INTO character_rank_snapshot (
        character_id,
        nickname,
        realm,
        realm_rank,
        power,
        wugong,
        fagong,
        wufang,
        fafang,
        max_qixue,
        max_lingqi,
        sudu,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
      )
      ON CONFLICT (character_id) DO UPDATE SET
        nickname = EXCLUDED.nickname,
        realm = EXCLUDED.realm,
        realm_rank = EXCLUDED.realm_rank,
        power = EXCLUDED.power,
        wugong = EXCLUDED.wugong,
        fagong = EXCLUDED.fagong,
        wufang = EXCLUDED.wufang,
        fafang = EXCLUDED.fafang,
        max_qixue = EXCLUDED.max_qixue,
        max_lingqi = EXCLUDED.max_lingqi,
        sudu = EXCLUDED.sudu,
        updated_at = NOW()
    `,
    [
      snapshot.characterId,
      snapshot.nickname,
      snapshot.realm,
      snapshot.realmRank,
      snapshot.power,
      snapshot.wugong,
      snapshot.fagong,
      snapshot.wufang,
      snapshot.fafang,
      snapshot.maxQixue,
      snapshot.maxLingqi,
      snapshot.sudu,
    ],
  );
  return snapshot;
};

export const deleteCharacterRankSnapshot = async (characterId: number): Promise<void> => {
  const normalizedCharacterId = normalizeCharacterId(characterId);
  if (normalizedCharacterId <= 0) return;
  await query('DELETE FROM character_rank_snapshot WHERE character_id = $1', [normalizedCharacterId]);
};
