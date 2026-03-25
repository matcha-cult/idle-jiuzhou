/**
 * 秘境境界校验快照刷新回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定秘境准入校验前必须先刷新参与者在线战斗快照，避免存量旧快照继续把正确境界误判成不满足。
 * 2. 做什么：确保刷新发生在读取参与者昵称/境界映射之前，后续判定口径始终基于同一批新快照。
 * 3. 不做什么：不执行真实秘境创建/开战流程，也不连接 Redis 或数据库。
 *
 * 输入/输出：
 * - 输入：秘境境界校验源码文本。
 * - 输出：源码级顺序断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 定位 validateDungeonParticipantRealmAccess
 * -> 断言先刷新参与者快照，再读取昵称/境界映射。
 *
 * 关键边界条件与坑点：
 * 1. 这里只锁定关键调用顺序，不约束具体报错文案，避免无关文本调整误伤测试。
 * 2. 刷新必须是批量入口，避免后续回退成逐人串行刷新，增加不必要的热点延迟。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('秘境境界校验应先刷新参与者快照再读取境界映射', () => {
  const source = readSource('../dungeon/shared/realmAccess.ts');

  assert.match(source, /refreshOnlineBattleCharacterSnapshotsByCharacterIds\(/u);
  assert.match(
    source,
    /export const validateDungeonParticipantRealmAccess[\s\S]*?refreshOnlineBattleCharacterSnapshotsByCharacterIds\([\s\S]*?\)[\s\S]*?getParticipantNicknameMap\(params\.participants\)[\s\S]*?getParticipantRealmMap\(params\.participants\)/u,
  );
});
