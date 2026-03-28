/**
 * 伙伴实例描述共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护伙伴实例描述的裁剪、清空与长度校验，供伙伴易名符改名链路复用，避免路由与服务散落同一套文本规则。
 * 2. 做什么：输出统一中文错误文案，让服务端与前端围绕同一上限协作，减少字段长度漂移。
 * 3. 不做什么：不处理敏感词审查、不决定描述展示优先级，也不负责易名符扣除。
 *
 * 输入/输出：
 * - 输入：原始伙伴描述字符串或 `null`。
 * - 输出：归一化后的伙伴实例描述，或统一失败结果。
 *
 * 数据流/状态流：
 * 路由透传原始描述 -> 本模块裁剪与长度校验 -> 伙伴改名服务写入实例行 -> 伙伴展示 DTO 优先消费实例描述。
 *
 * 复用设计说明：
 * - 伙伴描述只允许通过易名符改名入口修改，因此把规则收口到单一模块，避免后续路由参数校验、服务写库和测试断言各自维护 80 字符上限。
 * - 后续若坊市、详情页或其他入口也允许编辑实例描述，可直接复用同一规则，不需要再复制一套裁剪逻辑。
 *
 * 关键边界条件与坑点：
 * 1. 空字符串应显式归一化为 `null`，表示“清空实例描述并回退模板描述”，不能把空白字符原样写库。
 * 2. 这里只负责长度，不引入额外兜底或敏感词策略，避免擅自扩大当前需求范围。
 */

export const PARTNER_DESCRIPTION_MAX_LENGTH = 80;
export const PARTNER_DESCRIPTION_LENGTH_MESSAGE = `伙伴描述最多${PARTNER_DESCRIPTION_MAX_LENGTH}个字符`;

type PartnerDescriptionValidationResult =
  | {
      success: true;
      description: string | null;
    }
  | {
      success: false;
      message: string;
    };

export const normalizePartnerDescriptionInput = (
  description: string | null | undefined,
): string | null => {
  if (typeof description !== 'string') {
    return null;
  }
  const normalized = description.trim();
  return normalized.length > 0 ? normalized : null;
};

export const getPartnerDescriptionLengthError = (
  description: string | null | undefined,
): string | null => {
  const normalized = normalizePartnerDescriptionInput(description);
  if (!normalized) {
    return null;
  }
  return normalized.length > PARTNER_DESCRIPTION_MAX_LENGTH
    ? PARTNER_DESCRIPTION_LENGTH_MESSAGE
    : null;
};

export const validatePartnerDescription = (
  description: string | null | undefined,
): PartnerDescriptionValidationResult => {
  const normalized = normalizePartnerDescriptionInput(description);
  const lengthError = getPartnerDescriptionLengthError(normalized);
  if (lengthError) {
    return {
      success: false,
      message: lengthError,
    };
  }
  return {
    success: true,
    description: normalized,
  };
};
