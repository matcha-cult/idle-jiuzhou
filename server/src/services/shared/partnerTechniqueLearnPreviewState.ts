/**
 * 伙伴打书待处理预览 state 编解码模块
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中维护伙伴打书待处理预览写入 `item_instance.metadata` 的字段协议，供创建预览、总览恢复、确认与放弃复用。
 * 2) 做什么：统一声明预览书保留位置常量，避免 `partnerService` 再散落硬编码字符串。
 * 3) 不做什么：不读数据库、不决定伙伴功法替换是否合法，也不处理背包拆堆。
 *
 * 输入/输出：
 * - 输入：原始 `metadata` 对象，以及待处理预览 state。
 * - 输出：合并后的 `metadata`、解析出的 state，或清理 state 后的剩余 `metadata`。
 *
 * 数据流/状态流：
 * item_instance.metadata -> 本模块编码/解码 -> partnerService 持久化预览与恢复展示。
 *
 * 复用设计说明：
 * - 待处理预览是高频业务变化点，集中后服务端只维护一份 metadata 协议，避免总览/确认/放弃各写一套字段名。
 * - 预览书位置常量也统一放在这里，后续若背包位置策略调整，只需改一个入口。
 *
 * 关键边界条件与坑点：
 * 1) 合并 preview state 时必须保留原有 metadata，例如生成功法书依赖的 `generatedTechniqueId` 不能被覆盖。
 * 2) 清理 preview state 后若 metadata 已无其他字段，必须返回 `null`，避免数据库里残留空对象。
 */

type MetadataValue = string | number | boolean | object | null | undefined;
type MetadataRecord = Record<string, MetadataValue>;

const PARTNER_TECHNIQUE_LEARN_PREVIEW_KEY = 'partnerTechniqueLearnPreview';

export const PARTNER_TECHNIQUE_PREVIEW_ITEM_LOCATION = 'partner_preview';

export type PartnerTechniqueLearnPreviewState = {
  partnerId: number;
  learnedTechniqueId: string;
  replacedTechniqueId: string;
};

const asRecord = (value: object | null | undefined): MetadataRecord | null => {
  if (!value || Array.isArray(value)) return null;
  return value as MetadataRecord;
};

const asTrimmedText = (value: MetadataValue): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const asPositiveInteger = (value: MetadataValue): number => {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
};

export const buildPartnerTechniqueLearnPreviewMetadata = (
  metadataRaw: object | null | undefined,
  state: PartnerTechniqueLearnPreviewState,
): MetadataRecord => {
  const metadata = asRecord(metadataRaw);
  return {
    ...(metadata ?? {}),
    [PARTNER_TECHNIQUE_LEARN_PREVIEW_KEY]: {
      partnerId: state.partnerId,
      learnedTechniqueId: state.learnedTechniqueId,
      replacedTechniqueId: state.replacedTechniqueId,
    },
  };
};

export const readPartnerTechniqueLearnPreviewState = (
  metadataRaw: object | null | undefined,
): PartnerTechniqueLearnPreviewState | null => {
  const metadata = asRecord(metadataRaw);
  if (!metadata) return null;

  const preview = asRecord(metadata[PARTNER_TECHNIQUE_LEARN_PREVIEW_KEY] as object | null | undefined);
  if (!preview) return null;

  const partnerId = asPositiveInteger(preview.partnerId);
  const learnedTechniqueId = asTrimmedText(preview.learnedTechniqueId);
  const replacedTechniqueId = asTrimmedText(preview.replacedTechniqueId);
  if (!partnerId || !learnedTechniqueId || !replacedTechniqueId) {
    return null;
  }

  return {
    partnerId,
    learnedTechniqueId,
    replacedTechniqueId,
  };
};

export const clearPartnerTechniqueLearnPreviewMetadata = (
  metadataRaw: object | null | undefined,
): MetadataRecord | null => {
  const metadata = asRecord(metadataRaw);
  if (!metadata) return null;

  const nextMetadata: MetadataRecord = { ...metadata };
  delete nextMetadata[PARTNER_TECHNIQUE_LEARN_PREVIEW_KEY];
  return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
};
