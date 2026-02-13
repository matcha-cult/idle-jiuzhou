import { App, Button, Input, Menu, Modal, Select, Space, Switch, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { getCharacterInfo, updateCharacterAutoDisassemble, type AutoDisassembleRulesDto } from '../../../../services/api';
import { emitThemeModeChange, getStoredThemeMode, persistThemeMode, type ThemeMode } from '../../../../constants/theme';
import { useIsMobile } from '../../shared/responsive';
import './index.scss';

type SettingKey = 'base' | 'battle' | 'disassemble' | 'cdk';

interface SettingModalProps {
  open: boolean;
  onClose: () => void;
}

const CDK_STORAGE_KEY = 'cdk_redeemed_v1';

const loadRedeemedCdks = () => {
  const raw = localStorage.getItem(CDK_STORAGE_KEY);
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((x) => typeof x === 'string'));
  } catch {
    return new Set<string>();
  }
};

const saveRedeemedCdks = (set: Set<string>) => {
  localStorage.setItem(CDK_STORAGE_KEY, JSON.stringify(Array.from(set)));
};

const clampQualityRank = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isInteger(n)) return 1;
  return Math.max(1, Math.min(4, n));
};

/**
 * 子类选项（中文显示，值保持服务端约定的英文编码）。
 * 说明：
 * - label 仅用于界面展示，避免玩家看到英文内部码。
 * - value 会原样提交到服务端 rules.subCategories / rules.excludedSubCategories。
 */
const AUTO_DISASSEMBLE_SUB_CATEGORY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '配饰', value: 'accessory' },
  { label: '护甲', value: 'armor' },
  { label: '战令道具', value: 'battle_pass' },
  { label: '骨材', value: 'bone' },
  { label: '宝箱', value: 'box' },
  { label: '突破道具', value: 'breakthrough' },
  { label: '采集物', value: 'collect' },
  { label: '蛋类', value: 'egg' },
  { label: '强化道具', value: 'enhance' },
  { label: '精华', value: 'essence' },
  { label: '锻造材料', value: 'forge' },
  { label: '功能道具', value: 'function' },
  { label: '宝石', value: 'gem' },
  { label: '灵草', value: 'herb' },
  { label: '钥匙', value: 'key' },
  { label: '皮革', value: 'leather' },
  { label: '月卡道具', value: 'month_card' },
  { label: '杂项道具', value: 'object' },
  { label: '矿石', value: 'ore' },
  { label: '丹药', value: 'pill' },
  { label: '遗物', value: 'relic' },
  { label: '卷轴', value: 'scroll' },
  { label: '功法', value: 'technique' },
  { label: '功法书', value: 'technique_book' },
  { label: '代币', value: 'token' },
  { label: '木材', value: 'wood' },
];

const AUTO_DISASSEMBLE_SUB_CATEGORY_VALUE_SET = new Set(
  AUTO_DISASSEMBLE_SUB_CATEGORY_OPTIONS.map((option) => option.value)
);

const normalizeStringList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    const value = String(row ?? '').trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const normalizeSubCategoryList = (raw: unknown): string[] => {
  return normalizeStringList(raw).filter((value) => AUTO_DISASSEMBLE_SUB_CATEGORY_VALUE_SET.has(value));
};

const parseCommaList = (raw: string, toLower: boolean = false): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(',')) {
    const value = toLower ? token.trim().toLowerCase() : token.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const stringifyList = (raw: unknown): string => {
  if (!Array.isArray(raw)) return '';
  return raw
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length > 0)
    .join(', ');
};

const SettingModal: React.FC<SettingModalProps> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [activeKey, setActiveKey] = useState<SettingKey>('base');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode());
  const [autoBattle, setAutoBattle] = useState(false);
  const [fastBattle, setFastBattle] = useState(false);
  const [autoDisassembleEnabled, setAutoDisassembleEnabled] = useState(false);
  const [autoDisassembleMaxQualityRank, setAutoDisassembleMaxQualityRank] = useState(1);
  const [autoDisassembleCategories, setAutoDisassembleCategories] = useState<string[]>(['equipment']);
  const [autoDisassembleSubCategories, setAutoDisassembleSubCategories] = useState<string[]>([]);
  const [autoDisassembleExcludedSubCategories, setAutoDisassembleExcludedSubCategories] = useState<string[]>([]);
  const [autoDisassembleIncludeNameKeywordsText, setAutoDisassembleIncludeNameKeywordsText] = useState('');
  const [autoDisassembleExcludeNameKeywordsText, setAutoDisassembleExcludeNameKeywordsText] = useState('');
  const [autoDisassembleSaving, setAutoDisassembleSaving] = useState(false);
  const [autoDisassembleLoading, setAutoDisassembleLoading] = useState(false);
  const [cdk, setCdk] = useState('');
  const isMobile = useIsMobile();
  const autoDisassembleCategoryOptions = useMemo(
    () => [
      { label: '装备', value: 'equipment' },
      { label: '消耗品', value: 'consumable' },
      { label: '材料', value: 'material' },
      { label: '功法书', value: 'skillbook' },
      { label: '功法', value: 'skill' },
      { label: '任务道具', value: 'quest' },
      { label: '其他', value: 'other' },
    ],
    []
  );

  const menuItems = useMemo(
    () => [
      { key: 'base', label: '基础设置' },
      { key: 'battle', label: '战斗设置' },
      { key: 'disassemble', label: '自动分解' },
      { key: 'cdk', label: 'CDK兑换' },
    ],
    []
  );

  const redeemCdk = () => {
    const code = cdk.trim();
    if (!code) {
      message.warning('请输入CDK');
      return;
    }
    const redeemed = loadRedeemedCdks();
    if (redeemed.has(code)) {
      message.info('该CDK已兑换过');
      return;
    }
    redeemed.add(code);
    saveRedeemedCdks(redeemed);
    setCdk('');
    message.success('兑换成功');
  };

  const toggleDarkTheme = (enabled: boolean) => {
    const nextMode: ThemeMode = enabled ? 'dark' : 'light';
    setThemeMode(nextMode);
    persistThemeMode(nextMode);
    emitThemeModeChange(nextMode);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAutoDisassembleLoading(true);
    void (async () => {
      try {
        const res = await getCharacterInfo();
        if (!res.success || !res.data?.character || cancelled) return;
        const character = res.data.character;
        setAutoDisassembleEnabled(Boolean(character.auto_disassemble_enabled));
        setAutoDisassembleMaxQualityRank(clampQualityRank(character.auto_disassemble_max_quality_rank));
        const rules = character.auto_disassemble_rules;
        const categoriesRaw = Array.isArray(rules?.categories) ? rules.categories : ['equipment'];
        const normalizedCategories = categoriesRaw
          .map((v) => String(v ?? '').trim().toLowerCase())
          .filter((v, idx, arr) => v.length > 0 && arr.indexOf(v) === idx);
        setAutoDisassembleCategories(normalizedCategories.length > 0 ? normalizedCategories : ['equipment']);
        setAutoDisassembleSubCategories(normalizeSubCategoryList(rules?.subCategories));
        setAutoDisassembleExcludedSubCategories(normalizeSubCategoryList(rules?.excludedSubCategories));
        setAutoDisassembleIncludeNameKeywordsText(stringifyList(rules?.includeNameKeywords));
        setAutoDisassembleExcludeNameKeywordsText(stringifyList(rules?.excludeNameKeywords));
      } catch {
      } finally {
        if (!cancelled) {
          setAutoDisassembleLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const buildAutoDisassembleRulesPayload = (overrides?: {
    categories?: string[];
    subCategories?: string[];
    excludedSubCategories?: string[];
    includeNameKeywordsText?: string;
    excludeNameKeywordsText?: string;
  }): AutoDisassembleRulesDto => {
    const categories = (overrides?.categories ?? autoDisassembleCategories)
      .map((v) => String(v ?? '').trim().toLowerCase())
      .filter((v, idx, arr) => v.length > 0 && arr.indexOf(v) === idx);
    const subCategories = normalizeSubCategoryList(overrides?.subCategories ?? autoDisassembleSubCategories);
    const excludedSubCategories = normalizeSubCategoryList(
      overrides?.excludedSubCategories ?? autoDisassembleExcludedSubCategories
    );
    const includeNameKeywords = parseCommaList(
      overrides?.includeNameKeywordsText ?? autoDisassembleIncludeNameKeywordsText,
      true
    );
    const excludeNameKeywords = parseCommaList(
      overrides?.excludeNameKeywordsText ?? autoDisassembleExcludeNameKeywordsText,
      true
    );
    return {
      ...(categories.length > 0 ? { categories } : {}),
      ...(subCategories.length > 0 ? { subCategories } : {}),
      ...(excludedSubCategories.length > 0 ? { excludedSubCategories } : {}),
      ...(includeNameKeywords.length > 0 ? { includeNameKeywords } : {}),
      ...(excludeNameKeywords.length > 0 ? { excludeNameKeywords } : {}),
    };
  };

  const saveAutoDisassemble = async (
    nextEnabled: boolean,
    nextMaxQualityRank: number,
    nextRules: AutoDisassembleRulesDto,
    rollback: () => void,
  ) => {
    setAutoDisassembleSaving(true);
    try {
      const res = await updateCharacterAutoDisassemble(nextEnabled, nextMaxQualityRank, nextRules);
      if (!res.success) throw new Error(res.message || '设置保存失败');
      message.success('自动分解设置已保存');
    } catch (error) {
      rollback();
      const e = error as { message?: string };
      message.error(e.message || '设置保存失败');
    } finally {
      setAutoDisassembleSaving(false);
    }
  };

  const handleAutoDisassembleEnabledChange = (next: boolean) => {
    if (autoDisassembleLoading || autoDisassembleSaving) return;
    const prevEnabled = autoDisassembleEnabled;
    setAutoDisassembleEnabled(next);
    void saveAutoDisassemble(next, autoDisassembleMaxQualityRank, buildAutoDisassembleRulesPayload(), () =>
      setAutoDisassembleEnabled(prevEnabled)
    );
  };

  const handleAutoDisassembleQualityChange = (next: number) => {
    if (autoDisassembleLoading || autoDisassembleSaving) return;
    const clamped = clampQualityRank(next);
    const prevRank = autoDisassembleMaxQualityRank;
    setAutoDisassembleMaxQualityRank(clamped);
    void saveAutoDisassemble(autoDisassembleEnabled, clamped, buildAutoDisassembleRulesPayload(), () =>
      setAutoDisassembleMaxQualityRank(prevRank)
    );
  };

  const handleSaveAdvancedRules = () => {
    if (autoDisassembleLoading || autoDisassembleSaving) return;
    const rules = buildAutoDisassembleRulesPayload();
    void saveAutoDisassemble(autoDisassembleEnabled, autoDisassembleMaxQualityRank, rules, () => undefined);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width="min(860px, calc(100vw - 16px))"
      className="setting-modal"
      destroyOnHidden
    >
      <div className={`setting-modal-body ${isMobile ? 'is-mobile' : ''}`}>
        <aside className="setting-left">
          <Typography.Title level={5} className="setting-left-title">
            设置
          </Typography.Title>
          <Menu
            mode={isMobile ? 'horizontal' : 'inline'}
            items={menuItems}
            selectedKeys={[activeKey]}
            onClick={(e) => setActiveKey(e.key as SettingKey)}
          />
        </aside>

        <section className="setting-right">
          {activeKey === 'base' ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                基础设置
              </Typography.Title>
              <div className="setting-row">
                <Typography.Text>暗黑主题</Typography.Text>
                <Switch checked={themeMode === 'dark'} onChange={toggleDarkTheme} />
              </div>
            </Space>
          ) : null}

          {activeKey === 'battle' ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                战斗设置
              </Typography.Title>
              <div className="setting-row">
                <Typography.Text>自动战斗</Typography.Text>
                <Switch checked={autoBattle} onChange={setAutoBattle} />
              </div>
              <div className="setting-row">
                <Typography.Text>快速战斗</Typography.Text>
                <Switch checked={fastBattle} onChange={setFastBattle} />
              </div>
            </Space>
          ) : null}

          {activeKey === 'disassemble' ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                自动分解
              </Typography.Title>
              <div className="setting-row">
                <Typography.Text>自动分解物品</Typography.Text>
                <Switch
                  checked={autoDisassembleEnabled}
                  loading={autoDisassembleLoading || autoDisassembleSaving}
                  onChange={handleAutoDisassembleEnabledChange}
                />
              </div>
              <div className="setting-row">
                <Typography.Text>自动分解最高品质</Typography.Text>
                <Select
                  style={{ minWidth: 180 }}
                  value={autoDisassembleMaxQualityRank}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  options={[
                    { label: '黄品', value: 1 },
                    { label: '玄品', value: 2 },
                    { label: '地品', value: 3 },
                    { label: '天品', value: 4 },
                  ]}
                  onChange={handleAutoDisassembleQualityChange}
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>自动分解品类</Typography.Text>
                <Select
                  mode="multiple"
                  value={autoDisassembleCategories}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  options={autoDisassembleCategoryOptions}
                  onChange={(next) => setAutoDisassembleCategories((next as string[]).map((v) => String(v || '').toLowerCase()))}
                  style={{ width: '100%' }}
                  placeholder="未选择时默认仅装备"
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>包含子类</Typography.Text>
                <Select
                  mode="multiple"
                  value={autoDisassembleSubCategories}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  options={AUTO_DISASSEMBLE_SUB_CATEGORY_OPTIONS}
                  onChange={(next) => setAutoDisassembleSubCategories((next as string[]).map((v) => String(v || '').toLowerCase()))}
                  style={{ width: '100%' }}
                  placeholder="请选择需要包含的子类"
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>排除子类</Typography.Text>
                <Select
                  mode="multiple"
                  value={autoDisassembleExcludedSubCategories}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  options={AUTO_DISASSEMBLE_SUB_CATEGORY_OPTIONS}
                  onChange={(next) =>
                    setAutoDisassembleExcludedSubCategories((next as string[]).map((v) => String(v || '').toLowerCase()))
                  }
                  style={{ width: '100%' }}
                  placeholder="请选择需要排除的子类"
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>包含名称关键词（逗号分隔）</Typography.Text>
                <Input
                  value={autoDisassembleIncludeNameKeywordsText}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  onChange={(e) => setAutoDisassembleIncludeNameKeywordsText(e.target.value)}
                  placeholder="如：丹, 剑, 残页"
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>排除名称关键词（逗号分隔）</Typography.Text>
                <Input
                  value={autoDisassembleExcludeNameKeywordsText}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  onChange={(e) => setAutoDisassembleExcludeNameKeywordsText(e.target.value)}
                  placeholder="如：任务, 钥匙"
                />
              </div>
              <Button
                type="primary"
                loading={autoDisassembleSaving}
                disabled={autoDisassembleLoading || autoDisassembleSaving}
                onClick={handleSaveAdvancedRules}
                style={{ alignSelf: 'flex-end' }}
              >
                保存自动分解规则
              </Button>
            </Space>
          ) : null}

          {activeKey === 'cdk' ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                CDK兑换
              </Typography.Title>
              {isMobile ? (
                <Space direction="vertical" size={8} className="setting-cdk-mobile">
                  <Input value={cdk} onChange={(e) => setCdk(e.target.value)} placeholder="请输入CDK" />
                  <Button type="primary" onClick={redeemCdk} block>
                    兑换
                  </Button>
                </Space>
              ) : (
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={cdk} onChange={(e) => setCdk(e.target.value)} placeholder="请输入CDK" />
                  <Button type="primary" onClick={redeemCdk}>
                    兑换
                  </Button>
                </Space.Compact>
              )}
            </Space>
          ) : null}
        </section>
      </div>
    </Modal>
  );
};

export default SettingModal;
