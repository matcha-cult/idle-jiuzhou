/**
 * 功法书技能详情区
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一渲染功法书详情里的“可学习技能”区块，复用已有技能详情卡片内容，避免桌面端与移动端重复拼 UI。
 * 2. 做什么：集中处理加载中、错误、空态三类展示，让父组件只负责传入状态。
 * 3. 不做什么：不负责拉取数据、不负责决定物品是否是功法书，也不处理使用/学习交互。
 *
 * 输入/输出：
 * - 输入：`skills` 技能数组、`loading` 加载态、`error` 错误文案、`variant` 端类型。
 * - 输出：可直接插入详情面板的 React 节点。
 *
 * 数据流/状态流：
 * useTechniqueBookSkills -> TechniqueBookSkillSection -> BagModal / MobileBagModal。
 *
 * 关键边界条件与坑点：
 * 1. 功法存在但尚未配置技能时，不能把区块直接隐藏，否则用户会误以为没有加载到；需要明确展示空态。
 * 2. 卡片正文复用 TechniqueModal 的共享渲染函数，因此样式必须在 BagModal 样式层补齐，避免只有结构没有视觉。
 */
import type { TechniqueSkillDetailLike } from '../TechniqueModal/skillDetailShared';
import { renderSkillCardDetails } from '../TechniqueModal/skillDetailShared';

interface TechniqueBookSkillSectionProps {
  skills: TechniqueSkillDetailLike[];
  loading: boolean;
  error: string | null;
  variant: 'desktop' | 'mobile';
}

export const TechniqueBookSkillSection: React.FC<TechniqueBookSkillSectionProps> = ({
  skills,
  loading,
  error,
  variant,
}) => {
  const cardClassName = `bag-technique-skill-card bag-technique-skill-card--${variant}`;

  return (
    <div className={`bag-technique-skill-section bag-technique-skill-section--${variant}`}>
      <div className="bag-technique-skill-title">可学习技能</div>

      {loading ? (
        <div className="bag-technique-skill-state">技能详情加载中...</div>
      ) : null}

      {!loading && error ? (
        <div className="bag-technique-skill-state is-error">{error}</div>
      ) : null}

      {!loading && !error && skills.length <= 0 ? (
        <div className="bag-technique-skill-state">该功法暂无可展示技能</div>
      ) : null}

      {!loading && !error && skills.length > 0 ? (
        <div className="bag-technique-skill-list">
          {skills.map((skill) => (
            <div key={skill.id} className={cardClassName}>
              {renderSkillCardDetails(skill)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
