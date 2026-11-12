// 扫描与单据识别的运行平台与能力分配（见 2.7.1 升级计划第七节平台分配表）：
// Android / HarmonyOS 原生工作台：拍照为主入口，另有相册 / 文件导入，有扫描件库；
// Windows 桌面：只做文件导入与截图粘贴（Ctrl+V），不提供拍照，有扫描件库；
// 网页版：只做文件上传 → 本机处理 → 下载，不提供拍照与扫描件库（浏览器存储不可靠）。

export type 扫描平台 = 'desktop' | 'android' | 'harmony' | 'web'
export interface 扫描能力 { 拍照: boolean; 扫描件库: boolean; 粘贴: boolean }

export function 当前扫描平台(): 扫描平台 {
  if (typeof document === 'undefined') return 'desktop'
  const 平台 = document.documentElement.dataset.sealPlatform
  if (!平台) return 'desktop'
  if (平台 === 'app') return (window as unknown as { sealNative?: { platform?: string } }).sealNative?.platform === 'harmony' ? 'harmony' : 'android'
  return 'web'
}

export function 取扫描能力(平台: 扫描平台 = 当前扫描平台()): 扫描能力 {
  const 原生移动 = 平台 === 'android' || 平台 === 'harmony'
  return { 拍照: 原生移动, 扫描件库: 平台 !== 'web', 粘贴: !原生移动 }
}
