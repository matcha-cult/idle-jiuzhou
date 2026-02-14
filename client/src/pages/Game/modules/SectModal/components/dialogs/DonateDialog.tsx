/**
 * 宗门捐献弹窗。
 * 输入：当前灵石、捐献输入与预估收益。
 * 输出：捐献确认 UI。
 * 约束：仅接受非负整数；最小捐献 1 灵石。
 */
import { Input, Modal, Tag } from 'antd';

interface DonateDialogProps {
  open: boolean;
  spiritStones: number;
  donateSpiritStonesInput: string;
  donateSummary: { canSubmit: boolean; reason: string; added: number };
  actionLoadingKey: string | null;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onConfirm: () => void;
}

const DonateDialog: React.FC<DonateDialogProps> = ({
  open,
  spiritStones,
  donateSpiritStonesInput,
  donateSummary,
  actionLoadingKey,
  onClose,
  onInputChange,
  onConfirm,
}) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={560}
      title="宗门捐献"
      className="sect-submodal"
      destroyOnHidden
      okText="确认捐献"
      cancelText="取消"
      onOk={onConfirm}
      confirmLoading={actionLoadingKey === 'donate'}
      okButtonProps={{ disabled: !donateSummary.canSubmit }}
    >
      <div className="sect-donate">
        <div className="sect-donate-balance">
          <div className="sect-donate-balance-k">当前灵石</div>
          <div className="sect-donate-balance-v">{spiritStones.toLocaleString()}</div>
        </div>

        <div className="sect-form-field">
          <div className="sect-form-label">捐献灵石</div>
          <Input
            value={donateSpiritStonesInput}
            onChange={(event) => onInputChange(event.target.value)}
            inputMode="numeric"
            placeholder="请输入灵石数量"
            maxLength={12}
          />
          <div className="sect-form-helper">比例：1 灵石 = 10 贡献（同步增加宗门资金）</div>
        </div>

        <div className="sect-donate-preview">
          <div className="sect-donate-preview-k">预计获得</div>
          <div className="sect-donate-preview-v">
            贡献 +{donateSummary.added.toLocaleString()}，宗门资金 +{donateSummary.added.toLocaleString()}
          </div>
          {donateSummary.canSubmit ? <Tag color="green">可捐献</Tag> : <Tag color="red">{donateSummary.reason}</Tag>}
        </div>
      </div>
    </Modal>
  );
};

export default DonateDialog;
