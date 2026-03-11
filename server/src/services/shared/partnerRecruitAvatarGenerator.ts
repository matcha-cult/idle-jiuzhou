/**
 * AI 伙伴头像生成器
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：根据伙伴名字、品质、元素、定位与描述调用图像模型生成头像，并落到本地 uploads 目录。
 * 2) 做什么：把伙伴头像 prompt、图片压缩与本地落盘集中到单模块，模型 provider 协议由统一图片 client 处理。
 * 3) 不做什么：不写任务状态表、不吞掉业务失败；头像生成失败应由上层触发整单退款。
 *
 * 输入/输出：
 * - 输入：伙伴视觉语义信息。
 * - 输出：本地可访问头像路径 `/uploads/partners/*.webp`。
 *
 * 数据流/状态流：
 * partner recruit draft -> buildPartnerRecruitAvatarPrompt -> imageModelClient -> 压缩落盘 -> partnerRecruitService 回写 job/def。
 *
 * 关键边界条件与坑点：
 * 1) 这里仍复用现有生图环境变量，但业务层不再关心 OpenAI / DashScope 协议差异。
 * 2) 统一图片 client 只返回标准资源 `{ b64, url }`，头像模块必须明确处理“无图片数据”这种失败分支，不能静默吞掉。
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  downloadImageBuffer,
  generateConfiguredImageAsset,
} from '../ai/imageModelClient.js';

export type PartnerRecruitAvatarInput = {
  partnerId: string;
  name: string;
  quality: string;
  element: string;
  role: string;
  description: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_MAX_EDGE = 384;
const OUTPUT_QUALITY = 84;

const buildPartnerRecruitAvatarPrompt = (input: PartnerRecruitAvatarInput): string => {
  return [
    `生成中国仙侠角色头像，角色名「${input.name}」`,
    `角色定位：${input.role}`,
    `角色品质：${input.quality}`,
    `元素倾向：${input.element}`,
    `角色描述：${input.description}`,
    '半身角色立绘头像，单人物正面或微侧，东方仙侠服饰，人物面部清晰',
    '背景简洁，避免武器遮挡面部，避免多人，避免文字水印，避免 Q 版',
  ].join('\n');
};

const ensureImageDir = async (): Promise<string> => {
  const dir = path.join(__dirname, '../../../uploads/partners');
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const getSafePartnerId = (partnerId: string): string => {
  return (partnerId || 'partner')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'partner';
};

const compressImageBuffer = async (buffer: Buffer): Promise<Buffer> => {
  return sharp(buffer)
    .rotate()
    .resize({
      width: OUTPUT_MAX_EDGE,
      height: OUTPUT_MAX_EDGE,
      fit: 'cover',
      withoutEnlargement: false,
    })
    .webp({
      quality: OUTPUT_QUALITY,
      effort: 4,
    })
    .toBuffer();
};

const saveImageBufferToLocal = async (buffer: Buffer, partnerId: string): Promise<string> => {
  const dir = await ensureImageDir();
  const safeId = getSafePartnerId(partnerId);
  const fileName = `${safeId}-${Date.now().toString(36)}.webp`;
  const outputPath = path.join(dir, fileName);
  const compressed = await compressImageBuffer(buffer);
  await fs.writeFile(outputPath, compressed);
  return `/uploads/partners/${fileName}`;
};

export const generatePartnerRecruitAvatar = async (
  input: PartnerRecruitAvatarInput,
): Promise<string> => {
  const prompt = buildPartnerRecruitAvatarPrompt(input);
  const generated = await generateConfiguredImageAsset(prompt);
  if (!generated) {
    throw new Error('缺少 AI_TECHNIQUE_IMAGE_MODEL_URL 或 AI_TECHNIQUE_IMAGE_MODEL_KEY 配置');
  }

  if (generated.asset.b64) {
    return saveImageBufferToLocal(Buffer.from(generated.asset.b64, 'base64'), input.partnerId);
  }
  if (generated.asset.url) {
    const buffer = await downloadImageBuffer(generated.asset.url, generated.timeoutMs);
    return saveImageBufferToLocal(buffer, input.partnerId);
  }

  throw new Error('图像模型未返回可用图片数据');
};
