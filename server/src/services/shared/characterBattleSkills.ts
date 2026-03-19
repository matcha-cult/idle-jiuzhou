/**
 * 角色战斗技能共享读取模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一读取角色当前战斗应携带的技能，保留主动技能槽顺序，并自动追加被动/反击/追击等非手动技能。
 * 2. 做什么：让功法服务与战斗准备层复用同一套“战斗带入技能 + 升级层数”口径，避免手动配技与实战装配串口径。
 * 3. 不做什么：不负责把技能定义转换成战斗引擎 SkillData，也不负责写入技能槽或功法数据。
 *
 * 输入/输出：
 * - 输入：characterId，或“已装备主动技能顺序 + 当前已解锁技能明细”。
 * - 输出：按“主动技能槽顺序 + 自动带入的非手动技能”返回 `{ skillId, upgradeLevel }[]`。
 *
 * 数据流/状态流：
 * character_skill_slot 已装备主动技能 -> characterAvailableSkills 读取当前已解锁技能全集
 * -> 保留槽位中的主动技能顺序，并自动追加 passive/counter/chase 等非手动技能
 * -> 调用方继续组装战斗技能。
 *
 * 关键边界条件与坑点：
 * 1. 主动技能仍只认技能槽顺序；未上槽的主动技能不能偷偷进战斗。
 * 2. passive/counter/chase 等非手动技能必须自动带入战斗，不能复用“手动可配置技能集合”把它们误删。
 */

import { query } from '../../config/database.js';
import {
  loadCharacterUnlockedSkillEntries,
  type CharacterAvailableSkillEntry,
} from './characterAvailableSkills.js';
import { isManualSkillTriggerType } from '../../shared/skillTriggerType.js';

type CharacterSkillSlotRow = {
  skill_id: string | null;
};

export interface CharacterBattleSkillEntry {
  skillId: string;
  upgradeLevel: number;
}

const normalizeSkillId = (value: string | null): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const loadOrderedEquippedSkillIds = async (characterId: number): Promise<string[]> => {
  const slotResult = await query(
    'SELECT skill_id FROM character_skill_slot WHERE character_id = $1 ORDER BY slot_index',
    [characterId],
  );
  if (slotResult.rows.length <= 0) return [];

  const rawOrderedSkillIds = (slotResult.rows as CharacterSkillSlotRow[])
    .map((row) => normalizeSkillId(row.skill_id))
    .filter((skillId): skillId is string => skillId.length > 0);
  return rawOrderedSkillIds;
};

const toCharacterBattleSkillEntry = (
  skill: Pick<CharacterAvailableSkillEntry, 'skillId' | 'upgradeLevel'>,
): CharacterBattleSkillEntry => {
  return {
    skillId: skill.skillId,
    upgradeLevel: skill.upgradeLevel,
  };
};

export const mergeCharacterBattleSkillEntries = (params: {
  equippedSkillIds: string[];
  unlockedSkillEntries: CharacterAvailableSkillEntry[];
}): CharacterBattleSkillEntry[] => {
  const manualSkillEntryBySkillId = new Map<string, CharacterBattleSkillEntry>();
  const autoBattleEntries: CharacterBattleSkillEntry[] = [];

  for (const entry of params.unlockedSkillEntries) {
    if (isManualSkillTriggerType(entry.triggerType)) {
      if (!manualSkillEntryBySkillId.has(entry.skillId)) {
        manualSkillEntryBySkillId.set(entry.skillId, toCharacterBattleSkillEntry(entry));
      }
      continue;
    }
    autoBattleEntries.push(toCharacterBattleSkillEntry(entry));
  }

  const orderedEquippedEntries = params.equippedSkillIds
    .map((skillId) => manualSkillEntryBySkillId.get(skillId))
    .filter((entry): entry is CharacterBattleSkillEntry => entry !== undefined);

  return [...orderedEquippedEntries, ...autoBattleEntries];
};

export const loadCharacterBattleSkillEntries = async (
  characterId: number,
): Promise<CharacterBattleSkillEntry[]> => {
  const [equippedSkillIds, unlockedSkillEntries] = await Promise.all([
    loadOrderedEquippedSkillIds(characterId),
    loadCharacterUnlockedSkillEntries(characterId),
  ]);
  if (equippedSkillIds.length <= 0 && unlockedSkillEntries.length <= 0) return [];

  return mergeCharacterBattleSkillEntries({
    equippedSkillIds,
    unlockedSkillEntries,
  });
};
