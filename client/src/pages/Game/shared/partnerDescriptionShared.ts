/**
 * 伙伴实例描述前端共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护伙伴实例描述输入的裁剪与最大长度，供伙伴易名符弹窗复用，避免页面与弹窗各写一套 80 字符限制。
 * 2. 做什么：让输入框 `maxLength`、提交归一化和占位文案围绕同一常量协作，减少前后不一致。
 * 3. 不做什么：不负责敏感词校验、不发请求，也不决定描述字段是否显示。
 *
 * 输入/输出：
 * - 输入：原始描述字符串。
 * - 输出：裁剪后的描述或 `null`，以及统一最大长度常量。
 *
 * 数据流/状态流：
 * - 伙伴改名弹窗输入 -> 本模块裁剪 -> payload 提交到伙伴改名接口。
 *
 * 复用设计说明：
 * - 当前只有伙伴易名符改名会编辑实例描述，但后续若伙伴详情、坊市备注等入口也要消费同一字段，可直接复用本模块，避免重复维护长度规则。
 * - 最大长度收口到单一常量，减少组件 JSX、提交流程与测试断言的魔法数字散落。
 *
 * 关键边界条件与坑点：
 * 1. 空白描述需要归一化成 `null`，明确表示“清空实例描述并回退模板描述”。
 * 2. 这里只做前端轻量裁剪，不替代服务端权威校验。
 */

export const PARTNER_DESCRIPTION_MAX_LENGTH = 80;

export const normalizePartnerDescriptionInput = (
  value: string | null | undefined,
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};
