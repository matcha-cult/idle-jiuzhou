import { pool } from '../../config/database.js';
import { assertMember } from './db.js';

interface SectLogRow {
  id: number;
  log_type: string;
  content: string | null;
  created_at: string;
  operator_id: number | null;
  target_id: number | null;
  operator_name: string | null;
  target_name: string | null;
}

const clampLimit = (limit?: number): number => {
  if (!Number.isFinite(limit)) return 50;
  const safe = Math.floor(limit as number);
  if (safe <= 0) return 50;
  return Math.min(safe, 200);
};

export const getSectLogs = async (
  characterId: number,
  limit?: number
): Promise<{
  success: boolean;
  message: string;
  data?: Array<{
    id: number;
    logType: string;
    content: string;
    createdAt: string;
    operatorId: number | null;
    operatorName: string | null;
    targetId: number | null;
    targetName: string | null;
  }>;
}> => {
  const member = await assertMember(characterId);
  const safeLimit = clampLimit(limit);
  const res = await pool.query<SectLogRow>(
    `
      SELECT
        l.id,
        l.log_type,
        l.content,
        l.created_at,
        l.operator_id,
        l.target_id,
        co.nickname AS operator_name,
        ct.nickname AS target_name
      FROM sect_log l
      LEFT JOIN characters co ON co.id = l.operator_id
      LEFT JOIN characters ct ON ct.id = l.target_id
      WHERE l.sect_id = $1
      ORDER BY l.created_at DESC
      LIMIT $2
    `,
    [member.sectId, safeLimit]
  );

  return {
    success: true,
    message: 'ok',
    data: res.rows.map((row) => ({
      id: Number(row.id),
      logType: row.log_type,
      content: row.content ?? '',
      createdAt: row.created_at,
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      targetId: row.target_id,
      targetName: row.target_name,
    })),
  };
};
