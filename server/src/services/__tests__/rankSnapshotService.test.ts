import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCharacterRankSnapshotRow } from '../rankSnapshotService.js';
import { getCharacterRankSnapshotCompatibilityQueries } from '../../models/characterRankSnapshotTable.js';

test('buildCharacterRankSnapshotRow: 应提取排行榜快照字段并沿用当前战力公式', () => {
  const row = buildCharacterRankSnapshotRow({
    id: 17,
    nickname: '青云子',
    realm: '炼神返虚·合道期',
    sub_realm: null,
    wugong: 120,
    fagong: 80,
    wufang: 60,
    fafang: 40,
    max_qixue: 1500,
    max_lingqi: 800,
    sudu: 90,
  });

  assert.deepEqual(row, {
    characterId: 17,
    nickname: '青云子',
    realm: '炼神返虚·合道期',
    realmRank: 9,
    power: 2690,
    wugong: 120,
    fagong: 80,
    wufang: 60,
    fafang: 40,
    maxQixue: 1500,
    maxLingqi: 800,
    sudu: 90,
  });
});

test('buildCharacterRankSnapshotRow: 未知境界与空属性应按安全口径收敛', () => {
  const row = buildCharacterRankSnapshotRow({
    id: 9,
    nickname: '',
    realm: '未知境界',
    sub_realm: null,
    wugong: 10,
    fagong: undefined,
    wufang: null,
    fafang: Number.NaN,
    max_qixue: 200,
    max_lingqi: 0,
    sudu: 5,
  });

  assert.deepEqual(row, {
    characterId: 9,
    nickname: '',
    realm: '未知境界',
    realmRank: 0,
    power: 215,
    wugong: 10,
    fagong: 0,
    wufang: 0,
    fafang: 0,
    maxQixue: 200,
    maxLingqi: 0,
    sudu: 5,
  });
});

test('getCharacterRankSnapshotCompatibilityQueries: 应先补列，再补注释与排序索引', () => {
  const queries = getCharacterRankSnapshotCompatibilityQueries();

  const addRealmRankIndex = queries.findIndex((query) =>
    /ALTER TABLE character_rank_snapshot ADD COLUMN IF NOT EXISTS realm_rank INTEGER NOT NULL DEFAULT 0/.test(query),
  );
  const addPowerIndex = queries.findIndex((query) =>
    /ALTER TABLE character_rank_snapshot ADD COLUMN IF NOT EXISTS power BIGINT NOT NULL DEFAULT 0/.test(query),
  );
  const addWugongIndex = queries.findIndex((query) =>
    /ALTER TABLE character_rank_snapshot ADD COLUMN IF NOT EXISTS wugong BIGINT NOT NULL DEFAULT 0/.test(query),
  );
  const commentPowerIndex = queries.findIndex((query) =>
    /COMMENT ON COLUMN character_rank_snapshot\.power IS '排行榜综合战力快照'/.test(query),
  );
  const rankIndexQueryIndex = queries.findIndex((query) =>
    /CREATE INDEX IF NOT EXISTS idx_character_rank_snapshot_realm_power/.test(query),
  );

  assert.ok(addRealmRankIndex >= 0, '应生成 realm_rank 补列语句');
  assert.ok(addPowerIndex >= 0, '应生成 power 补列语句');
  assert.ok(addWugongIndex >= 0, '应生成 BIGINT 物攻补列语句');
  assert.ok(commentPowerIndex > addPowerIndex, 'power 注释必须在补列之后');
  assert.ok(rankIndexQueryIndex > addRealmRankIndex, '排序索引必须在 realm_rank 补列之后');
  assert.ok(rankIndexQueryIndex > addPowerIndex, '排序索引必须在 power 补列之后');
});
