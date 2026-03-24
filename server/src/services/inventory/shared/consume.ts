/**
 * 物品/货币消耗操作模块
 *
 * 作用：提供按物品定义 ID 消耗材料、按实例 ID 消耗道具、消耗/增加角色货币等原子操作。
 *       所有函数通过 `query()` 自动走事务连接，无需传入 client。
 *
 * 输入/输出：
 * - consumeMaterialByDefId(characterId, materialItemDefId, qty) — 按定义 ID 扣除材料
 * - consumeSpecificItemInstance(characterId, itemInstanceId, qty) — 按实例 ID 扣除道具
 * - consumeCharacterCurrencies(characterId, costs) — 扣除角色货币（银两/灵石）
 * - addCharacterCurrencies(characterId, gains) — 增加角色货币
 *
 * 被引用方：equipment.ts（强化/精炼/洗炼消耗）、socket.ts（镶嵌消耗）、
 *           disassemble.ts（拆解奖励增加货币）、bag.ts（如需）
 *
 * 数据流：
 * - 物品扣除：查询 item_instance 表并锁定目标行 → 校验数量 → 执行扣除
 * - 货币变更：对 characters 执行条件 UPDATE/RETURNING → 仅在失败时补查只读快照区分“不存在”和“余额不足”
 *
 * 边界条件：
 * 1. consumeMaterialByDefId 优先消耗未锁定、数量最多的堆叠行，全部锁定时报"材料已锁定"
 * 2. consumeCharacterCurrencies / addCharacterCurrencies 不再先 `FOR UPDATE characters`，避免在已持有背包锁的事务里额外拉长角色行锁等待
 */
import { query } from "../../../config/database.js";
import { clampInt } from "./helpers.js";

/**
 * 按物品定义 ID 消耗指定数量的材料
 * 从 bag/warehouse 位置的未锁定行中按数量降序扣除
 */
export const consumeMaterialByDefId = async (
  characterId: number,
  materialItemDefId: string,
  qty: number,
): Promise<{ success: boolean; message: string }> => {
  const need = clampInt(qty, 1, 999999);
  const rowResult = await query(
    `
      SELECT id, qty, locked
      FROM item_instance
      WHERE owner_character_id = $1
        AND item_def_id = $2
        AND location IN ('bag', 'warehouse')
      ORDER BY qty DESC, id ASC
      FOR UPDATE
    `,
    [characterId, materialItemDefId],
  );

  if (rowResult.rows.length === 0) {
    return { success: false, message: "材料不足" };
  }

  const rows = rowResult.rows as Array<{
    id: number;
    qty: number;
    locked: boolean;
  }>;
  const unlockedRows = rows.filter(
    (row) => !row.locked && (Number(row.qty) || 0) > 0,
  );
  const unlockedTotal = unlockedRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.qty) || 0),
    0,
  );

  if (unlockedTotal < need) {
    if (unlockedTotal <= 0 && rows.some((row) => row.locked)) {
      return { success: false, message: "材料已锁定" };
    }
    return { success: false, message: "材料不足" };
  }

  let remaining = need;
  for (const row of unlockedRows) {
    if (remaining <= 0) break;
    const rowQty = Math.max(0, Number(row.qty) || 0);
    if (rowQty <= 0) continue;

    const consume = Math.min(rowQty, remaining);
    if (consume >= rowQty) {
      await query("DELETE FROM item_instance WHERE id = $1", [row.id]);
    } else {
      await query(
        "UPDATE item_instance SET qty = qty - $1, updated_at = NOW() WHERE id = $2",
        [consume, row.id],
      );
    }
    remaining -= consume;
  }

  return { success: true, message: "扣除成功" };
};

/**
 * 按物品实例 ID 消耗指定数量的道具
 * 仅允许消耗 bag/warehouse 位置的未锁定物品
 */
export const consumeSpecificItemInstance = async (
  characterId: number,
  itemInstanceId: number,
  qty: number,
): Promise<{ success: boolean; message: string; itemDefId?: string }> => {
  const need = clampInt(qty, 1, 999999);
  const result = await query(
    `
      SELECT id, item_def_id, qty, locked, location
      FROM item_instance
      WHERE id = $1 AND owner_character_id = $2
      FOR UPDATE
      LIMIT 1
    `,
    [itemInstanceId, characterId],
  );

  if (result.rows.length === 0)
    return { success: false, message: "道具不存在" };

  const row = result.rows[0] as {
    id: number;
    item_def_id: string;
    qty: number;
    locked: boolean;
    location: string;
  };
  if (row.locked) return { success: false, message: "道具已锁定" };
  if (!["bag", "warehouse"].includes(String(row.location))) {
    return { success: false, message: "道具当前位置不可消耗" };
  }
  if ((Number(row.qty) || 0) < need)
    return { success: false, message: "道具数量不足" };

  if ((Number(row.qty) || 0) === need) {
    await query("DELETE FROM item_instance WHERE id = $1", [row.id]);
  } else {
    await query(
      "UPDATE item_instance SET qty = qty - $1, updated_at = NOW() WHERE id = $2",
      [need, row.id],
    );
  }
  return {
    success: true,
    message: "扣除成功",
    itemDefId: String(row.item_def_id),
  };
};

/**
 * 扣除角色货币（银两、灵石）
 * 两者均为 0 时直接返回成功
 */
export const consumeCharacterCurrencies = async (
  characterId: number,
  costs: { silver?: number; spiritStones?: number },
): Promise<{ success: boolean; message: string }> => {
  const silverCost = Math.max(0, Math.floor(Number(costs.silver) || 0));
  const spiritCost = Math.max(0, Math.floor(Number(costs.spiritStones) || 0));
  if (silverCost <= 0 && spiritCost <= 0)
    return { success: true, message: "无需扣除货币" };

  const updatedResult = await query(
    `
      UPDATE characters
      SET silver = silver - $2,
          spirit_stones = spirit_stones - $3,
          updated_at = NOW()
      WHERE id = $1
        AND silver >= $2
        AND spirit_stones >= $3
      RETURNING silver, spirit_stones
    `,
    [characterId, silverCost, spiritCost],
  );
  if (updatedResult.rows.length > 0) {
    return { success: true, message: "扣除成功" };
  }

  const charResult = await query(
    `SELECT silver, spirit_stones FROM characters WHERE id = $1 LIMIT 1`,
    [characterId],
  );
  if (charResult.rows.length === 0) {
    return { success: false, message: "角色不存在" };
  }

  const curSilver = Number(charResult.rows[0].silver ?? 0) || 0;
  const curSpirit = Number(charResult.rows[0].spirit_stones ?? 0) || 0;
  if (curSilver < silverCost) {
    return { success: false, message: `银两不足，需要${silverCost}` };
  }
  if (curSpirit < spiritCost) {
    return { success: false, message: `灵石不足，需要${spiritCost}` };
  }

  return { success: false, message: "角色货币已变化，请重试" };
};

/**
 * 增加角色货币（银两、灵石）
 * 两者均为 0 时直接返回成功
 */
export const addCharacterCurrencies = async (
  characterId: number,
  gains: { silver?: number; spiritStones?: number },
): Promise<{ success: boolean; message: string }> => {
  const silverGain = Math.max(0, Math.floor(Number(gains.silver) || 0));
  const spiritGain = Math.max(0, Math.floor(Number(gains.spiritStones) || 0));
  if (silverGain <= 0 && spiritGain <= 0)
    return { success: true, message: "无需增加货币" };

  const updatedResult = await query(
    `
      UPDATE characters
      SET silver = silver + $2,
          spirit_stones = spirit_stones + $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [characterId, silverGain, spiritGain],
  );
  if (updatedResult.rows.length === 0) {
    return { success: false, message: "角色不存在" };
  }
  return { success: true, message: "增加成功" };
};
