/**
 * 日常/周常/主线秘境目标任意难度回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定日常、周常、主线里的 `dungeon_clear` 目标不再写死 `difficulty_id`，避免后续只改一部分配置导致规则漂移。
 * 2. 做什么：校验与这些秘境目标直接绑定的文案不再出现“普通/困难”字样，避免展示层继续误导玩家。
 * 3. 不做什么：不执行任务服务、不验证真实进度推进，也不触达其他类型目标。
 *
 * 输入/输出：
 * - 输入：`task_def.json` 与 `main_quest_chapter*.json` 中的任务/主线种子。
 * - 输出：副本目标的难度字段与关联文案断言结果。
 *
 * 数据流/状态流：
 * - 先读取日常/周常种子并筛出包含 `dungeon_clear` 的任务；
 * - 再读取所有主线章节种子并筛出包含 `dungeon_clear` 的任务节；
 * - 最后统一断言这些目标没有 `difficulty_id`，且关联文案不再保留旧难度限定。
 *
 * 复用设计说明：
 * 1. 任务与主线都复用同一组字符串与目标扫描规则，避免两边各写一套“是否还残留难度限定”的判断。
 * 2. 高风险变化点是静态种子里的 `difficulty_id` 和展示文案，因此集中在一个测试入口收口，后续新增章节或任务时也能直接复用这条校验。
 *
 * 关键边界条件与坑点：
 * 1. 只检查日常、周常、主线这三类配置，不能把突破、成就等本就允许保留难度要求的模块误纳入断言范围。
 * 2. 一条任务/任务节里可能包含多个目标，必须只对 `dungeon_clear` 及其直接关联文案做校验，不能误伤采集或击杀目标描述。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asArray,
  asObject,
  asText,
  loadSeed,
  type JsonObject,
} from './seedTestUtils.js';

const FORBIDDEN_DIFFICULTY_TEXT = /(普通|困难)/;
const MAIN_QUEST_SEED_FILES = [
  'main_quest_chapter1.json',
  'main_quest_chapter2.json',
  'main_quest_chapter3.json',
  'main_quest_chapter4.json',
  'main_quest_chapter5.json',
  'main_quest_chapter6.json',
  'main_quest_chapter7.json',
  'main_quest_chapter8.json',
] as const;

const collectDungeonObjectives = (owner: JsonObject): JsonObject[] => {
  return asArray(owner.objectives)
    .map((objective) => asObject(objective))
    .filter((objective): objective is JsonObject => {
      if (!objective) return false;
      return asText(objective.type) === 'dungeon_clear';
    });
};

test('日常与周常秘境目标不应再限制具体难度', () => {
  const taskSeed = loadSeed('task_def.json');

  for (const taskEntry of asArray(taskSeed.tasks)) {
    const task = asObject(taskEntry);
    if (!task) continue;

    const category = asText(task.category);
    if (category !== 'daily' && category !== 'event') continue;

    const dungeonObjectives = collectDungeonObjectives(task);
    if (dungeonObjectives.length === 0) continue;

    assert.doesNotMatch(asText(task.title), FORBIDDEN_DIFFICULTY_TEXT, `${asText(task.id)} 标题仍包含旧难度限定`);
    assert.doesNotMatch(asText(task.description), FORBIDDEN_DIFFICULTY_TEXT, `${asText(task.id)} 描述仍包含旧难度限定`);

    for (const objective of dungeonObjectives) {
      const params = asObject(objective.params);
      assert.equal(asText(params?.difficulty_id), '', `${asText(task.id)} 仍限制了副本难度`);
      assert.doesNotMatch(asText(objective.text), FORBIDDEN_DIFFICULTY_TEXT, `${asText(task.id)} 目标文案仍包含旧难度限定`);
    }
  }
});

test('主线秘境目标不应再限制具体难度', () => {
  for (const filename of MAIN_QUEST_SEED_FILES) {
    const questSeed = loadSeed(filename);

    for (const sectionEntry of asArray(questSeed.sections)) {
      const section = asObject(sectionEntry);
      if (!section) continue;

      const dungeonObjectives = collectDungeonObjectives(section);
      if (dungeonObjectives.length === 0) continue;

      assert.doesNotMatch(asText(section.name), FORBIDDEN_DIFFICULTY_TEXT, `${asText(section.id)} 名称仍包含旧难度限定`);
      assert.doesNotMatch(asText(section.description), FORBIDDEN_DIFFICULTY_TEXT, `${asText(section.id)} 描述仍包含旧难度限定`);
      assert.doesNotMatch(asText(section.brief), FORBIDDEN_DIFFICULTY_TEXT, `${asText(section.id)} 简述仍包含旧难度限定`);

      for (const objective of dungeonObjectives) {
        const params = asObject(objective.params);
        assert.equal(asText(params?.difficulty_id), '', `${asText(section.id)} 仍限制了副本难度`);
        assert.doesNotMatch(asText(objective.text), FORBIDDEN_DIFFICULTY_TEXT, `${asText(section.id)} 目标文案仍包含旧难度限定`);
      }
    }
  }
});
