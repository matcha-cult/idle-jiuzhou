# 伙伴易名符支持描述修改 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让伙伴在消耗易名符时可同时修改实例名、实例头像和实例描述，并保持角色易名符流程不受影响。

**Architecture:** 在 `character_partner` 增加实例级 `description` 字段，后端继续复用 `/partner/renameWithCard` 单一事务入口更新名字、头像与描述，前端扩展共享易名符弹窗为“名字必填 + 描述可选”的复用表单，仅伙伴场景开启描述编辑。伙伴展示 DTO 统一优先读取实例描述，再回退模板描述，避免前端散落重复判断。

**Tech Stack:** TypeScript、React、Ant Design、Node.js、PostgreSQL、Prisma Schema、node:test、tsc -b

---

### Task 1: 锁定后端实例描述改名行为

**Files:**
- Modify: `server/src/services/__tests__/partnerRenameWithCard.test.ts`
- Modify: `server/src/services/shared/partnerView.ts`
- Modify: `server/src/services/partnerService.ts`
- Modify: `server/prisma/schema.prisma`

**Step 1: Write the failing test**

- 增加“伙伴易名符改名应同时写入实例描述并优先返回实例描述”测试。
- 增加“未传实例描述时仍回退模板描述”测试。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter server exec tsx --test src/services/__tests__/partnerRenameWithCard.test.ts`

Expected: FAIL，提示改名 SQL 未更新 `description` 或展示 DTO 未返回实例描述。

**Step 3: Write minimal implementation**

- 在 `character_partner` 增加 `description` 列。
- 扩展伙伴改名服务入参与更新 SQL。
- 调整伙伴展示 DTO 的描述优先级。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter server exec tsx --test src/services/__tests__/partnerRenameWithCard.test.ts`

Expected: PASS

### Task 2: 锁定前端共享改名弹窗的描述扩展

**Files:**
- Modify: `client/src/pages/Game/shared/__tests__/useRenameCardFlow.test.tsx`
- Modify: `client/src/pages/Game/modules/__tests__/partnerRenameCardFlow.test.tsx`
- Modify: `client/src/pages/Game/shared/CharacterRenameModal.tsx`
- Modify: `client/src/pages/Game/shared/useRenameCardFlow.tsx`
- Modify: `client/src/pages/Game/modules/PartnerModal/usePartnerRenameCardFlow.tsx`
- Modify: `client/src/services/api/partner.ts`

**Step 1: Write the failing test**

- 增加“伙伴改名场景提交时携带 description”测试。
- 增加“角色改名场景不渲染描述字段且不提交 description”测试。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter client exec vitest run src/pages/Game/modules/__tests__/partnerRenameCardFlow.test.tsx src/pages/Game/shared/__tests__/useRenameCardFlow.test.tsx`

Expected: FAIL，提示弹窗没有描述字段或请求参数缺少 `description`。

**Step 3: Write minimal implementation**

- 扩展共享弹窗与共享 flow 的可选描述配置。
- 伙伴改名流接入当前描述初值与提交参数。
- 扩展伙伴改名 API 类型。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter client exec vitest run src/pages/Game/modules/__tests__/partnerRenameCardFlow.test.tsx src/pages/Game/shared/__tests__/useRenameCardFlow.test.tsx`

Expected: PASS

### Task 3: 做全量类型校验

**Files:**
- Modify: `client/src/services/api/partner.ts`
- Modify: `server/src/routes/partnerRoutes.ts`
- Modify: `server/src/services/partnerService.ts`
- Modify: `server/src/services/shared/partnerView.ts`

**Step 1: Run TypeScript build verification**

Run: `tsc -b`

Expected: PASS；若失败，先修复新增描述字段造成的类型不一致，再重新执行。
