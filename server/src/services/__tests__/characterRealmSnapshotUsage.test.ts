/**
 * 角色境界快照复用回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴招募与洞府研修都必须复用共享的角色境界快照读取入口。
 * 2. 做什么：防止这两条只读解锁链路再次回退成 `SELECT realm, sub_realm ... FOR UPDATE`。
 * 3. 不做什么：不执行真实服务逻辑，不连接数据库。
 *
 * 输入/输出：
 * - 输入：服务源码文本。
 * - 输出：共享入口引用与禁用 SQL 片段的断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 检查是否引用 `loadCharacterRealmSnapshot` -> 断言旧的加锁查询不再出现。
 *
 * 关键边界条件与坑点：
 * 1. 这里锁的是实现约束，因为问题根源是无意义的角色行锁，而不是接口字段。
 * 2. 必须同时断言“已复用共享入口”和“旧 SQL 消失”，否则局部替换仍可能留下锁热点。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('伙伴招募与洞府研修应复用角色境界快照共享入口', () => {
  const partnerRecruitSource = readSource('../partnerRecruitService.ts');
  const techniqueGenerationSource = readSource('../techniqueGenerationService.ts');

  assert.match(partnerRecruitSource, /loadCharacterRealmSnapshot\(characterId\)/u);
  assert.match(techniqueGenerationSource, /loadCharacterRealmSnapshot\(characterId\)/u);

  assert.doesNotMatch(partnerRecruitSource, /SELECT realm, sub_realm[\s\S]*FOR UPDATE/u);
  assert.doesNotMatch(techniqueGenerationSource, /SELECT realm, sub_realm[\s\S]*FOR UPDATE/u);
});
