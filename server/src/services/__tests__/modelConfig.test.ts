import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOpenAIBaseUrl,
  normalizeSizeForDashScope,
  resolveDashScopeImageEndpoint,
  resolveImageProvider,
} from '../ai/modelConfig.js';

test('normalizeOpenAIBaseUrl: 应统一归一化为 OpenAI SDK baseURL', () => {
  assert.equal(
    normalizeOpenAIBaseUrl('https://api.openai.com'),
    'https://api.openai.com/v1',
  );
  assert.equal(
    normalizeOpenAIBaseUrl('https://api.deepseek.com/v1/chat/completions'),
    'https://api.deepseek.com/v1',
  );
  assert.equal(
    normalizeOpenAIBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations'),
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  );
});

test('resolveDashScopeImageEndpoint: 应统一归一化为同步生图地址', () => {
  assert.equal(
    resolveDashScopeImageEndpoint('https://dashscope.aliyuncs.com'),
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  );
  assert.equal(
    resolveDashScopeImageEndpoint('https://dashscope.aliyuncs.com/compatible-mode/v1'),
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  );
});

test('normalizeSizeForDashScope: 应统一转为星号尺寸', () => {
  assert.equal(normalizeSizeForDashScope('512x768'), '512*768');
  assert.equal(normalizeSizeForDashScope('512*768'), '512*768');
});

test('resolveImageProvider: auto 应按 endpoint 与模型名判定 provider', () => {
  assert.equal(resolveImageProvider('auto', 'https://dashscope.aliyuncs.com', 'qwen-image-2.0'), 'dashscope');
  assert.equal(resolveImageProvider('auto', 'https://api.openai.com', 'gpt-image-1'), 'openai');
  assert.equal(resolveImageProvider('openai', 'https://dashscope.aliyuncs.com', 'qwen-image-2.0'), 'openai');
});
