/**
 * 房间玩家对象映射测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定在线角色快照转换为房间玩家 DTO 时必须保留月卡状态，防止房间列表再次丢失名字特效依赖字段。
 * 2. 做什么：验证子境界拼接规则仍由统一函数产出，避免房间服务内部散落同类字符串拼装。
 * 3. 不做什么：不连接真实 socket，不覆盖房间过滤与数据库查询。
 *
 * 输入/输出：
 * - 输入：最小在线角色快照样本。
 * - 输出：房间玩家对象 DTO。
 *
 * 数据流/状态流：
 * 在线角色样本 -> buildRoomPlayerObject 纯函数 -> 断言 DTO 字段。
 *
 * 关键边界条件与坑点：
 * 1. `monthCardActive` 漏传时前端不会报错，但玩家名特效会静默失效，所以必须在纯函数层锁死。
 * 2. `subRealm` 为空时不应拼接分隔符，否则列表文案会出现肉眼可见脏数据。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRoomPlayerObject } from '../shared/roomPlayerObject.js';

test('buildRoomPlayerObject: 应保留月卡状态并拼接子境界', () => {
  const result = buildRoomPlayerObject({
    id: 7,
    nickname: '上海三号',
    monthCardActive: true,
    title: '道友',
    gender: '男',
    realm: '炼气期',
    subRealm: '三层',
    avatar: null,
  });

  assert.deepEqual(result, {
    type: 'player',
    id: '7',
    name: '上海三号',
    monthCardActive: true,
    title: '道友',
    gender: '男',
    realm: '炼气期·三层',
    avatar: null,
  });
});
