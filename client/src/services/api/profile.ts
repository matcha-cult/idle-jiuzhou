import api from './core';

// 上传头像
export interface UploadResponse {
  success: boolean;
  message: string;
  avatarUrl?: string;
}

export const uploadAvatar = (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('avatar', file);
  return api.post('/upload/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// 删除头像
export const deleteAvatar = (): Promise<{ success: boolean; message: string }> => {
  return api.delete('/upload/avatar');
};

// 加点接口
export interface AddPointResponse {
  success: boolean;
  message: string;
  data?: {
    attribute: string;
    newValue: number;
    remainingPoints: number;
  };
}

export const addAttributePoint = (
  attribute: 'jing' | 'qi' | 'shen',
  amount: number = 1
): Promise<AddPointResponse> => {
  return api.post('/attribute/add', { attribute, amount });
};

// 减点
export const removeAttributePoint = (
  attribute: 'jing' | 'qi' | 'shen',
  amount: number = 1
): Promise<AddPointResponse> => {
  return api.post('/attribute/remove', { attribute, amount });
};

// 批量加点
export const batchAddPoints = (points: {
  jing?: number;
  qi?: number;
  shen?: number;
}): Promise<AddPointResponse> => {
  return api.post('/attribute/batch', points);
};

// 重置属性点
export const resetAttributePoints = (): Promise<{
  success: boolean;
  message: string;
  totalPoints?: number;
}> => {
  return api.post('/attribute/reset');
};
