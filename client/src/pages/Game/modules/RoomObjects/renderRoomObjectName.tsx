/**
 * 房间对象名称渲染共享函数
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理房间对象列表里的名称渲染，确保“玩家名字”统一复用 PlayerName 月卡特效入口，避免列表内再手写一份分支。
 * 2. 做什么：保留非玩家对象的轻量文本渲染，避免把玩家特效错误扩散到 NPC / 妖兽 / 物品。
 * 3. 不做什么：不负责任务标记、不处理点击交互，也不拉取任何额外数据。
 *
 * 输入/输出：
 * - 输入：单个房间对象 DTO。
 * - 输出：可直接插入列表标题区域的名称 JSX。
 *
 * 数据流/状态流：
 * 房间对象接口 DTO -> 本函数按对象类型分流 -> 玩家走 PlayerName，共享 SCSS 特效；其他类型保留普通文本。
 *
 * 关键边界条件与坑点：
 * 1. 月卡特效只允许出现在 `type === 'player'` 分支，否则会让非玩家对象误带会员视觉。
 * 2. 房间列表宽度较窄，玩家名必须开启省略样式，避免移动端长名字把右侧类型标签顶出布局。
 */
import type { ReactElement } from 'react';
import type { MapObjectDto } from '../../../../services/api';
import PlayerName from '../../shared/PlayerName';

export const renderRoomObjectName = (obj: MapObjectDto): ReactElement => {
  if (obj.type === 'player') {
    return (
      <PlayerName
        name={obj.name}
        monthCardActive={obj.monthCardActive === true}
        ellipsis
        className="room-objects-item-name-text"
      />
    );
  }

  return <span className="room-objects-item-name-text">{obj.name}</span>;
};
