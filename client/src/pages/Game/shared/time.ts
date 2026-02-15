/**
 * 时间展示格式化工具。
 * 作用：统一“相对时间”和“分钟精度时间”文本，避免各模块重复实现。
 * 输入：后端返回的时间字符串。
 * 输出：
 * 1) formatRelativeTimeFromNow -> 刚刚 / X分钟前 / X小时前 / X天前
 * 2) formatDateTimeToMinute -> YYYY-MM-DD HH:mm
 * 注意：无法解析时回退原有兜底文案，保持现有页面行为不变。
 */

/**
 * 将时间格式化为“距现在多久”。
 * 无法解析时返回“刚刚”，与现有宗门面板行为保持一致。
 */
export const formatRelativeTimeFromNow = (dateString: string): string => {
  const now = Date.now();
  const past = new Date(dateString).getTime();
  if (!Number.isFinite(past)) return '刚刚';

  const diff = now - past;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;

  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(diff / 86400000);
  return `${days}天前`;
};

/**
 * 将时间格式化为 `YYYY-MM-DD HH:mm`。
 * 无法解析时返回原字符串，便于排查后端数据问题。
 */
export const formatDateTimeToMinute = (dateString: string): string => {
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return dateString;

  const pad = (value: number): string => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
};
