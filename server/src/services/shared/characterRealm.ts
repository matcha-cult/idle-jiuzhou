/**
 * 角色境界快照读取工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中读取角色当前 `realm/sub_realm` 快照，供只读解锁判定类场景复用。
 * 2. 做什么：把“读取境界但不锁角色行”的约束收口到单一入口，避免各服务再次写出 `FOR UPDATE` 版本。
 * 3. 不做什么：不负责角色存在性提示文案，也不处理境界规则换算。
 *
 * 输入/输出：
 * - 输入：characterId。
 * - 输出：角色境界快照 `{ realm, subRealm }`，若角色不存在则返回 `null`。
 *
 * 数据流/状态流：
 * 服务层传入角色 ID -> 本模块读取 `characters.realm/sub_realm` -> 调用方再交给各自的解锁规则模块。
 *
 * 关键边界条件与坑点：
 * 1. 这里只提供只读快照，不能用于依赖角色行锁的一致性写事务。
 * 2. `sub_realm` 允许为空字符串或空值，返回时统一收敛为 `null`，避免调用方重复 trim 判空。
 */
import { query } from '../../config/database.js';

export type CharacterRealmSnapshot = {
  realm: string;
  subRealm: string | null;
};

export const loadCharacterRealmSnapshot = async (
  characterId: number,
): Promise<CharacterRealmSnapshot | null> => {
  const characterRes = await query(
    `
      SELECT realm, sub_realm
      FROM characters
      WHERE id = $1
      LIMIT 1
    `,
    [characterId],
  );
  if (characterRes.rows.length === 0) {
    return null;
  }

  const row = characterRes.rows[0] as { realm?: string | null; sub_realm?: string | null };
  const realm = typeof row.realm === 'string' ? row.realm.trim() : '';
  const subRealm =
    typeof row.sub_realm === 'string' && row.sub_realm.trim()
      ? row.sub_realm.trim()
      : null;

  return {
    realm,
    subRealm,
  };
};
