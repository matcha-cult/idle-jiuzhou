/**
 * 第一章第二节新手装备发放测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：锁定第一章第 2 节对白发奖必须同时赠送新手剑与布衣，避免新手装备拆散到多处后再次漏发防具。
 * - 不做什么：不执行真实对白流程，也不验证后续穿戴、属性计算或其他章节奖励。
 *
 * 输入/输出：
 * - 输入：第一章对白种子与装备定义种子。
 * - 输出：断言 `dlg-main-1-002` 的 `effects` 中存在 `equip-weapon-001`、`equip-clothes-001` 两条 `give_item`，且系统提示文案同时包含两件装备名称。
 *
 * 数据流/状态流：
 * - 先从第一章对白种子中定位 `dlg-main-1-002`；
 * - 再读取起始节点的 `effects`，统一检查新手装备发放列表；
 * - 最后结合装备定义与系统节点文本，确认配置和展示文案保持同一数据意图。
 *
 * 关键边界条件与坑点：
 * 1) 新手剑属于对白效果发放，而不是任务节 `rewards`；测试必须锁定 `dialogue -> start.effects`，避免改错入口后误以为已经生效。
 * 2) 只加 `give_item` 不改系统提示，会让玩家实际拿到装备却看不到提示；因此这里一并锁住 `sys-1` 文案必须提到布衣。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { asArray, asObject, asText, buildObjectMap, loadSeed } from './seedTestUtils.js';

const TARGET_DIALOGUE_ID = 'dlg-main-1-002';
const TARGET_START_NODE_ID = 'start';
const TARGET_SYSTEM_NODE_ID = 'sys-1';
const STARTER_GEAR_IDS = ['equip-weapon-001', 'equip-clothes-001'] as const;
const STARTER_GEAR_NAMES = ['新手剑', '布衣'] as const;

test('第一章第2节对白应同时发放新手剑与布衣', () => {
  const dialogueSeed = loadSeed('dialogue_main_chapter1.json');
  const equipmentSeed = loadSeed('equipment_def.json');

  const dialogueById = buildObjectMap(asArray(dialogueSeed.dialogues), 'id');
  const equipmentById = buildObjectMap(asArray(equipmentSeed.items), 'id');

  const dialogue = dialogueById.get(TARGET_DIALOGUE_ID);
  assert.ok(dialogue, `缺少主线对白定义: ${TARGET_DIALOGUE_ID}`);

  const nodeById = buildObjectMap(asArray(dialogue.nodes), 'id');
  const startNode = nodeById.get(TARGET_START_NODE_ID);
  assert.ok(startNode, `${TARGET_DIALOGUE_ID} 缺少起始节点: ${TARGET_START_NODE_ID}`);

  const effects = asArray(startNode.effects);
  for (const gearId of STARTER_GEAR_IDS) {
    const effect = effects.find((entry) => {
      const effectObject = asObject(entry);
      const params = asObject(effectObject?.params);
      return asText(effectObject?.type) === 'give_item' && asText(params?.item_def_id) === gearId;
    });

    assert.ok(effect, `${TARGET_DIALOGUE_ID} 未配置新手装备发放: ${gearId}`);
    const effectObject = asObject(effect);
    const params = asObject(effectObject?.params);
    assert.equal(Number(params?.quantity), 1, `${TARGET_DIALOGUE_ID} 的 ${gearId} 发放数量应为 1`);
  }

  STARTER_GEAR_IDS.forEach((gearId, index) => {
    const equipment = equipmentById.get(gearId);
    assert.ok(equipment, `缺少装备定义: ${gearId}`);
    assert.equal(asText(equipment.name), STARTER_GEAR_NAMES[index], `${gearId} 装备名称与预期不一致`);
  });

  const systemNode = nodeById.get(TARGET_SYSTEM_NODE_ID);
  assert.ok(systemNode, `${TARGET_DIALOGUE_ID} 缺少系统提示节点: ${TARGET_SYSTEM_NODE_ID}`);
  const systemText = asText(systemNode.text);
  STARTER_GEAR_NAMES.forEach((gearName) => {
    assert.ok(systemText.includes(gearName), `${TARGET_DIALOGUE_ID} 的系统提示未提到装备：${gearName}`);
  });
});
