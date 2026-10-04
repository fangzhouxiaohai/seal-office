export type 命令能力状态 = '可用' | '缺少配置' | '只读' | '正在执行' | '暂不可用'

const 尚未实现 = new Set([
  'insert.chart', 'insert.media',
  'animation.appear', 'animation.fade', 'review.spell', 'review.comment',
])

export function 读取演示命令状态(
  标识: string,
  环境: { 只读?: boolean; 正在执行?: boolean; 需要配置?: boolean; 已配置?: boolean } = {}
): { 状态: 命令能力状态; 原因?: string } {
  if (尚未实现.has(标识)) return { 状态: '暂不可用', 原因: '此操作尚未完成文件保存与重新打开验证' }
  if (环境.正在执行) return { 状态: '正在执行', 原因: '当前操作正在执行，请稍候' }
  if (环境.只读) return { 状态: '只读', 原因: '当前演示文稿为只读状态' }
  if (环境.需要配置 && !环境.已配置) return { 状态: '缺少配置', 原因: '请先配置所需服务' }
  return { 状态: '可用' }
}
