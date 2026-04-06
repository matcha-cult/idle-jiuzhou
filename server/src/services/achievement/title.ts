import { query, getTransactionClient } from '../../config/database.js';
import { Transactional } from '../../decorators/transactional.js';
import {
  asFiniteNonNegativeInt,
  asNonEmptyString,
  normalizeTitleEffects,
} from './shared.js';
import type { ServiceResult, TitleInfo, TitleListResult } from './types.js';
import { invalidateCharacterComputedCache } from '../characterComputedService.js';
import { listTitleDefinitionsByIds, getTitleDefinitionById } from '../titleDefinitionService.js';
import { scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId } from '../onlineBattleProjectionService.js';

/**
 * 称号变更后的战斗状态刷新入口
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一处理称号装备后的角色属性缓存失效与在线战斗快照刷新，避免面板与后续战斗入口读取旧称号属性。
 * 2. 做什么：复用 `invalidateCharacterComputedCache` 内置的角色属性重算与战斗档案刷新，保持与装备、功法改动一致的单一刷新顺序。
 * 3. 不做什么：不处理称号归属发放，不负责 Socket 推送，也不重复刷新 battle loadout。
 *
 * 输入 / 输出：
 * - 输入：characterId。
 * - 输出：Promise<void>；副作用是事务提交后让角色读取链路与在线战斗快照都切到最新称号属性。
 *
 * 数据流 / 状态流：
 * 称号写库成功 -> 本入口 -> invalidateCharacterComputedCache
 * -> scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId。
 *
 * 复用设计说明：
 * 1. 称号、功法、装备都会影响角色派生属性，把“属性缓存失效 + 在线战斗快照刷新”抽成单点入口后，后续补充其他称号写链路时无需再重复拼接顺序。
 * 2. 高频变化点是“哪些称号操作会改属性”，而不是刷新顺序本身，因此把顺序固化在这里能减少重复维护。
 *
 * 关键边界条件与坑点：
 * 1. 必须先失效 computed，再刷新在线战斗快照；否则快照重建会继续读到旧称号属性。
 * 2. invalidateCharacterComputedCache 已经负责 battle loadout 侧刷新，这里不能再额外重复调同层刷新。
 */
const refreshCharacterBattleStateAfterTitleMutation = async (
  characterId: number,
): Promise<void> => {
  await invalidateCharacterComputedCache(characterId);
  await scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId(characterId);
};

/**
 * 称号管理服务
 *
 * 作用：处理称号列表查询与称号装备切换
 * 不做：不处理称号发放（由 titleOwnership.ts 负责）
 *
 * 数据流：
 * - getTitleList：查询角色拥有的称号列表（包含装备状态）
 * - equipTitle：锁定称号记录 → 卸下当前装备 → 装备新称号 → 更新角色属性 → 失效缓存
 *
 * 边界条件：
 * 1) getTitleList 为纯读方法，不需要事务
 * 2) equipTitle 使用 @Transactional 保证装备状态与角色属性更新的原子性
 */
class TitleService {
  private computeEffectDelta(
    current: Record<string, number>,
    next: Record<string, number>,
  ): Record<string, number> {
    const keys = new Set<string>([...Object.keys(current), ...Object.keys(next)]);
    const out: Record<string, number> = {};
    for (const key of keys) {
      const diff = (next[key] ?? 0) - (current[key] ?? 0);
      if (diff !== 0) out[key] = diff;
    }
    return out;
  }

  private async updateCharacterAttrsWithDeltaTx(
    characterId: number,
    titleName: string,
    _delta: Record<string, number>,
  ): Promise<void> {
    const params: unknown[] = [characterId, titleName];
    await query(`UPDATE characters SET title = $2, updated_at = NOW() WHERE id = $1`, params);
  }

  async getTitleList(characterId: number): Promise<TitleListResult> {
    const cid = asFiniteNonNegativeInt(characterId, 0);
    if (!cid) return { titles: [], equipped: '' };

    const res = await query(
      `
      SELECT
        ct.title_id,
        ct.is_equipped,
        ct.obtained_at,
        ct.expires_at
      FROM character_title ct
      WHERE ct.character_id = $1
        AND (ct.expires_at IS NULL OR ct.expires_at > NOW())
      ORDER BY ct.is_equipped DESC, ct.obtained_at ASC, ct.id ASC
    `,
      [cid],
    );

    const titleIds = (res.rows as Array<Record<string, string | boolean | Date | null>>)
      .map((row) => asNonEmptyString(row.title_id))
      .filter((titleId): titleId is string => titleId !== null);
    const titleDefMap = await listTitleDefinitionsByIds(titleIds);

    const titles: TitleInfo[] = [];
    let equipped = '';

    for (const row of res.rows as Array<Record<string, unknown>>) {
      const id = asNonEmptyString(row.title_id);
      if (!id) continue;
      const def = titleDefMap.get(id);
      if (!def) continue;
      const isEquipped = row.is_equipped === true;
      if (isEquipped) equipped = id;

      titles.push({
        id,
        name: asNonEmptyString(def.name) ?? id,
        description: String(def.description ?? ''),
        color: asNonEmptyString(def.color),
        icon: asNonEmptyString(def.icon),
        effects: normalizeTitleEffects(def.effects),
        isEquipped,
        obtainedAt: row.obtained_at ? new Date(String(row.obtained_at)).toISOString() : new Date(0).toISOString(),
        expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
      });
    }

    return { titles, equipped };
  }

  @Transactional
  async equipTitle(characterId: number, titleId: string): Promise<ServiceResult> {
    const cid = asFiniteNonNegativeInt(characterId, 0);
    const tid = asNonEmptyString(titleId);
    if (!cid) return { success: false, message: '角色不存在' };
    if (!tid) return { success: false, message: '称号ID不能为空' };

    const targetDef = await getTitleDefinitionById(tid);
    if (!targetDef) {
      return { success: false, message: '未拥有该称号' };
    }

    const targetRes = await query(
      `
        SELECT title_id
        FROM character_title
        WHERE character_id = $1
          AND title_id = $2
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
        FOR UPDATE
      `,
      [cid, tid],
    );

    if ((targetRes.rows ?? []).length === 0) {
      return { success: false, message: '未拥有该称号' };
    }

    const targetName = asNonEmptyString(targetDef.name) ?? tid;
    const nextEffects = normalizeTitleEffects(targetDef.effects);

    const currentRes = await query(
      `
        SELECT title_id
        FROM character_title
        WHERE character_id = $1
          AND is_equipped = true
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
        FOR UPDATE
      `,
      [cid],
    );

    const currentRow = (currentRes.rows?.[0] ?? null) as Record<string, unknown> | null;
    const currentTitleId = currentRow ? asNonEmptyString(currentRow.title_id) : null;
    const currentDef = currentTitleId ? await getTitleDefinitionById(currentTitleId) : null;
    const currentEffects = currentDef ? normalizeTitleEffects(currentDef.effects) : {};

    if (currentTitleId === tid) {
      return { success: true, message: 'ok' };
    }

    const delta = this.computeEffectDelta(currentEffects, nextEffects);

    await query(
      `
        UPDATE character_title
        SET is_equipped = false,
            updated_at = NOW()
        WHERE character_id = $1
          AND is_equipped = true
      `,
      [cid],
    );

    await query(
      `
        UPDATE character_title
        SET is_equipped = true,
            updated_at = NOW()
        WHERE character_id = $1
          AND title_id = $2
      `,
      [cid, tid],
    );

    await this.updateCharacterAttrsWithDeltaTx(cid, targetName, delta);
    await refreshCharacterBattleStateAfterTitleMutation(cid);
    return { success: true, message: 'ok' };
  }
}

export const titleService = new TitleService();

// 向后兼容的命名导出
export const getTitleList = titleService.getTitleList.bind(titleService);
export const equipTitle = titleService.equipTitle.bind(titleService);
