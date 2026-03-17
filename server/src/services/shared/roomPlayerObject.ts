/**
 * 房间在线玩家对象映射共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中把在线角色快照转换成房间对象列表里的玩家 DTO，确保月卡状态、称号和境界文案只有一个映射入口。
 * 2. 做什么：统一处理子境界拼接规则，避免房间对象服务未来再手写一遍 realm 文案逻辑。
 * 3. 不做什么：不查询在线玩家、不做房间过滤，也不处理 NPC / 妖兽 / 物品对象。
 *
 * 输入/输出：
 * - 输入：在线角色快照的最小必要字段。
 * - 输出：房间对象列表可直接下发给前端的玩家 DTO。
 *
 * 数据流/状态流：
 * GameServer 在线角色快照 -> 本模块纯函数 -> roomObjectService 返回的 player 对象。
 *
 * 关键边界条件与坑点：
 * 1. `monthCardActive` 必须原样透传；如果在这里漏掉，前端统一特效入口也拿不到月卡态。
 * 2. 子境界只在存在非空值时拼接，不能无条件产生多余分隔符，避免列表里出现脏文案。
 */
import type { CharacterAttributes } from '../../game/gameState.js';

export interface RoomPlayerObjectDto {
  type: 'player';
  id: string;
  name: string;
  monthCardActive: boolean;
  title?: string;
  gender?: string;
  realm?: string;
  avatar?: string | null;
}

type RoomPlayerSnapshot = Pick<
  CharacterAttributes,
  'id' | 'nickname' | 'monthCardActive' | 'title' | 'gender' | 'realm' | 'subRealm' | 'avatar'
>;

export const buildRoomPlayerObject = (player: RoomPlayerSnapshot): RoomPlayerObjectDto => {
  const realmText = player.subRealm ? `${player.realm}·${player.subRealm}` : player.realm;

  return {
    type: 'player',
    id: String(player.id),
    name: player.nickname,
    monthCardActive: player.monthCardActive,
    title: player.title || undefined,
    gender: player.gender || undefined,
    realm: realmText || undefined,
    avatar: player.avatar ?? null,
  };
};
