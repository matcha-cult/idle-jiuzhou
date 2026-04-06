/**
 * 称号装备后在线战斗快照同步回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定称号装备链路在失效角色计算缓存后，必须继续安排在线战斗角色快照刷新，避免左侧面板或后续战斗入口继续读取旧称号属性。
 * 2. 做什么：复用源码级顺序断言，保证“先清 computed，再刷新 snapshot”的关键时序不被后续改动破坏。
 * 3. 不做什么：不连接真实数据库，不执行真实称号装备事务，也不校验具体属性数值。
 *
 * 输入 / 输出：
 * - 输入：称号服务源码文本。
 * - 输出：源码级调用约束断言结果。
 *
 * 数据流 / 状态流：
 * 读取源码 -> 定位称号战斗状态刷新入口与 equipTitle -> 断言先 invalidateCharacterComputedCache
 * -> 再 scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId。
 *
 * 复用设计说明：
 * 1. 这里沿用现有“源码策略测试”模式，避免为单一刷新顺序重复搭建事务与数据库桩。
 * 2. 后续若称号写链路再扩展到续期、卸下或过期清理，也可以继续复用这类约束测试补充覆盖。
 *
 * 关键边界条件与坑点：
 * 1. 只清理 computed 还不够，因为在线战斗入口优先消费快照；如果不刷新 snapshot，部分链路仍会看到旧称号属性。
 * 2. 刷新顺序不能反过来，否则快照重建时会读到旧 computed。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('称号装备链路应在清理计算缓存后安排在线战斗快照刷新', () => {
  const source = readSource('../achievement/title.ts');

  assert.match(source, /const refreshCharacterBattleStateAfterTitleMutation = async/u);
  assert.match(source, /invalidateCharacterComputedCache\(characterId\)/u);
  assert.match(source, /scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId\(characterId\)/u);
  assert.match(
    source,
    /const refreshCharacterBattleStateAfterTitleMutation = async[\s\S]*?invalidateCharacterComputedCache\(characterId\)[\s\S]*?scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId\(characterId\)/u,
  );
  assert.match(
    source,
    /async equipTitle\([\s\S]*?await this\.updateCharacterAttrsWithDeltaTx\(cid, targetName, delta\);[\s\S]*?await refreshCharacterBattleStateAfterTitleMutation\(cid\);/u,
  );
});
