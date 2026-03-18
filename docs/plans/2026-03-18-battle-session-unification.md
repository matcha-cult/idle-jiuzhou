# Battle Session Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一普通战斗、秘境战斗、PVP 战斗的会话模型，让“开战、重连、继续下一场/下一波、结束回图”全部由 BattleSession 驱动。

**Architecture:** 保留单场战斗引擎与现有 battle action/state 查询链路，在其外层新增 BattleSession 统一承接会话状态、当前 battleId、推进动作与模式上下文。服务端统一输出 session 快照，前端只持有 active session 与当前 battleId，不再拼 dungeon/arena/local 三套推进逻辑。

**Tech Stack:** TypeScript、Express、React、Ant Design、现有 battle engine/runtime/socket 架构

---

### Task 1: 定义 BattleSession 领域模型

**Files:**
- Create: `server/src/services/battleSession/types.ts`
- Create: `server/src/services/battleSession/runtime.ts`

**Step 1: 写领域类型**
- 定义 `BattleSessionType/BattleSessionStatus/BattleSessionNextAction`
- 定义 `BattleSessionRecord/BattleSessionSnapshot`
- 定义 `pve/dungeon/pvp` 三类上下文

**Step 2: 实现运行时存储**
- 建立 `sessionById` 与 `sessionIdByBattleId`
- 实现 snapshot 构造、battle 绑定解绑、查询接口

### Task 2: 实现 BattleSession 服务

**Files:**
- Create: `server/src/services/battleSession/service.ts`
- Create: `server/src/services/battleSession/index.ts`
- Modify: `server/src/services/battle/pve.ts`
- Modify: `server/src/services/battle/pvp.ts`
- Modify: `server/src/services/dungeon/combat.ts`

**Step 1: 接入普通战斗**
- 新增 `startPVEBattleSession`
- 复用现有 `startPVEBattle`
- 创建 session 并绑定首场 battle

**Step 2: 接入秘境**
- 新增 `startDungeonBattleSession/advanceDungeonBattleSession`
- 复用现有 `startDungeonInstance/nextDungeonInstance`
- session 上下文只保留 `instanceId`

**Step 3: 接入 PVP**
- 新增 `startPVPBattleSession`
- 统一竞技场/普通挑战会话
- 会话结束后统一回图

### Task 3: 让 battle runtime 与 settlement 感知 session

**Files:**
- Modify: `server/src/services/battle/runtime/ticker.ts`
- Modify: `server/src/services/battle/settlement.ts`
- Modify: `server/src/services/battle/action.ts`

**Step 1: 结算时刷新 session**
- 战斗结束后写入 `nextAction/status/currentBattleId`

**Step 2: 放弃战斗时关闭 session**
- abandon 后把 session 标记为 `abandoned`

**Step 3: socket 更新补充 session 快照**
- battle update payload 增加当前 session snapshot

### Task 4: 暴露统一 BattleSession 路由

**Files:**
- Create: `server/src/routes/battleSessionRoutes.ts`
- Modify: `server/src/bootstrap/registerRoutes.ts`
- Modify: `server/src/domains/battle/index.ts`
- Modify: `server/src/routes/arenaRoutes.ts`

**Step 1: 新增路由**
- `POST /api/battle-session/start`
- `POST /api/battle-session/:sessionId/advance`
- `GET /api/battle-session/:sessionId`
- `GET /api/battle-session/by-battle/:battleId`

**Step 2: 竞技场路由返回 session**
- `challenge/match` 不再直接只返回 battleId
- 统一返回 session 快照

### Task 5: 新增客户端 BattleSession API

**Files:**
- Create: `client/src/services/api/battleSession.ts`
- Modify: `client/src/services/api/index.ts` 或聚合导出入口
- Modify: `client/src/services/api/combat-realm.ts`

**Step 1: 定义客户端 session DTO**
- 与服务端 snapshot 对齐

**Step 2: 暴露统一 start/advance/query API**
- 普通战斗、秘境、PVP 都通过 session API 启动

### Task 6: 改造 Game 页为单一 active session 驱动

**Files:**
- Modify: `client/src/pages/Game/index.tsx`
- Modify: `client/src/pages/Game/modules/ArenaModal/index.tsx`
- Modify: `client/src/pages/Game/modules/BattleArea/index.tsx`
- Modify: `client/src/pages/Game/shared/dungeonBattleReconnect.ts`
- Modify: `client/src/pages/Game/shared/battleViewSync.ts`

**Step 1: 用 `activeBattleSession` 替代 dungeon/arena 分裂状态**
- 收口 `sessionId/type/currentBattleId/nextAction`

**Step 2: 普通地图开战改为 session start**
- BattleArea 本地自动开战不再直接调 `/battle/start`

**Step 3: 继续按钮与自动继续统一走 session advance**
- 不再区分 `dungeonBattleId/arenaBattleId`

**Step 4: 重连恢复统一按 battleId 查 session**
- 不再只给秘境写专用恢复分支

### Task 7: 删除旧分叉判断与补回归测试

**Files:**
- Modify: `client/src/pages/Game/modules/__tests__/battleAutoNextPolicy.test.ts`
- Modify: `client/src/pages/Game/shared/__tests__/dungeonBattleReconnect.test.ts`
- Create: `server/src/services/__tests__/battleSessionService.test.ts`
- Create: `client/src/pages/Game/shared/__tests__/battleSessionFlow.test.ts`

**Step 1: 为 session start/advance/finish 补服务端测试**
- 覆盖 pve/dungeon/pvp 三种模式

**Step 2: 为前端 active session 驱动补测试**
- 覆盖开战、推进、恢复、结束回图

### Task 8: 最终校验

**Files:**
- Modify: 所有实现中实际涉及的文件

**Step 1: 运行 TypeScript 构建校验**
- Run: `tsc -b`
- Expected: exit code 0

**Step 2: 汇总变更与风险**
- 明确 battle engine 仍负责单场战斗
- 明确 session 成为唯一推进入口
