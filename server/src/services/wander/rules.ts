/**
 * 云游奇遇共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护云游奇遇与环境相关的通用规则，避免 service、worker、路由各自散落开发态判断。
 * 2. 做什么：统一提供“功能是否启用”和“本地开发可连续交互时如何派生虚拟 dayKey”的纯函数，保持路由、服务层口径一致。
 * 3. 不做什么：不访问数据库，不执行 AI 生成，也不决定前端展示文案。
 *
 * 输入/输出：
 * - 输入：运行环境、最近一次云游的 `dayKey`、当前时间。
 * - 输出：功能是否启用、是否跳过每日限制，以及本次应写入的 dayKey。
 *
 * 数据流/状态流：
 * route/service/worker -> 本模块 -> 获得生产环境开关、开发态绕过规则与下一次云游的 dayKey -> 继续执行业务写入。
 *
 * 关键边界条件与坑点：
 * 1. 项目本地开发默认不是 production，因此这里沿用仓库既有“非 production 视为开发态”的约定，不能在业务层重复写环境判断。
 * 2. 开发态连续交互时必须仍写入合法 date 字段，因此不能用时间戳字符串伪造 dayKey，只能派生稳定的“下一天”日期。
 * 3. “生产环境暂时关闭云游”只允许在这里保留一份判断，避免路由和页面各自维护不同开关。
 */

export const WANDER_FEATURE_DISABLED_MESSAGE = '云游奇遇暂时关闭，请稍后再来';

export const isWanderFeatureEnabled = (
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean => {
  return nodeEnv !== 'production';
};

export const buildDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dayKey: string | null): Date | null => {
  if (!dayKey) return null;
  const matched = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const monthIndex = Number(matched[2]) - 1;
  const day = Number(matched[3]);
  const parsed = new Date(year, monthIndex, day);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== monthIndex
    || parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

const addDays = (date: Date, days: number): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
};

export const shouldBypassWanderDailyLimit = (
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean => {
  return nodeEnv !== 'production';
};

export const resolveWanderGenerationDayKey = (
  latestEpisodeDayKey: string | null,
  now: Date = new Date(),
  bypassDailyLimit: boolean = shouldBypassWanderDailyLimit(),
): string => {
  const today = buildDateKey(now);
  if (!bypassDailyLimit) {
    return today;
  }

  const latestEpisodeDate = parseDateKey(latestEpisodeDayKey);
  const todayDate = parseDateKey(today);
  if (!latestEpisodeDate || !todayDate) {
    return today;
  }

  if (latestEpisodeDate.getTime() < todayDate.getTime()) {
    return today;
  }

  return buildDateKey(addDays(latestEpisodeDate, 1));
};
