/**
 * 功法书技能查询 Hook
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：根据背包物品里的 `learnableTechniqueId` 统一查询功法详情，并提取“可学习技能”给桌面端与移动端详情面板复用。
 * 2. 做什么：集中管理加载中、错误、技能列表三种状态，避免两个面板各写一套异步请求逻辑。
 * 3. 不做什么：不处理物品选择、不处理技能卡片样式，也不缓存跨会话数据。
 *
 * 输入/输出：
 * - 输入：`item` 当前详情物品；`enabled` 是否允许发起查询。
 * - 输出：`skills` 技能详情数组、`loading` 加载态、`error` 错误文案。
 *
 * 数据流/状态流：
 * BagItem.learnableTechniqueId -> getTechniqueDetail -> SkillDefDto[] -> TechniqueBookSkillSection。
 *
 * 关键边界条件与坑点：
 * 1. 非功法书或未解析出 `learnableTechniqueId` 时必须立刻清空状态，避免沿用上一个物品的数据。
 * 2. 切换物品过快会产生竞态，必须通过取消标记拦截过期响应，避免详情闪回。
 */
import { useEffect, useMemo, useState } from 'react';
import { getUnifiedApiErrorMessage } from '../../../../services/api';
import { getTechniqueDetail, type SkillDefDto } from '../../../../services/api/technique';
import type { TechniqueSkillDetailLike } from '../TechniqueModal/skillDetailShared';
import type { BagItem } from './bagShared';

type UseTechniqueBookSkillsOptions = {
  item: BagItem | null;
  enabled: boolean;
};

type TechniqueBookSkillsState = {
  skills: TechniqueSkillDetailLike[];
  loading: boolean;
  error: string | null;
};

const mapSkillToDetail = (skill: SkillDefDto): TechniqueSkillDetailLike => ({
  id: skill.id,
  name: skill.name,
  icon: skill.icon || '',
  description: skill.description || undefined,
  cost_lingqi: skill.cost_lingqi || undefined,
  cost_qixue: skill.cost_qixue || undefined,
  cooldown: skill.cooldown || undefined,
  target_type: skill.target_type || undefined,
  target_count: skill.target_count || undefined,
  damage_type: skill.damage_type || undefined,
  element: skill.element || undefined,
  effects: Array.isArray(skill.effects) ? skill.effects : undefined,
});

export const useTechniqueBookSkills = ({
  item,
  enabled,
}: UseTechniqueBookSkillsOptions): TechniqueBookSkillsState => {
  const techniqueId = useMemo(() => {
    if (!enabled) return null;
    return item?.learnableTechniqueId ?? null;
  }, [enabled, item?.learnableTechniqueId]);

  const [skills, setSkills] = useState<TechniqueSkillDetailLike[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!techniqueId) {
      setSkills([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getTechniqueDetail(techniqueId)
      .then((response) => {
        if (cancelled) return;
        if (!response.success || !response.data) {
          throw new Error(response.message || '加载功法详情失败');
        }
        setSkills(response.data.skills.map(mapSkillToDetail));
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setSkills([]);
        setLoading(false);
        setError(getUnifiedApiErrorMessage(error, '加载功法技能失败'));
      });

    return () => {
      cancelled = true;
    };
  }, [techniqueId]);

  return {
    skills,
    loading,
    error,
  };
};
