/**
 * 房间对象名称渲染测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定房间对象列表里的玩家名必须复用 PlayerName，避免后续回退成普通 span 后再次丢失月卡特效。
 * 2. 做什么：验证非玩家对象仍保持普通文本结构，避免特效范围扩散。
 * 3. 不做什么：不渲染整页房间列表，不覆盖点击交互与任务标记展示。
 *
 * 输入/输出：
 * - 输入：玩家 / 物品两种房间对象样本。
 * - 输出：静态 HTML 片段。
 *
 * 数据流/状态流：
 * 测试样本 -> renderRoomObjectName -> 静态标记 -> 断言 class 与文本结构。
 *
 * 关键边界条件与坑点：
 * 1. 玩家对象必须把 `monthCardActive` 透传到 PlayerName，否则即便后端回了字段也不会生效。
 * 2. 普通对象不能误带 `is-month-card-active`，否则会把月卡视觉污染到物品或怪物。
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { MapObjectDto } from '../../../../../services/api';
import { renderRoomObjectName } from '../renderRoomObjectName';

describe('renderRoomObjectName', () => {
  it('玩家对象应复用 PlayerName 并透传月卡特效 class', () => {
    const player: MapObjectDto = {
      type: 'player',
      id: '18',
      name: '六道轮回',
      monthCardActive: true,
    };

    const html = renderToStaticMarkup(renderRoomObjectName(player));

    expect(html).toContain('game-player-name');
    expect(html).toContain('is-month-card-active');
    expect(html).toContain('六道轮回');
  });

  it('非玩家对象应保持普通文本结构', () => {
    const item: MapObjectDto = {
      type: 'item',
      id: 'herb-1',
      name: '野生草药',
    };

    const html = renderToStaticMarkup(renderRoomObjectName(item));

    expect(html).toContain('room-objects-item-name-text');
    expect(html).not.toContain('is-month-card-active');
    expect(html).toContain('野生草药');
  });
});
