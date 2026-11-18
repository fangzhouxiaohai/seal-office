import { clearAdminSession, readAdminToken } from './sealAuth';

export function expireSession(): void {
  clearAdminSession();
  window.dispatchEvent(new Event('seal-session-expired'));
}

export async function callAdmin(route: string, method = 'GET', body?: unknown): Promise<any> {
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(route)) {
    throw new Error('管理接口路径无效');
  }
  const token = readAdminToken();
  if (!token) throw new Error('请先登录管理后台');
  const response = await fetch('/seal-admin/api/' + route, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401) expireSession();
  if (response.status === 403) window.dispatchEvent(new Event('seal-permissions-changed'));
  let result: any;
  try { result = await response.json(); } catch { throw new Error('管理服务响应无效，请稍后重试'); }
  if (!response.ok) throw new Error(result.error || result.message || '管理服务请求失败');
  return result;
}

export function uploadRelease(platform: string, version: string, file: File, progress: (value: number) => void, signal: AbortSignal): Promise<any> {
  const owner = readAdminToken();
  return new Promise((resolve, reject) => {
    if (!owner) { reject(new Error('请先登录管理后台')); return; }
    if (signal.aborted) { reject(new Error('安装包上传已取消')); return; }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open('POST', '/api/v1/admin/release-assets?' + new URLSearchParams({ platform, version, filename: file.name }));
    request.setRequestHeader('Authorization', 'Bearer ' + owner);
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.timeout = 30 * 60 * 1000;
    request.upload.onprogress = event => { if (event.lengthComputable) progress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
    request.onload = () => {
      if (request.status === 401) { expireSession(); reject(new Error('管理员登录已过期，请重新登录')); return; }
      let result: any;
      try { result = JSON.parse(request.responseText); } catch { reject(new Error(request.status === 413 ? '安装包超过允许大小，请检查服务器配置' : '上传服务返回内容无效')); return; }
      if (request.status < 200 || request.status >= 300) { reject(new Error(result.error || '安装包上传失败')); return; }
      if (owner !== readAdminToken()) { reject(new Error('管理员会话已变更，请重新进入版本管理')); return; }
      resolve(result);
    };
    request.onerror = () => reject(new Error('安装包上传连接中断，请检查网络后重试'));
    request.ontimeout = () => reject(new Error('安装包上传超时，请检查网络后重新上传'));
    request.onabort = () => reject(new Error('安装包上传已取消'));
    request.onloadend = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    request.send(file);
  });
}
