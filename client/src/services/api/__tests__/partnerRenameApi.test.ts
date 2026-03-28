/**
 * 改名 API 请求体测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴易名符请求体会携带实例描述，而角色易名符请求体保持原样不受影响。
 * 2. 做什么：避免伙伴改名字段扩展后，把 `description` 漏传到服务端或误污染角色改名接口。
 * 3. 不做什么：不发真实网络请求，不验证后端业务校验与扣卡逻辑。
 *
 * 输入/输出：
 * - 输入：伙伴改名参数、角色改名参数。
 * - 输出：axios `post` 调用的路径、请求体与请求配置。
 *
 * 数据流/状态流：
 * - API 封装函数 -> mock `api.post` -> 断言最终请求体。
 *
 * 关键边界条件与坑点：
 * 1. 伙伴描述是实例级字段，只能发给伙伴改名接口，不能顺手拼进角色改名请求。
 * 2. 保持伙伴改名继续走单一接口，避免名字、头像、描述分多次请求提交。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const postMock = vi.fn();

vi.mock('../core', () => ({
  default: {
    post: postMock,
  },
}));

import { renameCharacterWithCard } from '../auth-character';
import { renamePartnerWithCard } from '../partner';

describe('rename api', () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({ success: true, message: 'ok' });
  });

  it('renamePartnerWithCard: 应把 description 一并发送到伙伴改名接口', async () => {
    const requestConfig = { headers: { 'x-test': '1' } };

    await renamePartnerWithCard({
      partnerId: 9,
      itemInstanceId: 18,
      nickname: '青萝',
      avatar: '/uploads/avatars/partner.webp',
      description: '云游归来后更偏重护体与疗愈。',
    }, requestConfig);

    expect(postMock).toHaveBeenCalledWith('/partner/renameWithCard', {
      partnerId: 9,
      itemInstanceId: 18,
      nickname: '青萝',
      avatar: '/uploads/avatars/partner.webp',
      description: '云游归来后更偏重护体与疗愈。',
    }, requestConfig);
  });

  it('renameCharacterWithCard: 不应把伙伴描述字段拼进角色改名接口', async () => {
    const requestConfig = { headers: { 'x-test': '2' } };

    await renameCharacterWithCard(6, '凌霄子', requestConfig);

    expect(postMock).toHaveBeenCalledWith('/character/renameWithCard', {
      itemInstanceId: 6,
      nickname: '凌霄子',
    }, requestConfig);
  });
});
