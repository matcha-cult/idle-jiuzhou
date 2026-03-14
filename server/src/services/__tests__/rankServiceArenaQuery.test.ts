import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/**
 * 竞技场排行榜 SQL 回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定 `loadArenaRanks` 只使用子查询显式暴露的 `character_id` 作为最终并列排序键，避免再次引用不存在的 `id` 别名。
 * 2. 做什么：通过源码级断言为竞技场排行榜补一条最小回归保护，减少同类 SQL 别名漂移导致的线上报错。
 * 3. 不做什么：不连接数据库，不执行排行榜查询，也不验证缓存层与月卡状态拼装逻辑。
 *
 * 输入/输出：
 * - 输入：`server/src/services/rankService.ts` 源码文本。
 * - 输出：断言竞技场排行窗口函数的排序键包含 `character_id ASC`，且不再包含错误的 `id ASC`。
 *
 * 数据流/状态流：
 * 读取 `rankService.ts` -> 定位 `loadArenaRanks` 片段 -> 断言排序 SQL 使用单一正确列名。
 *
 * 关键边界条件与坑点：
 * 1. 这是源码级保护，不会发现数据库层或运行时缓存层的其他问题；它只负责拦住这次别名回归。
 * 2. 如果后续把竞技场排行 SQL 拆到独立模块或模板字符串中，必须同步更新这里的定位方式，否则测试会误报。
 */

const rankServicePath = path.resolve(process.cwd(), 'src/services/rankService.ts');

test('loadArenaRanks: 并列排序应使用 character_id 而不是不存在的 id', () => {
  const source = fs.readFileSync(rankServicePath, 'utf8');

  assert.match(
    source,
    /ROW_NUMBER\(\) OVER \(ORDER BY score DESC, win_count DESC, lose_count ASC, character_id ASC\)::int AS rank/,
    '竞技场排行榜应使用 character_id 作为稳定排序键',
  );
  assert.doesNotMatch(
    source,
    /ROW_NUMBER\(\) OVER \(ORDER BY score DESC, win_count DESC, lose_count ASC, id ASC\)::int AS rank/,
    '竞技场排行榜不应再引用子查询外不存在的 id 列',
  );
});
