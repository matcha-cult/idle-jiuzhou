/**
 * 秘境 BOSS 解绑道具掉落配置测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：验证所有秘境 BOSS 对应掉落池都包含解绑道具条目，避免只改部分配置。
 * - 不做什么：不验证真实战斗掉落概率结算，仅检查静态种子引用关系。
 *
 * 输入/输出：
 * - 输入：dungeon / monster / drop_pool 三类种子数据。
 * - 输出：秘境 BOSS 掉落池是否含有指定解绑道具。
 *
 * 数据流/状态流：
 * - 先从秘境种子提取 BOSS monster_def_id；
 * - 再读取 monster_def.json 找到对应 drop_pool_id；
 * - 最后断言 drop_pool.json 的对应 entries 含解绑道具。
 *
 * 关键边界条件与坑点：
 * 1) 只检查“秘境内 BOSS”，不把世界 BOSS 或普通怪误算进来。
 * 2) 直接按静态配置做全量断言，避免后续新增秘境时漏配解绑道具。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SEED_DIR = path.resolve(import.meta.dirname, '../../data/seeds');
const EQUIPMENT_UNBIND_ITEM_DEF_ID = 'scroll-jie-fu-fu';

type JsonRecord = Record<string, unknown>;

const readSeed = <T>(fileName: string): T => {
  const raw = fs.readFileSync(path.join(SEED_DIR, fileName), 'utf8');
  return JSON.parse(raw) as T;
};

const collectDungeonBossMonsterIds = (): string[] => {
  const fileNames = fs
    .readdirSync(SEED_DIR)
    .filter((fileName) => /^dungeon_.*\.json$/.test(fileName));

  const bossMonsterIds = new Set<string>();
  for (const fileName of fileNames) {
    const raw = fs.readFileSync(path.join(SEED_DIR, fileName), 'utf8');
    const monsterDefIdMatches = raw.matchAll(/"monster_def_id"\s*:\s*"([^"]+)"/g);
    for (const match of monsterDefIdMatches) {
      const monsterDefId = match[1]?.trim();
      if (!monsterDefId?.startsWith('monster-boss-')) continue;
      bossMonsterIds.add(monsterDefId);
    }
  }

  return Array.from(bossMonsterIds).sort();
};

test('所有秘境 BOSS 掉落池都应包含解绑道具', () => {
  const monsterSeed = readSeed<{ monsters?: JsonRecord[] }>('monster_def.json');
  const dropPoolSeed = readSeed<{ pools?: JsonRecord[] }>('drop_pool.json');
  const commonDropPoolSeed = readSeed<{ pools?: JsonRecord[] }>('drop_pool_common.json');
  const monsterById = new Map(
    (monsterSeed.monsters ?? [])
      .map((monster) => [String(monster.id || '').trim(), monster] as const)
      .filter(([monsterId]) => monsterId.length > 0),
  );
  const dropPoolById = new Map(
    (dropPoolSeed.pools ?? [])
      .map((pool) => [String(pool.id || '').trim(), pool] as const)
      .filter(([poolId]) => poolId.length > 0),
  );
  const commonDropPoolById = new Map(
    (commonDropPoolSeed.pools ?? [])
      .map((pool) => [String(pool.id || '').trim(), pool] as const)
      .filter(([poolId]) => poolId.length > 0),
  );

  const bossMonsterIds = collectDungeonBossMonsterIds();
  assert.ok(bossMonsterIds.length > 0, '秘境种子中未找到 BOSS monster_def_id');

  for (const monsterId of bossMonsterIds) {
    const monster = monsterById.get(monsterId);
    assert.ok(monster, `monster_def.json 缺少怪物定义: ${monsterId}`);

    const dropPoolId = String(monster.drop_pool_id || '').trim();
    assert.ok(dropPoolId, `${monsterId} 缺少 drop_pool_id`);

    const dropPool = dropPoolById.get(dropPoolId);
    assert.ok(dropPool, `${monsterId} 引用了不存在掉落池: ${dropPoolId}`);

    const exclusiveEntries = Array.isArray(dropPool.entries) ? dropPool.entries : [];
    const commonPoolIds = Array.isArray(dropPool.common_pool_ids) ? dropPool.common_pool_ids : [];
    const mergedEntries = [
      ...commonPoolIds.flatMap((commonPoolIdRaw) => {
        const commonPoolId = String(commonPoolIdRaw || '').trim();
        const commonPool = commonDropPoolById.get(commonPoolId);
        return Array.isArray(commonPool?.entries) ? commonPool.entries : [];
      }),
      ...exclusiveEntries,
    ];
    const hasUnbindItem = mergedEntries.some((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      return String((entry as JsonRecord).item_def_id || '').trim() === EQUIPMENT_UNBIND_ITEM_DEF_ID;
    });
    assert.equal(hasUnbindItem, true, `${monsterId} 的掉落池 ${dropPoolId} 缺少解绑道具 ${EQUIPMENT_UNBIND_ITEM_DEF_ID}`);
  }
});
