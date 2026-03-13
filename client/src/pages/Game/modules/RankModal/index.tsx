import { Button, Modal, Segmented, Table, Tag } from 'antd';
import { useMemo, useState } from 'react';
import type {
  ArenaRankRowDto,
  RealmRankRowDto,
  SectRankRowDto,
  WealthRankRowDto,
} from '../../../../services/api';
import { IMG_COIN as coin01 } from '../../shared/imageAssets';
import PlayerName from '../../shared/PlayerName';
import { useIsMobile } from '../../shared/responsive';
import { RANK_TAB_KEYS, RANK_TAB_META, RANK_TAB_META_MAP, useRankRows, type RankTab } from './rankShared';
import './index.scss';

interface RankModalProps {
  open: boolean;
  onClose: () => void;
}

const RankModal: React.FC<RankModalProps> = ({ open, onClose }) => {
  const [tab, setTab] = useState<RankTab>('realm');
  const isMobile = useIsMobile();
  const { rankRowsByTab, loadingByTab } = useRankRows(open, tab);
  const loading = loadingByTab[tab];
  const realmRanks: RealmRankRowDto[] = rankRowsByTab.realm;
  const sectRanks: SectRankRowDto[] = rankRowsByTab.sect;
  const wealthRanks: WealthRankRowDto[] = rankRowsByTab.wealth;
  const arenaRanks: ArenaRankRowDto[] = rankRowsByTab.arena;

  const leftItems = useMemo(
    () => RANK_TAB_META.map((item) => ({ key: item.key, label: item.label })),
    [],
  );

  const mobileMenuOptions = useMemo(
    () => RANK_TAB_META.map((item) => ({ value: item.key, label: item.shortLabel })),
    [],
  );

  const renderPaneTop = (tabKey: RankTab) => (
    <div className="rank-pane-top">
      <div className="rank-top-row">
        <div className="rank-title">{RANK_TAB_META_MAP[tabKey].label}</div>
      </div>
      <div className="rank-subtitle">{RANK_TAB_META_MAP[tabKey].subtitle}</div>
    </div>
  );

  const renderRealmRank = () => (
    <div className="rank-pane">
      {renderPaneTop('realm')}
      <div className="rank-pane-body">
        {isMobile ? (
          <div className="rank-mobile-list">
            {loading ? <div className="rank-empty">加载中...</div> : null}
            {!loading
              ? realmRanks.map((row) => (
                  <div key={row.rank} className="rank-mobile-card">
                    <div className="rank-mobile-card-head">
                      <div className="rank-mobile-rank">#{row.rank}</div>
                      <PlayerName name={row.name} monthCardActive={row.monthCardActive} ellipsis className="rank-mobile-name" />
                      <Tag color="green">{row.realm}</Tag>
                    </div>
                    <div className="rank-mobile-meta">
                      <span className="rank-mobile-meta-item">
                        <span className="rank-mobile-meta-k">战力</span>
                        <span className="rank-mobile-meta-v">{row.power.toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                ))
              : null}
            {!loading && realmRanks.length === 0 ? <div className="rank-empty">暂无排行</div> : null}
          </div>
        ) : (
          <Table
            size="small"
            rowKey={(row) => String(row.rank)}
            pagination={false}
            loading={loading}
            columns={[
              { title: '名次', dataIndex: 'rank', key: 'rank', width: 80, render: (v: number) => `#${v}` },
              {
                title: '玩家',
                dataIndex: 'name',
                key: 'name',
                width: 180,
                render: (value: string, row: RealmRankRowDto) => (
                  <PlayerName name={value} monthCardActive={row.monthCardActive} ellipsis />
                ),
              },
              { title: '境界', dataIndex: 'realm', key: 'realm', width: 120, render: (v: string) => <Tag color="green">{v}</Tag> },
              { title: '战力', dataIndex: 'power', key: 'power', render: (v: number) => v.toLocaleString() },
            ]}
            dataSource={realmRanks}
          />
        )}
      </div>
    </div>
  );

  const renderSectRank = () => (
    <div className="rank-pane">
      {renderPaneTop('sect')}
      <div className="rank-pane-body">
        {isMobile ? (
          <div className="rank-mobile-list">
            {loading ? <div className="rank-empty">加载中...</div> : null}
            {!loading
              ? sectRanks.map((row) => (
                  <div key={row.rank} className="rank-mobile-card">
                    <div className="rank-mobile-card-head">
                      <div className="rank-mobile-rank">#{row.rank}</div>
                      <div className="rank-mobile-name">{row.name}</div>
                      <Tag color="blue">Lv.{row.level}</Tag>
                    </div>
                    <div className="rank-mobile-meta">
                      <span className="rank-mobile-meta-item">
                        <span className="rank-mobile-meta-k">宗主</span>
                        <PlayerName name={row.leader} monthCardActive={row.leaderMonthCardActive} ellipsis className="rank-mobile-meta-v" />
                      </span>
                      <span className="rank-mobile-meta-item">
                        <span className="rank-mobile-meta-k">成员</span>
                        <span className="rank-mobile-meta-v">{row.members}/{row.memberCap}</span>
                      </span>
                      <span className="rank-mobile-meta-item">
                        <span className="rank-mobile-meta-k">实力</span>
                        <span className="rank-mobile-meta-v">{row.power.toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                ))
              : null}
            {!loading && sectRanks.length === 0 ? <div className="rank-empty">暂无排行</div> : null}
          </div>
        ) : (
          <Table
            size="small"
            rowKey={(row) => String(row.rank)}
            pagination={false}
            loading={loading}
            columns={[
              { title: '名次', dataIndex: 'rank', key: 'rank', width: 80, render: (v: number) => `#${v}` },
              { title: '宗门', dataIndex: 'name', key: 'name', width: 180 },
              { title: '等级', dataIndex: 'level', key: 'level', width: 90, render: (v: number) => <Tag color="blue">Lv.{v}</Tag> },
              {
                title: '宗主',
                dataIndex: 'leader',
                key: 'leader',
                width: 140,
                render: (value: string, row: SectRankRowDto) => (
                  <PlayerName name={value} monthCardActive={row.leaderMonthCardActive} ellipsis />
                ),
              },
              { title: '成员', key: 'members', width: 120, render: (_value: number, row: SectRankRowDto) => `${row.members}/${row.memberCap}` },
              { title: '实力', dataIndex: 'power', key: 'power', render: (v: number) => v.toLocaleString() },
            ]}
            dataSource={sectRanks}
          />
        )}
      </div>
    </div>
  );

  const renderWealthRank = () => (
    <div className="rank-pane">
      {renderPaneTop('wealth')}
      <div className="rank-pane-body">
        {isMobile ? (
          <div className="rank-mobile-list">
            {loading ? <div className="rank-empty">加载中...</div> : null}
            {!loading
              ? wealthRanks.map((row) => (
                  <div key={row.rank} className="rank-mobile-card">
                    <div className="rank-mobile-card-head">
                      <div className="rank-mobile-rank">#{row.rank}</div>
                      <PlayerName name={row.name} monthCardActive={row.monthCardActive} ellipsis className="rank-mobile-name" />
                      <Tag color="green">{row.realm}</Tag>
                    </div>
                    <div className="rank-mobile-meta">
                      <span className="rank-mobile-meta-item">
                        <span className="rank-mobile-meta-k">灵石</span>
                        <span className="rank-mobile-meta-v rank-money">
                          <img className="rank-money-icon" src={coin01} alt="灵石" />
                          {row.spiritStones.toLocaleString()}
                        </span>
                      </span>
                      <span className="rank-mobile-meta-item">
                        <span className="rank-mobile-meta-k">银两</span>
                        <span className="rank-mobile-meta-v">{row.silver.toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                ))
              : null}
            {!loading && wealthRanks.length === 0 ? <div className="rank-empty">暂无排行</div> : null}
          </div>
        ) : (
          <Table
            size="small"
            rowKey={(row) => String(row.rank)}
            pagination={false}
            loading={loading}
            columns={[
              { title: '名次', dataIndex: 'rank', key: 'rank', width: 80, render: (v: number) => `#${v}` },
              {
                title: '玩家',
                dataIndex: 'name',
                key: 'name',
                width: 180,
                render: (value: string, row: WealthRankRowDto) => (
                  <PlayerName name={value} monthCardActive={row.monthCardActive} ellipsis />
                ),
              },
              { title: '境界', dataIndex: 'realm', key: 'realm', width: 120, render: (v: string) => <Tag color="green">{v}</Tag> },
              {
                title: '灵石',
                dataIndex: 'spiritStones',
                key: 'spiritStones',
                width: 160,
                render: (v: number) => (
                  <span className="rank-money">
                    <img className="rank-money-icon" src={coin01} alt="灵石" />
                    {v.toLocaleString()}
                  </span>
                ),
              },
              {
                title: '银两',
                dataIndex: 'silver',
                key: 'silver',
                render: (v: number) => v.toLocaleString(),
              },
            ]}
            dataSource={wealthRanks}
          />
        )}
      </div>
    </div>
  );

  const renderArenaRank = () => (
    <div className="rank-pane">
      {renderPaneTop('arena')}
      <div className="rank-pane-body">
        {isMobile ? (
          <div className="rank-mobile-list">
            {loading ? <div className="rank-empty">加载中...</div> : null}
            {!loading
              ? arenaRanks.map((row) => (
                  <div key={row.rank} className="rank-mobile-card">
                    <div className="rank-mobile-card-head">
                      <div className="rank-mobile-rank">#{row.rank}</div>
                      <PlayerName name={row.name} monthCardActive={row.monthCardActive} ellipsis className="rank-mobile-name" />
                      <Tag color="green">{row.realm}</Tag>
                    </div>
                    <div className="rank-mobile-meta">
                      <span className="rank-mobile-meta-item">
                        <span className="rank-mobile-meta-k">积分</span>
                        <span className="rank-mobile-meta-v">{row.score}</span>
                      </span>
                      <span className="rank-mobile-meta-item">
                        <span className="rank-mobile-meta-k">胜负</span>
                        <span className="rank-mobile-meta-v">{row.winCount}/{row.loseCount}</span>
                      </span>
                    </div>
                  </div>
                ))
              : null}
            {!loading && arenaRanks.length === 0 ? <div className="rank-empty">暂无排行</div> : null}
          </div>
        ) : (
          <Table
            size="small"
            rowKey={(row) => String(row.rank)}
            pagination={false}
            loading={loading}
            columns={[
              { title: '名次', dataIndex: 'rank', key: 'rank', width: 80, render: (v: number) => `#${v}` },
              {
                title: '玩家',
                dataIndex: 'name',
                key: 'name',
                width: 180,
                render: (value: string, row: ArenaRankRowDto) => (
                  <PlayerName name={value} monthCardActive={row.monthCardActive} ellipsis />
                ),
              },
              { title: '境界', dataIndex: 'realm', key: 'realm', width: 120, render: (v: string) => <Tag color="green">{v}</Tag> },
              { title: '积分', dataIndex: 'score', key: 'score', width: 120, render: (v: number) => v },
              {
                title: '胜负',
                key: 'wl',
                render: (_value: number, row: ArenaRankRowDto) => `${row.winCount}/${row.loseCount}`,
              },
            ]}
            dataSource={arenaRanks}
          />
        )}
      </div>
    </div>
  );

  const panelContent = () => {
    if (tab === 'realm') return renderRealmRank();
    if (tab === 'sect') return renderSectRank();
    if (tab === 'wealth') return renderWealthRank();
    return renderArenaRank();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={1080}
      className="rank-modal"
      destroyOnHidden
      maskClosable
      afterOpenChange={(visible) => {
        if (!visible) return;
        setTab('realm');
      }}
    >
      <div className="rank-shell">
        <div className="rank-left">
          <div className="rank-left-title">
            <img className="rank-left-icon" src={coin01} alt="排行" />
            <div className="rank-left-name">排行</div>
          </div>
          {isMobile ? (
            <div className="rank-left-segmented-wrap">
              <Segmented
                className="rank-left-segmented"
                value={tab}
                options={mobileMenuOptions}
                onChange={(value) => {
                  if (typeof value !== 'string') return;
                  if (!RANK_TAB_KEYS.includes(value as RankTab)) return;
                  setTab(value as RankTab);
                }}
              />
            </div>
          ) : (
            <div className="rank-left-list">
              {leftItems.map((item) => (
                <Button
                  key={item.key}
                  type={tab === item.key ? 'primary' : 'default'}
                  className="rank-left-item"
                  onClick={() => setTab(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="rank-right">{panelContent()}</div>
      </div>
    </Modal>
  );
};

export default RankModal;
