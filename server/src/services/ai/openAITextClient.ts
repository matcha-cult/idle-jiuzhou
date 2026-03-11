/**
 * OpenAI 文本模型 client
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：使用标准 OpenAI SDK 发起文本模型请求，并统一返回模型内容、模型名与 prompt 快照。
 * 2) 做什么：让功法生成、伙伴招募、本地联调脚本复用同一套 SDK 调用逻辑，避免再手写 `fetch + headers + response.json`。
 * 3) 不做什么：不拼业务 prompt、不做业务 JSON 校验，也不吞掉请求异常。
 *
 * 输入/输出：
 * - 输入：system/user 消息、可选 responseFormat、可选 seed、请求超时。
 * - 输出：`{ modelName, promptSnapshot, content }`。
 *
 * 数据流/状态流：
 * 业务 prompt/schema -> buildTechniqueTextModelPayload -> OpenAI SDK -> 统一提取 content -> 调用方做 JSON 解析/业务校验。
 *
 * 关键边界条件与坑点：
 * 1) SDK 返回的 message content 可能是字符串，也可能是分段数组；这里必须统一提取，否则业务层又会回到重复解析。
 * 2) 业务侧仍然依赖 promptSnapshot 落库与问题排查，因此请求前构造出来的 payload 需要原样快照返回。
 */
import OpenAI from 'openai';
import { readTextModelConfig } from './modelConfig.js';
import {
  buildTechniqueTextModelPayload,
  extractTechniqueTextModelContent,
  type TechniqueTextModelResponseFormat,
} from '../shared/techniqueTextModelShared.js';

export type OpenAITextModelCallResult = {
  modelName: string;
  promptSnapshot: string;
  content: string;
};

const normalizeCompletionContent = (rawContent: unknown): string => {
  if (typeof rawContent === 'string') return rawContent;
  if (!Array.isArray(rawContent)) return '';
  return extractTechniqueTextModelContent(
    rawContent.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { text: null };
      }
      const row = entry as { text?: string | null };
      return {
        text: typeof row.text === 'string' ? row.text : null,
      };
    }),
  );
};

export const callConfiguredTextModel = async (params: {
  responseFormat?: TechniqueTextModelResponseFormat;
  systemMessage: string;
  userMessage: string;
  seed?: number;
  timeoutMs: number;
}): Promise<OpenAITextModelCallResult | null> => {
  const config = readTextModelConfig();
  if (!config) return null;

  const payload = buildTechniqueTextModelPayload({
    modelName: config.modelName,
    responseFormat: params.responseFormat,
    systemMessage: params.systemMessage,
    userMessage: params.userMessage,
    seed: params.seed,
  });
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: params.timeoutMs,
  });
  const completion = await client.chat.completions.create(payload);

  return {
    modelName: config.modelName,
    promptSnapshot: JSON.stringify(payload),
    content: normalizeCompletionContent(completion.choices[0]?.message?.content),
  };
};
