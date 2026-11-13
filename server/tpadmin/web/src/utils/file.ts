/**
 * 文件工具:大小格式化、扩展名、下载、MIME 判断。
 * Author: qiufeng
 */

/** 字节数格式化:formatSize(1536000) → '1.46 MB' */
export function formatSize(bytes: number, decimals = 2): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

/** 取扩展名(小写,不含点):extname('photo.JPG') → 'jpg' */
export function extname(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i + 1).toLowerCase();
}

/** 是否图片(按扩展名) */
export function isImage(filename: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(extname(filename));
}

/** Blob 保存为文件(配合 http.download 使用) */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 直接下载 URL(同源或允许跨域的地址) */
export function downloadUrl(url: string, filename = ''): void {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
