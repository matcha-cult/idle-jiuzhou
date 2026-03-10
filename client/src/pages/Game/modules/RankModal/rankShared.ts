/**
 * 排行榜弹窗的数据加载与短时缓存。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一四个榜单的按需请求、模块级短时缓存、并发请求去重。
 * 2. 做什么：把“打开弹窗先看当前 tab，再决定是否请求”的规则集中到一个 Hook。
 * 3. 不做什么：不负责任何表格/卡片 UI 渲染，不持久化到 localStorage，不改动后端排序规则。
 *
 * 输入/输出：
 * - 输入：`open` 表示弹窗是否可见，`activeTab` 表示当前选中的榜单。
 * - 输出：`rankRowsByTab` 提供四类榜单数据，`loadingByTab` 提供每个榜单自己的加载状态。
 *
 * 数据流/状态流：
 * - RankModal 传入当前 tab -> Hook 先读取模块级缓存 -> 无缓存时调用对应单榜单接口 ->
 *   写回缓存与本地状态 -> UI 只渲染当前 tab 的结果。
 *
 * 关键边界条件与坑点：
 * 1. RankModal 使用 `destroyOnHidden`，组件关闭后会销毁；缓存必须放在模块级，否则每次重开都会重新请求。
 * 2. 用户快速切 tab 时，同一榜单可能被重复触发；这里用 in-flight Promise 去重，避免重复打接口。
 * 3. 这里只缓存短时间数据，避免排行榜长时间停留旧值；TTL 到期后会重新请求。
 * 4. 首屏只加载当前 tab，避免默认“境界榜”还要等待“竞技场榜”返回后才能结束 loading。
 */
import { useEffect, useState } from 'react';
import {
  getArenaRanks,
  getRealmRanks,
  getSectRanks,
  getWealthRanks,
  type ArenaRankRowDto,
  type RealmRankRowDto,
  type SectRankRowDto,
  type WealthRankRowDto,
} from '../../../../services/api';

export type RankTab = 'realm' | 'sect' | 'wealth' | 'arena';

export interface RankTabMeta {
  key: RankTab;
  label: string;
  shortLabel: string;
  subtitle: string;
}

export const RANK_TAB_META: RankTabMeta[] = [
  { key: 'realm', label: '境界排行榜', shortLabel: '境界', subtitle: '按境界与战力综合排序' },
  { key: 'sect', label: '宗门排行榜', shortLabel: '宗门', subtitle: '按宗门综合实力排序' },
  { key: 'wealth', label: '财富排行榜', shortLabel: '财富', subtitle: '按灵石与银两总量排序' },
  { key: 'arena', label: '竞技场排行榜', shortLabel: '竞技', subtitle: '按竞技场积分排序' },
];

export const RANK_TAB_KEYS: RankTab[] = RANK_TAB_META.map((item) => item.key);

export const RANK_TAB_META_MAP: Record<RankTab, RankTabMeta> = {
  realm: RANK_TAB_META[0],
  sect: RANK_TAB_META[1],
  wealth: RANK_TAB_META[2],
  arena: RANK_TAB_META[3],
};

export type RankRowsByTab = {
  realm: RealmRankRowDto[];
  sect: SectRankRowDto[];
  wealth: WealthRankRowDto[];
  arena: ArenaRankRowDto[];
};

type RankRows = RankRowsByTab[RankTab];
type LoadingByTab = Record<RankTab, boolean>;
type RankCacheEntry = {
  rows: RankRows;
  expiresAt: number;
};

const RANK_CACHE_TTL_MS = 30_000;
const rankCache = new Map<RankTab, RankCacheEntry>();
const inflightRequests = new Map<RankTab, Promise<RankRows>>();

const createEmptyRankRows = (): RankRowsByTab => ({
  realm: [],
  sect: [],
  wealth: [],
  arena: [],
});

const createLoadingState = (): LoadingByTab => ({
  realm: false,
  sect: false,
  wealth: false,
  arena: false,
});

const readCachedRows = <T extends RankTab>(tab: T): RankRowsByTab[T] | null => {
  const cached = rankCache.get(tab);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    rankCache.delete(tab);
    return null;
  }
  return cached.rows as RankRowsByTab[T];
};

const writeCachedRows = <T extends RankTab>(tab: T, rows: RankRowsByTab[T]): void => {
  rankCache.set(tab, {
    rows,
    expiresAt: Date.now() + RANK_CACHE_TTL_MS,
  });
};

const fetchRowsByTab = async <T extends RankTab>(tab: T): Promise<RankRowsByTab[T]> => {
  if (tab === 'realm') {
    const response = await getRealmRanks(50);
    return (response.data ?? []) as RankRowsByTab[T];
  }

  if (tab === 'sect') {
    const response = await getSectRanks(30);
    return (response.data ?? []) as RankRowsByTab[T];
  }

  if (tab === 'wealth') {
    const response = await getWealthRanks(50);
    return (response.data ?? []) as RankRowsByTab[T];
  }

  const response = await getArenaRanks(50);
  return (response.data ?? []) as RankRowsByTab[T];
};

const getRowsWithCache = async <T extends RankTab>(tab: T): Promise<RankRowsByTab[T]> => {
  const cached = readCachedRows(tab);
  if (cached) return cached;

  const existingRequest = inflightRequests.get(tab);
  if (existingRequest) return existingRequest as Promise<RankRowsByTab[T]>;

  const request = fetchRowsByTab(tab)
    .then((rows) => {
      writeCachedRows(tab, rows);
      return rows;
    })
    .finally(() => {
      inflightRequests.delete(tab);
    });

  inflightRequests.set(tab, request);
  return request as Promise<RankRowsByTab[T]>;
};

const readAllCachedRows = (): RankRowsByTab => {
  const next = createEmptyRankRows();
  const realmRows = readCachedRows('realm');
  const sectRows = readCachedRows('sect');
  const wealthRows = readCachedRows('wealth');
  const arenaRows = readCachedRows('arena');

  if (realmRows) next.realm = realmRows;
  if (sectRows) next.sect = sectRows;
  if (wealthRows) next.wealth = wealthRows;
  if (arenaRows) next.arena = arenaRows;
  return next;
};

export const useRankRows = (
  open: boolean,
  activeTab: RankTab,
): { rankRowsByTab: RankRowsByTab; loadingByTab: LoadingByTab } => {
  const [rankRowsByTab, setRankRowsByTab] = useState<RankRowsByTab>(() => readAllCachedRows());
  const [loadingByTab, setLoadingByTab] = useState<LoadingByTab>(() => createLoadingState());

  useEffect(() => {
    if (!open) return;

    setRankRowsByTab((prev) => ({
      ...prev,
      ...readAllCachedRows(),
    }));

    let cancelled = false;
    const cachedRows = readCachedRows(activeTab);
    if (cachedRows) {
      setRankRowsByTab((prev) => ({ ...prev, [activeTab]: cachedRows }));
      setLoadingByTab((prev) => ({ ...prev, [activeTab]: false }));
      return;
    }

    setLoadingByTab((prev) => ({ ...prev, [activeTab]: true }));
    void getRowsWithCache(activeTab)
      .then((rows) => {
        if (cancelled) return;
        setRankRowsByTab((prev) => ({ ...prev, [activeTab]: rows }));
      })
      .catch(() => {
        if (cancelled) return;
        setRankRowsByTab((prev) => ({ ...prev, [activeTab]: [] }));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingByTab((prev) => ({ ...prev, [activeTab]: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, open]);

  return { rankRowsByTab, loadingByTab };
};
