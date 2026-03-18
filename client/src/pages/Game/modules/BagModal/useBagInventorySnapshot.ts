/**
 * 背包快照加载 Hook
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一加载背包弹窗首屏所需的容量信息、背包物品与已穿戴物品，供桌面端与移动端共用。
 * 2. 做什么：集中完成 DTO -> BagItem 的视图模型转换，避免两个弹窗组件各自重复拼装 refresh 逻辑。
 * 3. 不做什么：不持有筛选、选中态、详情弹层等纯 UI 状态，也不负责弹错误提示。
 *
 * 输入/输出：
 * - 输入：`open` 控制是否在弹窗打开时自动刷新；`onLoadFailed` 用于让外层在快照加载失败时清理选中态。
 * - 输出：`loading`、`info`、`items`、`refresh`，供背包弹窗直接消费。
 *
 * 数据流/状态流：
 * open -> getBagInventorySnapshot -> buildBagItem -> info/items 状态 -> BagModal / MobileBagModal 渲染。
 *
 * 关键边界条件与坑点：
 * 1. 接口请求失败时必须统一清空本地快照，避免继续展示旧背包数据误导用户。
 * 2. `onLoadFailed` 只在失败路径触发，避免成功刷新时把用户当前选中的物品误清掉。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  getBagInventorySnapshot,
  type InventoryInfoData,
} from '../../../../services/api';
import { buildBagItem, type BagItem } from './bagShared';

type UseBagInventorySnapshotOptions = {
  open: boolean;
  onLoadFailed: () => void;
};

type UseBagInventorySnapshotResult = {
  loading: boolean;
  info: InventoryInfoData | null;
  items: BagItem[];
  refresh: () => Promise<void>;
};

export const useBagInventorySnapshot = ({
  open,
  onLoadFailed,
}: UseBagInventorySnapshotOptions): UseBagInventorySnapshotResult => {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<InventoryInfoData | null>(null);
  const [items, setItems] = useState<BagItem[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getBagInventorySnapshot();
      if (!response.success || !response.data) {
        throw new Error(response.message || '获取背包快照失败');
      }

      const nextBagItems = response.data.bagItems.map(buildBagItem).filter((item): item is BagItem => !!item);
      const nextEquippedItems = response.data.equippedItems
        .map(buildBagItem)
        .filter((item): item is BagItem => !!item);

      setInfo(response.data.info);
      setItems([...nextBagItems, ...nextEquippedItems]);
    } catch {
      setInfo(null);
      setItems([]);
      onLoadFailed();
    } finally {
      setLoading(false);
    }
  }, [onLoadFailed]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  return {
    loading,
    info,
    items,
    refresh,
  };
};
