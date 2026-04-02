/**
 * 境界突破固定气血奖励约束测试
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：校验 `realm_breakthrough.json` 中每一档突破都声明了递增的固定气血上限奖励，并约束奖励预览链路与角色属性累计链路都接入 `flat` 奖励结构。
 * 2) 不做什么：不执行真实突破事务、不连接数据库、不校验百分比奖励细节。
 *
 * 输入 / 输出：
 * - 输入：`realm_breakthrough.json`、`realmService.ts`、`characterComputedService.ts` 的源码文本。
 * - 输出：静态断言结果；任一奖励缺失、递增不连续或服务端链路未接入 `flat` 时直接失败。
 *
 * 数据流 / 状态流：
 * seed 文件 -> 奖励静态断言；
 * service 源码 -> 预览/累计接线断言。
 *
 * 复用设计说明：
 * - 把“固定 max_qixue 奖励按突破顺序每档 +50 递增”的规则收敛到单一测试入口，避免后续在多个配置测试里分散写一遍。
 * - 同时覆盖预览与累计链路，防止只改 seed 或只改计算服务导致奖励显示与实际生效脱节。
 *
 * 关键边界条件与坑点：
 * 1) 断言严格依赖 `realmOrder` 与 `breakthroughs` 顺序一一对应，若后续新增跳级配置，这里需要同步调整规则。
 * 2) 源码断言依赖关键实现片段；若后续重构命名，需要一并更新本测试，避免出现假阴性。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Breakthrough = {
  from?: string;
  to?: string;
  rewards?: {
    flat?: Record<string, number>;
  };
};

type RealmBreakthroughSeed = {
  realmOrder?: string[];
  breakthroughs?: Breakthrough[];
};

const loadSeed = (): RealmBreakthroughSeed => {
  const candidatePaths = [
    resolve(process.cwd(), 'server/src/data/seeds/realm_breakthrough.json'),
    resolve(process.cwd(), 'src/data/seeds/realm_breakthrough.json'),
  ];
  const seedPath = candidatePaths.find((filePath) => existsSync(filePath));
  assert.ok(seedPath, '未找到 realm_breakthrough.json');
  return JSON.parse(readFileSync(seedPath, 'utf-8')) as RealmBreakthroughSeed;
};

const readServiceSource = (relativePath: string): string => {
  const candidatePaths = [
    resolve(process.cwd(), 'server/src/services', relativePath),
    resolve(process.cwd(), 'src/services', relativePath),
  ];
  const filePath = candidatePaths.find((value) => existsSync(value));
  assert.ok(filePath, `未找到 ${relativePath}`);
  return readFileSync(filePath, 'utf-8');
};

test('所有境界突破都应按顺序提供每档 +50 递增的固定气血上限奖励', () => {
  const seed = loadSeed();
  const realmOrder = seed.realmOrder ?? [];
  const breakthroughs = seed.breakthroughs ?? [];

  assert.equal(realmOrder.length, breakthroughs.length + 1, 'realmOrder 与 breakthroughs 数量不匹配');

  breakthroughs.forEach((entry, index) => {
    const expectedReward = (index + 1) * 50;
    assert.equal(entry.from, realmOrder[index], `第 ${index + 1} 档突破 from 与 realmOrder 不一致`);
    assert.equal(entry.to, realmOrder[index + 1], `第 ${index + 1} 档突破 to 与 realmOrder 不一致`);
    assert.equal(
      entry.rewards?.flat?.max_qixue,
      expectedReward,
      `${entry.from ?? 'unknown'} -> ${entry.to ?? 'unknown'} 的固定气血奖励应为 ${expectedReward}`,
    );
  });
});

test('突破奖励预览与角色属性累计链路都应接入 flat 奖励结构', () => {
  const realmServiceSource = readServiceSource('realmService.ts');
  const computedSource = readServiceSource('characterComputedService.ts');

  assert.match(realmServiceSource, /const flat = r\.flat \|\| \{\};/u);
  assert.match(realmServiceSource, /id: `flat-\$\{key\}`/u);
  assert.match(realmServiceSource, /for \(const rewardDef of BREAKTHROUGH_NUMERIC_REWARD_DEFS\) \{\s*addFlatRow/u);

  assert.match(computedSource, /const flat = toRecord\(entry\.rewards\?\.flat\) as BreakthroughFlatRewards;/u);
  assert.match(computedSource, /runningFlat\[rewardDef\.key\] = \(runningFlat\[rewardDef\.key\] \|\| 0\) \+ flatValue;/u);
  assert.match(computedSource, /applyAttrDelta\(stats, rewardDef\.key, flatValue\);/u);
});
