/**
 * 分解奖励预览 Hook
 *
 * 作用（做什么 / 不做什么）：
 * - 做：在分解弹窗打开后，根据选中物品与数量向后端请求分解奖励预览，并把响应收敛成组件可直接消费的状态。
 * - 做：把“预计获得什么”这件事完全交给后端规则，移除前端按品质/子类型硬编码推导产物的分叉。
 * - 不做：不执行实际分解，不在接口失败时回退到本地公式，也不负责把奖励格式化成最终文案。
 *
 * 输入/输出：
 * - 输入：弹窗开关 `open`、物品实例 id `itemId`、分解数量 `qty`。
 * - 输出：`previewRewards`、`loading`、`errorMessage`。
 *
 * 数据流/状态流：
 * - open/itemId/qty 变化 -> 请求 `/inventory/disassemble/preview` -> 写入奖励预览或错误信息 -> DisassembleModal 渲染结果。
 *
 * 关键边界条件与坑点：
 * 1) 弹窗关闭或物品切换时必须立即清空上一次预览，避免旧物品的奖励短暂残留在新弹窗中。
 * 2) 接口失败时只暴露错误信息，不做任何前端补算，确保“预览来源”和“实际结算来源”始终同源。
 */
import { useEffect, useState } from 'react';
import {
  getInventoryDisassembleRewardPreview,
  type InventoryDisassembleRewards,
} from '../../../../services/api';

interface UseDisassembleRewardPreviewOptions {
  open: boolean;
  itemId: number | null;
  qty: number;
}

export const useDisassembleRewardPreview = ({
  open,
  itemId,
  qty,
}: UseDisassembleRewardPreviewOptions): {
  previewRewards: InventoryDisassembleRewards | null;
  loading: boolean;
  errorMessage: string;
} => {
  const [previewRewards, setPreviewRewards] = useState<InventoryDisassembleRewards | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open || itemId === null || !Number.isInteger(qty) || qty <= 0) {
      setPreviewRewards(null);
      setLoading(false);
      setErrorMessage('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage('');

    getInventoryDisassembleRewardPreview({ itemId, qty })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.rewards) {
          setPreviewRewards(res.rewards);
          setErrorMessage('');
          return;
        }
        setPreviewRewards(null);
        setErrorMessage(res.message || '分解产物预览获取失败');
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewRewards(null);
        setErrorMessage('分解产物预览获取失败');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, itemId, qty]);

  return {
    previewRewards,
    loading,
    errorMessage,
  };
};
