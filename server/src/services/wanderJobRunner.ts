/**
 * 云游奇遇异步任务协调器
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把云游生成任务投递到独立 worker，并在服务启动时恢复遗留 pending 任务。
 * 2. 做什么：统一处理 worker 启动失败、执行异常与任务收尾，避免云游任务长期卡住。
 * 3. 不做什么：不做 HTTP 参数校验，不直接生成剧情，也不决定前端轮询节奏。
 *
 * 输入/输出：
 * - 输入：`generationId / characterId`。
 * - 输出：无同步业务结果；副作用是推动任务从 pending 进入 generated 或 failed。
 *
 * 数据流/状态流：
 * route -> wanderJobRunner.enqueue -> worker -> wanderService.processPendingGenerationJob -> DB 状态更新。
 *
 * 关键边界条件与坑点：
 * 1. worker 启动失败时必须把任务显式标记为 failed，不能留在 pending。
 * 2. 恢复 pending 任务时只依赖数据库真相，不依赖进程内内存状态，避免重启后任务丢失。
 */
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';
import { wanderService } from './wander/service.js';
import type { WanderWorkerMessage, WanderWorkerPayload, WanderWorkerResponse } from '../workers/wanderWorkerShared.js';

type EnqueueParams = WanderWorkerPayload;

class WanderJobRunner {
  private activeWorkers = new Map<string, Worker>();
  private initialized = false;

  private resolveWorkerScript(): string {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    if (process.env.NODE_ENV !== 'production') {
      return path.join(__dirname, '../../dist/workers/wanderWorker.js');
    }
    return path.join(__dirname, '../workers/wanderWorker.js');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.recoverPendingJobs();
  }

  async shutdown(): Promise<void> {
    const workers = [...this.activeWorkers.values()];
    this.activeWorkers.clear();
    await Promise.allSettled(workers.map((worker) => worker.terminate()));
  }

  async enqueue(params: EnqueueParams): Promise<void> {
    if (this.activeWorkers.has(params.generationId)) return;

    const worker = new Worker(this.resolveWorkerScript());
    this.activeWorkers.set(params.generationId, worker);

    const cleanup = async (): Promise<void> => {
      this.activeWorkers.delete(params.generationId);
      await worker.terminate().catch(() => undefined);
    };

    const failJob = async (reason: string): Promise<void> => {
      await wanderService.markGenerationJobFailed(params.characterId, params.generationId, reason);
    };

    worker.once('error', (error) => {
      void (async () => {
        await cleanup();
        const message = error instanceof Error ? error.message : String(error);
        await failJob(`云游 worker 启动失败：${message}`);
      })();
    });

    worker.once('exit', (code) => {
      if (code === 0) return;
      void (async () => {
        if (!this.activeWorkers.has(params.generationId)) return;
        await cleanup();
        await failJob(`云游 worker 异常退出，退出码=${code}`);
      })();
    });

    worker.on('message', (message: WanderWorkerResponse) => {
      void (async () => {
        if (message.type === 'ready') {
          const request: WanderWorkerMessage = {
            type: 'executeWanderGeneration',
            payload: params,
          };
          worker.postMessage(request);
          return;
        }

        await cleanup();
        if (message.type === 'error') {
          await failJob(`云游 worker 执行失败：${message.payload.error}`);
        }
      })();
    });
  }

  private async recoverPendingJobs(): Promise<void> {
    const result = await query(
      `
        SELECT id, character_id
        FROM character_wander_generation_job
        WHERE status = 'pending'
        ORDER BY created_at ASC
      `,
    );

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const generationId = typeof row.id === 'string' ? row.id : '';
      const characterId = Number(row.character_id);
      if (!generationId || !Number.isFinite(characterId) || characterId <= 0) {
        continue;
      }

      await this.enqueue({
        generationId,
        characterId,
      });
    }
  }
}

const runner = new WanderJobRunner();

export const initializeWanderJobRunner = async (): Promise<void> => {
  await runner.initialize();
};

export const shutdownWanderJobRunner = async (): Promise<void> => {
  await runner.shutdown();
};

export const enqueueWanderGenerationJob = async (params: EnqueueParams): Promise<void> => {
  await runner.enqueue(params);
};
