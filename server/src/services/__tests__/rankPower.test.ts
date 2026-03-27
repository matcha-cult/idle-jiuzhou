import assert from 'node:assert/strict';
import test from 'node:test';

import { computeRankPower } from '../shared/rankPower.js';

/**
 * 排行榜战力公式回归测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住排行榜/竞技场/角色快照/伙伴快照共用的战力权重入口，避免后续改动只剩攻防血速在生效。
 * 2. 做什么：验证默认比率基线不会平白放大战力，并确认恢复、控制、五行抗性等属性已被纳入评分。
 * 3. 不做什么：不验证真实战斗伤害，不断言具体数值常量，也不覆盖角色属性来源计算。
 *
 * 输入/输出：
 * - 输入：精简的战力计算源数据。
 * - 输出：对 `computeRankPower` 单调性与基线规则的断言结果。
 *
 * 数据流/状态流：
 * 测试样例 -> rankPower.computeRankPower -> 断言战力增量方向 -> 锁住共享权重口径。
 *
 * 复用设计说明：
 * 1. 这里只测共享公式单点，不去角色榜、伙伴榜、竞技场分别重复造同类断言。
 * 2. 通过“基线 / 比率 / 恢复 / 抗性 / 双修”几个代表样例覆盖主要分组，后续调权重只需要维护这一组测试意图。
 * 3. 用增量断言而不是硬编码总值，避免正常调权时每次都要机械更新整串数字。
 *
 * 关键边界条件与坑点：
 * 1. 命中、闪避、暴击、暴伤有默认基线，测试必须锁住“仅高于基线才加分”，否则公式很容易被默认值污染。
 * 2. 双攻双防不能按主属性完全同权累加；这里只验证有次级收益，不把实现细节绑死在具体常量上。
 */

test('computeRankPower: 默认比率基线不应平白抬高战力', () => {
  assert.equal(
    computeRankPower({
      mingzhong: 0.9,
      shanbi: 0.05,
      zhaojia: 0.05,
      baoji: 0.1,
      baoshang: 1.5,
    }),
    0,
  );
});

test('computeRankPower: 核心比率属性高于基线时应提升战力', () => {
  const base = computeRankPower({
    wugong: 120,
    fagong: 60,
    wufang: 80,
    fafang: 50,
    max_qixue: 1800,
    max_lingqi: 240,
    sudu: 7,
  });

  const enhanced = computeRankPower({
    wugong: 120,
    fagong: 60,
    wufang: 80,
    fafang: 50,
    max_qixue: 1800,
    max_lingqi: 240,
    sudu: 7,
    mingzhong: 1.05,
    baoji: 0.18,
    baoshang: 1.9,
    zengshang: 0.12,
  });

  assert.ok(enhanced > base);
});

test('computeRankPower: 恢复、控制抗性与五行抗性应进入战力', () => {
  const base = computeRankPower({
    max_qixue: 1200,
    max_lingqi: 180,
    wugong: 90,
    wufang: 70,
  });

  const enhanced = computeRankPower({
    max_qixue: 1200,
    max_lingqi: 180,
    wugong: 90,
    wufang: 70,
    qixue_huifu: 12,
    lingqi_huifu: 10,
    kongzhi_kangxing: 0.6,
    huo_kangxing: 0.25,
    shui_kangxing: 0.18,
  });

  assert.ok(enhanced > base);
});

test('computeRankPower: 双攻双防应有次级收益而不是被完全忽略', () => {
  const singleTrack = computeRankPower({
    wugong: 200,
    fagong: 0,
    wufang: 150,
    fafang: 0,
  });

  const hybrid = computeRankPower({
    wugong: 200,
    fagong: 120,
    wufang: 150,
    fafang: 90,
  });

  assert.ok(hybrid > singleTrack);
});
