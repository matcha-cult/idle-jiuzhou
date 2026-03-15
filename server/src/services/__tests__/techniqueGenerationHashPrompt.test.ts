/**
 * 功法生成 HASH 扰动请求测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定功法生成共享核心会显式携带随机 seed，并把基于 seed 生成的扰动 hash 注入 prompt 输入。
 * 2. 做什么：确保洞府研修与伙伴天生功法复用的功法生成核心共用同一套 HASH 扰动入口，避免调用方各自拼接。
 * 3. 不做什么：不请求真实模型、不验证 candidate 清洗，也不覆盖落库链路。
 *
 * 输入/输出：
 * - 输入：功法类型、品质、最大层数、固定 seed、可选 extraContext。
 * - 输出：文本模型请求参数中的 seed、promptNoiseHash 与 userMessage。
 *
 * 数据流/状态流：
 * 固定 seed -> buildTechniqueGenerationTextModelRequest -> prompt 输入 JSON -> 文本模型调用。
 *
 * 关键边界条件与坑点：
 * 1. promptNoiseHash 必须与 seed 同源，否则不同调用方接入后会出现“同样 seed，不同扰动”的漂移。
 * 2. extraContext 仍需保留，避免本次接入 HASH 扰动时把伙伴招募已有的补充语境覆盖掉。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTechniqueGenerationTextModelRequest } from '../shared/techniqueGenerationCandidateCore.js';
import { buildTextModelPromptNoiseHash } from '../shared/techniqueTextModelShared.js';

test('buildTechniqueGenerationTextModelRequest: 应显式传入 seed 并在 prompt 中注入对应扰动 hash', () => {
  const seed = 20260315;
  const request = buildTechniqueGenerationTextModelRequest({
    techniqueType: '武技',
    quality: '黄',
    maxLayer: 3,
    seed,
    promptContext: {
      source: 'unit-test',
    },
  });
  const parsedUserMessage = JSON.parse(request.userMessage) as {
    promptNoiseHash?: string;
    extraContext?: { source?: string };
  };

  assert.equal(request.seed, seed);
  assert.equal(parsedUserMessage.promptNoiseHash, buildTextModelPromptNoiseHash('technique-generation', seed));
  assert.equal(parsedUserMessage.extraContext?.source, 'unit-test');
});
