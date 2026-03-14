/**
 * 洞府研修抄写命名共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理研修抄写命名的默认值归一化、规则文案拼装、错误码映射，避免 `TechniqueModal` 把同类字符串判断散落多处。
 * 2. 做什么：为命名弹窗与后续可能复用该流程的入口提供统一纯函数，减少重复代码并保证交互文案一致。
 * 3. 不做什么：不持有 React 状态、不直接发请求，也不负责服务端命名校验。
 *
 * 输入/输出：
 * - 输入：AI 推荐名称、研修命名规则 DTO、发布接口返回的错误码与兜底文案。
 * - 输出：裁剪后的默认名称、规则文案数组、面向玩家的稳定错误提示。
 *
 * 数据流/状态流：
 * 研修状态接口 `nameRules` / 草稿推荐名 / 发布错误码 -> 本模块纯函数 -> TechniqueModal 命名弹窗展示与提交反馈。
 *
 * 关键边界条件与坑点：
 * 1. 默认名称只做首尾空白裁剪，不额外篡改 AI 推荐内容，避免前端与后端对“合法名称”理解再次分叉。
 * 2. 命名类错误必须集中识别，否则弹窗内联报错和全局 message 会各自维护一套判断，后续很容易不一致。
 */
import type { TechniqueResearchNameRulesDto } from '../../../../services/api';

export type TechniqueResearchPublishErrorCode =
  | 'NAME_CONFLICT'
  | 'NAME_SENSITIVE'
  | 'NAME_INVALID'
  | 'GENERATION_NOT_READY'
  | 'GENERATION_EXPIRED';

const NAME_ERROR_CODES = new Set<TechniqueResearchPublishErrorCode>([
  'NAME_CONFLICT',
  'NAME_SENSITIVE',
  'NAME_INVALID',
]);

export const normalizeTechniqueResearchCustomNameInput = (
  suggestedName: string,
): string => {
  return suggestedName.trim();
};

export const buildTechniqueResearchPublishRuleLines = (
  nameRules: TechniqueResearchNameRulesDto,
): string[] => {
  return [
    `固定前缀：${nameRules.fixedPrefix || '无'}`,
    `长度限制：${nameRules.minLength}~${nameRules.maxLength}字`,
    `格式要求：${nameRules.patternHint}`,
  ];
};

export const isTechniqueResearchPublishNameErrorCode = (
  code?: string,
): code is Extract<TechniqueResearchPublishErrorCode, 'NAME_CONFLICT' | 'NAME_SENSITIVE' | 'NAME_INVALID'> => {
  if (code !== 'NAME_CONFLICT' && code !== 'NAME_SENSITIVE' && code !== 'NAME_INVALID') {
    return false;
  }
  return NAME_ERROR_CODES.has(code);
};

export const resolveTechniqueResearchPublishErrorMessage = (
  code?: string,
  fallbackMessage?: string,
): string => {
  if (code === 'NAME_CONFLICT') return '名称已存在，请更换';
  if (code === 'NAME_SENSITIVE') return '名称包含敏感内容，请重填';
  if (code === 'NAME_INVALID') return '名称不符合格式规则';
  if (code === 'GENERATION_NOT_READY') return '草稿尚未就绪，请先领悟';
  if (code === 'GENERATION_EXPIRED') return '草稿已过期，系统仅返还一半功法残页，请重新领悟';
  return fallbackMessage || '抄写失败';
};
