/**
 * ChatPanel 消息列表黏底滚动 Hook。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理聊天列表“切视图强制滚到底”和“新消息追加时保持黏底”，避免主频道与私聊各写一套滚动副作用。
 * 2. 做什么：在内容高度于首轮提交后继续变化时，通过 `ResizeObserver` 补一次滚动，解决战况/批量消息等场景首轮滚动后仍未贴底的问题。
 * 3. 不做什么：不决定消息来源、不维护频道状态，也不处理列表虚拟化；它只关心已渲染 DOM 的滚动位置同步。
 *
 * 输入/输出：
 * 1. 输入：滚动容器 ref、内容容器 ref、当前 Hook 是否启用、当前视图 key、尾消息 key。
 * 2. 输出：返回一个 `handleScroll` 回调，供滚动容器更新“用户是否仍停留在底部附近”的状态。
 *
 * 数据流/状态流：
 * 1. ChatPanel 传入当前活跃容器与内容容器 refs。
 * 2. 频道切换或尾消息变化时，Hook 判断是否需要滚动到底。
 * 3. 内容高度变化且当前仍处于黏底状态时，Hook 再次把容器滚到最新底部。
 *
 * 关键边界条件与坑点：
 * 1. 只观察滚动容器自身尺寸无法捕获 `scrollHeight` 变化，因此必须观察内部内容容器，才能在消息换行、批量插入后拿到高度变化。
 * 2. 用户手动上翻后不能被强制拉回底部，所以只有“切视图”或“原本就在底部附近时的新内容变化”才允许自动滚动。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface UseStickyMessageScrollOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  viewKey: string;
  tailKey: string;
}

interface UseStickyMessageScrollResult {
  handleScroll: () => void;
}

const NEAR_BOTTOM_THRESHOLD_PX = 24;

const readContentHeight = (element: HTMLDivElement): number => {
  return Math.floor(element.getBoundingClientRect().height);
};

export const useStickyMessageScroll = ({
  containerRef,
  contentRef,
  enabled,
  viewKey,
  tailKey,
}: UseStickyMessageScrollOptions): UseStickyMessageScrollResult => {
  const shouldStickToBottomRef = useRef(true);
  const prevEnabledRef = useRef(false);
  const prevViewKeyRef = useRef('');
  const prevTailKeyRef = useRef('');

  const isNearBottom = useCallback((element: HTMLDivElement): boolean => {
    return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    shouldStickToBottomRef.current = true;
  }, [containerRef]);

  const handleScroll = useCallback(() => {
    if (!enabled) return;
    const element = containerRef.current;
    if (!element) return;
    shouldStickToBottomRef.current = isNearBottom(element);
  }, [containerRef, enabled, isNearBottom]);

  useLayoutEffect(() => {
    const becameEnabled = enabled && !prevEnabledRef.current;
    const viewChanged = prevViewKeyRef.current !== viewKey;
    const tailChanged = prevTailKeyRef.current !== tailKey;

    prevEnabledRef.current = enabled;
    prevViewKeyRef.current = viewKey;
    prevTailKeyRef.current = tailKey;

    if (!enabled) {
      return;
    }

    if (!becameEnabled && !viewChanged && !(tailChanged && shouldStickToBottomRef.current)) {
      return;
    }

    scrollToBottom();
    const rafId = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(rafId);
  }, [enabled, scrollToBottom, tailKey, viewKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') {
      return;
    }

    let previousHeight = readContentHeight(content);
    const resizeObserver = new ResizeObserver(() => {
      const nextHeight = readContentHeight(content);
      if (nextHeight === previousHeight) {
        return;
      }
      previousHeight = nextHeight;
      if (!shouldStickToBottomRef.current) {
        return;
      }
      scrollToBottom();
    });

    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, [contentRef, enabled, scrollToBottom]);

  return { handleScroll };
};
