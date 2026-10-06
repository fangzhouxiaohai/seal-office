// 演示语义校对：调用共用 AI 文本链路获取逐条建议，只产出候选，不直接修改正文。
// 本机规则检查属于「排版检查」，不得与本模块的智能语义分析混为一谈。
const { 分批, 校验译文可应用 } = require('./translate')

const 默认每批条数 = 10
const 默认每批字符 = 6000
const 问题类型列表 = ['语义', '表达', '用词', '结构', '一致性', '其他']

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

function 校验条目(条目) {
  if (!Array.isArray(条目) || 条目.length === 0) throw new Error('没有需要校对的内容')
  const 标识集合 = new Set()
  for (const 项 of 条目) {
    if (!是记录(项)) throw new Error('校对条目格式无效')
    if (typeof 项.对象标识 !== 'string' || !项.对象标识.trim()) throw new Error('校对条目的对象标识无效')
    if (标识集合.has(项.对象标识)) throw new Error(`条目中存在重复对象标识：${项.对象标识}`)
    标识集合.add(项.对象标识)
    if (typeof 项.原文 !== 'string') throw new Error(`对象 ${项.对象标识} 的原文格式无效`)
  }
  return 条目
}

function 解析建议(文本, 本批, 范围内标识) {
  const 精简 = String(文本 ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let 数据
  try { 数据 = JSON.parse(精简) } catch { throw new Error('模型返回的校对结果格式无效（可能被截断），未修改任何原文') }
  if (!是记录(数据) || !Array.isArray(数据.建议)) throw new Error('模型返回的校对结果格式无效（缺少建议数组），未修改任何原文')
  const 原文表 = new Map(本批.map((项) => [项.对象标识, 项.原文]))
  return 数据.建议.map((项) => {
    if (!是记录(项) || typeof 项.对象标识 !== 'string') throw new Error('模型返回的校对建议格式无效，未修改任何原文')
    if (!范围内标识.has(项.对象标识)) throw new Error(`模型返回了不属于本次校对范围的对象标识：${项.对象标识}`)
    if (typeof 项.问题类型 !== 'string' || !问题类型列表.includes(项.问题类型)) throw new Error(`对象 ${项.对象标识} 的建议格式无效：问题类型不在允许范围`)
    if (typeof 项.说明 !== 'string' || !项.说明.trim()) throw new Error(`对象 ${项.对象标识} 的建议格式无效：缺少说明`)
    if (typeof 项.建议文本 !== 'string' || !项.建议文本.trim()) throw new Error(`对象 ${项.对象标识} 的建议文本为空，已拒绝`)
    return { 对象标识: 项.对象标识, 原文: 原文表.get(项.对象标识) ?? '', 问题类型: 项.问题类型, 说明: 项.说明.trim(), 建议文本: 项.建议文本.trim() }
  })
}

/** 语义校对：调用注入的共用文本链路；结果只作为候选返回。 */
async function 语义校对({ 条目, 调用模型, 每批条数 = 默认每批条数, 每批字符 = 默认每批字符, 推送 = () => {}, 信号, 上限条数 = 2000 }) {
  if (typeof 调用模型 !== 'function') throw new Error('语义校对必须调用 AI 模型服务，不能使用本机规则冒充智能分析')
  const 清单 = 校验条目(条目)
  if (清单.length > 上限条数) throw new Error(`一次校对的条目过多：最多 ${上限条数} 条，请缩小范围`)
  const 待查 = 清单.filter((项) => 项.原文.trim().length > 0)
  if (待查.length === 0) throw new Error('没有需要校对的内容：所选对象的文本为空')
  const 批次数 = 分批(待查, Math.max(1, Math.floor(每批条数)), Math.max(500, Math.floor(每批字符)))
  const 系统提示 = [
    '你是中文商务演示文稿的语义校对助手，负责语义、表达、用词、结构与一致性问题。',
    '只输出一个 JSON 对象，形如 {"建议":[{"对象标识":"给定标识","问题类型":"语义","说明":"问题原因","建议文本":"修改后的完整文本"}]}。',
    `问题类型只能是：${问题类型列表.join('、')}。`,
    '没有问题的对象不要出现在建议中；不要把标点、空格或排版问题算作语义问题。',
    '对象标识必须原样返回，不得新增、改名或返回范围外的标识；不要输出解释或 Markdown 代码块。',
  ].join('\n')
  const 建议 = []
  for (const [序号, 批次] of 批次数.entries()) {
    if (信号?.aborted) throw new Error('已停止生成')
    推送({ 类型: '状态', 内容: `正在校对第 ${序号 + 1}/${批次数.length} 批（共 ${批次.length} 个对象）` })
    const 范围内标识 = new Set(批次.map((项) => 项.对象标识))
    const 用户内容 = '请校对下列条目，只返回 JSON：\n' + JSON.stringify({
      条目: 批次.map((项) => ({ 对象标识: 项.对象标识, 原文: 项.原文, ...(项.来源 ? { 来源: 项.来源 } : {}) })),
    })
    const 模型文本 = await 调用模型({ 系统提示, 用户内容, 推送, 信号 })
    if (信号?.aborted) throw new Error('已停止生成')
    建议.push(...解析建议(模型文本, 批次, 范围内标识))
  }
  return { 建议, 批次: 批次数.length, 检查对象数: 待查.length }
}

/** 应用建议前的原内容核对；复用统一的版本校验规则。 */
function 校验建议可应用(建议, 当前条目) {
  return 校验译文可应用(建议, 当前条目).map((项) => ({ 对象标识: 项.对象标识, 原文: 项.原文, 建议文本: 项.建议文本 }))
}

module.exports = { 语义校对, 校验建议可应用, 问题类型列表 }
