/**
 * 坊市列表查询签名构建工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把物品坊市与伙伴坊市的查询参数归一化为稳定签名，用于识别“同一筛选条件反复刷新”的脚本行为。
 * 2. 做什么：统一 trim、大小写、分页与数值参数序列化规则，避免路由层各自拼接导致同义请求签名不一致。
 * 3. 不做什么：不做 Redis 存储、不评估风险分、不处理 HTTP 请求对象。
 *
 * 输入/输出：
 * - 输入：已解析完成的坊市查询参数。
 * - 输出：稳定字符串签名。
 *
 * 数据流/状态流：
 * - 路由层解析 query -> 本模块生成签名 -> 风控服务记录访问事件。
 *
 * 关键边界条件与坑点：
 * 1. 文本查询需要统一 trim + lower-case，否则同一关键字大小写变化会被误认为不同签名。
 * 2. 缺省参数必须显式落成固定占位值，避免“未传 page”和“page=1”出现两种签名。
 */

export interface ItemMarketRiskQuerySignatureInput {
  category?: string;
  quality?: string;
  query?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}

export interface PartnerMarketRiskQuerySignatureInput {
  quality?: string;
  element?: string;
  query?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

const normalizeText = (value?: string): string => {
  return value?.trim().toLowerCase() ?? '';
};

const normalizeOptionalInt = (value?: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return String(Math.floor(value));
};

const normalizePositiveInt = (
  value: number | undefined,
  fallbackValue: number,
): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return String(fallbackValue);
  }
  return String(Math.max(1, Math.floor(value)));
};

const buildSignature = (parts: string[]): string => parts.join('|');

export const buildItemMarketRiskQuerySignature = (
  input: ItemMarketRiskQuerySignatureInput,
): string => {
  return buildSignature([
    'item',
    normalizeText(input.category),
    normalizeText(input.quality),
    normalizeText(input.query),
    normalizeText(input.sort),
    normalizeOptionalInt(input.minPrice),
    normalizeOptionalInt(input.maxPrice),
    normalizePositiveInt(input.page, 1),
    normalizePositiveInt(input.pageSize, 0),
  ]);
};

export const buildPartnerMarketRiskQuerySignature = (
  input: PartnerMarketRiskQuerySignatureInput,
): string => {
  return buildSignature([
    'partner',
    normalizeText(input.quality),
    normalizeText(input.element),
    normalizeText(input.query),
    normalizeText(input.sort),
    normalizePositiveInt(input.page, 1),
    normalizePositiveInt(input.pageSize, 0),
  ]);
};
