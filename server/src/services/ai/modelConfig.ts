/**
 * AI 模型配置共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：统一读取文本/图片模型环境变量，并把 OpenAI SDK 所需 baseURL、DashScope 生图 endpoint、provider 判定等配置归一化。
 * 2) 做什么：给文本生成、技能图标、伙伴头像等多个 AI 调用链提供单一配置入口，避免每个业务模块各自解析环境变量。
 * 3) 不做什么：不发起模型请求、不构造业务 prompt，也不解析模型响应内容。
 *
 * 输入/输出：
 * - 输入：`process.env` 中的 AI 相关环境变量。
 * - 输出：结构化文本模型配置 `TextModelConfig` 与图片模型配置 `ImageModelConfig`。
 *
 * 数据流/状态流：
 * 环境变量 -> modelConfig 归一化 -> OpenAI SDK client / DashScope 请求层 -> 业务模块消费结果。
 *
 * 关键边界条件与坑点：
 * 1) OpenAI SDK 需要的是 `baseURL` 而不是完整 endpoint，因此这里必须把 `/chat/completions`、`/images/generations` 等完整地址回收成统一 baseURL。
 * 2) 图片链路仍然同时承接 OpenAI 兼容接口与 DashScope 专用协议，provider 判定必须只收敛在这里，不能继续散落在多个业务文件中。
 */

export type ImageProvider = 'openai' | 'dashscope';
export type TextModelProvider = 'openai' | 'anthropic';

export type TextModelConfig = {
  provider: TextModelProvider;
  apiKey: string;
  baseURL: string;
  modelName: string;
};

export type ImageModelConfig = {
  provider: ImageProvider;
  apiKey: string;
  modelName: string;
  baseURL: string;
  endpoint: string;
  size: string;
  timeoutMs: number;
  responseFormat: string;
  maxSkills: number;
};

const DEFAULT_TEXT_MODEL = 'gpt-4o-mini';
const DEFAULT_IMAGE_MODEL = 'qwen-image-2.0';
const DEFAULT_IMAGE_PROVIDER = 'auto';
const DEFAULT_IMAGE_SIZE = '512x512';
const DEFAULT_IMAGE_TIMEOUT_MS = 15_000;
const DEFAULT_IMAGE_MAX_SKILLS = 4;
const DEFAULT_IMAGE_RESPONSE_FORMAT = 'b64_json';
const DASHSCOPE_SYNC_IMAGE_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

const asString = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

const asPositiveInt = (raw: unknown, fallback: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.floor(n);
  return normalized > 0 ? normalized : fallback;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const normalizeOpenAIBaseUrl = (raw: string): string => {
  const endpoint = trimTrailingSlash(raw.trim());
  if (!endpoint) return '';

  if (/\/chat\/completions$/i.test(endpoint)) {
    return endpoint.replace(/\/chat\/completions$/i, '');
  }
  if (/\/images\/generations$/i.test(endpoint)) {
    return endpoint.replace(/\/images\/generations$/i, '');
  }
  if (/\/v1$/i.test(endpoint)) {
    return endpoint;
  }
  return `${endpoint}/v1`;
};

export const resolveDashScopeImageEndpoint = (raw: string): string => {
  const endpoint = trimTrailingSlash(raw);
  if (!endpoint) return '';

  try {
    const parsed = new URL(endpoint);
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (new RegExp(`${DASHSCOPE_SYNC_IMAGE_PATH}$`, 'i').test(cleanPath)) {
      return `${parsed.origin}${cleanPath}`;
    }
    return `${parsed.origin}${DASHSCOPE_SYNC_IMAGE_PATH}`;
  } catch {
    if (/\/compatible-mode(\/v1)?$/i.test(endpoint)) {
      return endpoint.replace(/\/compatible-mode(\/v1)?$/i, DASHSCOPE_SYNC_IMAGE_PATH);
    }
    if (/\/api\/v1$/i.test(endpoint)) {
      return `${endpoint}/services/aigc/multimodal-generation/generation`;
    }
    if (/\/v1$/i.test(endpoint)) {
      return endpoint.replace(/\/v1$/i, DASHSCOPE_SYNC_IMAGE_PATH);
    }
    return `${endpoint}${DASHSCOPE_SYNC_IMAGE_PATH}`;
  }
};

export const normalizeSizeForDashScope = (size: string): string => {
  const compact = size.replace(/\s+/g, '');
  if (/^\d+\*\d+$/i.test(compact)) return compact;
  if (/^\d+x\d+$/i.test(compact)) return compact.replace(/x/gi, '*');
  return DEFAULT_IMAGE_SIZE.replace('x', '*');
};

export const resolveImageProvider = (
  providerRaw: string,
  endpointRaw: string,
  modelName: string,
): ImageProvider => {
  const provider = providerRaw.toLowerCase();
  if (provider === 'openai' || provider === 'dashscope') return provider;

  const endpoint = endpointRaw.toLowerCase();
  const model = modelName.toLowerCase();
  if (
    endpoint.includes('dashscope') ||
    endpoint.includes('/compatible-mode') ||
    model.startsWith('qwen-image')
  ) {
    return 'dashscope';
  }
  return 'openai';
};

const resolveTextModelProvider = (raw: string): TextModelProvider => {
  const normalized = raw.toLowerCase();
  if (normalized === 'anthropic') return 'anthropic';
  return 'openai';
};

export const readTextModelConfig = (): TextModelConfig | null => {
  const apiKey = asString(process.env.AI_TECHNIQUE_MODEL_KEY);
  if (!apiKey) return null;

  const provider = resolveTextModelProvider(
    asString(process.env.AI_TECHNIQUE_MODEL_PROVIDER),
  );
  const endpointRaw = asString(process.env.AI_TECHNIQUE_MODEL_URL);

  // Anthropic provider 不强制要求 URL（SDK 有默认值 https://api.anthropic.com）；OpenAI 必须配置
  if (provider === 'openai' && !endpointRaw) return null;

  return {
    provider,
    apiKey,
    baseURL: provider === 'anthropic'
      ? (endpointRaw ? trimTrailingSlash(endpointRaw) : '')
      : normalizeOpenAIBaseUrl(endpointRaw),
    modelName: asString(process.env.AI_TECHNIQUE_MODEL_NAME) || DEFAULT_TEXT_MODEL,
  };
};

export const readImageModelConfig = (): ImageModelConfig | null => {
  const endpointRaw = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_URL);
  const apiKey = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_KEY);
  if (!endpointRaw || !apiKey) return null;

  const modelName = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_NAME) || DEFAULT_IMAGE_MODEL;
  const provider = resolveImageProvider(
    asString(process.env.AI_TECHNIQUE_IMAGE_PROVIDER) || DEFAULT_IMAGE_PROVIDER,
    endpointRaw,
    modelName,
  );
  const baseURL = normalizeOpenAIBaseUrl(endpointRaw);

  return {
    provider,
    apiKey,
    modelName,
    baseURL,
    endpoint: provider === 'dashscope' ? resolveDashScopeImageEndpoint(endpointRaw) : baseURL,
    size: asString(process.env.AI_TECHNIQUE_IMAGE_SIZE) || DEFAULT_IMAGE_SIZE,
    timeoutMs: asPositiveInt(process.env.AI_TECHNIQUE_IMAGE_TIMEOUT_MS, DEFAULT_IMAGE_TIMEOUT_MS),
    responseFormat: asString(process.env.AI_TECHNIQUE_IMAGE_RESPONSE_FORMAT) || DEFAULT_IMAGE_RESPONSE_FORMAT,
    maxSkills: asPositiveInt(process.env.AI_TECHNIQUE_IMAGE_MAX_SKILLS, DEFAULT_IMAGE_MAX_SKILLS),
  };
};
