/**
 * 代码生成器接口。
 * Author: qiufeng
 */
import http from '@/utils/request';

export interface GenTable {
  name: string;
  comment: string;
  rows: number;
  columns: number;
}

/** 字段配置(列表/搜索/表单/控件) */
export interface GenColumn {
  name: string;
  label: string;
  comment: string;
  base: string;
  php_type: string;
  ts_type: string;
  system: boolean;
  list: boolean;
  search: boolean;
  search_type: 'like' | 'eq';
  form: boolean;
  component: 'input' | 'textarea' | 'number' | 'switch' | 'datetime';
}

/** 预览文件 */
export interface GenFile {
  display: string;
  language: string;
  content: string;
}

export interface GenResult {
  files: string[];
  permission: string;
  menu_path: string;
}

export const listGenTables = () => http.get<GenTable[]>('/adminapi/generator/tables');

export const getGenColumns = (table: string) =>
  http.get<GenColumn[]>('/adminapi/generator/columns', { table });

export const previewGenerate = (table: string, title: string, columns: GenColumn[]) =>
  http.post<GenFile[]>('/adminapi/generator/preview', { table, title, columns });

export const runGenerate = (table: string, title: string, columns: GenColumn[], force: boolean) =>
  http.post<GenResult>('/adminapi/generator/run', { table, title, columns, force });
