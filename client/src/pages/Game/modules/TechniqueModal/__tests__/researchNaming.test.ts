import { describe, expect, it } from 'vitest';
import {
  buildTechniqueResearchPublishRuleLines,
  isTechniqueResearchPublishNameErrorCode,
  normalizeTechniqueResearchCustomNameInput,
  resolveTechniqueResearchPublishErrorMessage,
} from '../researchNaming';

describe('researchNaming', () => {
  it('normalizeTechniqueResearchCustomNameInput: 应裁剪推荐名称首尾空白', () => {
    expect(normalizeTechniqueResearchCustomNameInput('  太虚剑诀  ')).toBe('太虚剑诀');
  });

  it('buildTechniqueResearchPublishRuleLines: 应输出统一命名规则文案', () => {
    expect(buildTechniqueResearchPublishRuleLines({
      minLength: 2,
      maxLength: 14,
      fixedPrefix: '『研』',
      patternHint: '仅支持纯中文（不含空格、符号、字母、数字）',
      immutableAfterPublish: true,
    })).toEqual([
      '固定前缀：『研』',
      '长度限制：2~14字',
      '格式要求：仅支持纯中文（不含空格、符号、字母、数字）',
    ]);
  });

  it('resolveTechniqueResearchPublishErrorMessage: 应映射命名错误与草稿状态错误', () => {
    expect(resolveTechniqueResearchPublishErrorMessage('NAME_CONFLICT')).toBe('名称已存在，请更换');
    expect(resolveTechniqueResearchPublishErrorMessage('NAME_SENSITIVE')).toBe('名称包含敏感内容，请重填');
    expect(resolveTechniqueResearchPublishErrorMessage('NAME_INVALID')).toBe('名称不符合格式规则');
    expect(resolveTechniqueResearchPublishErrorMessage('GENERATION_EXPIRED')).toBe('草稿已过期，系统仅返还一半功法残页，请重新领悟');
  });

  it('isTechniqueResearchPublishNameErrorCode: 只应识别命名类错误', () => {
    expect(isTechniqueResearchPublishNameErrorCode('NAME_CONFLICT')).toBe(true);
    expect(isTechniqueResearchPublishNameErrorCode('NAME_SENSITIVE')).toBe(true);
    expect(isTechniqueResearchPublishNameErrorCode('NAME_INVALID')).toBe(true);
    expect(isTechniqueResearchPublishNameErrorCode('GENERATION_NOT_READY')).toBe(false);
    expect(isTechniqueResearchPublishNameErrorCode(undefined)).toBe(false);
  });
});
