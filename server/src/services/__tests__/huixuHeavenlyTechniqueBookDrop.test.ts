/**
 * 还虚天台天级功法书掉落测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：锁定还虚天台最终 BOSS「归墟领主」必须承接两本缺失掉落源的天级功法书。
 * - 做什么：验证这两本功法书定义与 BOSS 掉落池配置保持同一条数据链路，避免再次出现“功法已定义但没有实际掉落源”。
 * - 不做什么：不执行真实战斗、不验证随机掉率结算过程，也不覆盖其他秘境或其他品质功法书。
 *
 * 输入/输出：
 * - 输入：还虚天台秘境种子、怪物种子、掉落池种子、物品种子。
 * - 输出：断言目标 BOSS、目标掉落池以及两本天级功法书条目都存在。
 *
 * 数据流/状态流：
 * - 先从还虚天台种子读取最终波次 BOSS；
 * - 再从 monster_def.json 解析该 BOSS 的唯一掉落池；
 * - 最后同时校验 item_def.json 中的功法书定义与 drop_pool.json 中的掉落条目。
 *
 * 关键边界条件与坑点：
 * 1) 本需求只要求补到最终 BOSS 掉落池，因此测试必须锁定最后一波首领，不能把普通怪或精英怪混进断言范围。
 * 2) 掉落源缺失既可能是“没有物品定义”，也可能是“物品存在但没进掉落池”；测试要同时覆盖这两层，避免只修一半。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { asArray, asObject, asText, buildObjectMap, loadSeed } from './seedTestUtils.js';

const HUIXU_DUNGEON_FILE = 'dungeon_qi_cultivation_13.json';
const HUIXU_FINAL_BOSS_ID = 'monster-boss-huanxu-guixu-lord';
const HUIXU_FINAL_BOSS_DROP_POOL_ID = 'dp-huanxu-boss-guixu-lord';
const REQUIRED_BOOK_IDS = ['book-taixu-shiwen-jue', 'book-zhenhun-guiyuan-jing'] as const;

const collectHuixuFinalWaveBossIds = (): string[] => {
  const dungeonSeed = loadSeed(HUIXU_DUNGEON_FILE);
  const bossIds = new Set<string>();

  for (const dungeonEntry of asArray(dungeonSeed.dungeons)) {
    const dungeon = asObject(dungeonEntry);
    for (const difficultyEntry of asArray(dungeon?.difficulties)) {
      const difficulty = asObject(difficultyEntry);
      const stages = asArray(difficulty?.stages);
      const lastStage = asObject(stages.at(-1));
      const waves = asArray(lastStage?.waves);
      const lastWave = asObject(waves.at(-1));
      for (const monsterEntry of asArray(lastWave?.monsters)) {
        const monster = asObject(monsterEntry);
        const monsterDefId = asText(monster?.monster_def_id);
        if (monsterDefId.startsWith('monster-boss-')) {
          bossIds.add(monsterDefId);
        }
      }
    }
  }

  return Array.from(bossIds).sort();
};

test('还虚天台最终 BOSS 应掉落两本天级功法书', () => {
  const finalWaveBossIds = collectHuixuFinalWaveBossIds();
  assert.deepEqual(finalWaveBossIds, [HUIXU_FINAL_BOSS_ID]);

  const itemSeed = loadSeed('item_def.json');
  const monsterSeed = loadSeed('monster_def.json');
  const dropPoolSeed = loadSeed('drop_pool.json');
  const itemById = buildObjectMap(asArray(itemSeed.items), 'id');
  const monsterById = buildObjectMap(asArray(monsterSeed.monsters), 'id');
  const dropPoolById = buildObjectMap(asArray(dropPoolSeed.pools), 'id');

  for (const itemId of REQUIRED_BOOK_IDS) {
    assert.ok(itemById.get(itemId), `item_def.json 缺少功法书定义: ${itemId}`);
  }

  const bossDef = monsterById.get(HUIXU_FINAL_BOSS_ID);
  assert.ok(bossDef, `monster_def.json 缺少怪物定义: ${HUIXU_FINAL_BOSS_ID}`);

  const dropPoolId = asText(bossDef?.drop_pool_id);
  assert.equal(dropPoolId, HUIXU_FINAL_BOSS_DROP_POOL_ID);

  const dropPool = dropPoolById.get(dropPoolId);
  assert.ok(dropPool, `drop_pool.json 缺少掉落池定义: ${dropPoolId}`);

  for (const itemId of REQUIRED_BOOK_IDS) {
    const dropEntry = asArray(dropPool?.entries).find((entry) => asText(asObject(entry)?.item_def_id) === itemId);
    assert.ok(dropEntry, `${dropPoolId} 缺少功法书掉落条目: ${itemId}`);
  }
});
