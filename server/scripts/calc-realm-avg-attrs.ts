#!/usr/bin/env tsx
/**
 * 各境界平均气血/灵力统计脚本
 *
 * 作用：
 * - 从 character_rank_snapshot 表读取每个玩家的 realm、max_qixue、max_lingqi，
 *   按 REALM_ORDER 归一化境界后，计算每个境界的平均值。
 * - 使用 IQR（四分位距）方法排除极端个体，避免离群值拉偏均值。
 * - 不写库、不改数据，仅输出控制台统计表格。
 *
 * 输入/输出：
 * - 输入：无 CLI 参数，直接从数据库全量读取。
 * - 输出：标准输出表格（每个境界的样本数、排除数、平均 max_qixue、平均 max_lingqi）。
 *
 * 数据流：
 * - 数据库查询 -> 境界归一化 -> 按 REALM_ORDER 分组 ->
 *   每组内按 max_qixue 和 max_lingqi 分别做 IQR 过滤 -> 计算均值 -> 格式化输出。
 *
 * 复用设计：
 * - 复用 realmRules.ts 的 normalizeRealmStrict + REALM_ORDER，保持境界归一化与游戏逻辑一致。
 * - 复用 database.ts 的 pool 连接池，与项目数据库访问方式统一。
 *
 * 关键边界条件与坑点：
 * 1) character_rank_snapshot 的 max_qixue/max_lingqi 是 BigInt 类型，
 *    pg 驱动返回字符串，需要 Number() 转换；极大数据可能丢失精度（实际游戏数值不会超出 Number 安全范围）。
 * 2) IQR 过滤对 max_qixue 和 max_lingqi 独立执行，一个玩家可能在一项被排除而在另一项保留，
 *    因此两列的排除数和最终样本数可能不同。
 */

import '../src/bootstrap/installConsoleLogger.js';
import { pool } from '../src/config/database.js';
import { normalizeRealmStrict, REALM_ORDER, type RealmName } from '../src/services/shared/realmRules.js';

// ============================================
// 类型定义
// ============================================

/** 数据库原始行（character_rank_snapshot） */
interface SnapshotRow {
  realm: string;
  max_qixue: string;
  max_lingqi: string;
}

/** 某个属性的统计结果 */
interface AttrStat {
  count: number;
  excluded: number;
  mean: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
}

/** 某个境界的完整统计 */
interface RealmStat {
  realm: RealmName;
  total: number;
  qixueStat: AttrStat;
  lingqiStat: AttrStat;
}

// ============================================
// 统计工具函数
// ============================================

/**
 * 排序数组并取指定百分位的值（线性插值）
 *
 * 输入：已排序的数值数组 + 百分位（0~1）
 * 输出：百分位对应的值
 */
const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo]! + frac * (sorted[hi]! - sorted[lo]!);
};

/**
 * 基于 IQR 过滤极端值
 *
 * 输入：数值数组
 * 输出：过滤后的数组 + 排除数量
 *
 * 逻辑：
 * - 计算 Q1（25%）、Q3（75%）、IQR = Q3 - Q1
 * - 保留范围：[Q1 - 1.5 * IQR, Q3 + 1.5 * IQR]
 * - 样本数 ≤ 3 时不做过滤（样本太少，IQR 无统计意义）
 */
const filterIqr = (values: number[]): { filtered: number[]; excluded: number } => {
  if (values.length <= 3) {
    return { filtered: values, excluded: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const filtered = sorted.filter((v) => v >= lo && v <= hi);
  return { filtered, excluded: values.length - filtered.length };
};

/**
 * 计算单个属性的完整统计（含 IQR 过滤）
 */
const computeAttrStat = (values: number[]): AttrStat => {
  const { filtered, excluded } = filterIqr(values);
  const sorted = [...filtered].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count,
    excluded,
    mean: count > 0 ? Math.round(sum / count) : 0,
    min: count > 0 ? sorted[0]! : 0,
    max: count > 0 ? sorted[count - 1]! : 0,
    p25: count > 0 ? Math.round(percentile(sorted, 0.25)) : 0,
    p50: count > 0 ? Math.round(percentile(sorted, 0.5)) : 0,
    p75: count > 0 ? Math.round(percentile(sorted, 0.75)) : 0,
  };
};

// ============================================
// 主逻辑
// ============================================

const main = async (): Promise<void> => {
  console.log('正在从 character_rank_snapshot 表读取玩家快照数据...\n');

  const { rows } = await pool.query<SnapshotRow>(`
    SELECT realm, max_qixue, max_lingqi
    FROM character_rank_snapshot
  `);

  if (rows.length === 0) {
    console.log('无玩家快照数据。');
    return;
  }

  console.log(`共读取 ${rows.length} 条快照记录。\n`);

  // 归一化境界并过滤无效数值
  const realmIndexMap = new Map<RealmName, number>();
  REALM_ORDER.forEach((r, i) => realmIndexMap.set(r, i));

  // 直接按 REALM_ORDER 索引分组，避免中间数组
  const qixueGroups: number[][] = Array.from({ length: REALM_ORDER.length }, () => []);
  const lingqiGroups: number[][] = Array.from({ length: REALM_ORDER.length }, () => []);

  for (const row of rows) {
    const qixue = Number(row.max_qixue);
    const lingqi = Number(row.max_lingqi);
    if (!Number.isFinite(qixue) || !Number.isFinite(lingqi)) continue;
    if (qixue <= 0 && lingqi <= 0) continue;

    const realm = normalizeRealmStrict(row.realm);
    const idx = realmIndexMap.get(realm);
    if (idx === undefined) continue;

    qixueGroups[idx]!.push(qixue);
    lingqiGroups[idx]!.push(lingqi);
  }

  // 逐境界计算统计
  const stats: RealmStat[] = [];
  for (let i = 0; i < REALM_ORDER.length; i++) {
    const qixueValues = qixueGroups[i]!;
    const lingqiValues = lingqiGroups[i]!;
    const total = qixueValues.length;
    if (total === 0) continue;

    stats.push({
      realm: REALM_ORDER[i]!,
      total,
      qixueStat: computeAttrStat(qixueValues),
      lingqiStat: computeAttrStat(lingqiValues),
    });
  }

  // 格式化输出
  const padRight = (s: string, len: number): string => s.padEnd(len, '　');
  const padNum = (n: number, len: number): string => n.toLocaleString().padStart(len);

  const COL_REALM = 18;
  const COL_NUM = 8;

  // 气血表
  console.log('═'.repeat(90));
  console.log('  气血（max_qixue）统计 — 已排除 IQR 离群值');
  console.log('═'.repeat(90));
  console.log(
    `${'境界'.padEnd(COL_REALM)} ${'人数'.padStart(COL_NUM)} ${'排除'.padStart(COL_NUM)} ${'均值'.padStart(COL_NUM)} ${'最小'.padStart(COL_NUM)} ${'P25'.padStart(COL_NUM)} ${'P50'.padStart(COL_NUM)} ${'P75'.padStart(COL_NUM)} ${'最大'.padStart(COL_NUM)}`,
  );
  console.log('-'.repeat(90));
  for (const s of stats) {
    const q = s.qixueStat;
    console.log(
      `${padRight(s.realm, COL_REALM)} ${padNum(s.total, COL_NUM)} ${padNum(q.excluded, COL_NUM)} ${padNum(q.mean, COL_NUM)} ${padNum(q.min, COL_NUM)} ${padNum(q.p25, COL_NUM)} ${padNum(q.p50, COL_NUM)} ${padNum(q.p75, COL_NUM)} ${padNum(q.max, COL_NUM)}`,
    );
  }

  // 灵力表
  console.log();
  console.log('═'.repeat(90));
  console.log('  灵力（max_lingqi）统计 — 已排除 IQR 离群值');
  console.log('═'.repeat(90));
  console.log(
    `${'境界'.padEnd(COL_REALM)} ${'人数'.padStart(COL_NUM)} ${'排除'.padStart(COL_NUM)} ${'均值'.padStart(COL_NUM)} ${'最小'.padStart(COL_NUM)} ${'P25'.padStart(COL_NUM)} ${'P50'.padStart(COL_NUM)} ${'P75'.padStart(COL_NUM)} ${'最大'.padStart(COL_NUM)}`,
  );
  console.log('-'.repeat(90));
  for (const s of stats) {
    const l = s.lingqiStat;
    console.log(
      `${padRight(s.realm, COL_REALM)} ${padNum(s.total, COL_NUM)} ${padNum(l.excluded, COL_NUM)} ${padNum(l.mean, COL_NUM)} ${padNum(l.min, COL_NUM)} ${padNum(l.p25, COL_NUM)} ${padNum(l.p50, COL_NUM)} ${padNum(l.p75, COL_NUM)} ${padNum(l.max, COL_NUM)}`,
    );
  }

  console.log();
  console.log(`统计完成，共 ${stats.length} 个境界有数据。`);
};

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  });
