/**
 * 云游奇遇 worker 通讯协议
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中定义主线程与云游 worker 之间的消息体，避免 runner 与 worker 各自散落字符串协议。
 * 2. 做什么：复用云游任务状态类型，让 pending/generated/failed 在路由、runner、worker 三处保持一致。
 * 3. 不做什么：不直接生成剧情、不读写数据库，也不负责前端轮询策略。
 *
 * 输入/输出：
 * - 输入：主线程投递的 `executeWanderGeneration` 消息。
 * - 输出：worker 返回的 `ready / result / error` 消息。
 *
 * 数据流/状态流：
 * wanderJobRunner -> wanderWorkerMessage -> worker
 * worker -> wanderWorkerResponse -> wanderJobRunner
 *
 * 关键边界条件与坑点：
 * 1. 协议只承载单次云游生成任务，不能混入其他 AI 业务，避免消息体继续膨胀。
 * 2. 返回状态必须复用业务层定义，而不是在 worker 内再手写一套字面量。
 */
import type { WanderGenerationJobStatus } from '../services/wander/types.js';

export type WanderWorkerPayload = {
  characterId: number;
  generationId: string;
};

export type WanderWorkerMessage =
  | { type: 'executeWanderGeneration'; payload: WanderWorkerPayload }
  | { type: 'shutdown' };

export type WanderWorkerResult = {
  generationId: string;
  characterId: number;
  status: Extract<WanderGenerationJobStatus, 'generated' | 'failed'>;
  episodeId: string | null;
  errorMessage: string | null;
};

export type WanderWorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; payload: WanderWorkerResult }
  | { type: 'error'; payload: { generationId: string; characterId: number; error: string; stack?: string } };
