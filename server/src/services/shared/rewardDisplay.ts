/**
 * 奖励展示元数据工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中把奖励里的物品定义 ID 解析成统一的展示名称与图标，避免任务、主线、战令各自重复查定义。
 * 2. 做什么：为奖励 DTO 提供单一展示数据源，减少前端收到英文 ID 后再各处兜底的分叉。
 * 3. 不做什么：不负责发奖、不写数据库，也不处理功法/伙伴等非物品奖励类型。
 *
 * 输入/输出：
 * - 输入：单个或多个 `itemDefId`。
 * - 输出：可直接挂到奖励 DTO 上的 `{ name, icon }` 展示元数据。
 *
 * 数据流/状态流：
 * 奖励配置/结算结果 -> 本工具解析静态物品定义 -> 任务/主线/战令服务组装展示 DTO -> 前端统一渲染。
 *
 * 关键边界条件与坑点：
 * 1. 物品定义缺失时必须退化为原始 ID，避免调用方再各自补“找不到名称就显示 ID”的重复逻辑。
 * 2. 这里只读静态配置，不做异步查询；因此适合在奖励组装链路高频复用，不能混入任何事务副作用。
 */
import { getItemDefinitionById, getItemDefinitionsByIds } from '../staticConfigLoader.js';

export type RewardItemDisplayMeta = {
  name: string;
  icon: string | null;
};

const normalizeItemDefId = (itemDefId: string): string => String(itemDefId || '').trim();

const normalizeItemIcon = (icon: unknown): string | null => {
  const normalized = typeof icon === 'string' ? icon.trim() : '';
  return normalized || null;
};

export const resolveRewardItemDisplayMeta = (itemDefId: string): RewardItemDisplayMeta => {
  const normalizedId = normalizeItemDefId(itemDefId);
  if (!normalizedId) {
    return { name: '', icon: null };
  }

  const itemDef = getItemDefinitionById(normalizedId);
  const name = typeof itemDef?.name === 'string' ? itemDef.name.trim() : '';
  return {
    name: name || normalizedId,
    icon: normalizeItemIcon(itemDef?.icon),
  };
};

export const resolveRewardItemDisplayMetaMap = (
  itemDefIds: Iterable<string>,
): Map<string, RewardItemDisplayMeta> => {
  const normalizedIds = Array.from(
    new Set(
      Array.from(itemDefIds)
        .map((itemDefId) => normalizeItemDefId(itemDefId))
        .filter((itemDefId) => itemDefId.length > 0),
    ),
  );

  const out = new Map<string, RewardItemDisplayMeta>();
  if (normalizedIds.length === 0) return out;

  const defs = getItemDefinitionsByIds(normalizedIds);
  for (const itemDefId of normalizedIds) {
    const itemDef = defs.get(itemDefId);
    const name = typeof itemDef?.name === 'string' ? itemDef.name.trim() : '';
    out.set(itemDefId, {
      name: name || itemDefId,
      icon: normalizeItemIcon(itemDef?.icon),
    });
  }
  return out;
};

export const getRewardCurrencyDisplayName = (
  currency: 'silver' | 'spirit_stones',
): string => {
  return currency === 'silver' ? '银两' : '灵石';
};
