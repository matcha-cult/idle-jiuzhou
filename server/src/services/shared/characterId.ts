/**
 * 角色ID公共查询工具。
 * - `getCharacterIdByUserId`：普通查询。
 * - `getCharacterIdByUserIdForUpdate`：事务内加锁查询（FOR UPDATE）。
 * 返回：有效角色ID或 `null`。
 */
import { query } from '../../config/database.js';

const normalizeUserId = (userId: number): number | null => {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  return uid;
};

const normalizeCharacterId = (rawId: unknown): number | null => {
  const characterId = Number(rawId);
  if (!Number.isFinite(characterId) || characterId <= 0) return null;
  return characterId;
};

export const getCharacterIdByUserId = async (userId: number): Promise<number | null> => {
  const uid = normalizeUserId(userId);
  if (!uid) return null;

  const result = await query('SELECT id FROM characters WHERE user_id = $1 LIMIT 1', [uid]);
  return normalizeCharacterId(result.rows?.[0]?.id);
};

export const getCharacterIdByUserIdForUpdate = async (
  userId: number,
): Promise<number | null> => {
  const uid = normalizeUserId(userId);
  if (!uid) return null;

  const result = await query('SELECT id FROM characters WHERE user_id = $1 LIMIT 1 FOR UPDATE', [uid]);
  return normalizeCharacterId(result.rows?.[0]?.id);
};
