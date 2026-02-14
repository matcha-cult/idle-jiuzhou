/**
 * 宗门任务面板。
 * 输入：任务列表、任务动作回调（接取/提交/领取）。
 * 输出：任务卡片、进度和奖励展示。
 * 边界：只有 submit_item 类型的进行中任务允许“提交”按钮。
 */
import { Button, Tag } from 'antd';
import { QUEST_STATUS_COLOR_MAP, QUEST_STATUS_LABEL_MAP, QUEST_TYPE_LABEL_MAP } from '../constants';
import type { SectQuestDto } from '../../../../../services/api';

interface QuestPanelProps {
  loading: boolean;
  quests: SectQuestDto[];
  actionLoadingKey: string | null;
  onAccept: (questId: string) => void;
  onSubmit: (questId: string) => void;
  onClaim: (questId: string) => void;
}

const QuestPanel: React.FC<QuestPanelProps> = ({ loading, quests, actionLoadingKey, onAccept, onSubmit, onClaim }) => {
  return (
    <div className="sect-pane">
      <div className="sect-pane-top">
        <div className="sect-pane-title-wrap">
          <div className="sect-title">宗门活动</div>
          <div className="sect-subtitle">完成宗门任务可获取个人贡献、建设点与宗门资金奖励。</div>
        </div>
      </div>

      <div className="sect-pane-body sect-panel-scroll">
        {loading ? <div className="sect-empty">任务加载中...</div> : null}
        {!loading && quests.length === 0 ? <div className="sect-empty">暂无可接取任务</div> : null}

        <div className="sect-quest-grid">
          {quests.map((quest) => {
            const progress = Math.max(0, Math.min(Number(quest.required) || 0, Number(quest.progress) || 0));
            const loadingKey =
              quest.status === 'completed'
                ? `quest-claim-${quest.id}`
                : quest.status === 'in_progress' && quest.actionType === 'submit_item'
                  ? `quest-submit-${quest.id}`
                  : `quest-accept-${quest.id}`;

            const buttonLabel =
              quest.status === 'not_accepted'
                ? '接取'
                : quest.status === 'in_progress' && quest.actionType === 'submit_item'
                  ? '提交'
                  : quest.status === 'completed'
                    ? '领取'
                    : quest.status === 'claimed'
                      ? '已领取'
                      : '进行中';

            const buttonDisabled = quest.status === 'claimed' || (quest.status === 'in_progress' && quest.actionType !== 'submit_item');
            const onClick =
              quest.status === 'not_accepted'
                ? () => onAccept(quest.id)
                : quest.status === 'in_progress' && quest.actionType === 'submit_item'
                  ? () => onSubmit(quest.id)
                  : quest.status === 'completed'
                    ? () => onClaim(quest.id)
                    : undefined;

            return (
              <div key={quest.id} className="sect-quest-card">
                <div className="sect-quest-head">
                  <div className="sect-quest-title">{quest.name}</div>
                  <div className="sect-quest-tags">
                    <Tag color="default">{QUEST_TYPE_LABEL_MAP[quest.type]}</Tag>
                    <Tag color={QUEST_STATUS_COLOR_MAP[quest.status]}>{QUEST_STATUS_LABEL_MAP[quest.status]}</Tag>
                  </div>
                </div>

                <div className="sect-quest-target">{quest.target}</div>
                <div className="sect-quest-progress">
                  进度 {progress}/{quest.required}
                </div>
                <div className="sect-quest-reward">
                  <Tag>贡献 +{quest.reward.contribution}</Tag>
                  <Tag>建设点 +{quest.reward.buildPoints}</Tag>
                  <Tag>资金 +{quest.reward.funds}</Tag>
                </div>

                <div className="sect-quest-actions">
                  <Button
                    size="small"
                    type={quest.status === 'completed' ? 'primary' : 'default'}
                    disabled={buttonDisabled}
                    loading={actionLoadingKey === loadingKey}
                    onClick={onClick}
                  >
                    {buttonLabel}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default QuestPanel;
