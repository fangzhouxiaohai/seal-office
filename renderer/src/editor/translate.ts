export interface 翻译配置 {
  地址: string
  密钥?: string
  来源语言?: string
  目标语言?: string
}

export async function 翻译文本(文本: string, 配置: 翻译配置): Promise<string> {
  if (!配置.地址.trim()) throw new Error('请先在设置中配置翻译服务地址')
  const 响应 = await fetch(配置.地址, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(配置.密钥 ? { Authorization: `Bearer ${配置.密钥}` } : {}) },
    body: JSON.stringify({ text: 文本, source: 配置.来源语言 || 'auto', target: 配置.目标语言 || 'zh' }),
  })
  if (!响应.ok) throw new Error(`翻译服务返回错误（${响应.status}）`)
  const 数据 = await 响应.json() as { translation?: string }
  if (!数据.translation) throw new Error('翻译服务未返回有效内容')
  return 数据.translation
}
