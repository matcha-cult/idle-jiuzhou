/**
 * 伙伴打书预览 metadata 状态测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定待处理打书预览写入 `item_instance.metadata` 的结构，避免服务端多处各写一套字段名。
 * 2. 做什么：确保读取和清理都走同一共享模块，为持久化预览、总览恢复和确认/放弃复用。
 * 3. 不做什么：不读数据库，也不验证伙伴功法替换或背包拆堆 SQL。
 *
 * 输入/输出：
 * - 输入：基础 metadata 与待处理预览 state。
 * - 输出：合并后的 metadata、解析结果与清理结果。
 *
 * 数据流/状态流：
 * 原始 item metadata -> 共享 state 模块编码 -> 服务端持久化 / 总览恢复 -> 清理编码字段。
 *
 * 复用设计说明：
 * - metadata 编解码属于高频业务变化点，集中后服务端创建预览、总览恢复和确认/放弃只维护一份字段协议。
 * - 测试直接绑定共享模块，避免 `partnerService` 与未来其他入口再次复制 JSON 结构判断。
 *
 * 关键边界条件与坑点：
 * 1. 合并 metadata 时必须保留原有字段，例如生成功法书依赖的 `generatedTechniqueId` 不能被预览 state 覆盖掉。
 * 2. 清理待处理预览后，如果 metadata 已无其他字段，必须返回 `null`，避免数据库里残留空对象。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPartnerTechniqueLearnPreviewMetadata,
  clearPartnerTechniqueLearnPreviewMetadata,
  readPartnerTechniqueLearnPreviewState,
  type PartnerTechniqueLearnPreviewState,
} from '../shared/partnerTechniqueLearnPreviewState.js';

test('partnerTechniqueLearnPreviewState: 写入预览 state 时应保留原有 metadata 字段', () => {
  const state: PartnerTechniqueLearnPreviewState = {
    partnerId: 11,
    learnedTechniqueId: 'tech-learned',
    replacedTechniqueId: 'tech-replaced',
  };

  const metadata = buildPartnerTechniqueLearnPreviewMetadata({
    generatedTechniqueId: 'generated-technique-001',
  }, state);

  assert.deepEqual(metadata, {
    generatedTechniqueId: 'generated-technique-001',
    partnerTechniqueLearnPreview: {
      partnerId: 11,
      learnedTechniqueId: 'tech-learned',
      replacedTechniqueId: 'tech-replaced',
    },
  });
});

test('partnerTechniqueLearnPreviewState: 应从 metadata 中读取合法的预览 state', () => {
  const state = readPartnerTechniqueLearnPreviewState({
    generatedTechniqueId: 'generated-technique-001',
    partnerTechniqueLearnPreview: {
      partnerId: 23,
      learnedTechniqueId: 'tech-a',
      replacedTechniqueId: 'tech-b',
    },
  });

  assert.deepEqual(state, {
    partnerId: 23,
    learnedTechniqueId: 'tech-a',
    replacedTechniqueId: 'tech-b',
  });
});

test('partnerTechniqueLearnPreviewState: 清理预览 state 后若 metadata 为空应返回 null', () => {
  const cleaned = clearPartnerTechniqueLearnPreviewMetadata({
    partnerTechniqueLearnPreview: {
      partnerId: 1,
      learnedTechniqueId: 'tech-a',
      replacedTechniqueId: 'tech-b',
    },
  });

  assert.equal(cleaned, null);
});
