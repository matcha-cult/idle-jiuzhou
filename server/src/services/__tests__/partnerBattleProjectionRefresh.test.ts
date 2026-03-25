/**
 * 伙伴战斗投影刷新策略测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴战斗相关写入会统一走“伙伴战斗缓存 + 在线战斗角色投影”双刷新入口，避免再次出现伙伴面板已切换、开战仍读取旧伙伴。
 * 2. 做什么：覆盖切换出战、下阵和培养类高频入口，保证实际影响开战伙伴快照的链路都复用同一个刷新函数。
 * 3. 不做什么：不执行真实事务提交，也不触发 Redis/内存刷新；这里只验证源码级调用约束。
 *
 * 输入/输出：
 * - 输入：`partnerService.ts` 源码文本。
 * - 输出：源码结构断言结果。
 *
 * 数据流/状态流：
 * 读取 partnerService 源码 -> 检查统一刷新函数 -> 检查各业务入口是否复用该函数。
 *
 * 关键边界条件与坑点：
 * 1. 只刷新 `profileCache` 不足以修复开战读旧伙伴，因为在线战斗入口真正消费的是在线战斗角色投影里的 `activePartner`。
 * 2. 必须锁定“统一刷新函数被复用”，否则未来很容易在新入口里只补一半刷新逻辑，重新制造状态分裂。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('partnerService: 伙伴战斗相关写入后应统一刷新伙伴缓存与在线战斗投影', () => {
  const source = readSource('../partnerService.ts');

  assert.match(
    source,
    /const schedulePartnerBattleStateRefreshByCharacterId = async[\s\S]*?scheduleActivePartnerBattleCacheRefreshByCharacterId\(characterId\)[\s\S]*?scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId\(characterId\)/u,
  );
  assert.match(
    source,
    /async activate\([\s\S]*?await schedulePartnerBattleStateRefreshByCharacterId\(characterId\)/u,
  );
  assert.match(
    source,
    /async dismiss\([\s\S]*?await schedulePartnerBattleStateRefreshByCharacterId\(characterId\)/u,
  );
  assert.match(
    source,
    /async injectExp\([\s\S]*?await schedulePartnerBattleStateRefreshByCharacterId\(characterId\)/u,
  );
  assert.match(
    source,
    /async renameWithCard\([\s\S]*?await schedulePartnerBattleStateRefreshByCharacterId\(characterId\)/u,
  );
});
