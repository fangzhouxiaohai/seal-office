import { 查找文档格式, 是原生格式 } from '../../fileFormats'
import { diagramFileType } from '../../localTools/diagramCloud'

/** 完整：桌面与网页版携带第三方预览引擎；精简：移动原生包受云打包体积限制，仅用浏览器能力与编辑器。 */
export type 预览引擎 = '完整' | '精简'
export type 预览类型 = 'image' | 'audio' | 'video' | 'text' | 'zip' | 'viewer' | 'editor' | 'unsupported'

export const 预览最大字节 = 100 * 1024 * 1024

/** 编译期常量：Android / HarmonyOS / iOS 原生包使用精简预览，构建时剔除完整引擎。 */
export const 移动原生包 = __SEAL_PLATFORM__ === 'android' || __SEAL_PLATFORM__ === 'harmony' || __SEAL_PLATFORM__ === 'ios'
export const 当前预览引擎: 预览引擎 = 移动原生包 ? '精简' : '完整'

const 图片 = new Set(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'apng'])
const 音频 = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'])
const 视频 = new Set(['mp4', 'webm', 'ogv', 'mov', 'm4v'])
const 文本 = new Set(['txt', 'log', 'md', 'markdown', 'json', 'jsonc', 'xml', 'yaml', 'yml', 'csv', 'tsv', 'ini', 'conf', 'cfg', 'toml', 'properties', 'env',
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less', 'html', 'htm', 'vue', 'svelte', 'py', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'go', 'rs', 'rb', 'php',
  'sh', 'bash', 'bat', 'cmd', 'ps1', 'sql', 'swift', 'lua', 'r', 'dart', 'scala', 'pl', 'gradle', 'dockerfile', 'makefile', 'gitignore', 'srt', 'vtt'])
/** 由 file-viewer 渲染器处理的格式（含文本高亮与 Markdown 渲染）。 */
const 引擎 = new Set(['docx', 'doc', 'dotx', 'dot', 'docm', 'rtf', 'odt', 'ott', 'xlsx', 'xls', 'xlsm', 'xlsb', 'xltx', 'ods', 'ots', 'pptx', 'ppt', 'pps', 'ppsx', 'pptm', 'potx', 'odp', 'otp',
  'pdf', 'ofd', 'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'epub', 'eml', 'msg', 'tif', 'tiff', 'heic', 'heif', 'mkv'])

const 扩展名 = (名称: string) => (名称.match(/\.([^./\\]+)$/)?.[1] ?? '').toLowerCase()

export function 预览方式(名称: string, 引擎能力: 预览引擎): { 方式: 预览类型; 说明?: string } {
  const 扩展 = 扩展名(名称)
  if (是原生格式(名称) || diagramFileType(名称)) return { 方式: 'editor', 说明: '海豹专属格式使用海豹办公打开查看与编辑' }
  if (图片.has(扩展)) return { 方式: 'image' }
  if (音频.has(扩展)) return { 方式: 'audio' }
  if (视频.has(扩展)) return { 方式: 'video' }
  if (引擎能力 === '完整' && (引擎.has(扩展) || 文本.has(扩展))) return { 方式: 'viewer' }
  if (文本.has(扩展)) return { 方式: 'text' }
  if (扩展 === 'zip') return { 方式: 'zip' }
  if (查找文档格式(名称)) return { 方式: 'editor', 说明: '此格式使用海豹办公编辑器打开查看' }
  if (引擎.has(扩展)) return { 方式: 'unsupported', 说明: `移动端安装包暂不内置 ${扩展.toUpperCase()} 预览组件，请下载后用其他应用打开，或在桌面版或网页版中预览` }
  return { 方式: 'unsupported', 说明: `暂不支持预览 ${扩展 ? 扩展.toUpperCase() : '无扩展名'} 文件，可下载后用对应软件打开` }
}

/** 云空间中点击文件：可编辑格式直接打开编辑，其余格式进入预览。 */
export const 默认打开方式 = (名称: string): 'edit' | 'preview' => 是原生格式(名称) || diagramFileType(名称) || 查找文档格式(名称) ? 'edit' : 'preview'
