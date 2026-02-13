/**
 * 九州修仙录 - 怪物数据表
 */
import { query } from '../config/database.js';

// ============================================
// 掉落池表
// ============================================
const dropPoolTableSQL = `
CREATE TABLE IF NOT EXISTS drop_pool (
  id VARCHAR(64) PRIMARY KEY,                         -- 掉落池ID
  name VARCHAR(64) NOT NULL,                          -- 掉落池名称
  description TEXT,                                   -- 掉落池说明
  mode VARCHAR(16) NOT NULL DEFAULT 'prob',           -- 掉落模式（prob概率/weight权重）
  
  -- 运营控制
  version INTEGER NOT NULL DEFAULT 1,                 -- 配置版本
  enabled BOOLEAN NOT NULL DEFAULT true,              -- 是否启用
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE drop_pool IS '掉落池表';
COMMENT ON COLUMN drop_pool.id IS '掉落池ID';
COMMENT ON COLUMN drop_pool.name IS '掉落池名称';
COMMENT ON COLUMN drop_pool.mode IS '掉落模式（prob概率/weight权重）';
`;

const dropPoolEntryTableSQL = `
CREATE TABLE IF NOT EXISTS drop_pool_entry (
  id BIGSERIAL PRIMARY KEY,                           -- 主键
  drop_pool_id VARCHAR(64) NOT NULL,                  -- 掉落池ID
  item_def_id VARCHAR(64) NOT NULL,                   -- 物品定义ID
  
  -- 掉落规则
  chance NUMERIC(8,6) DEFAULT 1.0,                    -- 掉落概率（prob模式）
  weight INTEGER DEFAULT 100,                         -- 权重（weight模式）
  qty_min INTEGER NOT NULL DEFAULT 1,                 -- 最小数量
  qty_max INTEGER NOT NULL DEFAULT 1,                 -- 最大数量
  
  -- 品质控制（装备专用）
  quality_weights JSONB,                              -- 品质权重
  
  -- 绑定与展示
  bind_type VARCHAR(16) DEFAULT 'none',               -- 绑定规则
  show_in_ui BOOLEAN NOT NULL DEFAULT true,           -- 是否在前端掉落预览展示
  sort_order INTEGER NOT NULL DEFAULT 0,              -- 展示/结算顺序
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE drop_pool_entry IS '掉落池条目表';
COMMENT ON COLUMN drop_pool_entry.drop_pool_id IS '掉落池ID';
COMMENT ON COLUMN drop_pool_entry.item_def_id IS '物品定义ID';
COMMENT ON COLUMN drop_pool_entry.chance IS '掉落概率（prob模式，1.0=100%）';
COMMENT ON COLUMN drop_pool_entry.weight IS '权重（weight模式）';
COMMENT ON COLUMN drop_pool_entry.qty_min IS '最小数量';
COMMENT ON COLUMN drop_pool_entry.qty_max IS '最大数量';
COMMENT ON COLUMN drop_pool_entry.quality_weights IS '品质权重（装备专用）';
COMMENT ON COLUMN drop_pool_entry.show_in_ui IS '是否在前端掉落预览展示';

CREATE INDEX IF NOT EXISTS idx_drop_pool_entry_pool ON drop_pool_entry(drop_pool_id);
`;

export const initMonsterTables = async (): Promise<void> => {
  try {
    console.log('✓ 怪物定义与刷新规则改为静态JSON加载，跳过建表');
    
    await query(dropPoolTableSQL);
    await query(dropPoolEntryTableSQL);
    console.log('✓ 掉落池表检测完成');
  } catch (error) {
    console.error('✗ 怪物系统表初始化失败:', error);
    throw error;
  }
};

