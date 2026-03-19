import { App, Button, Modal, Spin, Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  chooseWanderEpisodeOption,
  generateWanderEpisode,
  getWanderOverview,
  type WanderOverviewDto,
} from '../../../../services/api';
import { SILENT_API_REQUEST_CONFIG } from '../../../../services/api/requestConfig';
import './index.scss';

/**
 * 云游奇遇弹窗
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：承接百业入口的云游奇遇交互，负责展示今日剧情、提交选项与回顾故事。
 * 2. 做什么：把“概览读取 / 今日生成 / 选项确认”三条请求集中在单个弹窗里，避免 Game 页维护额外状态机。
 * 3. 不做什么：不重复实现后端每日限制，不接管正式称号装备逻辑，也不处理全局红点。
 *
 * 输入/输出：
 * - 输入：`open`、`onClose`。
 * - 输出：用户关闭弹窗或完成当日奇遇交互后的界面更新。
 *
 * 数据流/状态流：
 * 打开弹窗 -> 读取 overview -> 若今日未触发则点击“今日云游”生成一幕 -> 选择选项 -> 刷新 overview。
 *
 * 关键边界条件与坑点：
 * 1. 自动错误 toast 仍由统一请求拦截器负责，本组件只补成功提示，避免失败提示重复弹两次。
 * 2. 当前幕次未选择前不能再次生成；按钮状态必须直接绑定 overview 的 `hasPendingEpisode/canGenerateToday`，不能本地猜测。
 */

interface WanderModalProps {
  open: boolean;
  onClose: () => void;
}

type WanderOverviewRefreshMode = 'initial' | 'background';

const WanderModal: React.FC<WanderModalProps> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<WanderOverviewDto | null>(null);
  const [actionKey, setActionKey] = useState('');

  const refreshOverview = useCallback(async (mode: WanderOverviewRefreshMode = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    }
    try {
      const response = await getWanderOverview(mode === 'background' ? SILENT_API_REQUEST_CONFIG : undefined);
      setOverview(response.data ?? null);
    } catch {
      if (mode === 'initial') {
        setOverview(null);
      }
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      }
    }
  }, []);

  const generateToday = useCallback(async () => {
    setActionKey('generate');
    try {
      const response = await generateWanderEpisode();
      setOverview((current) => {
        if (!current || !response.data) return current;
        return {
          ...current,
          hasPendingEpisode: false,
          canGenerateToday: false,
          todayCompleted: false,
          currentGenerationJob: response.data.job,
        };
      });
      message.success('今日云游已开始推演');
      await refreshOverview('background');
    } finally {
      setActionKey('');
    }
  }, [message, refreshOverview]);

  const chooseOption = useCallback(async (episodeId: string, optionIndex: number) => {
    setActionKey(`choose:${episodeId}:${optionIndex}`);
    try {
      const response = await chooseWanderEpisodeOption({ episodeId, optionIndex });
      const awardedTitle = response.data?.awardedTitle ?? null;
      if (awardedTitle) {
        message.success(`奇遇已完结，获得正式称号「${awardedTitle.name}」`);
      } else {
        message.success('今日抉择已落定');
      }
      await refreshOverview();
    } finally {
      setActionKey('');
    }
  }, [message, refreshOverview]);

  const currentEpisode = overview?.currentEpisode ?? null;
  const currentGenerationJob = overview?.currentGenerationJob ?? null;
  const activeStory = overview?.activeStory ?? null;
  const latestFinishedStory = overview?.latestFinishedStory ?? null;
  const storyForHistory = activeStory ?? latestFinishedStory;

  useEffect(() => {
    if (!open || currentGenerationJob?.status !== 'pending') {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refreshOverview('background');
    }, 2000);

    return () => window.clearInterval(timer);
  }, [currentGenerationJob?.generationId, currentGenerationJob?.status, open, refreshOverview]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={880}
      className="wander-modal"
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (!visible) {
          setOverview(null);
          setActionKey('');
          setLoading(false);
          return;
        }
        void refreshOverview();
      }}
    >
      <div className="wander-shell">
        <div className="wander-header">
          <div>
            <div className="wander-title">云游奇遇</div>
            <div className="wander-subtitle">每日一幕，由 AI 延续你的修行缘法，并在结局时铸成正式称号。</div>
          </div>
          {overview ? <Tag color="default">今日日期 {overview.today}</Tag> : null}
        </div>

        <div className="wander-body">
          {loading && !overview ? (
            <div className="wander-loading">
              <Spin />
            </div>
          ) : null}

          {!loading && overview ? (
            <>
              <section className="wander-panel wander-panel-highlight">
                <div className="wander-panel-head">
                  <div className="wander-panel-title">今日缘法</div>
                  {!overview.aiAvailable ? <Tag color="red">AI 未配置</Tag> : null}
                  {overview.todayCompleted ? <Tag color="green">今日已完成</Tag> : null}
                  {overview.hasPendingEpisode ? <Tag color="gold">等待抉择</Tag> : null}
                  {currentGenerationJob?.status === 'pending' ? <Tag color="processing">生成中</Tag> : null}
                  {currentGenerationJob?.status === 'failed' ? <Tag color="red">生成失败</Tag> : null}
                </div>

                {!overview.aiAvailable ? (
                  <div className="wander-empty">当前服务器未配置 AI 文本模型，暂时无法开启云游奇遇。</div>
                ) : null}

                {overview.aiAvailable && !currentEpisode && currentGenerationJob?.status === 'pending' ? (
                  <div className="wander-generate-card">
                    <div className="wander-generate-main">
                      <div className="wander-generate-title">今日云游推演中</div>
                      <div className="wander-generate-desc">
                        <Spin size="small" /> AI 正在整理你今日的缘法脉络，剧情生成完成后会自动出现在这里。
                      </div>
                    </div>
                    <Tag color="processing">任务 #{currentGenerationJob.generationId}</Tag>
                  </div>
                ) : null}

                {overview.aiAvailable && !currentEpisode && currentGenerationJob?.status === 'failed' ? (
                  <div className="wander-generate-card">
                    <div className="wander-generate-main">
                      <div className="wander-generate-title">今日云游推演失败</div>
                      <div className="wander-generate-desc">
                        {currentGenerationJob.errorMessage || '本次奇遇未能顺利成形，你可以立即重新推演今日剧情。'}
                      </div>
                    </div>
                    <Button
                      type="primary"
                      size="large"
                      loading={actionKey === 'generate'}
                      onClick={() => void generateToday()}
                    >
                      重新推演
                    </Button>
                  </div>
                ) : null}

                {overview.aiAvailable && !currentEpisode && overview.canGenerateToday && currentGenerationJob === null ? (
                  <div className="wander-generate-card">
                    <div className="wander-generate-main">
                      <div className="wander-generate-title">今日尚未云游</div>
                      <div className="wander-generate-desc">
                        点击后将生成今天这一幕剧情。AI 会参考你最近的奇遇走向继续推进，并在结局时产出正式称号。
                      </div>
                    </div>
                    <Button
                      type="primary"
                      size="large"
                      loading={actionKey === 'generate'}
                      onClick={() => void generateToday()}
                    >
                      今日云游
                    </Button>
                  </div>
                ) : null}

                {currentEpisode ? (
                  <div className="wander-episode">
                    <div className="wander-episode-top">
                      <Tag color="processing">第 {currentEpisode.dayIndex} 幕</Tag>
                      {currentEpisode.isEnding ? <Tag color="magenta">终幕</Tag> : null}
                    </div>
                    <div className="wander-episode-title">{currentEpisode.title}</div>
                    <div className="wander-episode-opening">{currentEpisode.opening}</div>

                    {currentEpisode.chosenOptionIndex === null ? (
                      <div className="wander-options">
                        {currentEpisode.options.map((option) => (
                          <Button
                            key={option.index}
                            className="wander-option-button"
                            onClick={() => void chooseOption(currentEpisode.id, option.index)}
                            loading={actionKey === `choose:${currentEpisode.id}:${option.index}`}
                          >
                            <span className="wander-option-index">抉择 {option.index + 1}</span>
                            <span className="wander-option-text">{option.text}</span>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="wander-choice-result">
                        <div className="wander-choice-label">今日选择</div>
                        <div className="wander-choice-text">{currentEpisode.chosenOptionText}</div>
                        {currentEpisode.isEnding && currentEpisode.rewardTitleName ? (
                          <div className="wander-choice-reward">
                            结局称号：{currentEpisode.rewardTitleName}
                            {currentEpisode.rewardTitleDesc ? ` · ${currentEpisode.rewardTitleDesc}` : ''}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                {overview.aiAvailable && !currentEpisode && !overview.canGenerateToday && currentGenerationJob === null ? (
                  <div className="wander-empty">今日云游已经结束，明日再来续写新的缘法。</div>
                ) : null}
              </section>

              <section className="wander-panel">
                <div className="wander-panel-head">
                  <div className="wander-panel-title">故事回顾</div>
                  {storyForHistory ? <Tag color="default">{storyForHistory.theme}</Tag> : null}
                </div>
                {storyForHistory ? (
                  <>
                    <div className="wander-story-premise">{storyForHistory.premise}</div>
                    <div className="wander-story-summary">{storyForHistory.summary}</div>
                    <div className="wander-history-list">
                      {storyForHistory.episodes.map((episode) => (
                        <div key={episode.id} className="wander-history-card">
                          <div className="wander-history-head">
                            <span className="wander-history-title">第 {episode.dayIndex} 幕 · {episode.title}</span>
                            {episode.isEnding ? <Tag color="magenta">终幕</Tag> : null}
                          </div>
                          <div className="wander-history-summary">{episode.summary}</div>
                          {episode.chosenOptionText ? (
                            <div className="wander-history-choice">选择：{episode.chosenOptionText}</div>
                          ) : (
                            <div className="wander-history-choice">尚未作出选择</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="wander-empty">尚未开启任何云游故事。</div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

export default WanderModal;
