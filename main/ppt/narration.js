// 智能讲 PPT：分页生成讲稿，并按页合成讲解音频（音频按页稳定标识绑定，失败只影响该页）。
const { 合成语音 } = require('./speech')

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)
const 默认每批页数 = 8
const 最大讲稿字数 = 2000

function 校验页列表(页列表) {
  if (!Array.isArray(页列表)) throw new Error('讲稿页面列表格式无效')
  const 标识集合 = new Set()
  for (const 页 of 页列表) {
    if (!是记录(页) || typeof 页.页标识 !== 'string' || !页.页标识.trim()) throw new Error('讲稿页面标识无效')
    if (标识集合.has(页.页标识)) throw new Error(`讲稿页面存在重复标识：${页.页标识}`)
    标识集合.add(页.页标识)
    if (typeof 页.文本 !== 'string') throw new Error(`第 ${页.页标识} 页的文本格式无效`)
  }
  return 页列表
}

/** 生成讲稿：按页稳定标识返回，拒绝缺页、重复与空讲稿。 */
async function 生成讲稿({ 页列表, 调用模型, 每批页数 = 默认每批页数, 风格 = '正式讲解', 推送 = () => {}, 信号 }) {
  if (typeof 调用模型 !== 'function') throw new Error('讲稿生成必须调用 AI 模型服务')
  const 清单 = 校验页列表(页列表)
  const 待生成 = 清单.filter((页) => String(页.文本 ?? '').trim().length > 0 || String(页.备注 ?? '').trim().length > 0)
  if (!待生成.length) throw new Error('没有可生成讲稿的页面：所选页面没有文字或备注内容')
  const 批大小 = Math.max(1, Math.floor(每批页数))
  const 批次 = []
  for (let 起点 = 0; 起点 < 待生成.length; 起点 += 批大小) 批次.push(待生成.slice(起点, 起点 + 批大小))
  const 系统提示 = [
    '你是演示文稿讲稿撰写助手，为每一页写出口语化、可直接朗读的讲解词。',
    '只输出一个 JSON 对象，形如 {"讲稿":[{"页标识":"给定标识","讲稿":"该页讲解词"}]}。',
    '必须为请求中的每个页标识返回且只返回一条讲稿；不得增删页、改名或合并页面。',
    '讲稿只使用该页给出的内容，不编造数据；长度约 60 到 200 字；不要输出 Markdown 或思考过程。',
  ].join('\n')
  const 结果表 = new Map()
  for (const [序号, 本批] of 批次.entries()) {
    if (信号?.aborted) throw new Error('已停止生成')
    推送({ 类型: '状态', 内容: `正在生成讲稿第 ${序号 + 1}/${批次.length} 批（共 ${本批.length} 页）` })
    const 本批标识 = new Set(本批.map((页) => 页.页标识))
    const 用户内容 = '请为下列页面生成讲稿，只返回 JSON：\n' + JSON.stringify({
      风格,
      页列表: 本批.map((页) => ({ 页标识: 页.页标识, 标题: 页.标题 ?? '', 文本: 页.文本, 备注: 页.备注 ?? '' })),
    })
    const 模型文本 = await 调用模型({ 系统提示, 用户内容, 推送, 信号 })
    if (信号?.aborted) throw new Error('已停止生成')
    const 精简 = String(模型文本 ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    let 数据
    try { 数据 = JSON.parse(精简) } catch { throw new Error('模型返回的讲稿格式无效（可能被截断），未生成任何讲稿') }
    if (!是记录(数据) || !Array.isArray(数据.讲稿)) throw new Error('模型返回的讲稿格式无效（缺少讲稿数组），未生成任何讲稿')
    const 本批结果 = new Map()
    for (const 项 of 数据.讲稿) {
      if (!是记录(项) || typeof 项.页标识 !== 'string' || typeof 项.讲稿 !== 'string') throw new Error('模型返回的讲稿条目格式无效，未生成任何讲稿')
      if (!本批标识.has(项.页标识)) throw new Error(`模型返回了不属于本批的页标识：${项.页标识}`)
      if (本批结果.has(项.页标识)) throw new Error(`模型返回了重复页标识：${项.页标识}`)
      if (!项.讲稿.trim()) throw new Error(`第 ${项.页标识} 页的讲稿为空，已拒绝写入`)
      if (项.讲稿.length > 最大讲稿字数) throw new Error(`第 ${项.页标识} 页的讲稿过长：最多 ${最大讲稿字数} 个字符`)
      本批结果.set(项.页标识, 项.讲稿.trim())
    }
    for (const 项 of 本批标识) if (!本批结果.has(项)) throw new Error(`模型返回的讲稿缺少页标识：${项}`)
    for (const [标识, 讲稿] of 本批结果) 结果表.set(标识, 讲稿)
  }
  return { 讲稿: 待生成.map((页) => ({ 页标识: 页.页标识, 讲稿: 结果表.get(页.页标识) })), 批次: 批次.length }
}

/** 逐页合成讲解音频；失败页记录真实原因，成功页正常返回。 */
async function 合成讲解音频({ 讲稿, 语音配置, 请求, 缓存, 信号, 推送 = () => {} }) {
  if (!Array.isArray(讲稿)) throw new Error('讲稿列表格式无效')
  校验页列表(讲稿.map((项) => ({ 页标识: 项?.页标识, 文本: 项?.讲稿 ?? '' })))
  const 音频 = [], 失败 = []
  for (const [序号, 项] of 讲稿.entries()) {
    const 页标识 = 项.页标识, 内容 = String(项.讲稿 ?? '').trim()
    if (!内容) { 失败.push({ 页标识, 原因: '该页没有讲稿内容' }); continue }
    推送({ 类型: '状态', 内容: `正在合成第 ${序号 + 1}/${讲稿.length} 页讲解音频` })
    try {
      const 结果 = await 合成语音(内容, { 配置: 语音配置, 请求, 缓存, 信号 })
      音频.push({ 页标识, 缓存键: 结果.缓存键, 类型: 结果.类型, 字节数: 结果.字节数, 命中缓存: 结果.命中缓存, 音频: 结果.音频 })
    } catch (错误) {
      失败.push({ 页标识, 原因: 错误 instanceof Error ? 错误.message : '讲解音频合成失败' })
    }
  }
  return { 音频, 失败 }
}

module.exports = { 生成讲稿, 合成讲解音频 }
