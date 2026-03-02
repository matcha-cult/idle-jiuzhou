/**
 * 通用类型强制转换工具
 *
 * 作用：将 unknown 类型安全地转换为具体类型，用于解析 JSON 配置、数据库返回值等场景。
 * 输入：unknown 值 + 可选默认值。
 * 输出：类型安全的目标值。
 *
 * 复用点：dungeon、mainQuest、以及任何需要安全解析动态数据的模块。
 *
 * 边界条件：
 * 1) 所有函数都是纯函数，无副作用。
 * 2) 转换失败时返回默认值而非抛异常，调用方需自行校验业务合法性。
 */

/** unknown -> string（默认空字符串） */
export const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

/** unknown -> number（带 fallback） */
export const asNumber = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** unknown -> T[]（若非数组返回空数组） */
export const asArray = <T = unknown>(v: unknown): T[] =>
  Array.isArray(v) ? (v as T[]) : [];

/** unknown -> object（排除 null 和数组） */
export const asObject = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** unknown -> string[]（去重、trim、过滤空串） */
export const asStringArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const s = typeof item === 'string' ? item.trim() : '';
    if (s && !seen.has(s)) {
      seen.add(s);
      result.push(s);
    }
  }
  return result;
};
