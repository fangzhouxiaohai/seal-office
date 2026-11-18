/**
 * 后端统一响应与通用分页类型。
 * Author: qiufeng
 */

/** 统一响应包装 {code, message, data, request_id, timestamp} */
export interface ApiResult<T = unknown> {
  code: number;
  message: string;
  data: T;
  request_id: string;
  timestamp: number;
}

/** 分页元信息(后端 PaginationVo) */
export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** 分页列表响应(后端 PageVo) */
export interface PageResult<T> {
  list: T[];
  pagination: Pagination;
}
