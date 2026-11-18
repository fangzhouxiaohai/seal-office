/**
 * 字典接口:类型 + 字典项。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface DictType {
  id: number;
  name: string;
  code: string;
  status: number;
  remark: string;
  create_time: number;
}

export interface DictTypeForm {
  id?: number;
  name: string;
  code: string;
  status: number;
  remark: string;
}

export interface DictData {
  id: number;
  type_code: string;
  label: string;
  value: string;
  sort: number;
  status: number;
  remark: string;
}

export interface DictDataForm {
  id?: number;
  type_code: string;
  label: string;
  value: string;
  sort: number;
  status: number;
  remark: string;
}

export const listDictTypes = (params: Record<string, unknown>) =>
  http.get<PageResult<DictType>>('/adminapi/system/dict/types', params);

export const createDictType = (data: DictTypeForm) => http.post<{ id: number }>('/adminapi/system/dict/types', data);

export const updateDictType = (id: number, data: DictTypeForm) => http.put(`/adminapi/system/dict/types/${id}`, data);

export const deleteDictType = (id: number) => http.delete(`/adminapi/system/dict/types/${id}`);

export const listDictData = (params: Record<string, unknown>) =>
  http.get<PageResult<DictData>>('/adminapi/system/dict/data', params);

export const createDictData = (data: DictDataForm) => http.post<{ id: number }>('/adminapi/system/dict/data', data);

export const updateDictData = (id: number, data: DictDataForm) => http.put(`/adminapi/system/dict/data/${id}`, data);

export const deleteDictData = (id: number) => http.delete(`/adminapi/system/dict/data/${id}`);

/** 按编码取字典项(业务下拉框用) */
export const dictByCode = (code: string) => http.get<{ label: string; value: string }[]>(`/adminapi/dicts/${code}`);
