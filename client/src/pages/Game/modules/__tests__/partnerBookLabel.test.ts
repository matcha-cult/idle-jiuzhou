/**
 * 伙伴功法书标题格式化回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴面板功法书标题的单一展示规则，只展示功法书主名称，不再额外拼接功法名。
 * 2. 不做什么：不覆盖伙伴学习流程、道具扣除或卡片布局，只验证共享格式化函数输出。
 *
 * 输入/输出：
 * - 输入：`PartnerBookDto` 形状的功法书数据。
 * - 输出：`resolvePartnerBookLabel` 返回给 UI 的标题字符串。
 *
 * 数据流/状态流：
 * - 伙伴总览接口 books DTO -> `resolvePartnerBookLabel` -> PartnerModal 功法书卡片标题。
 *
 * 关键边界条件与坑点：
 * 1. `book.name` 已经是展示主标题时，不能再拼 `techniqueName`，否则会出现“《凌波微步》（凌波微步）”这类重复文案。
 * 2. 生成功法书的 `book.name` 可能带有“秘卷”等后缀，标题必须保留原始书名，不能只退化成裸功法名。
 */

import { describe, expect, it } from 'vitest';
import type { PartnerBookDto } from '../../../../services/api/partner';
import { resolvePartnerBookLabel } from '../PartnerModal/partnerShared';

describe('resolvePartnerBookLabel', () => {
  it('应直接展示功法书名称，不再重复拼接功法名', () => {
    const book: PartnerBookDto = {
      itemInstanceId: 1001,
      itemDefId: 'book-lingbo-weibu',
      techniqueId: 'tech-lingbo-weibu',
      techniqueName: '凌波微步',
      name: '《凌波微步》',
      icon: '/assets/items/icon_book.png',
      quality: '地',
      qty: 1,
    };

    expect(resolvePartnerBookLabel(book)).toBe('《凌波微步》');
  });

  it('应保留生成功法书主名称里的秘卷后缀', () => {
    const book: PartnerBookDto = {
      itemInstanceId: 1002,
      itemDefId: 'book-generated-technique',
      techniqueId: 'generated-technique-guixu-yuanyuan-jue',
      techniqueName: '[刃] 归虚蕴元诀',
      name: '《[刃] 归虚蕴元诀》秘卷',
      icon: '/assets/items/icon_book_generated.png',
      quality: '黄',
      qty: 1,
    };

    expect(resolvePartnerBookLabel(book)).toBe('《[刃] 归虚蕴元诀》秘卷');
  });
});
