/**
 * 装备解绑服务
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：集中处理“将某件已绑定装备恢复为未绑定”的校验与数据库更新。
 * - 不做什么：不负责消耗解绑道具，不处理背包刷新推送，不参与穿戴/卸下流程。
 *
 * 输入/输出：
 * - 输入：角色 ID、目标装备实例 ID，可注入的 queryRunner 与静态物品定义解析函数。
 * - 输出：解绑结果（成功/失败、提示文案、目标实例 ID）。
 *
 * 数据流/状态流：
 * - 查询目标实例并加锁 -> 校验装备类型/锁定状态/绑定状态 -> 更新绑定字段为 none/NULL。
 *
 * 关键边界条件与坑点：
 * 1) `bind_type` 只要不是 `none` 都视为“已绑定”，避免未来新增绑定类型时漏判。
 * 2) 目标装备被锁定时必须拒绝解绑，保持背包锁与使用道具语义一致。
 * 3) 自定义 `queryRunner` 分支只允许复用外层事务中的校验锁定；真正写入仍统一走 shared mutation service，且调用方必须已先持有角色背包互斥锁。
 */
import { hasUsableTransactionContext, query } from '../../config/database.js';
import { normalizeItemBindType } from '../shared/itemBindType.js';
import { getStaticItemDef } from './shared/helpers.js';
import {
  applyCharacterItemInstanceMutationsImmediately,
  bufferCharacterItemInstanceMutations,
  loadProjectedCharacterItemInstanceById,
} from '../shared/characterItemInstanceMutationService.js';

type QueryResultLike = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
};

type StaticItemDefLike = {
  category?: unknown;
} | null;

export type EquipmentUnbindQueryRunner = (
  sql: string,
  params: unknown[],
) => Promise<QueryResultLike>;

type EquipmentUnbindParams = {
  characterId: number;
  itemInstanceId: number;
  queryRunner?: EquipmentUnbindQueryRunner;
  resolveItemDef?: (itemDefId: string) => StaticItemDefLike;
};

type EquipmentUnbindResult = {
  success: boolean;
  message: string;
  itemInstanceId?: number;
};

export const unbindEquipmentBindingByInstanceId = async ({
  characterId,
  itemInstanceId,
  queryRunner = query,
  resolveItemDef = getStaticItemDef,
}: EquipmentUnbindParams): Promise<EquipmentUnbindResult> => {
  if (queryRunner === query && resolveItemDef === getStaticItemDef) {
    const targetRow = await loadProjectedCharacterItemInstanceById(characterId, itemInstanceId);
    if (!targetRow) {
      return { success: false, message: '目标装备不存在' };
    }

    const itemDefId = typeof targetRow.item_def_id === 'string' ? targetRow.item_def_id.trim() : '';
    if (!itemDefId) {
      return { success: false, message: '目标装备数据异常' };
    }

    const itemDef = resolveItemDef(itemDefId);
    if (!itemDef || String(itemDef.category || '').trim() !== 'equipment') {
      return { success: false, message: '目标物品不是装备' };
    }

    if (Boolean(targetRow.locked)) {
      return { success: false, message: '目标装备已锁定' };
    }

    if (normalizeItemBindType(targetRow.bind_type) === 'none') {
      return { success: false, message: '目标装备尚未绑定' };
    }

    await bufferCharacterItemInstanceMutations([
      {
        opId: `equipment-unbind:${itemInstanceId}:${Date.now()}`,
        characterId,
        itemId: itemInstanceId,
        createdAt: Date.now(),
        kind: 'upsert',
        snapshot: {
          ...targetRow,
          bind_type: 'none',
          bind_owner_user_id: null,
          bind_owner_character_id: null,
        },
      },
    ]);

    return {
      success: true,
      message: '解绑成功',
      itemInstanceId,
    };
  }

  const targetResult = await queryRunner(
    `
      SELECT id, item_def_id, bind_type, locked
      FROM item_instance
      WHERE id = $1 AND owner_character_id = $2
      FOR UPDATE
    `,
    [itemInstanceId, characterId],
  );

  if (targetResult.rows.length <= 0) {
    return { success: false, message: '目标装备不存在' };
  }

  const targetRow = targetResult.rows[0];
  const itemDefId = typeof targetRow?.item_def_id === 'string' ? targetRow.item_def_id.trim() : '';
  if (!itemDefId) {
    return { success: false, message: '目标装备数据异常' };
  }

  const itemDef = resolveItemDef(itemDefId);
  if (!itemDef || String(itemDef.category || '').trim() !== 'equipment') {
    return { success: false, message: '目标物品不是装备' };
  }

  if (Boolean(targetRow?.locked)) {
    return { success: false, message: '目标装备已锁定' };
  }

  if (
    normalizeItemBindType(
      typeof targetRow?.bind_type === 'string' ? targetRow.bind_type : null,
    ) === 'none'
  ) {
    return { success: false, message: '目标装备尚未绑定' };
  }

  if (!hasUsableTransactionContext()) {
    return { success: false, message: '自定义事务解绑必须在事务上下文中执行' };
  }

  const latestItem = await loadProjectedCharacterItemInstanceById(characterId, itemInstanceId);
  if (!latestItem) {
    return { success: false, message: '目标装备不存在' };
  }

  await applyCharacterItemInstanceMutationsImmediately([
    {
      opId: `equipment-unbind-direct:${itemInstanceId}:${Date.now()}`,
      characterId,
      itemId: itemInstanceId,
      createdAt: Date.now(),
      kind: 'upsert',
      snapshot: {
        ...latestItem,
        bind_type: 'none',
        bind_owner_user_id: null,
        bind_owner_character_id: null,
      },
    },
  ]);

  return {
    success: true,
    message: '解绑成功',
    itemInstanceId,
  };
};
