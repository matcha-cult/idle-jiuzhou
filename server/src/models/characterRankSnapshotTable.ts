/**
 * 角色排行榜快照表初始化。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：创建 `character_rank_snapshot` 表，作为境界排行榜的 SQL 投影数据源。
 * 2. 做什么：兼容旧库升级，保证补列、注释、索引顺序稳定。
 * 3. 不做什么：不计算快照内容，不承载角色主数据，不直接参与业务判定。
 *
 * 输入/输出：
 * - 输入：无，初始化阶段由 `initTables` 调用。
 * - 输出：表、注释、索引存在且兼容升级可执行。
 *
 * 数据流/状态流：
 * - 启动初始化 -> 建表 -> 执行兼容补列 SQL -> 补注释 -> 创建排序索引。
 *
 * 关键边界条件与坑点：
 * 1. 兼容升级必须先补列再建索引，否则旧库在缺列状态下会直接失败。
 * 2. 这里的字段是排行榜派生快照，不应再被其他业务当作角色真值来源使用。
 */
import { query } from '../config/database.js';

type CompatibleColumnDefinition = {
  name: string;
  definition: string;
  comment?: string;
};

const compatibleColumns: readonly CompatibleColumnDefinition[] = [
  { name: 'nickname', definition: "nickname VARCHAR(50) NOT NULL DEFAULT ''", comment: '排行榜展示昵称' },
  { name: 'realm', definition: "realm VARCHAR(64) NOT NULL DEFAULT '凡人'", comment: '排行榜展示境界文本' },
  { name: 'realm_rank', definition: 'realm_rank INTEGER NOT NULL DEFAULT 0', comment: '境界排序值（0-based）' },
  { name: 'power', definition: 'power BIGINT NOT NULL DEFAULT 0', comment: '排行榜综合战力快照' },
  { name: 'wugong', definition: 'wugong BIGINT NOT NULL DEFAULT 0', comment: '物攻快照' },
  { name: 'fagong', definition: 'fagong BIGINT NOT NULL DEFAULT 0', comment: '法攻快照' },
  { name: 'wufang', definition: 'wufang BIGINT NOT NULL DEFAULT 0', comment: '物防快照' },
  { name: 'fafang', definition: 'fafang BIGINT NOT NULL DEFAULT 0', comment: '法防快照' },
  { name: 'max_qixue', definition: 'max_qixue BIGINT NOT NULL DEFAULT 0', comment: '最大气血快照' },
  { name: 'max_lingqi', definition: 'max_lingqi BIGINT NOT NULL DEFAULT 0', comment: '最大灵气快照' },
  { name: 'sudu', definition: 'sudu BIGINT NOT NULL DEFAULT 0', comment: '速度快照' },
  { name: 'updated_at', definition: 'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', comment: '快照更新时间' },
];

const renderColumnDefinitions = (columns: readonly CompatibleColumnDefinition[]): string => {
  return columns.map(({ definition }) => `  ${definition},`).join('\n');
};

const buildColumnMigrationQueries = (tableName: string, columns: readonly CompatibleColumnDefinition[]): string[] => {
  return columns.map(({ definition }) => `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${definition}`);
};

const buildColumnCommentQueries = (tableName: string, columns: readonly CompatibleColumnDefinition[]): string[] => {
  return columns
    .filter((column): column is CompatibleColumnDefinition & { comment: string } => typeof column.comment === 'string')
    .map(({ name, comment }) => `COMMENT ON COLUMN ${tableName}.${name} IS '${comment}'`);
};

const characterRankSnapshotTableSQL = `
CREATE TABLE IF NOT EXISTS character_rank_snapshot (
  character_id BIGINT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
${renderColumnDefinitions(compatibleColumns)}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE character_rank_snapshot IS '角色排行榜快照表';
COMMENT ON COLUMN character_rank_snapshot.character_id IS '角色ID';
COMMENT ON COLUMN character_rank_snapshot.created_at IS '快照创建时间';
`;

const characterRankSnapshotIndexQueries: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_character_rank_snapshot_realm_power
    ON character_rank_snapshot(realm_rank DESC, power DESC, character_id ASC)`,
];

export const getCharacterRankSnapshotCompatibilityQueries = (): string[] => [
  ...buildColumnMigrationQueries('character_rank_snapshot', compatibleColumns),
  ...buildColumnCommentQueries('character_rank_snapshot', compatibleColumns),
  ...characterRankSnapshotIndexQueries,
];

export const initCharacterRankSnapshotTable = async (): Promise<void> => {
  await query(characterRankSnapshotTableSQL);
  for (const migrationQuery of getCharacterRankSnapshotCompatibilityQueries()) {
    await query(migrationQuery);
  }
  console.log('✓ 角色排行榜快照表检测完成');
};
