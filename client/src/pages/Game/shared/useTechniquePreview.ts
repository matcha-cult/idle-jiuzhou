/**
 * 功法详情预览共享 Hook。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理“按功法 ID 拉取详情、预览缓存、并发请求去重、聊天等入口打开详情”的共享链路。
 * 2. 做什么：统一把接口返回转换成 `TechniqueDetailPanel` 可直接消费的视图结构，避免调用方重复拼装详情数据。
 * 3. 不做什么：不决定详情以弹窗还是抽屉展示，也不负责聊天 token 的解析和样式。
 *
 * 输入 / 输出：
 * - 输入：调用方通过 `openTechniquePreviewById` 传入功法 ID。
 * - 输出：当前预览功法详情、加载态，以及打开/关闭预览的方法。
 *
 * 数据流 / 状态流：
 * 聊天广播点击 -> 本 Hook 先查模块级缓存 -> 未命中则静默请求功法详情 ->
 * `buildTechniqueDetailView` 归一化 -> 调用方把结果交给 `TechniquePreviewOverlay` 渲染。
 *
 * 复用设计说明：
 * 1. 缓存和请求去重放在模块级，多个聊天入口重复点击同一门功法时只会落一次请求。
 * 2. 详情视图构建继续复用共享 `buildTechniqueDetailView`，避免广播预览再维护一套“层数/技能/加成”转换逻辑。
 * 3. 错误提示统一在这里收敛，调用方只负责触发打开，不再各自补同一份 catch 文案。
 *
 * 关键边界条件与坑点：
 * 1. 快速连续点击不同功法时，必须屏蔽过期响应，避免后返回的旧请求覆盖最新预览。
 * 2. 静默请求只关闭拦截器自动 toast；这里仍需手动提示一次失败文案，避免用户点击后无反馈。
 */
import { App } from 'antd';
import { useCallback, useRef, useState } from 'react';
import {
  getTechniqueDetail,
  getUnifiedApiErrorMessage,
  SILENT_API_REQUEST_CONFIG,
} from '../../../services/api';
import { IMG_LINGSHI, IMG_TONGQIAN } from './imageAssets';
import { resolveIconUrl } from './resolveIcon';
import { buildTechniqueDetailView, type TechniqueDetailView } from './techniqueDetailView';

interface UseTechniquePreviewResult {
  previewTechnique: TechniqueDetailView | null;
  previewTechniqueLoading: boolean;
  openTechniquePreviewById: (techniqueId: string) => Promise<void>;
  closeTechniquePreview: () => void;
}

const techniquePreviewCache = new Map<string, TechniqueDetailView>();
const techniquePreviewRequestMap = new Map<string, Promise<TechniqueDetailView>>();

const normalizeTechniqueId = (techniqueId: string): string => {
  return String(techniqueId ?? '').trim();
};

const requestTechniquePreview = async (techniqueId: string): Promise<TechniqueDetailView> => {
  const result = await getTechniqueDetail(techniqueId, SILENT_API_REQUEST_CONFIG);
  if (!result.success || !result.data) {
    throw new Error(result.message || '未找到功法');
  }

  return buildTechniqueDetailView({
    technique: result.data.technique,
    currentLayer: 0,
    layers: result.data.layers,
    skills: result.data.skills,
    resolveIcon: resolveIconUrl,
    spiritStoneIcon: IMG_LINGSHI,
    expIcon: IMG_TONGQIAN,
  });
};

export const useTechniquePreview = (): UseTechniquePreviewResult => {
  const { message } = App.useApp();
  const [previewTechnique, setPreviewTechnique] = useState<TechniqueDetailView | null>(null);
  const [previewTechniqueLoading, setPreviewTechniqueLoading] = useState(false);
  const requestVersionRef = useRef(0);

  const closeTechniquePreview = useCallback(() => {
    requestVersionRef.current += 1;
    setPreviewTechnique(null);
    setPreviewTechniqueLoading(false);
  }, []);

  const openTechniquePreviewById = useCallback(async (techniqueId: string) => {
    const normalizedTechniqueId = normalizeTechniqueId(techniqueId);
    if (!normalizedTechniqueId) return;

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setPreviewTechnique(null);
    setPreviewTechniqueLoading(true);

    const cachedTechnique = techniquePreviewCache.get(normalizedTechniqueId);
    if (cachedTechnique) {
      if (requestVersionRef.current !== requestVersion) return;
      setPreviewTechnique(cachedTechnique);
      setPreviewTechniqueLoading(false);
      return;
    }

    const existingRequest = techniquePreviewRequestMap.get(normalizedTechniqueId);
    const request = existingRequest ?? requestTechniquePreview(normalizedTechniqueId);
    if (!existingRequest) {
      techniquePreviewRequestMap.set(normalizedTechniqueId, request);
    }

    try {
      const detail = await request;
      techniquePreviewCache.set(normalizedTechniqueId, detail);
      if (requestVersionRef.current !== requestVersion) return;
      setPreviewTechnique(detail);
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) return;
      setPreviewTechnique(null);
      message.error(getUnifiedApiErrorMessage(error, '功法详情加载失败'));
    } finally {
      if (techniquePreviewRequestMap.get(normalizedTechniqueId) === request) {
        techniquePreviewRequestMap.delete(normalizedTechniqueId);
      }
      if (requestVersionRef.current === requestVersion) {
        setPreviewTechniqueLoading(false);
      }
    }
  }, [message]);

  return {
    previewTechnique,
    previewTechniqueLoading,
    openTechniquePreviewById,
    closeTechniquePreview,
  };
};
