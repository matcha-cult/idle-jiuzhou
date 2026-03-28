/**
 * 易名符改名弹窗
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：承载“消耗易名符后输入新名称”的唯一表单 UI，并按需承接头像上传与伙伴实例描述编辑，供角色改名与伙伴改名共同复用。
 * 2. 做什么：复用统一名字规则，并在打开时自动带入当前名字、头像与可选描述，减少多个入口重复拼表单与上传交互。
 * 3. 不做什么：不直接发请求、不刷新背包，也不决定改名成功后的业务副作用。
 *
 * 输入/输出：
 * - 输入：弹窗开关、标题文案、字段文案、初始名字、可选头像配置、可选描述配置、提交中状态，以及取消/提交回调。
 * - 输出：标准 Ant Design Modal + Form；启用头像配置时额外输出头像预览与上传入口。
 *
 * 数据流/状态流：
 * 外层 flow 提供当前易名符上下文与当前展示名 -> 本组件维护表单输入 -> 提交时把裁剪后的新名称回传给上层。
 *
 * 关键边界条件与坑点：
 * 1. 弹窗每次打开都要重置成最新角色名和头像，否则连续编辑不同对象时会残留上一次输入。
 * 2. 头像上传只负责把图片放进统一存储，不代表业务对象已写库；真正提交仍由外层 flow 决定。
 * 3. 描述字段仅在伙伴场景显式开启，角色改名不能因为共享弹窗扩展而多出无关输入项。
 */
import { UserOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';

import {
  buildNameFormRules,
  NAME_MAX_LENGTH,
  normalizeCharacterNameInput,
} from './characterNameShared';
import { useAvatarUploadFlow, type AvatarUploadRequest } from './avatarUploadFlow';
import {
  normalizePartnerDescriptionInput,
  PARTNER_DESCRIPTION_MAX_LENGTH,
} from './partnerDescriptionShared';
import './CharacterRenameModal.scss';

export interface CharacterRenameSubmitPayload {
  name: string;
  avatar?: string | null;
  description?: string | null;
}

export interface CharacterRenameAvatarConfig {
  initialAvatar: string | null;
  label?: string;
  avatarAlt: string;
  uploadRequest: AvatarUploadRequest;
  resolvePreviewUrl: (avatar: string | null) => string;
  helperText?: string;
}

export interface CharacterRenameDescriptionFieldConfig {
  label: string;
  placeholder: string;
  initialValue: string | null;
  maxLength?: number;
}

interface RenameAvatarFieldProps {
  avatar: string | null;
  avatarConfig: CharacterRenameAvatarConfig;
  disabled: boolean;
  onAvatarChange: (avatar: string) => void;
}

const RenameAvatarField: React.FC<RenameAvatarFieldProps> = ({
  avatar,
  avatarConfig,
  disabled,
  onAvatarChange,
}) => {
  const { uploading, customRequest } = useAvatarUploadFlow({
    uploadRequest: avatarConfig.uploadRequest,
    successMessage: '头像上传成功',
    onUploaded: (avatarUrl) => {
      onAvatarChange(avatarUrl);
    },
  });

  return (
    <div className="character-rename-avatar-section">
      <div className="character-rename-avatar-label">{avatarConfig.label ?? '头像'}</div>
      <Upload
        accept="image/*"
        showUploadList={false}
        customRequest={customRequest}
        disabled={disabled || uploading}
        className="character-rename-avatar-upload"
      >
        <button
          type="button"
          className="character-rename-avatar-trigger"
          disabled={disabled || uploading}
        >
          {avatar ? (
            <img
              className="character-rename-avatar-image"
              src={avatarConfig.resolvePreviewUrl(avatar)}
              alt={avatarConfig.avatarAlt}
            />
          ) : (
            <span className="character-rename-avatar-placeholder" aria-hidden="true">
              <UserOutlined />
            </span>
          )}
          <span className="character-rename-avatar-copy">
            <span className="character-rename-avatar-title">
              {uploading ? '上传中...' : '点击上传头像'}
            </span>
            <span className="character-rename-avatar-tip">
              {avatarConfig.helperText ?? '支持 JPG、PNG、GIF、WEBP，大小不超过 2MB'}
            </span>
          </span>
        </button>
      </Upload>
    </div>
  );
};

interface CharacterRenameModalProps {
  open: boolean;
  title: string;
  itemName: string;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  submitText: string;
  initialName: string;
  avatarConfig?: CharacterRenameAvatarConfig;
  descriptionFieldConfig?: CharacterRenameDescriptionFieldConfig;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: CharacterRenameSubmitPayload) => Promise<void>;
}

interface CharacterRenameFormValues {
  name: string;
  description?: string;
}

const CharacterRenameModal: React.FC<CharacterRenameModalProps> = ({
  open,
  title,
  itemName,
  description,
  inputLabel,
  inputPlaceholder,
  submitText,
  initialName,
  avatarConfig,
  descriptionFieldConfig,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<CharacterRenameFormValues>();
  const [avatar, setAvatar] = useState<string | null>(avatarConfig?.initialAvatar ?? null);

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue({
      name: initialName,
      description: descriptionFieldConfig?.initialValue ?? '',
    });
    setAvatar(avatarConfig?.initialAvatar ?? null);
  }, [avatarConfig?.initialAvatar, descriptionFieldConfig?.initialValue, form, initialName, open]);

  const handleFinish = async (values: CharacterRenameFormValues): Promise<void> => {
    const normalizedDescription = descriptionFieldConfig
      ? normalizePartnerDescriptionInput(values.description)
      : undefined;
    const normalizedInitialDescription = descriptionFieldConfig
      ? normalizePartnerDescriptionInput(descriptionFieldConfig.initialValue)
      : undefined;
    await onSubmit({
      name: normalizeCharacterNameInput(values.name),
      avatar: avatarConfig && avatar !== avatarConfig.initialAvatar ? avatar : undefined,
      description: descriptionFieldConfig
        ? normalizedDescription !== normalizedInitialDescription
          ? normalizedDescription
          : undefined
        : undefined,
    });
  };

  return (
    <Modal
      open={open}
      title={title}
      onCancel={submitting ? undefined : onCancel}
      footer={null}
      destroyOnHidden
      centered
      width="min(420px, calc(100vw - 24px))"
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          void handleFinish(values);
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {description || `消耗 1 张【${itemName}】后，立即将名称改为新的内容。`}
        </Typography.Paragraph>
        {avatarConfig ? (
          <RenameAvatarField
            avatar={avatar}
            avatarConfig={avatarConfig}
            disabled={submitting}
            onAvatarChange={setAvatar}
          />
        ) : null}
        <Form.Item
          name="name"
          label={inputLabel}
          rules={buildNameFormRules({
            requiredMessage: `请输入${inputLabel}`,
            fieldLabel: inputLabel,
          })}
        >
          <Input
            placeholder={inputPlaceholder}
            autoComplete="off"
            maxLength={NAME_MAX_LENGTH}
          />
        </Form.Item>
        {descriptionFieldConfig ? (
          <Form.Item
            name="description"
            label={descriptionFieldConfig.label}
          >
            <Input.TextArea
              placeholder={descriptionFieldConfig.placeholder}
              autoSize={{ minRows: 2, maxRows: 4 }}
              maxLength={descriptionFieldConfig.maxLength ?? PARTNER_DESCRIPTION_MAX_LENGTH}
            />
          </Form.Item>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={onCancel} disabled={submitting}>
            取消
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting}>
            {submitText}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default CharacterRenameModal;
