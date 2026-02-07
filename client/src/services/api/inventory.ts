import api from './core';

export type InventoryLocation = 'bag' | 'warehouse' | 'equipped';

export interface InventoryInfoData {
  bag_capacity: number;
  warehouse_capacity: number;
  bag_used: number;
  warehouse_used: number;
}

export interface InventoryInfoResponse {
  success: boolean;
  message?: string;
  data?: InventoryInfoData;
}

export interface ItemDefLite {
  id: string;
  name: string;
  icon: string | null;
  quality: string;
  category: string;
  sub_category: string | null;
  stack_max: number;
  description: string | null;
  long_desc: string | null;
  tags: unknown;
  effect_defs: unknown;
  base_attrs: unknown;
  equip_slot: string | null;
  use_type: string | null;
}

export interface InventoryItemDto {
  id: number;
  item_def_id: string;
  qty: number;
  location: InventoryLocation;
  location_slot: number | null;
  equipped_slot: string | null;
  strengthen_level: number;
  refine_level: number;
  affixes: unknown;
  identified: boolean;
  locked: boolean;
  bind_type: string;
  created_at: string;
  def?: ItemDefLite;
}

export interface InventoryItemsResponse {
  success: boolean;
  message?: string;
  data?: {
    items: InventoryItemDto[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export const getInventoryInfo = (): Promise<InventoryInfoResponse> => {
  return api.get('/inventory/info');
};

export const getInventoryItems = (
  location: InventoryLocation = 'bag',
  page: number = 1,
  pageSize: number = 200
): Promise<InventoryItemsResponse> => {
  return api.get('/inventory/items', { params: { location, page, pageSize } });
};

export interface InventoryMoveResponse {
  success: boolean;
  message: string;
}

export const moveInventoryItem = (body: {
  itemId: number;
  targetLocation: 'bag' | 'warehouse';
  targetSlot?: number;
}): Promise<InventoryMoveResponse> => {
  return api.post('/inventory/move', body);
};

export interface InventoryUseResponse {
  success: boolean;
  message: string;
  effects?: unknown[];
  data?: { character: unknown };
}

export const inventoryUseItem = (body: {
  itemInstanceId?: number;
  instanceId?: number;
  itemId?: number;
  qty?: number;
}): Promise<InventoryUseResponse> => {
  return api.post('/inventory/use', body);
};

export interface InventoryEquipResponse {
  success: boolean;
  message: string;
  equippedSlot?: string;
  swappedOutItemId?: number;
  data?: { character: unknown };
}

export const equipInventoryItem = (itemId: number): Promise<InventoryEquipResponse> => {
  return api.post('/inventory/equip', { itemId });
};

export interface InventoryUnequipResponse {
  success: boolean;
  message: string;
  movedTo?: { location: 'bag' | 'warehouse'; slot: number };
  data?: { character: unknown };
}

export const unequipInventoryItem = (
  itemId: number,
  targetLocation: 'bag' | 'warehouse' = 'bag'
): Promise<InventoryUnequipResponse> => {
  return api.post('/inventory/unequip', { itemId, targetLocation });
};

export interface InventoryEnhanceResponse {
  success: boolean;
  message: string;
  data?: { strengthenLevel: number; character: unknown | null };
}

export const enhanceInventoryItem = (itemId: number): Promise<InventoryEnhanceResponse> => {
  return api.post('/inventory/enhance', { itemId });
};

export interface InventoryDisassembleResponse {
  success: boolean;
  message: string;
  rewards?: { itemDefId: string; qty: number; itemIds?: number[] };
}

export const disassembleInventoryEquipment = (itemId: number): Promise<InventoryDisassembleResponse> => {
  return api.post('/inventory/disassemble', { itemId });
};

export interface InventoryDisassembleBatchResponse {
  success: boolean;
  message: string;
  disassembledCount?: number;
  rewards?: Array<{ itemDefId: string; qty: number; itemIds?: number[] }>;
}

export const disassembleInventoryEquipmentBatch = (itemIds: number[]): Promise<InventoryDisassembleBatchResponse> => {
  return api.post('/inventory/disassemble/batch', { itemIds });
};

export interface InventoryRemoveBatchResponse {
  success: boolean;
  message: string;
  removedCount?: number;
  removedQtyTotal?: number;
}

export const removeInventoryItemsBatch = (itemIds: number[]): Promise<InventoryRemoveBatchResponse> => {
  return api.post('/inventory/remove/batch', { itemIds });
};

export const sortInventory = (location: 'bag' | 'warehouse' = 'bag'): Promise<{ success: boolean; message: string }> => {
  return api.post('/inventory/sort', { location });
};
