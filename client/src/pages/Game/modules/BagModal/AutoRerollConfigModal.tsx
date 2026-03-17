/**
 * 自动洗炼配置弹窗
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：将自动洗炼的目标词条选择、匹配模式切换、最大次数配置集中到一个独立弹窗中，
 *   让洗炼主面板不再被自动洗炼配置区域占用空间。
 * - 做什么：桌面端和移动端共用同一个弹窗组件，避免两端各写一套配置 UI。
 * - 不做什么：不持有自动洗炼的状态（状态由 useAutoRerollController 管理），只通过 props 读写。
 *
 * 输入/输出（props）：
 * - open / onClose：弹窗开关
 * - targetKeys / onTargetKeysChange：已选目标词条 key 列表
 * - matchMode / onMatchModeChange：匹配模式（any / all）
 * - maxAttempts / onMaxAttemptsChange：最大尝试次数
 * - options：可选目标词条列表（来自词条池 + 当前词条合并去重）
 * - disabled / loading / submitting：控制交互状态
 * - poolReady / poolErrorMessage：词条池就绪状态与错误提示
 * - onStart：点击"开启自动洗炼"的回调
 *
 * 数据流/状态流：
 * - useAutoRerollController 持有全部状态 -> 本组件通过 props 读取并回写 -> 点击开始后由 controller 执行循环。
 *
 * 关键边界条件与坑点：
 * 1) 弹窗打开时词条池可能仍在加载，此时目标选择器需要显示 loading 态并禁用交互。
 * 2) 匹配模式切换不应清空已选目标，用户可能先选好词条再决定匹配策略。
 */
import { useState, useMemo } from 'react';
import { Modal, Button, InputNumber, Input, Radio } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { AutoRerollMatchMode } from './autoReroll';

export interface AutoRerollConfigModalProps {
    open: boolean;
    onClose: () => void;
    targetKeys: string[];
    onTargetKeysChange: (keys: string[]) => void;
    matchMode: AutoRerollMatchMode;
    onMatchModeChange: (mode: AutoRerollMatchMode) => void;
    maxAttempts: number;
    onMaxAttemptsChange: (value: number) => void;
    options: Array<{ key: string; label: string }>;
    disabled: boolean;
    loading: boolean;
    submitting: boolean;
    poolReady: boolean;
    poolErrorMessage: string;
    onStart: () => void;
}

const MATCH_MODE_LABELS: Record<AutoRerollMatchMode, string> = {
    any: '任意命中',
    all: '全部命中',
};

const MATCH_MODE_DESCRIPTIONS: Record<AutoRerollMatchMode, string> = {
    any: '命中任意一条目标词条即停止',
    all: '命中全部目标词条才停止',
};

export const AutoRerollConfigModal: React.FC<AutoRerollConfigModalProps> = ({
    open,
    onClose,
    targetKeys,
    onTargetKeysChange,
    matchMode,
    onMatchModeChange,
    maxAttempts,
    onMaxAttemptsChange,
    options,
    disabled,
    loading,
    submitting,
    poolReady,
    poolErrorMessage,
    onStart,
}) => {
    const [search, setSearch] = useState('');

    const filteredOptions = useMemo(() => {
        const kw = search.trim().toLowerCase();
        if (!kw) return options;
        return options.filter((opt) => opt.label.toLowerCase().includes(kw));
    }, [options, search]);

    const selectedSet = useMemo(() => new Set(targetKeys), [targetKeys]);

    const handleToggle = (key: string) => {
        if (selectedSet.has(key)) {
            onTargetKeysChange(targetKeys.filter((k) => k !== key));
        } else {
            onTargetKeysChange([...targetKeys, key]);
        }
    };

    const handleClose = () => {
        setSearch('');
        onClose();
    };

    const handleStart = () => {
        onStart();
    };

    const interactionDisabled = disabled || submitting || !poolReady;

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            footer={null}
            centered
            destroyOnHidden
            width={520}
            title="自动洗炼配置"
            className="bag-auto-reroll-modal"
            maskClosable={!submitting}
        >
            <div className="bag-auto-reroll-shell">
                {/* 匹配模式 */}
                <div className="bag-auto-reroll-panel">
                    <div className="bag-auto-reroll-panel-head">
                        <div>
                            <div className="bag-auto-reroll-panel-title">匹配模式</div>
                            <div className="bag-auto-reroll-panel-status">
                                {MATCH_MODE_DESCRIPTIONS[matchMode]}
                            </div>
                        </div>
                    </div>
                    <Radio.Group
                        value={matchMode}
                        onChange={(e) => onMatchModeChange(e.target.value as AutoRerollMatchMode)}
                        disabled={interactionDisabled}
                        optionType="button"
                        buttonStyle="solid"
                        size="middle"
                    >
                        <Radio.Button value="any">{MATCH_MODE_LABELS.any}</Radio.Button>
                        <Radio.Button value="all">{MATCH_MODE_LABELS.all}</Radio.Button>
                    </Radio.Group>
                </div>

                {/* 目标词条选择 */}
                <div className="bag-auto-reroll-panel">
                    <div className="bag-auto-reroll-panel-head">
                        <div>
                            <div className="bag-auto-reroll-panel-title">目标词条</div>
                            <div className={`bag-auto-reroll-panel-status${loading ? ' is-loading' : poolReady ? ' is-ready' : ''}`}>
                                {loading
                                    ? '词条池加载中...'
                                    : poolReady
                                        ? `已选 ${targetKeys.length} / ${options.length} 条`
                                        : poolErrorMessage || '词条池未就绪'}
                            </div>
                        </div>
                        {targetKeys.length > 0 && (
                            <Button
                                size="small"
                                onClick={() => onTargetKeysChange([])}
                                disabled={interactionDisabled}
                            >
                                清空
                            </Button>
                        )}
                    </div>

                    <Input
                        placeholder="搜索词条..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        prefix={<SearchOutlined style={{ color: 'var(--text-secondary, #999)' }} />}
                        allowClear
                        disabled={interactionDisabled}
                    />

                    <div className="bag-auto-reroll-target-list">
                        {filteredOptions.length === 0 ? (
                            <div className="bag-auto-reroll-target-empty">
                                {loading ? '加载中...' : options.length === 0 ? '暂无可选词条' : '未找到匹配的词条'}
                            </div>
                        ) : (
                            filteredOptions.map((opt) => {
                                const selected = selectedSet.has(opt.key);
                                return (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        className={`bag-auto-reroll-target-chip${selected ? ' is-selected' : ''}`}
                                        onClick={() => handleToggle(opt.key)}
                                        disabled={interactionDisabled}
                                    >
                                        <span className="bag-auto-reroll-target-chip-indicator" />
                                        <span className="bag-auto-reroll-target-chip-label">{opt.label}</span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 最大次数 + 操作 */}
                <div className="bag-auto-reroll-panel">
                    <div className="bag-auto-reroll-form-row">
                        <div className="bag-auto-reroll-field">
                            <div className="bag-auto-reroll-field-label">最大次数</div>
                            <InputNumber
                                className="bag-auto-reroll-attempt-input"
                                min={1}
                                max={2000}
                                value={maxAttempts}
                                onChange={(value) => {
                                    if (typeof value !== 'number') return;
                                    onMaxAttemptsChange(Math.max(1, Math.min(2000, Math.floor(value))));
                                }}
                                disabled={interactionDisabled}
                            />
                        </div>
                        <div className="bag-auto-reroll-field" style={{ justifyContent: 'flex-end' }}>
                            <Button
                                type="primary"
                                size="large"
                                block
                                onClick={handleStart}
                                loading={submitting}
                                disabled={disabled || !poolReady || targetKeys.length <= 0}
                            >
                                {submitting ? '自动洗炼中...' : '开启自动洗炼'}
                            </Button>
                        </div>
                    </div>
                </div>

                {!poolReady && poolErrorMessage ? (
                    <div className="bag-auto-reroll-tip is-warning">{poolErrorMessage}</div>
                ) : null}
            </div>
        </Modal>
    );
};
