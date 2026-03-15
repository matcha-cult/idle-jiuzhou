/**
 * 图形验证码共享服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一生成登录/注册共用的图片验证码，集中处理答案归一化、SVG 图片组装、Redis 持久化与一次性消费校验。
 * 2. 做什么：把验证码 Redis key、TTL、错误文案收敛到单一模块，避免登录和注册路由各自维护同一套规则。
 * 3. 不做什么：不处理 HTTP 请求参数，不直接返回 Express 响应，也不承担账号密码校验逻辑。
 *
 * 输入/输出：
 * - 输入：`createCaptcha` 无输入；`verifyCaptcha` 接收 `captchaId` 与用户输入 `captchaCode`。
 * - 输出：`createCaptcha` 返回图片数据与过期时间；`verifyCaptcha` 成功时无返回，失败时抛业务错误。
 *
 * 数据流/状态流：
 * - 路由层调用 `createCaptcha` -> 生成 4 位验证码 -> 组装中间 SVG -> 转 PNG data URI -> 写入 Redis `auth:captcha:<id>` -> 返回 `captchaId/imageData/expiresAt`
 * - 登录/注册提交 `captchaId + captchaCode` -> `verifyCaptcha` 读 Redis -> 比对答案与过期时间 -> 删除 Redis 记录 -> 通过或抛错
 *
 * 关键边界条件与坑点：
 * 1. 验证码成功或失败后都必须删除 Redis 记录，保证一次性消费，否则登录和注册会出现不同的重试口径。
 * 2. 过期判断只信任服务端 Redis 中的 `expiresAt`，不能依赖前端倒计时，避免客户端时间漂移造成规则不一致。
 */
import { randomUUID } from 'node:crypto';

import sharp from 'sharp';
import { redis } from '../config/redis.js';
import { BusinessError } from '../middleware/BusinessError.js';

export type CaptchaScene = 'auth' | 'market-risk';

type StoredCaptchaRecord = {
  answer: string;
  expiresAt: number;
  scene: CaptchaScene;
};

export type CaptchaChallenge = {
  captchaId: string;
  imageData: string;
  expiresAt: number;
};

type CaptchaGlyph = {
  char: string;
  x: number;
  y: number;
  rotation: number;
  skewX: number;
  scaleX: number;
  scaleY: number;
  fontSize: number;
};

type CaptchaWaveProfile = {
  amplitude: number;
  phase: number;
  frequency: number;
};

const CAPTCHA_REDIS_KEY_PREFIX_MAP: Record<CaptchaScene, string> = {
  auth: 'auth:captcha:',
  'market-risk': 'market:risk:captcha:',
};
const CAPTCHA_TTL_SECONDS = 300;
const CAPTCHA_LENGTH = 4;
const CAPTCHA_WIDTH = 132;
const CAPTCHA_HEIGHT = 56;
const CAPTCHA_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/**
 * 干扰线颜色：故意与字符填充色接近（深色系），让 OCR 难以通过颜色通道区分干扰与字符
 * 被 buildBackgroundNoiseLines / buildOverlayPaths 复用
 */
const CAPTCHA_STROKE_COLORS = [
  'rgba(15, 23, 42, 0.28)',
  'rgba(30, 41, 59, 0.32)',
  'rgba(51, 65, 85, 0.26)',
  'rgba(2, 6, 23, 0.24)',
] as const;
/**
 * 切片/遮挡色：混合深浅两档，浅色做背景干扰、深色做字符遮挡
 * 被 buildSliceOverlays / buildGlyphOccluders 复用
 */
const CAPTCHA_SLICE_COLORS = [
  'rgba(148, 163, 184, 0.24)',
  'rgba(125, 211, 252, 0.18)',
  'rgba(196, 181, 253, 0.16)',
  'rgba(30, 41, 59, 0.18)',
  'rgba(15, 23, 42, 0.14)',
] as const;
const CAPTCHA_FONT_FAMILIES = [
  "'Trebuchet MS', 'Verdana', sans-serif",
  "'Tahoma', 'Verdana', sans-serif",
  "'Arial Black', 'Arial', sans-serif",
  "'Georgia', 'Times New Roman', serif",
  "'Courier New', 'Consolas', monospace",
  "'Lucida Console', 'Courier New', monospace",
  "'Impact', 'Arial Black', sans-serif",
] as const;

const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const randomFloat = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

const pickOne = <T,>(values: readonly T[]): T => {
  return values[randomInt(0, values.length - 1)];
};

const formatSvgNumber = (value: number): string => value.toFixed(1);

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const buildCaptchaKey = (captchaId: string, scene: CaptchaScene): string =>
  `${CAPTCHA_REDIS_KEY_PREFIX_MAP[scene]}${captchaId}`;

const normalizeCaptchaCode = (captchaCode: string): string => captchaCode.trim().toUpperCase();

const pickCaptchaChar = (): string => {
  const index = Math.floor(Math.random() * CAPTCHA_CHARSET.length);
  return CAPTCHA_CHARSET.charAt(index);
};

const generateCaptchaAnswer = (): string =>
  Array.from({ length: CAPTCHA_LENGTH }, () => pickCaptchaChar()).join('');

const encodeSvgDataUri = (svg: string): string => {
  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
};

const buildWaveProfile = (): CaptchaWaveProfile => {
  return {
    amplitude: randomFloat(6.2, 8.8),
    phase: randomFloat(0, Math.PI * 2),
    frequency: randomFloat(0.95, 1.2),
  };
};

const buildWaveFlowPath = (
  waveProfile: CaptchaWaveProfile,
): string => {
  const points = Array.from({ length: 6 }, (_, index) => {
    const x = 8 + index * ((CAPTCHA_WIDTH - 16) / 5);
    const y =
      29
      + Math.sin(waveProfile.phase + waveProfile.frequency * (index + 0.3))
      * waveProfile.amplitude;
    return { x, y };
  });

  const [firstPoint, ...restPoints] = points;
  const path = restPoints.reduce((currentPath, point, index) => {
    const previousPoint = points[index];
    const controlX = (previousPoint.x + point.x) / 2;
    return `${currentPath} Q ${formatSvgNumber(controlX)} ${formatSvgNumber(previousPoint.y)} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`;
  }, `M ${formatSvgNumber(firstPoint.x)} ${formatSvgNumber(firstPoint.y)}`);

  return `<path class="captcha-wave-flow" d="${path}" fill="none" stroke="rgba(99, 102, 241, 0.14)" stroke-width="1.2" stroke-linecap="round" />`;
};

/**
 * 字符布局：唯一的字符位置/变形入口
 *
 * 抗 OCR 关键点：
 * 1. 字符间距随机收窄，制造粘连/重叠，破坏 OCR 分割
 * 2. 旋转、倾斜、缩放范围加大，增加单字符识别难度
 * 3. 字号差异拉大，同一验证码内字符大小不一致
 */
const buildCaptchaGlyphs = (answer: string, waveProfile: CaptchaWaveProfile): CaptchaGlyph[] => {
  const startX = 14;
  const endX = CAPTCHA_WIDTH - 14;
  /* 锚点间距收窄，让相邻字符更容易粘连 */
  const anchorRatios = [0.06, 0.30, 0.58, 0.88] as const;
  const anchorSpan = endX - startX;

  return Array.from(answer).map((char, index) => {
    const baseX = startX + anchorSpan * anchorRatios[index];
    /* 水平抖动加大，进一步打乱等距排列 */
    const x = clampNumber(baseX + randomInt(-8, 7), 10, CAPTCHA_WIDTH - 10);
    const waveOffset =
      Math.sin(waveProfile.phase + waveProfile.frequency * (index + 0.35))
      * waveProfile.amplitude;
    /* 垂直抖动加大 */
    const y = 29 + waveOffset + randomInt(-4, 4);
    return {
      char,
      x,
      y,
      rotation: randomInt(-32, 32),
      skewX: randomInt(-22, 22),
      scaleX: randomFloat(0.82, 1.18),
      scaleY: randomFloat(0.82, 1.18),
      fontSize: randomInt(25, 34),
    };
  });
};

/**
 * SVG defs：渐变、阴影、位移滤镜集中定义
 *
 * 抗 OCR 关键点：
 * 1. 位移滤镜 seed 每次随机，避免固定变形模式被学习
 * 2. 位移强度提升到 6~9，字符轮廓产生明显非线性扭曲
 * 3. 新增 feColorMatrix 给字符边缘注入噪声，破坏二值化阈值
 */
const buildSvgDefs = (): string => {
  const distortionSeed = randomInt(1, 9999);
  const distortionScale = randomFloat(6, 9);
  const baseFreqX = randomFloat(0.018, 0.032);
  const baseFreqY = randomFloat(0.08, 0.16);
  return [
    '<defs>',
    '<linearGradient id="captcha-bg" x1="0%" y1="0%" x2="100%" y2="100%">',
    '<stop offset="0%" stop-color="#f8fafc" />',
    '<stop offset="48%" stop-color="#dbeafe" />',
    '<stop offset="100%" stop-color="#ddd6fe" />',
    '</linearGradient>',
    '<linearGradient id="captcha-glyph-gradient" x1="0%" y1="0%" x2="100%" y2="100%">',
    '<stop offset="0%" stop-color="#020617" />',
    '<stop offset="52%" stop-color="#1e293b" />',
    '<stop offset="100%" stop-color="#0f172a" />',
    '</linearGradient>',
    '<linearGradient id="captcha-scan-gradient" x1="0%" y1="0%" x2="100%" y2="0%">',
    '<stop offset="0%" stop-color="rgba(255,255,255,0)" />',
    '<stop offset="45%" stop-color="rgba(255,255,255,0.22)" />',
    '<stop offset="100%" stop-color="rgba(255,255,255,0)" />',
    '</linearGradient>',
    '<filter id="captcha-glyph-shadow" x="-30%" y="-30%" width="160%" height="160%">',
    '<feDropShadow dx="0.8" dy="1.6" stdDeviation="1.1" flood-color="rgba(15,23,42,0.32)" />',
    '</filter>',
    `<filter id="captcha-glyph-distortion" x="-40%" y="-40%" width="180%" height="180%">`,
    `<feTurbulence type="fractalNoise" baseFrequency="${formatSvgNumber(baseFreqX)} ${formatSvgNumber(baseFreqY)}" numOctaves="3" seed="${distortionSeed}" result="distortion-noise" />`,
    `<feDisplacementMap in="SourceGraphic" in2="distortion-noise" scale="${formatSvgNumber(distortionScale)}" xChannelSelector="R" yChannelSelector="G" result="distorted-glyph" />`,
    '<feDropShadow in="distorted-glyph" dx="0.8" dy="1.6" stdDeviation="1.1" flood-color="rgba(15,23,42,0.32)" result="distorted-shadow" />',
    '<feMerge>',
    '<feMergeNode in="distorted-shadow" />',
    '<feMergeNode in="distorted-glyph" />',
    '</feMerge>',
    '</filter>',
    /* 全图噪声滤镜：给最终输出叠加细粒度噪点，干扰 OCR 二值化 */
    `<filter id="captcha-noise-filter" x="0%" y="0%" width="100%" height="100%">`,
    `<feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed="${randomInt(1, 9999)}" stitchTiles="stitch" result="noise" />`,
    '<feColorMatrix in="noise" type="saturate" values="0" result="gray-noise" />',
    '<feBlend in="SourceGraphic" in2="gray-noise" mode="multiply" />',
    '</filter>',
    '</defs>',
  ].join('');
};

const buildBackgroundAura = (): string =>
  Array.from({ length: 2 }, () => {
    const cx = randomFloat(26, CAPTCHA_WIDTH - 26);
    const cy = randomFloat(14, CAPTCHA_HEIGHT - 14);
    const rx = randomFloat(22, 34);
    const ry = randomFloat(8, 14);
    const opacity = randomFloat(0.08, 0.14);
    return `<ellipse cx="${formatSvgNumber(cx)}" cy="${formatSvgNumber(cy)}" rx="${formatSvgNumber(rx)}" ry="${formatSvgNumber(ry)}" fill="rgba(255, 255, 255, ${formatSvgNumber(opacity)})" transform="rotate(${randomInt(-18, 18)} ${formatSvgNumber(cx)} ${formatSvgNumber(cy)})" />`;
  }).join('');

const buildBackgroundNoiseDots = (): string =>
  Array.from({ length: 28 }, () => {
    const cx = randomFloat(8, CAPTCHA_WIDTH - 8);
    const cy = randomFloat(7, CAPTCHA_HEIGHT - 7);
    const radius = randomFloat(0.9, 1.9);
    const opacity = randomFloat(0.16, 0.34);
    return `<circle cx="${formatSvgNumber(cx)}" cy="${formatSvgNumber(cy)}" r="${formatSvgNumber(radius)}" fill="${pickOne(CAPTCHA_SLICE_COLORS).replace(/0\.\d+\)/, `${formatSvgNumber(opacity)})`)}" />`;
  }).join('');

/**
 * 背景干扰线：数量增加到 8 条，线宽加粗，颜色与字符接近
 * 抗 OCR：干扰线穿过字符区域且颜色接近字符填充色，OCR 无法通过颜色/粗细区分
 */
const buildBackgroundNoiseLines = (): string =>
  Array.from({ length: 8 }, () => {
    const startX = randomFloat(-4, 20);
    const startY = randomFloat(4, CAPTCHA_HEIGHT - 4);
    const controlX1 = randomFloat(CAPTCHA_WIDTH * 0.2, CAPTCHA_WIDTH * 0.5);
    const controlY1 = randomFloat(-4, CAPTCHA_HEIGHT + 4);
    const controlX2 = randomFloat(CAPTCHA_WIDTH * 0.5, CAPTCHA_WIDTH * 0.8);
    const controlY2 = randomFloat(-4, CAPTCHA_HEIGHT + 4);
    const endX = randomFloat(CAPTCHA_WIDTH - 22, CAPTCHA_WIDTH + 4);
    const endY = randomFloat(4, CAPTCHA_HEIGHT - 4);
    const strokeWidth = randomFloat(1.2, 2.6);
    /* 用三次贝塞尔曲线替代二次，线条更自然更难被模式匹配去除 */
    return `<path d="M ${formatSvgNumber(startX)} ${formatSvgNumber(startY)} C ${formatSvgNumber(controlX1)} ${formatSvgNumber(controlY1)} ${formatSvgNumber(controlX2)} ${formatSvgNumber(controlY2)} ${formatSvgNumber(endX)} ${formatSvgNumber(endY)}" fill="none" stroke="${pickOne(CAPTCHA_STROKE_COLORS)}" stroke-width="${formatSvgNumber(strokeWidth)}" stroke-linecap="round" />`;
  }).join('');

/**
 * 前景覆盖线：数量增加到 5 条，线宽加粗，颜色与字符一致
 * 抗 OCR：覆盖线直接叠在字符上方，与字符同色系，OCR 无法通过图层顺序去除
 */
const buildOverlayPaths = (): string =>
  Array.from({ length: 5 }, () => {
    const startX = randomFloat(-2, 14);
    const startY = randomFloat(6, CAPTCHA_HEIGHT - 6);
    const controlX1 = randomFloat(CAPTCHA_WIDTH * 0.2, CAPTCHA_WIDTH * 0.5);
    const controlY1 = randomFloat(-2, CAPTCHA_HEIGHT + 2);
    const controlX2 = randomFloat(CAPTCHA_WIDTH * 0.5, CAPTCHA_WIDTH * 0.8);
    const controlY2 = randomFloat(-2, CAPTCHA_HEIGHT + 2);
    const endX = randomFloat(CAPTCHA_WIDTH - 16, CAPTCHA_WIDTH + 2);
    const endY = randomFloat(6, CAPTCHA_HEIGHT - 6);
    const strokeWidth = randomFloat(1.4, 2.8);
    const opacity = randomFloat(0.30, 0.50);

    return `<path class="captcha-overlay" d="M ${formatSvgNumber(startX)} ${formatSvgNumber(startY)} C ${formatSvgNumber(controlX1)} ${formatSvgNumber(controlY1)} ${formatSvgNumber(controlX2)} ${formatSvgNumber(controlY2)} ${formatSvgNumber(endX)} ${formatSvgNumber(endY)}" fill="none" stroke="rgba(15, 23, 42, ${formatSvgNumber(opacity)})" stroke-width="${formatSvgNumber(strokeWidth)}" stroke-linecap="round" />`;
  }).join('');

const buildGlyphOccluders = (glyphs: CaptchaGlyph[]): string => {
  return glyphs.map((glyph) => {
    const width = randomFloat(glyph.fontSize * 0.52, glyph.fontSize * 0.78);
    const height = randomFloat(2.6, 4.2);
    const x = glyph.x - width / 2 + randomFloat(-2, 2);
    const y = glyph.y - height / 2 + randomFloat(-3, 3);
    const rotation = glyph.rotation + randomInt(-18, 18);
    const fill = pickOne(CAPTCHA_SLICE_COLORS);
    return `<rect class="captcha-glyph-occluder" x="${formatSvgNumber(x)}" y="${formatSvgNumber(y)}" width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" rx="1.4" fill="${fill}" transform="rotate(${rotation} ${formatSvgNumber(glyph.x)} ${formatSvgNumber(glyph.y)})" />`;
  }).join('');
};

/**
 * 字符间桥接线：连接相邻字符，制造视觉粘连
 * 抗 OCR：桥接线颜色/粗细与字符笔画接近，破坏 OCR 的字符分割边界检测
 */
const buildGlyphBridges = (glyphs: CaptchaGlyph[]): string => {
  return glyphs.slice(0, -1).map((glyph, index) => {
    const nextGlyph = glyphs[index + 1];
    const startX = glyph.x + randomFloat(3, 8);
    const startY = glyph.y + randomFloat(-5, 5);
    const controlX = (glyph.x + nextGlyph.x) / 2 + randomFloat(-4, 4);
    const controlY = (glyph.y + nextGlyph.y) / 2 + randomFloat(-8, 8);
    const endX = nextGlyph.x - randomFloat(3, 8);
    const endY = nextGlyph.y + randomFloat(-5, 5);
    /* 线宽提升到与字符笔画接近的粗细 */
    const strokeWidth = randomFloat(1.6, 2.8);
    const opacity = randomFloat(0.28, 0.44);

    return `<path class="captcha-glyph-bridge" d="M ${formatSvgNumber(startX)} ${formatSvgNumber(startY)} Q ${formatSvgNumber(controlX)} ${formatSvgNumber(controlY)} ${formatSvgNumber(endX)} ${formatSvgNumber(endY)}" fill="none" stroke="rgba(15, 23, 42, ${formatSvgNumber(opacity)})" stroke-width="${formatSvgNumber(strokeWidth)}" stroke-linecap="round" />`;
  }).join('');
};

const buildGlyphDecoyStrokes = (glyphs: CaptchaGlyph[]): string => {
  return glyphs.flatMap((glyph) => {
    const strokeCount = randomInt(1, 2);
    return Array.from({ length: strokeCount }, () => {
      const startX = glyph.x + randomFloat(-12, 10);
      const startY = glyph.y + randomFloat(-12, 10);
      const controlX = startX + randomFloat(4, 10);
      const controlY = startY + randomFloat(-6, 6);
      const endX = startX + randomFloat(8, 16);
      const endY = startY + randomFloat(-8, 8);
      const strokeWidth = randomFloat(1, 1.8);
      return `<path class="captcha-glyph-decoy-stroke" d="M ${formatSvgNumber(startX)} ${formatSvgNumber(startY)} Q ${formatSvgNumber(controlX)} ${formatSvgNumber(controlY)} ${formatSvgNumber(endX)} ${formatSvgNumber(endY)}" fill="none" stroke="rgba(15, 23, 42, ${formatSvgNumber(randomFloat(0.18, 0.3))})" stroke-width="${formatSvgNumber(strokeWidth)}" stroke-linecap="round" />`;
    });
  }).join('');
};

const buildSliceOverlays = (): string =>
  Array.from({ length: 5 }, () => {
    const x = randomFloat(12, CAPTCHA_WIDTH - 26);
    const y = randomFloat(12, CAPTCHA_HEIGHT - 14);
    const width = randomFloat(18, 34);
    const height = randomFloat(2.4, 4.6);
    const rotation = randomInt(-20, 20);
    return `<rect class="captcha-slice" x="${formatSvgNumber(x)}" y="${formatSvgNumber(y)}" width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" rx="1.6" fill="${pickOne(CAPTCHA_SLICE_COLORS)}" transform="rotate(${rotation} ${formatSvgNumber(x + width / 2)} ${formatSvgNumber(y + height / 2)})" />`;
  }).join('');

/**
 * 假字符（decoy glyphs）：在真实字符附近放置半透明的随机字符
 *
 * 抗 OCR 关键点：
 * 1. 假字符与真字符使用相同字体/渐变，OCR 无法通过样式区分真假
 * 2. 透明度控制在 0.12~0.22，人眼可忽略但 OCR 二值化后会当成真字符
 * 3. 位置紧贴真字符边缘，制造字符重叠假象
 */
const buildDecoyGlyphs = (glyphs: CaptchaGlyph[]): string => {
  return glyphs.flatMap((glyph) => {
    const decoyCount = randomInt(1, 2);
    return Array.from({ length: decoyCount }, () => {
      const decoyChar = pickCaptchaChar();
      /* 假字符偏移量小，紧贴真字符 */
      const offsetX = randomFloat(-14, 14);
      const offsetY = randomFloat(-10, 10);
      const x = clampNumber(glyph.x + offsetX, 4, CAPTCHA_WIDTH - 4);
      const y = clampNumber(glyph.y + offsetY, 8, CAPTCHA_HEIGHT - 8);
      const fontSize = randomInt(14, 20);
      const opacity = randomFloat(0.12, 0.22);
      const rotation = randomInt(-40, 40);
      return [
        `<text`,
        ` class="captcha-decoy-glyph"`,
        ` x="0" y="0"`,
        ` text-anchor="middle"`,
        ` dominant-baseline="central"`,
        ` font-size="${fontSize}"`,
        ` font-family="${pickOne(CAPTCHA_FONT_FAMILIES)}"`,
        ` font-weight="700"`,
        ` fill="rgba(15, 23, 42, ${formatSvgNumber(opacity)})"`,
        ` transform="translate(${formatSvgNumber(x)} ${formatSvgNumber(y)}) rotate(${rotation})"`,
        `>${decoyChar}</text>`,
      ].join('');
    });
  }).join('');
};

/**
 * 字符渲染标记：唯一的字符 SVG 输出入口
 *
 * 抗 OCR 关键点：
 * 1. 每个字符独立随机 font-weight（600~900），笔画粗细不一致
 * 2. 描边宽度随机化（0.6~1.4），破坏 OCR 对统一笔画宽度的假设
 * 3. 每个字符独立选择字体，同一验证码内字体混排
 */
const buildGlyphMarkup = (glyphs: CaptchaGlyph[]): string => {
  const fontWeights = [600, 700, 800, 900] as const;
  return glyphs.map((glyph) => {
    const strokeWidth = randomFloat(0.6, 1.4);
    const fontWeight = pickOne(fontWeights);
    return [
      `<text`,
      ` class="captcha-glyph"`,
      ` x="0"`,
      ` y="0"`,
      ` text-anchor="middle"`,
      ` dominant-baseline="central"`,
      ` font-size="${glyph.fontSize}"`,
      ` font-family="${pickOne(CAPTCHA_FONT_FAMILIES)}"`,
      ` font-weight="${fontWeight}"`,
      ` fill="url(#captcha-glyph-gradient)"`,
      ` stroke="rgba(248, 250, 252, 0.88)"`,
      ` stroke-width="${formatSvgNumber(strokeWidth)}"`,
      ` paint-order="stroke fill"`,
      ` filter="url(#captcha-glyph-distortion)"`,
      ` transform="translate(${glyph.x} ${formatSvgNumber(glyph.y)}) rotate(${glyph.rotation}) skewX(${glyph.skewX}) scale(${formatSvgNumber(glyph.scaleX)} ${formatSvgNumber(glyph.scaleY)})"`,
      `>${glyph.char}</text>`,
    ].join('');
  }).join('');
};

/**
 * SVG 组装入口：统一拼装所有图层
 *
 * 图层顺序（从底到顶）：
 * 1. 背景渐变 + 光晕
 * 2. 背景干扰线 + 噪点
 * 3. 波浪流线
 * 4. 假字符（decoy glyphs）— 在真字符下方，半透明干扰
 * 5. 真字符（带位移滤镜）
 * 6. 字符桥接 + 遮挡条 + 诱导笔画
 * 7. 前景覆盖线 + 切片
 * 8. 全图噪声滤镜覆盖层
 */
const buildCaptchaSvg = (answer: string): string => {
  const waveProfile = buildWaveProfile();
  const glyphs = buildCaptchaGlyphs(answer, waveProfile);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}" viewBox="0 0 ${CAPTCHA_WIDTH} ${CAPTCHA_HEIGHT}" preserveAspectRatio="none" role="img" aria-label="图片验证码">`,
    buildSvgDefs(),
    `<rect width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}" rx="12" fill="url(#captcha-bg)" />`,
    buildBackgroundAura(),
    buildBackgroundNoiseLines(),
    buildBackgroundNoiseDots(),
    buildWaveFlowPath(waveProfile),
    buildDecoyGlyphs(glyphs),
    buildGlyphMarkup(glyphs),
    buildGlyphBridges(glyphs),
    buildGlyphOccluders(glyphs),
    buildGlyphDecoyStrokes(glyphs),
    buildOverlayPaths(),
    buildSliceOverlays(),
    /* 全图噪声覆盖：用半透明矩形挂载噪声滤镜，给整张图叠加细粒度噪点 */
    `<rect class="captcha-noise-overlay" width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}" fill="rgba(255,255,255,0.01)" filter="url(#captcha-noise-filter)" />`,
    '</svg>',
  ].join('');
};

const encodePngDataUri = (buffer: Buffer): string => {
  return `data:image/png;base64,${buffer.toString('base64')}`;
};

const renderCaptchaPngDataUri = async (answer: string): Promise<string> => {
  const svg = buildCaptchaSvg(answer);
  const pngBuffer = await sharp(Buffer.from(svg, 'utf8'))
    .png()
    .toBuffer();
  return encodePngDataUri(pngBuffer);
};

export const createCaptcha = async (
  scene: CaptchaScene = 'auth',
): Promise<CaptchaChallenge> => {
  const captchaId = randomUUID();
  const answer = generateCaptchaAnswer();
  const expiresAt = Date.now() + CAPTCHA_TTL_SECONDS * 1000;
  const payload: StoredCaptchaRecord = {
    answer,
    expiresAt,
    scene,
  };

  await redis.set(
    buildCaptchaKey(captchaId, scene),
    JSON.stringify(payload),
    'EX',
    CAPTCHA_TTL_SECONDS,
  );

  return {
    captchaId,
    imageData: await renderCaptchaPngDataUri(answer),
    expiresAt,
  };
};

export const verifyCaptcha = async (
  captchaId: string,
  captchaCode: string,
  scene: CaptchaScene = 'auth',
): Promise<void> => {
  const key = buildCaptchaKey(captchaId, scene);
  const raw = await redis.get(key);

  if (!raw) {
    throw new BusinessError('图片验证码已失效，请重新获取');
  }

  const record = JSON.parse(raw) as StoredCaptchaRecord;
  if (record.expiresAt <= Date.now()) {
    await redis.del(key);
    throw new BusinessError('图片验证码已失效，请重新获取');
  }

  await redis.del(key);

  if (normalizeCaptchaCode(captchaCode) !== record.answer) {
    throw new BusinessError('图片验证码错误，请重新获取');
  }
};
