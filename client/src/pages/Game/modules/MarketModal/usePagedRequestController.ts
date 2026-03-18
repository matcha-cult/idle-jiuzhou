import { useEffect, useRef } from 'react';

/**
 * 坊市分页请求控制 Hook
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把“筛选条件变化时先回到第 1 页，再按最新条件请求一次”的流程收敛成单一入口，避免坊市组件在多个 effect / 事件处理里重复写同样的分页联动逻辑。
 * 2. 做什么：保证同一轮条件变化只发起一次最终请求，避免先请求旧页码、再请求新页码。
 * 3. 不做什么：不负责拼装业务参数，不维护列表数据，也不决定成功后的状态写入。
 *
 * 输入/输出：
 * - 输入：是否启用 `enabled`、当前查询签名 `requestKey`、当前页 `page`、回到第一页的方法 `onPageReset`、真正执行请求的方法 `onRequest`。
 * - 输出：无返回值；内部通过 effect 触发请求或触发页码重置。
 *
 * 数据流/状态流：
 * - 上游筛选条件或页码变化 -> 生成新的 `requestKey` / `page` -> 本 Hook 判断是否属于“筛选变化” -> 若当前页不是 1 则先重置页码 -> 下一轮 render 再发最终请求。
 *
 * 关键边界条件与坑点：
 * 1. 面板关闭或切走时必须清空上一次的 `requestKey`，否则再次进入同一面板时会误判成“条件未变化”，导致首屏不请求。
 * 2. 条件变化且当前页不是 1 时，不能先请求旧页码，否则会产生一次无效请求，再补一次正确请求，正是这类重复请求需要被消除。
 */
interface UsePagedRequestControllerOptions {
  enabled: boolean;
  requestKey: string;
  page: number;
  onPageReset: () => void;
  onRequest: (page: number) => void | Promise<void>;
}

export const usePagedRequestController = ({
  enabled,
  requestKey,
  page,
  onPageReset,
  onRequest,
}: UsePagedRequestControllerOptions): void => {
  const lastRequestKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastRequestKeyRef.current = null;
      return;
    }

    const filtersChanged = lastRequestKeyRef.current !== requestKey;
    lastRequestKeyRef.current = requestKey;

    if (filtersChanged && page !== 1) {
      onPageReset();
      return;
    }

    void onRequest(filtersChanged ? 1 : page);
  }, [enabled, onPageReset, onRequest, page, requestKey]);
};
