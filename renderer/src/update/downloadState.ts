/** 平台上报的实际下载状态；总大小为 0 时表示暂时无法确定。 */
export type 下载阶段 = '空闲' | '下载中' | '校验中' | '已就绪' | '已取消' | '失败' | '安装中'
export interface 下载进度 { 阶段: 下载阶段; 已下载: number; 总大小: number; 版本?: string; 任务标识?: string; 错误?: string; 强制?: boolean; 通知可见?: boolean }
export interface 下载界面状态 { 进度: 下载进度 | null; 界面: '隐藏' | '前台' | '后台' }
export const 初始下载状态: 下载界面状态 = { 进度: null, 界面: '隐藏' }
const 阶段集合 = new Set<下载阶段>(['空闲', '下载中', '校验中', '已就绪', '已取消', '失败', '安装中'])
export function 应用下载进度(状态: 下载界面状态, 进度: 下载进度): 下载界面状态 {
  if (!进度 || (进度.强制 !== undefined && typeof 进度.强制 !== 'boolean') || (进度.通知可见 !== undefined && typeof 进度.通知可见 !== 'boolean') || !阶段集合.has(进度.阶段) || !Number.isSafeInteger(进度.已下载) || 进度.已下载 < 0 || !Number.isSafeInteger(进度.总大小) || 进度.总大小 < 0 || (进度.总大小 > 0 && 进度.已下载 > 进度.总大小) || (进度.阶段 === '已就绪' && !进度.版本)) throw new Error('下载服务返回的状态无效')
  if (状态.进度?.任务标识 && 进度.任务标识 && 状态.进度.任务标识 !== 进度.任务标识) return 状态
  return { ...状态, 进度 }
}
export function 更新下载界面(状态: 下载界面状态, 界面: 下载界面状态['界面']): 下载界面状态 { return { ...状态, 界面 } }
export function 应跳过自动检查(状态: 下载界面状态): boolean { return (状态.界面 === '前台' && !状态.进度) || (!!状态.进度 && ['下载中', '校验中', '已就绪', '安装中'].includes(状态.进度.阶段)) }
