/**
 * AI 生成功法技能数值归一化共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一约束 AI 生成功法技能的基础冷却，主动类技能最低为 1 回合，被动技能固定为 0。
 * 2. 做什么：让模型输出清洗、已发布生成技能加载、草稿预览读取复用同一入口，避免三条链路各写一套冷却修正。
 * 3. 不做什么：不负责触发类型推导、不校验技能效果结构，也不处理升级增量和数据库读写。
 *
 * 输入/输出：
 * - 输入：原始冷却值 `rawCooldown` 与已归一化的技能触发类型 `triggerType`。
 * - 输出：可直接落入 candidate / 配置缓存 / 预览 DTO 的标准冷却回合数。
 *
 * 数据流/状态流：
 * 模型结果或数据库行 -> 调用方先解析 triggerType -> 本模块统一收敛冷却下限/上限 -> 战斗装配与功法展示复用。
 *
 * 复用设计说明：
 * - 冷却下限规则属于 AI 生成功法的高频业务变化点，集中在这里后，`techniqueGenerationCandidateCore`、
 *   `generatedTechniqueConfigStore`、`techniqueGenerationService` 都只保留读取数据职责，不再各自维护一份 clamp 逻辑。
 * - 当前被 AI 生成链路、已发布配置缓存和草稿预览三处复用，后续新增读取入口时也只需要接入同一纯函数。
 *
 * 关键边界条件与坑点：
 * 1. 被动技能即使历史库里写成了正数冷却，也必须强制归零；否则会和 `validatePassiveSkillConfig`、战斗被动进场逻辑冲突。
 * 2. 主动类技能若历史脏数据写成 0、负数或非数值，必须在读取时直接抬到 1；不能把修正散落到展示层或战斗层再补。
 */
import type { SkillTriggerType } from '../../shared/skillTriggerType.js';

const GENERATED_TECHNIQUE_ACTIVE_SKILL_MIN_COOLDOWN = 1;
const GENERATED_TECHNIQUE_SKILL_MAX_COOLDOWN = 6;

const clampInteger = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
};

export const normalizeGeneratedTechniqueSkillCooldown = (
  rawCooldown: unknown,
  triggerType: SkillTriggerType,
): number => {
  if (triggerType === 'passive') {
    return 0;
  }
  return clampInteger(
    Number(rawCooldown),
    GENERATED_TECHNIQUE_ACTIVE_SKILL_MIN_COOLDOWN,
    GENERATED_TECHNIQUE_SKILL_MAX_COOLDOWN,
  );
};
