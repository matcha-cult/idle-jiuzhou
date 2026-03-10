/**
 * 洞府研修解锁规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护洞府研修的境界解锁门槛，并提供统一的“是否已解锁”纯函数，供状态接口与创建任务校验复用。
 * 2. 做什么：把“当前角色境界 -> 解锁态”收敛成单一数据出口，避免服务层不同入口各自手写境界比较。
 * 3. 不做什么：不查询数据库、不处理冷却、不处理功法残页扣除。
 *
 * 输入/输出：
 * - 输入：角色当前境界 `realm` 与小境界 `subRealm`。
 * - 输出：固定解锁境界 `unlockRealm` 与布尔值 `unlocked`。
 *
 * 数据流/状态流：
 * characters.realm / characters.sub_realm -> buildTechniqueResearchUnlockState -> 研修状态接口 / 创建任务前校验。
 *
 * 关键边界条件与坑点：
 * 1. 主境界与小境界可能分列存储，也可能只传全称，必须复用统一境界归一化规则，不能在业务层手写字符串拼接。
 * 2. 未识别境界会按 `realmRules` 的保守口径回退到最低档，确保不会把非法文本误判成已解锁。
 */
import {
  getRealmRankZeroBased,
  type RealmName,
} from './realmRules.js';

export const TECHNIQUE_RESEARCH_UNLOCK_REALM: RealmName = '炼炁化神·结胎期';

export type TechniqueResearchUnlockState = {
  unlockRealm: RealmName;
  unlocked: boolean;
};

export const buildTechniqueResearchUnlockState = (
  realm: string,
  subRealm: string | null,
): TechniqueResearchUnlockState => {
  return {
    unlockRealm: TECHNIQUE_RESEARCH_UNLOCK_REALM,
    unlocked:
      getRealmRankZeroBased(realm, subRealm ?? undefined)
      >= getRealmRankZeroBased(TECHNIQUE_RESEARCH_UNLOCK_REALM),
  };
};
