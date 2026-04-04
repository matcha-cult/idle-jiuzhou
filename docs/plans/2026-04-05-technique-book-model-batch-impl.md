# Technique Book Model Batch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增一个可指定功法文本模型、批量生成若干本功法书并落盘为 JSON 的联调脚本，同时复用现有单次联调链路且禁用图片生成。

**Architecture:** 把现有 `server/scripts/test-technique-model.ts` 里的模型请求、JSON 解析、结构归一化收敛到 `server/src/scripts/shared` 共享模块，由共享模块提供“单次生成”能力。新增一个 `server/src/scripts` 批量脚本负责参数解析、循环生成、结果汇总与 JSON 落盘；现有单次脚本改为复用共享模块，避免两份 prompt/解析逻辑分叉。

**Tech Stack:** TypeScript、tsx CLI、Node.js `fs/promises`、现有功法文本模型共享服务。

---

### Task 1: 抽取功法模型联调共享模块

**Files:**
- Create: `server/src/scripts/shared/techniqueModelDebug.ts`
- Modify: `server/scripts/test-technique-model.ts`

**Step 1: 定义共享输入输出类型**

- 补充功法品质、生成选项、生成结果、汇总结果类型。
- 明确“是否生成图片”由调用方显式传入，默认不在共享层做隐式兜底。

**Step 2: 搬运并收敛单次生成能力**

- 复用现有 prompt 组装、模型请求、JSON 解析、结构归一化逻辑。
- 暴露单次生成函数，返回模型名、seed、品质、功法类型、归一化 JSON。

**Step 3: 让旧脚本改为复用共享模块**

- 保持原有单次调试入口可用。
- 只保留脚本层的 CLI 参数解析与控制台输出。

### Task 2: 新增批量功法书模型联调脚本

**Files:**
- Create: `server/src/scripts/testTechniqueBookModelBatch.ts`

**Step 1: 设计 CLI 参数**

- 支持 `--count`、`--quality`、`--type`、`--seed-start`、`--output`。
- `--count` 必填且必须为正整数；其余参数按脚本约定解析。

**Step 2: 设计输出目录与文件命名**

- 默认输出到 `server/tmp/technique-book-model-check/<timestamp>/`。
- 每本功法生成独立 JSON 文件，并额外生成 `summary.json` 汇总文件。

**Step 3: 调用共享单次生成能力做批量落盘**

- 循环生成时显式关闭图片生成。
- 每次生成后立即写文件，避免结果只留在内存。
- 汇总文件记录 seed、模型名、功法名、品质、类型、技能数、层数与输出路径。

### Task 3: 校验与交付

**Files:**
- Verify: `tsc -b`

**Step 1: 做 TypeScript 构建校验**

- 运行 `tsc -b`。
- 如果编译错误，优先修正本次新增代码的类型问题。

**Step 2: 交付说明**

- 说明新增脚本如何使用。
- 明确现有单次脚本与新批量脚本共用同一套生成核心，避免重复维护。
