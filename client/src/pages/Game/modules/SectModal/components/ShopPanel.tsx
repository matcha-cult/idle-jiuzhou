/**
 * 宗门商店面板。
 * 输入：商品列表、当前贡献、兑换动作。
 * 输出：可兑换商品卡片与贡献消耗提示。
 * 边界：贡献不足时按钮禁用，显示“贡献不足”。
 */
import { Button } from 'antd';
import type { SectShopItemDto } from '../../../../../services/api';
import { resolveIcon } from '../../BagModal/bagShared';

interface ShopPanelProps {
  loading: boolean;
  myContribution: number;
  shopItems: SectShopItemDto[];
  actionLoadingKey: string | null;
  onBuy: (itemId: string) => void;
}

/**
 * 商店名称去重：当名称末尾已经包含“xN / ×N”数量后缀时，移除该后缀，
 * 避免与“数量 xN”标签重复展示。
 */
const normalizeShopItemName = (name: string, qty: number): string => {
  const trimmed = name.trim();
  const qtyText = String(Math.max(0, Math.floor(qty)));
  const suffixPattern = new RegExp(`\\s*[xX×]\\s*${qtyText}$`);
  const cleaned = trimmed.replace(suffixPattern, '').trim();
  return cleaned || trimmed;
};

/**
 * 提取物品占位图标字符：
 * 跳过常见的前缀符号（如《、[、( 等），获取第一个有效的文字字符。
 */
const getItemPlaceholder = (name: string): string => {
  const cleaned = name.replace(/^[《\[\(\s"'【「]+/, '');
  return (cleaned.charAt(0) || name.charAt(0) || '?').toUpperCase();
};

const ShopPanel: React.FC<ShopPanelProps> = ({ loading, myContribution, shopItems, actionLoadingKey, onBuy }) => {
  return (
    <div className="sect-pane">
      <div className="sect-pane-top">
        <div className="sect-pane-title-wrap">
          <div className="sect-title">宗门商店</div>
          <div className="sect-subtitle">消耗个人贡献兑换宗门专属物资。</div>
        </div>
      </div>

      <div className="sect-pane-body sect-panel-scroll">
        <div className="sect-shop-balance">
          <div className="sect-shop-balance-k">当前贡献</div>
          <div className="sect-shop-balance-v">{myContribution.toLocaleString()}</div>
        </div>

        {loading ? <div className="sect-empty">商店加载中...</div> : null}
        {!loading && shopItems.length === 0 ? <div className="sect-empty">暂无可兑换商品</div> : null}

        <div className="sect-shop-grid">
          {shopItems.map((item) => {
            const affordable = myContribution >= item.costContribution;
            const loadingKey = `shop-buy-${item.id}`;
            const rawDailyLimit = Number(item.limitDaily);
            const dailyLimit = Number.isFinite(rawDailyLimit) ? Math.max(0, Math.floor(rawDailyLimit)) : 0;
            const displayName = normalizeShopItemName(item.name, item.qty);
            const iconUrl = resolveIcon({ icon: item.itemIcon ?? null });

            return (
              <div key={item.id} className={`sect-shop-card ${!affordable ? 'is-unaffordable' : ''}`}>
                <div className="sect-shop-card-content">
                  <div className="sect-shop-item-icon">
                    <img 
                      src={iconUrl} 
                      alt={displayName} 
                      onError={(e) => {
                        // 如果图片加载失败，隐藏图片并显示占位文字（通过父级样式或 JS 控制）
                        (e.target as HTMLImageElement).style.display = 'none';
                        const parent = (e.target as HTMLElement).parentElement;
                        if (parent) {
                          const span = document.createElement('span');
                          span.innerText = getItemPlaceholder(displayName);
                          parent.appendChild(span);
                        }
                      }}
                    />
                  </div>
                  <div className="sect-shop-item-info">
                    <div className="sect-shop-item-name">{displayName}</div>
                    <div className="sect-shop-item-meta">
                      <span className="sect-shop-qty">数量 x{item.qty}</span>
                      {dailyLimit > 0 && (
                        <span className="sect-shop-limit">每日限购 {dailyLimit}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="sect-shop-card-footer">
                  <div className="sect-shop-price">
                    <span className="sect-shop-price-label">消耗</span>
                    <span className={`sect-shop-price-value ${!affordable ? 'is-shortage' : ''}`}>
                      {item.costContribution.toLocaleString()} 贡献
                    </span>
                  </div>
                  <div className="sect-shop-actions">
                    <Button
                      size="small"
                      type="primary"
                      disabled={!affordable}
                      loading={actionLoadingKey === loadingKey}
                      onClick={() => {
                        if (!affordable) return;
                        void onBuy(item.id);
                      }}
                    >
                      {affordable ? '兑换' : '贡献不足'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ShopPanel;
