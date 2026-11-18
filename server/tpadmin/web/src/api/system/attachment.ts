/**
 * 附件接口:直传三步流程(policy → 直传/兜底上传 → 登记)。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface AttachmentItem {
  id: number;
  name: string;
  path: string;
  disk: string;
  url: string;
  mime: string;
  ext: string;
  size: number;
  sha1: string;
  uploader_id: number;
  create_time: number;
}

export interface UploadPolicy {
  disk: string;
  /** direct=前端直传云端;server=POST 到本地兜底接口 */
  mode: 'direct' | 'server';
  key: string;
  host: string;
  form: Record<string, string>;
  expires_in: number;
}

export const listAttachments = (params: Record<string, unknown>) =>
  http.get<PageResult<AttachmentItem>>('/adminapi/attachments', params);

export const getUploadPolicy = (filename: string, size: number, mime: string) =>
  http.post<UploadPolicy>('/adminapi/attachments/policy', { filename, size, mime });

export const registerAttachment = (key: string) => http.post<AttachmentItem>('/adminapi/attachments', { key });

export const uploadToServer = (key: string, file: File) => {
  const form = new FormData();
  form.append('key', key);
  form.append('file', file);
  return http.upload<AttachmentItem>('/adminapi/attachments/upload', form);
};

export const deleteAttachment = (id: number) =>
  http.delete<{ remote_deleted: boolean }>(`/adminapi/attachments/${id}`);

export const getAttachmentUrl = (id: number) => http.get<{ url: string }>(`/adminapi/attachments/${id}/url`);

/**
 * 统一上传:自动走 policy → direct(multipart 直传云端)或 server(兜底)→ 登记。
 * 返回登记后的附件记录。
 */
export async function uploadFile(file: File): Promise<AttachmentItem> {
  const policy = await getUploadPolicy(file.name, file.size, file.type || 'application/octet-stream');

  if (policy.mode === 'server') {
    // 本地磁盘:接收即登记
    return uploadToServer(policy.key, file);
  }

  // 云端直传:form 字段 + file 以 multipart 表单 POST 到云存储 host
  const form = new FormData();
  for (const [k, v] of Object.entries(policy.form)) form.append(k, v);
  form.append('file', file);
  const resp = await fetch(policy.host, { method: 'POST', body: form });
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`直传失败(HTTP ${resp.status})`);
  }

  return registerAttachment(policy.key);
}
