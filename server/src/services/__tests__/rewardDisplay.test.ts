/**
 * 奖励展示元数据回归测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：锁定奖励展示工具对物品定义的解析结果，确保任务/主线/战令共用的展示链路不会退化成英文 ID。
 * - 做什么：覆盖“种子存在”与“种子缺失”两类场景，保证统一 fallback 规则稳定。
 * - 不做什么：不验证发奖流程、不触发数据库事务，也不覆盖前端文案拼接。
 *
 * 输入/输出：
 * - 输入：物品定义 ID。
 * - 输出：`resolveRewardItemDisplayMeta` 返回的展示名称与图标。
 *
 * 数据流/状态流：
 * itemDefId -> `rewardDisplay` 读取静态种子 -> 奖励 DTO 复用该结果 -> 前端展示。
 *
 * 关键边界条件与坑点：
 * 1) 已配置物品必须返回中文展示名，否则多个奖励链路会同时退化成英文 ID。
 * 2) 未配置物品必须稳定回退为原始 ID，避免调用方再次各写一层 fallback 逻辑。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRewardItemDisplayMeta } from '../shared/rewardDisplay.js';

test('resolveRewardItemDisplayMeta 应解析已存在物品的中文名与图标', () => {
  const meta = resolveRewardItemDisplayMeta('mat-lingmo');

  assert.equal(meta.name, '灵墨');
  assert.equal(meta.icon, '/assets/ui/sh_icon_0006_jinbi_02.png');
});

test('resolveRewardItemDisplayMeta 应对缺失物品稳定回退到原始 ID', () => {
  const meta = resolveRewardItemDisplayMeta('missing-item-def');

  assert.equal(meta.name, 'missing-item-def');
  assert.equal(meta.icon, null);
});
