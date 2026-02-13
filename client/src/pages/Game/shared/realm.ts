/**
 * 游戏端境界共享常量与工具
 *
 * 输入：
 * - realm/subRealm：可能是完整境界、主阶段、子阶段，或空字符串
 *
 * 输出：
 * - REALM_ORDER：统一境界顺序
 * - normalizeRealmWithAlias：按主阶段/子阶段映射到完整境界（无法识别时保留输入）
 * - getRealmRankFromLiteral：仅按字面匹配计算排名（未知回退 0）
 * - getRealmRankFromAlias：按别名映射后计算排名（未知回退 0）
 * - getEquipRealmRankForReroll：装备词条洗炼使用的 1-based 境界档位
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

export const normalizeRealmText = (value: unknown): string => {
  const text = toTrimmedString(value);
  return text || '凡人';
};

export const normalizeRealmWithAlias = (realmRaw: unknown, subRealmRaw?: unknown): string => {
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

export const getRealmRankFromLiteral = (realmRaw: unknown): number => {
  const index = REALM_ORDER.indexOf(normalizeRealmText(realmRaw) as RealmName);
  return index >= 0 ? index : 0;
};

export const getRealmRankFromAlias = (realmRaw: unknown, subRealmRaw?: unknown): number => {
  const index = REALM_ORDER.indexOf(normalizeRealmWithAlias(realmRaw, subRealmRaw) as RealmName);
  return index >= 0 ? index : 0;
};

export const getEquipRealmRankForReroll = (realmRaw: unknown): number => {
  const normalized = normalizeRealmWithAlias(realmRaw);
  const index = REALM_ORDER.indexOf(normalized as RealmName);
  return index >= 0 ? index + 1 : 1;
};
