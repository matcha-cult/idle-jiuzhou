/**
 * 洞府研修结果查看标记回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“标记最新研修结果已查看”必须复用单条原子更新入口。
 * 2. 做什么：防止实现回退成“先 `FOR UPDATE` 查一行，再按状态二次 UPDATE”的两段式锁链。
 * 3. 不做什么：不执行真实数据库写入，不校验业务文案。
 *
 * 输入/输出：
 * - 输入：洞府研修服务源码文本。
 * - 输出：共享入口调用、原子 SQL 结构与禁用旧锁查询的断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 检查 `markLatestResultViewed` 是否复用私有原子更新入口 -> 校验 CTE + UPDATE RETURNING 仍存在 -> 确认旧的 `FOR UPDATE` 预读已移除。
 *
 * 关键边界条件与坑点：
 * 1. 这里锁的是并发协议，而不是接口返回值；只看业务文案不足以防止锁热点回归。
 * 2. 必须同时约束“入口复用”和“旧 SQL 消失”，否则后续有人可能一边保留 helper，一边又把两段式查询加回来。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('洞府研修标记最新结果已查看应复用单条原子更新', () => {
  const techniqueGenerationSource = readFileSync(
    new URL('../techniqueGenerationService.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    techniqueGenerationSource,
    /const jobRes = await this\.markLatestTechniqueResultViewedTx\(characterId\)/u,
  );
  assert.match(techniqueGenerationSource, /WITH latest_unviewed_job AS \(/u);
  assert.match(techniqueGenerationSource, /UPDATE technique_generation_job AS job/u);
  assert.match(techniqueGenerationSource, /RETURNING job\.id/u);
  assert.doesNotMatch(
    techniqueGenerationSource,
    /async markLatestResultViewed[\s\S]*?SELECT id, status[\s\S]*?FOR UPDATE/u,
  );
});
