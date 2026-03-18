# Battle Socket Only Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让战斗展示与推进在前端彻底改为 socket 驱动，同时移除 `BattleState` 对 `logs` 的耦合，并保留刷新重连、组队观战、秘境推进、自动下一场等现有能力。

**Architecture:** 服务端新增统一的战斗实时消息载荷，把状态快照、日志增量、结算信息都收敛为 socket 单一入口；前端 `gameSocket` 缓存最近一份完整战斗快照并对晚订阅组件回放，`BattleArea` 改为分别维护 `battleState` 与 `battleLogs`。HTTP `battle/action` 保留为命令提交入口，但不再返回战斗状态；客户端移除 `/battle/state/:battleId` 依赖。

**Tech Stack:** TypeScript、React、Socket.IO、Express、Node

---

### Task 1: 定义统一的战斗实时消息模型

**Files:**
- Modify: `server/src/services/battle/runtime/ticker.ts`
- Modify: `server/src/services/battle/teamHooks.ts`
- Modify: `server/src/services/battle/action.ts`
- Modify: `server/src/services/battle/settlement.ts`
- Modify: `client/src/services/api/combat-realm.ts`
- Create: `client/src/pages/Game/shared/battleRealtime.ts`

**Step 1:** 提炼 socket 战斗消息类型，明确完整快照、状态增量、结束、放弃的共同字段。  
**Step 2:** 服务端统一改成“`state` 不含 `logs`，日志独立在消息顶层”的输出口径。  
**Step 3:** 前端新增复用的战斗实时消息解析模块，供 `Game`、`BattleArea`、`SkillFloatButton` 共用。  

### Task 2: 服务端补齐首帧全量同步与日志独立输出

**Files:**
- Modify: `server/src/game/gameServer.ts`
- Modify: `server/src/services/battle/runtime/ticker.ts`
- Modify: `server/src/services/battle/teamHooks.ts`

**Step 1:** 认证重连时，把当前战斗推送为完整快照消息，而不是沿用普通 `battle_started` 语义。  
**Step 2:** battle ticker 保留日志增量优化，但把 `logs/logDelta/logStart` 从 `state` 中剥离。  
**Step 3:** 结束与放弃消息统一带完整终态数据，确保前端不必回源 HTTP。  

### Task 3: 前端 socket 层增加战斗快照缓存与回放

**Files:**
- Modify: `client/src/services/gameSocket.ts`
- Create/Modify: `client/src/pages/Game/shared/battleRealtime.ts`

**Step 1:** `gameSocket` 缓存最近一份完整战斗消息。  
**Step 2:** `onBattleUpdate` 新订阅时立即回放缓存的完整快照，避免刷新/重挂载丢首帧。  
**Step 3:** 保持现有 battle cooldown 等事件不受影响。  

### Task 4: BattleArea 去掉 HTTP 状态依赖并拆分状态/日志

**Files:**
- Modify: `client/src/pages/Game/modules/BattleArea/index.tsx`
- Modify: `client/src/pages/Game/modules/BattleArea/logFormatterFast.ts`

**Step 1:** 把 `battleState` 与 `battleLogs` 拆成两份本地源。  
**Step 2:** 让浮字、战况聊天、战斗公告统一改吃独立日志流。  
**Step 3:** 删除 `/battle/state/:battleId` 首帧拉取与轮询补偿逻辑。  
**Step 4:** `battleAction` 成功后仅等待 socket 更新，不再使用 HTTP 返回 state 驱动 UI。  

### Task 5: 其他前端消费者切到统一消息模型

**Files:**
- Modify: `client/src/pages/Game/index.tsx`
- Modify: `client/src/pages/Game/modules/SkillFloatButton/index.tsx`

**Step 1:** `Game` 页改用统一 battle realtime 解析，继续保留本地战斗/重连接管判定。  
**Step 2:** `SkillFloatButton` 从新消息模型读取状态，不再依赖旧消息结构。  

### Task 6: 收尾与静态校验

**Files:**
- Modify: `server/src/routes/battleRoutes.ts`
- Modify: `client/src/services/api/combat-realm.ts`
- Modify: 受编译错误影响的类型引用文件

**Step 1:** 收窄 `/battle/action` 响应类型，移除客户端对 `/battle/state/:battleId` 的使用与导出。  
**Step 2:** 静态清理所有 `state.logs`、`getBattleState` 前端引用。  
**Step 3:** 运行 `tsc -b`，根据结果修正类型与调用链。  
