/**
 * 宗门建筑面板。
 * 输入：建筑列表、升级权限、升级动作。
 * 输出：建筑效果、升级需求与升级按钮。
 * 约束：按钮禁用规则 = 必须有权限 + 可升级 + 资源足够。
 */
import { Button, Tag, Tooltip } from 'antd';
import {
  ArrowRightOutlined,
} from '@ant-design/icons';
import type { SectBuildingVm, SectPermissionState } from '../types';

interface BuildingsPanelProps {
  buildings: SectBuildingVm[];
  permissions: SectPermissionState;
  actionLoadingKey: string | null;
  onUpgrade: (buildingType: string) => void;
}

const BuildingsPanel: React.FC<BuildingsPanelProps> = ({ buildings, permissions, actionLoadingKey, onUpgrade }) => {
  return (
    <div className="sect-pane">
      <div className="sect-pane-top">
        <div className="sect-pane-title-wrap">
          <div className="sect-title">宗门建筑</div>
          <div className="sect-subtitle">建设宗门基业，提升建筑等级以解锁更多功能。</div>
        </div>
      </div>

      <div className="sect-pane-body sect-panel-scroll">
        <div className="sect-building-grid">
          {buildings.map((building) => {
            const canTriggerUpgrade = building.requirement.upgradable && permissions.canUpgradeBuilding && building.canAfford;
            const loadingKey = `upgrade-${building.buildingType}`;
            
            const upgradeLabel = !building.requirement.upgradable
              ? building.requirement.reason || '已达上限'
              : !permissions.canUpgradeBuilding
                ? '权限不足'
                : !building.canAfford
                  ? '资源不足'
                  : '提升等级';

            return (
              <div key={building.id} className={`sect-building-card${building.requirement.upgradable ? '' : ' is-maxed'}`}>
                {/* 建筑头部：基础信息 */}
                <div className="sect-building-header">
                  <div className="sect-building-info">
                    <div className="sect-building-name-row">
                      <div className="sect-building-name">{building.name}</div>
                      <Tag color={building.requirement.upgradable ? 'blue' : 'orange'} className="sect-building-tag">
                        {building.requirement.upgradable ? `Lv.${building.level}` : '已满级'}
                      </Tag>
                    </div>
                    <div className="sect-building-level-progress">
                      {building.requirement.upgradable && building.requirement.nextLevel ? (
                        <div className="sect-building-lv-next">
                          <span>Lv.{building.level}</span>
                          <ArrowRightOutlined className="lv-arrow" />
                          <span className="next-hl">Lv.{building.requirement.nextLevel}</span>
                        </div>
                      ) : (
                        <div className="sect-building-lv-max">
                          当前已达最高等级 Lv.{building.level}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 建筑描述与效果 */}
                <div className="sect-building-content">
                  <div className="sect-building-desc">{building.desc}</div>
                  <div className="sect-building-effect">
                    <div className="effect-row">
                      <div className="effect-side">
                        <span className="side-label">当前</span>
                        <span className="side-val">{building.effect}</span>
                      </div>
                      {building.nextEffect && (
                        <>
                          <ArrowRightOutlined className="side-arrow" />
                          <div className="effect-side next">
                            <span className="side-label">下级</span>
                            <span className="side-val">{building.nextEffect}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 升级需求区域 */}
                <div className="sect-building-footer">
                  {building.requirement.upgradable ? (
                    <div className="sect-building-upgrade-zone">
                      <div className="sect-building-costs">
                        <Tooltip title={building.fundsGap > 0 ? `还差 ${building.fundsGap.toLocaleString()} 宗门资金` : ''}>
                          <div className={`cost-item ${building.fundsGap > 0 ? 'is-lack' : ''}`}>
                            <span className="cost-label">宗门资金:</span>
                            <span className="cost-val">{(building.requirement.funds ?? 0).toLocaleString()}</span>
                          </div>
                        </Tooltip>
                        <Tooltip title={building.buildPointsGap > 0 ? `还差 ${building.buildPointsGap.toLocaleString()} 建设点` : ''}>
                          <div className={`cost-item ${building.buildPointsGap > 0 ? 'is-lack' : ''}`}>
                            <span className="cost-label">建设点:</span>
                            <span className="cost-val">{(building.requirement.buildPoints ?? 0).toLocaleString()}</span>
                          </div>
                        </Tooltip>
                      </div>
                      <Button
                        type="primary"
                        size="middle"
                        className="upgrade-btn"
                        disabled={!canTriggerUpgrade}
                        loading={actionLoadingKey === loadingKey}
                        onClick={() => onUpgrade(building.buildingType)}
                      >
                        {upgradeLabel}
                      </Button>
                    </div>
                  ) : (
                    <div className="sect-building-maxed-tip">
                      {building.requirement.reason || '此建筑已修至圆满'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BuildingsPanel;
