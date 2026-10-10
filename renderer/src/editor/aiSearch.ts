import { 桥接 } from '../ipc/bridge'
import { 索引文字, 文字范围 } from './textSearch'

export interface AI搜索结果 { 原文: string; 说明: string; 范围: Range }
export interface 搜索资料 { 编号: number; 原文: string; 开始: number }

export function 分组搜索资料(文字: string): 搜索资料[][] {
  const 资料: 搜索资料[] = []
  let 开始 = 0
  for (const 段落 of 文字.split('\n')) {
    if (段落.trim()) for (let 位 = 0; 位 < 段落.length; 位 += 1300) {
      资料.push({ 编号: 资料.length + 1, 原文: 段落.slice(位, 位 + 1500), 开始: 开始 + 位 })
    }
    开始 += 段落.length + 1
  }
  const 批次: 搜索资料[][] = []; let 当前: 搜索资料[] = [], 长度 = 0
  for (const 项 of 资料) {
    const 大小 = JSON.stringify({ 编号: 项.编号, 原文: 项.原文 }).length
    if (当前.length && 长度 + 大小 > 20000) { 批次.push(当前); 当前 = []; 长度 = 0 }
    当前.push(项); 长度 += 大小
  }
  if (当前.length) 批次.push(当前)
  return 批次
}

export function 核对搜索结果(回复: string, 资料: 搜索资料[]): Array<{ 原文: string; 说明: string; 开始: number }> {
  const 文本 = 回复.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let 数据: unknown
  try { 数据 = JSON.parse(文本) } catch { throw new Error('AI 搜索返回格式无效，请重试') }
  const 结果 = (数据 as { 结果?: unknown[] })?.结果
  if (!Array.isArray(结果)) throw new Error('AI 搜索返回格式无效，请重试')
  return 结果.flatMap(项 => {
    const 值 = 项 as { 编号?: number; 原文?: string; 说明?: string }
    if (!值 || typeof 值.原文 !== 'string' || !值.原文.trim()) return []
    const 段 = 资料.find(段 => 段.编号 === 值.编号)
    const 位 = 段?.原文.indexOf(值.原文) ?? -1
    if (!段 || 位 < 0) return []
    return [{ 原文: 值.原文, 说明: typeof 值.说明 === 'string' ? 值.说明.slice(0, 300) : '', 开始: 段.开始 + 位 }]
  })
}

/** 使用应用既有模型服务；所有返回引用必须与本次文件快照中的原文一致。 */
export async function 搜索文档含义(根: HTMLElement, 需求: string, 控制: { 已取消: () => boolean; 请求: (id: string) => void; 进度: (文本: string) => void }): Promise<AI搜索结果[]> {
  if (!需求.trim() || 需求.length > 4000) throw new Error('请输入 1 至 4000 字的搜索需求')
  const 配置 = await 桥接.ai.getConfig()
  if (!配置.成功 || !配置.数据?.地址 || !配置.数据.模型 || (配置.数据.服务商 !== 'custom' && !配置.数据.已配置密钥)) throw new Error('请先在智能助手设置中配置模型服务')
  const 快照 = 根.innerHTML, 索引 = 索引文字(根), 批次 = 分组搜索资料(索引.文字)
  const 所有: AI搜索结果[] = [], 已有 = new Set<number>()
  for (const [序号, 资料] of 批次.entries()) {
    if (控制.已取消()) return []
    控制.进度(`AI 正在搜索 ${序号 + 1}/${批次.length} 组内容…`)
    const 标识 = crypto.randomUUID(); 控制.请求(标识)
    const 回复 = await 桥接.ai.chat({ 请求标识: 标识, 用途: '文档搜索', 自动执行: false,
      消息: [{ 角色: 'user', 内容: `搜索需求：${需求}\n返回与需求含义相关的原文，最多 8 处。只输出 JSON：{"结果":[{"编号":1,"原文":"资料中的连续原文","说明":"与需求的关系"}]}。无依据时返回空结果。` }],
      文档上下文: JSON.stringify(资料.map(({ 编号, 原文 }) => ({ 编号, 原文 }))),
    })
    if (控制.已取消()) return []
    if (根.innerHTML !== 快照 || !根.isConnected) throw new Error('文档已变化，请重新进行 AI 搜索')
    if (!回复.成功 || !回复.数据 || 回复.数据.已停止) throw new Error(回复.错误 || 'AI 搜索未完成')
    for (const 项 of 核对搜索结果(回复.数据.内容, 资料)) {
      const 范围 = 文字范围(索引, 项.开始, 项.开始 + 项.原文.length)
      if (范围 && !已有.has(项.开始)) { 已有.add(项.开始); 所有.push({ ...项, 范围 }) }
    }
  }
  return 所有
}
