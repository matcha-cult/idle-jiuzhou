/**
 * 成员管理弹窗。
 * 输入：目标成员、当前玩家权限、任命/踢出/转让回调。
 * 输出：可执行的成员管理操作。
 * 边界：
 * 1) 宗主不可被踢出。
 * 2) 宗主转让只能转给他人。
 * 3) 权限不足时按钮禁用并给出明确文案。
 */
import { Button, Modal, Select, Tag } from 'antd';
import { APPOINTABLE_POSITION_OPTIONS } from '../../constants';
import type { MemberActionDraft, SectMemberVm, SectPermissionState } from '../../types';

interface MemberActionDialogProps {
  open: boolean;
  draft: MemberActionDraft;
  myMember: SectMemberVm | null;
  permissions: SectPermissionState;
  actionLoadingKey: string | null;
  onClose: () => void;
  onDraftChange: (next: MemberActionDraft) => void;
  onAppoint: (targetId: number, position: MemberActionDraft['appointPosition']) => void;
  onKick: (targetId: number) => void;
  onTransferLeader: (targetId: number) => void;
}

const MemberActionDialog: React.FC<MemberActionDialogProps> = ({
  open,
  draft,
  myMember,
  permissions,
  actionLoadingKey,
  onClose,
  onDraftChange,
  onAppoint,
  onKick,
  onTransferLeader,
}) => {
  const target = draft.target;
  const myCharacterId = myMember?.characterId ?? 0;
  const isSelf = !!target && target.characterId === myCharacterId;

  const canAppoint = Boolean(target && permissions.canAppointPosition && target.position !== 'leader');
  const canKick = Boolean(target && permissions.canKickMember && target.position !== 'leader' && !isSelf);
  const canTransferLeader = Boolean(target && permissions.canTransferLeader && target.position !== 'leader' && !isSelf);

  return (
    <Modal open={open} onCancel={onClose} footer={null} centered width={560} title="成员管理" className="sect-submodal" destroyOnHidden>
      {!target ? <div className="sect-empty">未选择成员</div> : null}

      {target ? (
        <div className="sect-member-action">
          <div className="sect-member-action-head">
            <div className="sect-member-action-name">{target.nickname}</div>
            <div className="sect-member-action-tags">
              <Tag color={target.position === 'leader' ? 'gold' : 'blue'}>{target.positionLabel}</Tag>
              <Tag color="cyan">{target.realm}</Tag>
            </div>
          </div>

          <div className="sect-member-action-grid">
            <div className="sect-member-action-kv">
              <span>累计贡献</span>
              <strong>{target.contribution.toLocaleString()}</strong>
            </div>
            <div className="sect-member-action-kv">
              <span>周贡献</span>
              <strong>{target.weeklyContribution.toLocaleString()}</strong>
            </div>
          </div>

          <div className="sect-form-field">
            <div className="sect-form-label">任命职位</div>
            <Select
              value={draft.appointPosition}
              options={APPOINTABLE_POSITION_OPTIONS}
              onChange={(value: MemberActionDraft['appointPosition']) => onDraftChange({ ...draft, appointPosition: value })}
            />
          </div>

          <div className="sect-member-action-buttons">
            <Button
              type="primary"
              disabled={!canAppoint}
              loading={actionLoadingKey === `appoint-${target.characterId}`}
              onClick={() => {
                if (!canAppoint) return;
                void onAppoint(target.characterId, draft.appointPosition);
              }}
            >
              {canAppoint ? '确认任命' : '无任命权限'}
            </Button>

            <Button
              danger
              disabled={!canKick}
              loading={actionLoadingKey === `kick-${target.characterId}`}
              onClick={() => {
                if (!canKick) return;
                void onKick(target.characterId);
              }}
            >
              {canKick ? '踢出成员' : '不可踢出'}
            </Button>

            <Button
              disabled={!canTransferLeader}
              loading={actionLoadingKey === `transfer-${target.characterId}`}
              onClick={() => {
                if (!canTransferLeader) return;
                void onTransferLeader(target.characterId);
              }}
            >
              {canTransferLeader ? '转让宗主' : '不可转让'}
            </Button>
          </div>

          <div className="sect-tips">请谨慎执行成员管理操作，任命与转让会立即生效。</div>
        </div>
      ) : null}
    </Modal>
  );
};

export default MemberActionDialog;
