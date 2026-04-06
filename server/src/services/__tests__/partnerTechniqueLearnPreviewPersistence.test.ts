/**
 * 伙伴打书预览持久化回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴打书替换预览进入后必须持久化到服务端，避免玩家刷新页面后功法书重新回到背包。
 * 2. 做什么：约束总览读取、预览创建、确认与放弃都复用同一套持久化预览入口，防止前后端再次各管一半状态。
 * 3. 不做什么：不执行真实事务、不连接数据库，也不覆盖伙伴功法替换公式本身。
 *
 * 输入/输出：
 * - 输入：`partnerService.ts` 源码文本。
 * - 输出：源码结构断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 断言总览/创建预览/确认/放弃是否走持久化预览链路。
 *
 * 复用设计说明：
 * - 继续沿用仓库已有的源码回归测试模式，只锁定这次 bug 的关键实现约束，避免为了单条持久化链路引入高成本集成夹具。
 * - 测试直接绑定 `partnerTechniqueLearnPreviewState` 共享模块，确保 metadata 协议只有单一入口，不会在 `partnerService` 中再次手写第二份字段名。
 *
 * 关键边界条件与坑点：
 * 1. 仅把“放弃学习”改成前端提示并不能修复刷新绕过，因为真正的问题是服务端没有保存待处理预览。
 * 2. `confirm/discard` 若继续直接按背包实例扣书，刷新后预览实例不存在时仍会退化回旧漏洞。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('partnerService: 伙伴打书替换预览必须持久化到服务端并由总览恢复', () => {
  const source = readSource('../partnerService.ts');

  assert.match(
    source,
    /from '\.\/shared\/partnerTechniqueLearnPreviewState\.js'/u,
    'partnerService 必须复用共享预览 state 模块，避免再次手写 metadata 字段',
  );
  assert.match(
    source,
    /loadPendingPartnerTechniqueLearnPreview\(characterId\)[\s\S]*pendingTechniqueLearnPreview/u,
    '伙伴总览必须透传待处理打书预览，刷新后才能恢复确认弹窗',
  );
  assert.match(
    source,
    /async startTechniqueLearnByBook\([\s\S]*await reservePartnerTechniqueLearnPreviewBook\(/u,
    '进入替换预览时必须立即保留功法书，不能只把预览放在前端内存',
  );
  assert.match(
    source,
    /async confirmTechniqueLearnPreview\([\s\S]*await loadPendingPartnerTechniqueLearnPreviewByItem\([\s\S]*await deletePendingPartnerTechniqueLearnPreviewBook\(/u,
    '确认学习必须消费持久化预览实例，而不是重新按背包实例扣书',
  );
  assert.match(
    source,
    /async discardTechniqueLearnPreview\([\s\S]*await loadPendingPartnerTechniqueLearnPreviewByItem\([\s\S]*await deletePendingPartnerTechniqueLearnPreviewBook\(/u,
    '放弃学习必须销毁持久化预览实例，不能依赖刷新前的前端临时状态',
  );
  assert.doesNotMatch(
    source,
    /async discardTechniqueLearnPreview\([\s\S]*consumeSpecificItemInstance\(/u,
    '放弃学习不应再直接按背包实例扣书，否则刷新后仍可绕过',
  );
});
