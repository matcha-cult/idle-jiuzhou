/**
 * 玩家名字共享展示组件
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一渲染玩家名字与月卡激活特效，避免聊天、排行、队伍、宗门等模块各自重复拼 DOM 与 class。
 * 2. 做什么：按需渲染可选称号文本，但不接管点击、请求与业务文案拼装。
 * 3. 不做什么：不拉取月卡状态，不决定谁是玩家；调用方必须明确传入玩家名字与 `monthCardActive`。
 *
 * 输入/输出：
 * - 输入：`name` 玩家名、`title` 可选前缀称号、`monthCardActive` 月卡激活态、`ellipsis` 是否启用省略样式、额外 className。
 * - 输出：统一的行内名字结构，名字文本在激活时自动附加月卡特效 class。
 *
 * 数据流/状态流：
 * 后端 DTO / 页面已有状态 -> PlayerName props -> 统一 DOM + 共享 SCSS。
 *
 * 关键边界条件与坑点：
 * 1. 组件只负责“玩家名字”，系统消息、宗门名、队伍名等非玩家文本不能误用，否则会把特效扩散到错误实体。
 * 2. 小字号列表与表格也会复用本组件，因此特效强度必须克制，不能为了炫光牺牲可读性。
 */
import './playerName.scss';

interface PlayerNameProps {
  name: string;
  title?: string;
  monthCardActive?: boolean;
  ellipsis?: boolean;
  className?: string;
  titleClassName?: string;
  nameClassName?: string;
}

const joinClassNames = (...values: Array<string | false | null | undefined>): string => {
  return values.filter(Boolean).join(' ');
};

const PlayerName: React.FC<PlayerNameProps> = ({
  name,
  title,
  monthCardActive = false,
  ellipsis = false,
  className,
  titleClassName,
  nameClassName,
}) => {
  return (
    <span
      className={joinClassNames(
        'game-player-name',
        ellipsis && 'game-player-name--ellipsis',
        className,
      )}
    >
      {title ? (
        <span className={joinClassNames('game-player-name__title', titleClassName)}>
          {title}
        </span>
      ) : null}
      <span
        className={joinClassNames(
          'game-player-name__text',
          monthCardActive && 'is-month-card-active',
          nameClassName,
        )}
        data-text={monthCardActive ? name : undefined}
      >
        {name}
      </span>
    </span>
  );
};

export default PlayerName;
