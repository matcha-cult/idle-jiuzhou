/**
 * Prisma CLI Docker 运行时依赖回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定运行镜像必须包含 `scripts/prismaCli.mjs` 的共享脚本依赖，避免服务启动前的 `db push` 因缺文件直接崩溃。
 * 2. 做什么：把“脚本存在于仓库里”和“脚本被复制进 runner 镜像里”区分开，防止只改源码不改 Docker 分层。
 * 3. 不做什么：不执行 Docker 构建，不访问真实镜像，也不验证 Prisma 命令本身是否成功。
 *
 * 输入/输出：
 * - 输入：`server/Dockerfile` 与 `server/scripts/prismaCli.mjs` 源码文本。
 * - 输出：断言 `prismaCli.mjs` 的共享日志脚本存在，且 runner 阶段明确复制了 `server/scripts/shared`。
 *
 * 数据流/状态流：
 * - 读取 Prisma CLI 包装脚本，确认运行时确实依赖 `./shared/installConsoleLogger.mjs`；
 * - 再读取 Dockerfile，确认 runner 镜像把对应共享目录复制到 `/app/server/scripts/shared`。
 *
 * 关键边界条件与坑点：
 * 1. 这里只校验运行阶段 COPY，不校验 builder 阶段；因为线上报错发生在最终 runner 镜像。
 * 2. 不能只复制 `prismaCli.mjs` 单文件，否则一旦它继续依赖 `scripts/shared` 下的脚本，容器启动会再次出现同类缺文件故障。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Docker runner 应复制 prismaCli.mjs 依赖的 scripts/shared 目录', () => {
  const prismaCliPath = path.resolve(process.cwd(), 'server/scripts/prismaCli.mjs');
  const dockerfilePath = path.resolve(process.cwd(), 'server/Dockerfile');

  const prismaCliSource = readFileSync(prismaCliPath, 'utf8');
  const dockerfileSource = readFileSync(dockerfilePath, 'utf8');

  assert.match(
    prismaCliSource,
    /import\s+['"]\.\/shared\/installConsoleLogger\.mjs['"]/u,
    'prismaCli.mjs 应显式依赖共享日志脚本',
  );

  assert.match(
    dockerfileSource,
    /COPY --from=builder \/app\/server\/scripts\/shared \.\/scripts\/shared/u,
    'runner 镜像必须复制 server/scripts/shared，避免 prismaCli.mjs 启动时缺少共享脚本',
  );
});
