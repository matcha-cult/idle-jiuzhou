/**
 * 境界序列与归一化规则（服务端共享）
 *
 * 输入：
 * - realmRaw/subRealmRaw：角色境界主阶段与小阶段（可能为空、可能是全称、主阶段或小阶段）
 *
 * 输出：
 * - REALM_ORDER：统一境界顺序
 * - normalizeRealmKeepingUnknown：尽量标准化；无法识别时保留原始主阶段文本
 * - normalizeRealmStrict：只返回受支持境界，无法识别回退“凡人”
 * - getRealmOrderIndex/getRealmRankZeroBased/getRealmRankOneBasedStrict：统一排名计算
 *
 * 注意：
 * - 不同业务对“未知境界”处理不同：有的需要 -1，有的需要回退 0 或 1。
 * - 这里提供多种 rank 函数，由调用方按语义选择，避免隐式行为变化。
 */
export const REALM_ORDER = [
  '凡人',
  '炼精化炁·养气期',
  '炼精化炁·通脉期',
  '炼精化炁·凝炁期',
  '炼炁化神·炼己期',
  '炼炁化神·采药期',
  '炼炁化神·结胎期',
  '炼神返虚·养神期',
  '炼神返虚·还虚期',
  '炼神返虚·合道期',
  '炼虚合道·证道期',
  '炼虚合道·历劫期',
  '炼虚合道·成圣期',
] as const;

export type RealmName = (typeof REALM_ORDER)[number];

export const REALM_MAJOR_TO_FIRST: Record<string, RealmName> = {
  凡人: '凡人',
  炼精化炁: '炼精化炁·养气期',
  炼炁化神: '炼炁化神·炼己期',
  炼神返虚: '炼神返虚·养神期',
  炼虚合道: '炼虚合道·证道期',
};

export const REALM_SUB_TO_FULL: Record<string, RealmName> = {
  养气期: '炼精化炁·养气期',
  通脉期: '炼精化炁·通脉期',
  凝炁期: '炼精化炁·凝炁期',
  炼己期: '炼炁化神·炼己期',
  采药期: '炼炁化神·采药期',
  结胎期: '炼炁化神·结胎期',
  养神期: '炼神返虚·养神期',
  还虚期: '炼神返虚·还虚期',
  合道期: '炼神返虚·合道期',
  证道期: '炼虚合道·证道期',
  历劫期: '炼虚合道·历劫期',
  成圣期: '炼虚合道·成圣期',
};

const toTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const isRealmName = (value: string): value is RealmName => {
  return (REALM_ORDER as readonly string[]).includes(value);
};

export const normalizeRealmKeepingUnknown = (realmRaw: unknown, subRealmRaw?: unknown): string => {
  const realm = toTrimmedString(realmRaw);
  const subRealm = toTrimmedString(subRealmRaw);
  if (!realm && !subRealm) return '凡人';
  if (realm && isRealmName(realm)) return realm;
  if (realm && subRealm) {
    const full = `${realm}·${subRealm}`;
    if (isRealmName(full)) return full;
  }
  if (realm && REALM_MAJOR_TO_FIRST[realm]) return REALM_MAJOR_TO_FIRST[realm];
  if (realm && REALM_SUB_TO_FULL[realm]) return REALM_SUB_TO_FULL[realm];
  if (!realm && subRealm && REALM_SUB_TO_FULL[subRealm]) return REALM_SUB_TO_FULL[subRealm];
  return realm || '凡人';
};

export const normalizeRealmStrict = (realmRaw: unknown, subRealmRaw?: unknown): RealmName => {
  const normalized = normalizeRealmKeepingUnknown(realmRaw, subRealmRaw);
  if (isRealmName(normalized)) return normalized;
  return '凡人';
};

export const getRealmOrderIndex = (realmRaw: unknown, subRealmRaw?: unknown): number => {
  const normalized = normalizeRealmKeepingUnknown(realmRaw, subRealmRaw);
  return REALM_ORDER.indexOf(normalized as RealmName);
};

export const getRealmRankZeroBased = (realmRaw: unknown, subRealmRaw?: unknown): number => {
  const index = getRealmOrderIndex(realmRaw, subRealmRaw);
  return index >= 0 ? index : 0;
};

export const getRealmRankOneBasedStrict = (realmRaw: unknown, subRealmRaw?: unknown): number => {
  const normalized = normalizeRealmStrict(realmRaw, subRealmRaw);
  const index = REALM_ORDER.indexOf(normalized);
  return index >= 0 ? index + 1 : 1;
};
