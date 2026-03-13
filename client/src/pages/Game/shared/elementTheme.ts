/**
 * 元素主题共享工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护元素代码到展示文案、统一样式类名的映射，供伙伴、坊市、技能等模块复用。
 * 2. 做什么：把“元素文案 + 固定配色 class”收口到单一入口，避免各页面各写一套金木水火土映射。
 * 3. 不做什么：不直接渲染 UI，不决定标签尺寸，也不负责业务判定。
 *
 * 输入/输出：
 * - 输入：服务端下发的元素值，如 `jin`、`mu`、`none`。
 * - 输出：标准化元素 key、展示文案，以及可直接挂到组件上的文本/标签 className。
 *
 * 数据流/状态流：
 * - DTO element 字段 -> 本模块标准化 -> 业务组件决定渲染成 Tag / span / 文本。
 *
 * 关键边界条件与坑点：
 * 1. 未识别元素不能抛错，文案保留原始值，但配色必须回退到中性样式，避免 UI 断裂。
 * 2. `none` 在不同场景有“无”与“无属性”两种文案需求，因此中性文案要允许调用方传入覆盖值。
 */

export type GameElementKey = 'none' | 'jin' | 'mu' | 'shui' | 'huo' | 'tu' | 'an';

type GameElementMeta = {
  label: string;
};

const ELEMENT_META: Record<GameElementKey, GameElementMeta> = {
  none: { label: '无' },
  jin: { label: '金' },
  mu: { label: '木' },
  shui: { label: '水' },
  huo: { label: '火' },
  tu: { label: '土' },
  an: { label: '暗' },
};

const RAW_TO_ELEMENT_KEY: Record<string, GameElementKey> = {
  none: 'none',
  jin: 'jin',
  mu: 'mu',
  shui: 'shui',
  huo: 'huo',
  tu: 'tu',
  an: 'an',
};

const normalizeElementRaw = (value: string | null | undefined): string => {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

export const resolveGameElementKey = (
  value: string | null | undefined,
): GameElementKey | null => {
  const normalized = normalizeElementRaw(value);
  if (!normalized) return 'none';
  return RAW_TO_ELEMENT_KEY[normalized] ?? null;
};

export const formatElementLabel = (
  value: string | null | undefined,
  noneLabel = '无',
): string => {
  const normalized = normalizeElementRaw(value);
  if (!normalized) return noneLabel;
  const key = RAW_TO_ELEMENT_KEY[normalized];
  if (!key) return value?.trim() || noneLabel;
  if (key === 'none') return noneLabel;
  return ELEMENT_META[key].label;
};

export const getElementClassName = (
  value: string | null | undefined,
): string => {
  const key = resolveGameElementKey(value) ?? 'none';
  return `game-element--${key}`;
};

export const getElementToneClassName = (
  value: string | null | undefined,
): string => {
  return `game-element-tone ${getElementClassName(value)}`;
};

export const getElementTextClassName = (
  value: string | null | undefined,
): string => {
  return `game-element-text ${getElementClassName(value)}`;
};
