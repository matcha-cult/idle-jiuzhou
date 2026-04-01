/**
 * WanderModal 故事回顾层级回归测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“故事回顾”顶部只保留故事引子，并改成连续阅读流，不再回退成逐幕卡片列表。
 * 2. 做什么：通过源码级断言约束渲染结构，避免后续改动把重复文案或旧卡片容器重新加回弹窗。
 * 3. 不做什么：不校验 antd 组件行为，不验证视觉样式，也不覆盖云游接口请求流程。
 *
 * 输入/输出：
 * - 输入：`WanderModal` 源码文本。
 * - 输出：顶部引导区是否仍存在重复摘要块，且主体是否仍保持阅读流结构。
 *
 * 数据流/状态流：
 * - WanderModal 源码 -> 测试读取组件文本 -> 断言故事回顾区的静态渲染结构。
 *
 * 复用设计说明：
 * - 这类结构回归更适合静态源码断言，不需要挂载整棵弹窗树，避免为单一展示规则引入额外渲染依赖。
 * - 该测试直接复用现有 `WanderModal` 文件路径，后续只要故事回顾层级再变动，就能在同一入口发现回归。
 *
 * 关键边界条件与坑点：
 * 1. 顶部仍需保留 `wander-story-premise`，否则会把故事引子也一并删掉，损失层级信息。
 * 2. 必须禁止 `wander-history-card` 再次出现在故事回顾区，否则“小说式正文”会回退成碎片卡片。
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wanderModalSource = readFileSync(new URL('../WanderModal/index.tsx', import.meta.url), 'utf8');

describe('WanderModal 故事回顾层级', () => {
  it('顶部应只保留故事引子，并以阅读流替代旧卡片列表', () => {
    expect(wanderModalSource).toContain('wander-story-premise');
    expect(wanderModalSource).toContain('wander-story-reader');
    expect(wanderModalSource).not.toContain('wander-story-summary');
    expect(wanderModalSource).not.toContain('wander-history-card');
  });
});
