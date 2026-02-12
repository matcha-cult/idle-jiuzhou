import { query, pool } from '../config/database.js';
import { addItemToInventoryTx } from './inventoryService.js';
import { lockCharacterInventoryMutexTx } from './inventoryMutex.js';

export type BattlePassTaskDto = {
  id: string;
  code: string;
  name: string;
  description: string;
  taskType: 'daily' | 'weekly' | 'season';
  condition: unknown;
  targetValue: number;
  rewardExp: number;
  rewardExtra: unknown[];
  enabled: boolean;
  sortWeight: number;
  progressValue: number;
  completed: boolean;
  claimed: boolean;
};

export type BattlePassTasksOverviewDto = {
  seasonId: string;
  daily: BattlePassTaskDto[];
  weekly: BattlePassTaskDto[];
  season: BattlePassTaskDto[];
};

type BattlePassTaskType = BattlePassTaskDto['taskType'];

export const getCharacterIdByUserId = async (userId: number): Promise<number | null> => {
  try {
    const res = await query('SELECT id FROM characters WHERE user_id = $1 LIMIT 1', [userId]);
    const characterId = Number(res.rows?.[0]?.id);
    if (!Number.isFinite(characterId) || characterId <= 0) return null;
    return characterId;
  } catch {
    return null;
  }
};

export const getActiveBattlePassSeasonId = async (now: Date = new Date()): Promise<string | null> => {
  try {
    const res = await query(
      `
        SELECT id
        FROM battle_pass_season_def
        WHERE enabled = true
          AND start_at <= $1
          AND end_at > $1
        ORDER BY sort_weight DESC, start_at DESC
        LIMIT 1
      `,
      [now.toISOString()],
    );
    const seasonId = String(res.rows?.[0]?.id || '');
    return seasonId || null;
  } catch {
    return null;
  }
};

export const getFallbackBattlePassSeasonId = async (): Promise<string | null> => {
  try {
    const res = await query(
      `
        SELECT id
        FROM battle_pass_season_def
        WHERE enabled = true
        ORDER BY sort_weight DESC, start_at DESC
        LIMIT 1
      `,
    );
    const seasonId = String(res.rows?.[0]?.id || '');
    return seasonId || null;
  } catch {
    return null;
  }
};

export const getBattlePassTasksOverview = async (userId: number, seasonId?: string): Promise<BattlePassTasksOverviewDto> => {
  const resolvedSeasonId =
    (typeof seasonId === 'string' && seasonId.trim() ? seasonId.trim() : null) ??
    (await getActiveBattlePassSeasonId()) ??
    (await getFallbackBattlePassSeasonId()) ??
    '';

  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) {
    return { seasonId: resolvedSeasonId, daily: [], weekly: [], season: [] };
  }

  if (!resolvedSeasonId) {
    return { seasonId: '', daily: [], weekly: [], season: [] };
  }

  const res = await query(
    `
      SELECT
        d.id,
        d.code,
        d.name,
        COALESCE(d.description, '') AS description,
        d.task_type,
        d.condition,
        d.target_value,
        d.reward_exp,
        d.reward_extra,
        d.enabled,
        d.sort_weight,
        COALESCE(
          CASE
            WHEN d.task_type = 'daily'
              THEN CASE WHEN p.completed_at IS NOT NULL AND p.completed_at >= date_trunc('day', NOW()) THEN p.progress_value ELSE 0 END
            WHEN d.task_type = 'weekly'
              THEN CASE WHEN p.completed_at IS NOT NULL AND p.completed_at >= date_trunc('week', NOW()) THEN p.progress_value ELSE 0 END
            ELSE p.progress_value
          END,
          0
        ) AS progress_value,
        COALESCE(
          CASE
            WHEN d.task_type = 'daily' THEN (p.completed = true AND p.completed_at IS NOT NULL AND p.completed_at >= date_trunc('day', NOW()))
            WHEN d.task_type = 'weekly' THEN (p.completed = true AND p.completed_at IS NOT NULL AND p.completed_at >= date_trunc('week', NOW()))
            ELSE (p.completed = true)
          END,
          false
        ) AS completed,
        COALESCE(
          CASE
            WHEN d.task_type = 'daily' THEN (p.claimed = true AND p.claimed_at IS NOT NULL AND p.claimed_at >= date_trunc('day', NOW()))
            WHEN d.task_type = 'weekly' THEN (p.claimed = true AND p.claimed_at IS NOT NULL AND p.claimed_at >= date_trunc('week', NOW()))
            ELSE (p.claimed = true)
          END,
          false
        ) AS claimed
      FROM battle_pass_task_def d
      LEFT JOIN battle_pass_task_progress p
        ON p.task_id = d.id
       AND p.season_id = d.season_id
       AND p.character_id = $2
      WHERE d.season_id = $1
        AND d.enabled = true
      ORDER BY d.task_type ASC, d.sort_weight DESC, d.id ASC
    `,
    [resolvedSeasonId, characterId],
  );

  const rows: BattlePassTaskDto[] = (res.rows ?? []).map((r) => ({
    id: String(r.id || ''),
    code: String(r.code || ''),
    name: String(r.name || ''),
    description: String(r.description || ''),
    taskType: (String(r.task_type || 'daily') as BattlePassTaskDto['taskType']) ?? 'daily',
    condition: r.condition ?? {},
    targetValue: Number.isFinite(Number(r.target_value)) ? Number(r.target_value) : 1,
    rewardExp: Number.isFinite(Number(r.reward_exp)) ? Number(r.reward_exp) : 0,
    rewardExtra: Array.isArray(r.reward_extra) ? r.reward_extra : (() => {
      try {
        return typeof r.reward_extra === 'string' ? (JSON.parse(r.reward_extra) as unknown[]) : [];
      } catch {
        return [];
      }
    })(),
    enabled: r.enabled !== false,
    sortWeight: Number.isFinite(Number(r.sort_weight)) ? Number(r.sort_weight) : 0,
    progressValue: Number.isFinite(Number(r.progress_value)) ? Number(r.progress_value) : 0,
    completed: r.completed === true,
    claimed: r.claimed === true,
  }));

  return {
    seasonId: resolvedSeasonId,
    daily: rows.filter((x) => x.taskType === 'daily'),
    weekly: rows.filter((x) => x.taskType === 'weekly'),
    season: rows.filter((x) => x.taskType === 'season'),
  };
};

export type CompleteBattlePassTaskResult = {
  success: boolean;
  message: string;
  data?: {
    taskId: string;
    taskType: BattlePassTaskType;
    gainedExp: number;
    exp: number;
    level: number;
    maxLevel: number;
    expPerLevel: number;
  };
};

export const completeBattlePassTask = async (userId: number, taskId: string): Promise<CompleteBattlePassTaskResult> => {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return { success: false, message: '任务ID无效' };

  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return { success: false, message: '角色不存在' };

  const seasonId = (await getActiveBattlePassSeasonId()) ?? (await getFallbackBattlePassSeasonId());
  if (!seasonId) return { success: false, message: '当前没有进行中的赛季' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonRes = await client.query(
      `SELECT max_level, exp_per_level FROM battle_pass_season_def WHERE id = $1 LIMIT 1`,
      [seasonId],
    );
    if ((seasonRes.rows ?? []).length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '赛季配置不存在' };
    }
    const maxLevel = Number(seasonRes.rows[0]?.max_level) || 30;
    const expPerLevel = Number(seasonRes.rows[0]?.exp_per_level) || 1000;
    const maxExp = Math.max(0, maxLevel * expPerLevel);

    const taskRes = await client.query(
      `
        SELECT id, task_type, target_value, reward_exp
        FROM battle_pass_task_def
        WHERE id = $1
          AND season_id = $2
          AND enabled = true
        LIMIT 1
      `,
      [normalizedTaskId, seasonId],
    );
    if ((taskRes.rows ?? []).length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '任务不存在或未启用' };
    }

    const taskType = String(taskRes.rows[0]?.task_type || 'daily') as BattlePassTaskType;
    if (taskType !== 'daily' && taskType !== 'weekly' && taskType !== 'season') {
      await client.query('ROLLBACK');
      return { success: false, message: '任务类型不支持' };
    }
    const targetValue = Math.max(1, Number(taskRes.rows[0]?.target_value) || 1);
    const rewardExp = Math.max(0, Number(taskRes.rows[0]?.reward_exp) || 0);

    const taskProgressRes = await client.query(
      `
        SELECT
          CASE
            WHEN $4 = 'daily' THEN (completed = true AND completed_at IS NOT NULL AND completed_at >= date_trunc('day', NOW()))
            WHEN $4 = 'weekly' THEN (completed = true AND completed_at IS NOT NULL AND completed_at >= date_trunc('week', NOW()))
            ELSE (completed = true)
          END AS completed_in_cycle
        FROM battle_pass_task_progress
        WHERE character_id = $1
          AND season_id = $2
          AND task_id = $3
        FOR UPDATE
      `,
      [characterId, seasonId, normalizedTaskId, taskType],
    );
    const completedInCycle = taskProgressRes.rows[0]?.completed_in_cycle === true;
    if (completedInCycle) {
      await client.query('ROLLBACK');
      return { success: false, message: '任务已完成' };
    }

    await client.query(
      `
        INSERT INTO battle_pass_task_progress (
          character_id, season_id, task_id, progress_value, completed, completed_at, claimed, claimed_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, true, NOW(), true, NOW(), NOW(), NOW())
        ON CONFLICT (character_id, season_id, task_id)
        DO UPDATE SET
          progress_value = EXCLUDED.progress_value,
          completed = true,
          completed_at = NOW(),
          claimed = true,
          claimed_at = NOW(),
          updated_at = NOW()
      `,
      [characterId, seasonId, normalizedTaskId, targetValue],
    );

    const bpProgressRes = await client.query(
      `
        INSERT INTO battle_pass_progress (character_id, season_id, exp, created_at, updated_at)
        VALUES ($1, $2, LEAST($3::bigint, $4::bigint), NOW(), NOW())
        ON CONFLICT (character_id, season_id)
        DO UPDATE SET
          exp = LEAST($4::bigint, battle_pass_progress.exp + $3::bigint),
          updated_at = NOW()
        RETURNING exp
      `,
      [characterId, seasonId, rewardExp, maxExp],
    );

    const exp = Number(bpProgressRes.rows[0]?.exp ?? 0);
    const level = Math.min(Math.floor(exp / expPerLevel) + 1, maxLevel);

    await client.query('COMMIT');
    return {
      success: true,
      message: '任务完成',
      data: {
        taskId: normalizedTaskId,
        taskType,
        gainedExp: rewardExp,
        exp,
        level,
        maxLevel,
        expPerLevel,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('完成战令任务失败:', error);
    return { success: false, message: '服务器错误' };
  } finally {
    client.release();
  }
};

export type BattlePassStatusDto = {
  seasonId: string;
  seasonName: string;
  exp: number;
  level: number;
  maxLevel: number;
  expPerLevel: number;
  premiumUnlocked: boolean;
  claimedFreeLevels: number[];
  claimedPremiumLevels: number[];
};

export const getBattlePassStatus = async (userId: number): Promise<BattlePassStatusDto | null> => {
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return null;

  const seasonId = (await getActiveBattlePassSeasonId()) ?? (await getFallbackBattlePassSeasonId());
  if (!seasonId) return null;

  const seasonRes = await query(
    `SELECT id, name, max_level, exp_per_level FROM battle_pass_season_def WHERE id = $1`,
    [seasonId],
  );
  if (seasonRes.rows.length === 0) return null;

  const season = seasonRes.rows[0];
  const maxLevel = Number(season.max_level) || 30;
  const expPerLevel = Number(season.exp_per_level) || 1000;

  const progressRes = await query(
    `SELECT exp, premium_unlocked FROM battle_pass_progress WHERE character_id = $1 AND season_id = $2`,
    [characterId, seasonId],
  );
  const exp = Number(progressRes.rows[0]?.exp ?? 0);
  const premiumUnlocked = progressRes.rows[0]?.premium_unlocked === true;

  const claimRes = await query(
    `SELECT level, track FROM battle_pass_claim_record WHERE character_id = $1 AND season_id = $2`,
    [characterId, seasonId],
  );
  const claimedFreeLevels: number[] = [];
  const claimedPremiumLevels: number[] = [];
  for (const row of claimRes.rows) {
    if (row.track === 'free') claimedFreeLevels.push(Number(row.level));
    else if (row.track === 'premium') claimedPremiumLevels.push(Number(row.level));
  }

  const level = Math.min(Math.floor(exp / expPerLevel) + 1, maxLevel);

  return {
    seasonId,
    seasonName: String(season.name || ''),
    exp,
    level,
    maxLevel,
    expPerLevel,
    premiumUnlocked,
    claimedFreeLevels: claimedFreeLevels.sort((a, b) => a - b),
    claimedPremiumLevels: claimedPremiumLevels.sort((a, b) => a - b),
  };
};

export type BattlePassRewardDto = {
  level: number;
  freeRewards: Array<{ type: string; currency?: string; amount?: number; itemDefId?: string; qty?: number }>;
  premiumRewards: Array<{ type: string; currency?: string; amount?: number; itemDefId?: string; qty?: number }>;
};

export const getBattlePassRewards = async (seasonId?: string): Promise<BattlePassRewardDto[]> => {
  const resolvedSeasonId =
    (typeof seasonId === 'string' && seasonId.trim() ? seasonId.trim() : null) ??
    (await getActiveBattlePassSeasonId()) ??
    (await getFallbackBattlePassSeasonId()) ??
    '';
  if (!resolvedSeasonId) return [];

  const res = await query(
    `SELECT level, free_rewards, premium_rewards FROM battle_pass_reward_def WHERE season_id = $1 ORDER BY level ASC`,
    [resolvedSeasonId],
  );

  return res.rows.map((row) => ({
    level: Number(row.level),
    freeRewards: Array.isArray(row.free_rewards) ? row.free_rewards : [],
    premiumRewards: Array.isArray(row.premium_rewards) ? row.premium_rewards : [],
  }));
};

export type ClaimRewardResult = {
  success: boolean;
  message: string;
  data?: {
    level: number;
    track: 'free' | 'premium';
    rewards: Array<{ type: string; currency?: string; amount?: number; itemDefId?: string; qty?: number }>;
    spiritStones?: number;
    silver?: number;
  };
};

export const claimBattlePassReward = async (
  userId: number,
  level: number,
  track: 'free' | 'premium',
): Promise<ClaimRewardResult> => {
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return { success: false, message: '角色不存在' };

  const seasonId = (await getActiveBattlePassSeasonId()) ?? (await getFallbackBattlePassSeasonId());
  if (!seasonId) return { success: false, message: '当前没有进行中的赛季' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockCharacterInventoryMutexTx(client, characterId);

    // 获取赛季配置
    const seasonRes = await client.query(
      `SELECT max_level, exp_per_level FROM battle_pass_season_def WHERE id = $1`,
      [seasonId],
    );
    if (seasonRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '赛季配置不存在' };
    }
    const maxLevel = Number(seasonRes.rows[0].max_level) || 30;
    const expPerLevel = Number(seasonRes.rows[0].exp_per_level) || 1000;

    if (level < 1 || level > maxLevel) {
      await client.query('ROLLBACK');
      return { success: false, message: '等级无效' };
    }

    // 获取玩家战令进度
    const progressRes = await client.query(
      `SELECT exp, premium_unlocked FROM battle_pass_progress WHERE character_id = $1 AND season_id = $2 FOR UPDATE`,
      [characterId, seasonId],
    );
    const exp = Number(progressRes.rows[0]?.exp ?? 0);
    const premiumUnlocked = progressRes.rows[0]?.premium_unlocked === true;
    const currentLevel = Math.min(Math.floor(exp / expPerLevel) + 1, maxLevel);

    if (level > currentLevel) {
      await client.query('ROLLBACK');
      return { success: false, message: '等级未解锁' };
    }

    if (track === 'premium' && !premiumUnlocked) {
      await client.query('ROLLBACK');
      return { success: false, message: '未解锁特权通行证' };
    }

    // 检查是否已领取
    const claimCheck = await client.query(
      `SELECT 1 FROM battle_pass_claim_record WHERE character_id = $1 AND season_id = $2 AND level = $3 AND track = $4`,
      [characterId, seasonId, level, track],
    );
    if (claimCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '该等级奖励已领取' };
    }

    // 获取奖励配置
    const rewardRes = await client.query(
      `SELECT free_rewards, premium_rewards FROM battle_pass_reward_def WHERE season_id = $1 AND level = $2`,
      [seasonId, level],
    );
    if (rewardRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '奖励配置不存在' };
    }

    const rewards: Array<{ type: string; currency?: string; amount?: number; itemDefId?: string; item_def_id?: string; qty?: number }> =
      track === 'free'
        ? (rewardRes.rows[0].free_rewards ?? [])
        : (rewardRes.rows[0].premium_rewards ?? []);

    // 发放奖励
    let spiritStonesGained = 0;
    let silverGained = 0;

    for (const reward of rewards) {
      if (reward.type === 'currency') {
        const amount = Number(reward.amount) || 0;
        if (reward.currency === 'spirit_stones' && amount > 0) {
          await client.query(
            `UPDATE characters SET spirit_stones = spirit_stones + $1, updated_at = NOW() WHERE id = $2`,
            [amount, characterId],
          );
          spiritStonesGained += amount;
        } else if (reward.currency === 'silver' && amount > 0) {
          await client.query(
            `UPDATE characters SET silver = silver + $1, updated_at = NOW() WHERE id = $2`,
            [amount, characterId],
          );
          silverGained += amount;
        }
      } else if (reward.type === 'item') {
        const itemDefId = reward.itemDefId ?? reward.item_def_id;
        const qty = Number(reward.qty) || 1;
        if (itemDefId && qty > 0) {
          const addResult = await addItemToInventoryTx(client, characterId, userId, itemDefId, qty, {
            location: 'bag',
            obtainedFrom: 'battle_pass',
          });
          if (!addResult.success) {
            await client.query('ROLLBACK');
            return { success: false, message: addResult.message || '添加物品失败' };
          }
        }
      }
    }

    // 记录领取
    await client.query(
      `INSERT INTO battle_pass_claim_record (character_id, season_id, level, track, claimed_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [characterId, seasonId, level, track],
    );

    // 获取更新后的灵石和银两数量
    const charRes = await client.query(
      `SELECT spirit_stones, silver FROM characters WHERE id = $1`,
      [characterId],
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: '领取成功',
      data: {
        level,
        track,
        rewards,
        spiritStones: Number(charRes.rows[0]?.spirit_stones ?? 0),
        silver: Number(charRes.rows[0]?.silver ?? 0),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('领取战令奖励失败:', error);
    return { success: false, message: '服务器错误' };
  } finally {
    client.release();
  }
};
