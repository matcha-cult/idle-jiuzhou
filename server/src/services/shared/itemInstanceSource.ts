/**
 * 物品实例来源字段规范工具
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一规范 `item_instance.obtained_from` 的默认值与基础格式，避免各服务重复写来源归一化逻辑。
 * - 不做什么：不负责拼接来源语义，不负责数据库写入，不负责长度拦截。
 *
 * 输入/输出：
 * - 输入：上游传入的来源字符串（`unknown`），来源可为空或未定义。
 * - 输出：`{ success: true, value }`，调用方直接写入数据库。
 *
 * 数据流/状态流：
 * - 业务层在入库前调用本工具，拿到规范化来源值。
 * - 校验通过后写入 `item_instance.obtained_from`。
 * - 字段长度越界由数据库约束抛错，业务层不在这里提前拦截。
 *
 * 关键边界条件与坑点：
 * 1) 允许空来源：空字符串会被规范为 `system`，保持历史业务语义一致。
 * 2) 禁止静默截断：不做自动裁剪，避免来源追踪信息被悄悄破坏。
 */

type NormalizeItemInstanceSourceResult = { success: true; value: string };

export const normalizeItemInstanceObtainedFrom = (
  obtainedFromRaw: unknown,
): NormalizeItemInstanceSourceResult => {
  const source =
    typeof obtainedFromRaw === 'string' ? obtainedFromRaw.trim() : '';
  const resolved = source || 'system';

  return { success: true, value: resolved };
};
