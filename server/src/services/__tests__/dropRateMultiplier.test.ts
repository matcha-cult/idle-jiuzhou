/**
 * 通用掉落池倍率排除规则测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：验证秘境 BOSS 解绑道具公共池不会再吃通用掉落倍率，保证展示与结算都回到配置原值。
 * - 不做什么：不覆盖完整战斗掉落实例，也不验证福缘、境界压制等其他倍率链路。
 *
 * 输入/输出：
 * - 输入：公共池来源类型、公共池 ID、秘境 BOSS 场景下的基础概率/数量。
 * - 输出：倍率工具返回的仍应是原始概率与原始数量。
 *
 * 数据流/状态流：
 * - 测试直接调用共享倍率工具；
 * - 共享倍率工具被战斗结算与 UI 预览共同复用；
 * - 因此该测试同时约束这两条链路对解绑符的倍率口径。
 *
 * 关键边界条件与坑点：
 * 1. 这里只验证被排除的公共池，不影响其他公共池继续按秘境/BOSS规则放大。
 * 2. 该测试关注“倍率是否生效”，不关注掉落池本身是否已挂到所有秘境 BOSS 上，那部分已有独立测试覆盖。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { getAdjustedChance, getAdjustedQuantity } from '../shared/dropRateMultiplier.js';

test('秘境 BOSS 解绑道具公共池不应放大概率与数量', () => {
  const options = { isDungeonBattle: true, monsterKind: 'boss' as const };

  assert.equal(
    getAdjustedChance(0.005, 'common', 'dp-common-dungeon-boss-unbind', options),
    0.005,
  );
  assert.equal(
    getAdjustedQuantity(1, 'common', 'dp-common-dungeon-boss-unbind', options, true),
    1,
  );
});

test('其他未排除公共池仍应按秘境 BOSS 规则放大', () => {
  const options = { isDungeonBattle: true, monsterKind: 'boss' as const };

  assert.equal(getAdjustedChance(0.005, 'common', 'dp-common-monster-global', options), 0.03);
  assert.equal(getAdjustedQuantity(1, 'common', 'dp-common-monster-global', options, true), 6);
});
