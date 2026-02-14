/**
 * 宗门日志面板。
 * 输入：日志列表与刷新动作，可选 `embedded`（是否以内嵌区块渲染）。
 * 输出：按时间倒序的宗门操作记录。
 * 边界：
 * 1) 日志为空时展示空态，不展示伪造占位内容；
 * 2) embedded=true 时不再输出整页容器，便于并入“基础信息”标签；
 * 3) 刷新入口使用图标按钮，减少标题区横向占用。
 */
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import type { SectLogDto } from '../../../../../services/api';

interface LogsPanelProps {
  loading: boolean;
  logs: SectLogDto[];
  onRefresh: () => void;
  embedded?: boolean;
}

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return dateString;
  const pad = (value: number) => String(value).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

const LogsList: React.FC<{ loading: boolean; logs: SectLogDto[] }> = ({ loading, logs }) => {
  return (
    <>
      {logs.length === 0 && !loading ? <div className="sect-empty">暂无日志记录</div> : null}

      <div className="sect-log-list">
        {logs.map((row: SectLogDto) => (
          <div key={row.id} className="sect-log-card">
            <div className="sect-log-head">
              <Tag color="default">{row.logType}</Tag>
              <span className="sect-log-time">{formatTime(row.createdAt)}</span>
            </div>
            <div className="sect-log-content">{row.content || '（无内容）'}</div>
            <div className="sect-log-meta">
              {row.operatorName ? <span>操作人：{row.operatorName}</span> : null}
              {row.targetName ? <span>目标：{row.targetName}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

const LogsPanel: React.FC<LogsPanelProps> = ({ loading, logs, onRefresh, embedded = false }) => {
  const refreshButton = (
    <Button
      onClick={onRefresh}
      loading={loading}
      icon={<ReloadOutlined />}
      aria-label="刷新日志"
      title="刷新日志"
    />
  );

  if (embedded) {
    return (
      <div className="sect-overview-log-section">
        <div className="sect-overview-log-top">
          <div className="sect-overview-log-title-wrap">
            <div className="sect-title">宗门日志</div>
            <div className="sect-subtitle">记录宗门管理与成员行为，便于追踪关键事件。</div>
          </div>
          <div className="sect-pane-actions">{refreshButton}</div>
        </div>
        <LogsList loading={loading} logs={logs} />
      </div>
    );
  }

  return (
    <div className="sect-pane">
      <div className="sect-pane-top">
        <div className="sect-pane-title-wrap">
          <div className="sect-title">宗门日志</div>
          <div className="sect-subtitle">记录宗门管理与成员行为，便于追踪关键事件。</div>
        </div>
        <div className="sect-pane-actions">{refreshButton}</div>
      </div>

      <div className="sect-pane-body sect-panel-scroll">
        <LogsList loading={loading} logs={logs} />
      </div>
    </div>
  );
};

export default LogsPanel;
