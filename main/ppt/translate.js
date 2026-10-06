// 演示翻译编排：按对象标识分批调用共用 AI 文本链路，接收结构化译文。
// 不使用固定词库；缺失对象、重复标识、越界标识、空译文与截断一律拒绝，绝不覆盖原文。
const 默认每批条数 = 12
const 默认每批字符 = 6000

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

function 校验条目(条目) {
  if (!Array.isArray(条目) || 条目.length === 0) throw new Error('没有需要翻译的内容')
  const 标识集合 = new Set()
  for (const 项 of 条目) {
    if (!是记录(项)) throw new Error('翻译条目格式无效')
    if (typeof 项.对象标识 !== 'string' || !项.对象标识.trim()) throw new Error('翻译条目的对象标识无效')
    if (标识集合.has(项.对象标识)) throw new Error(`条目中存在重复对象标识：${项.对象标识}`)
    标识集合.add(项.对象标识)
    if (typeof 项.原文 !== 'string') throw new Error(`对象 ${项.对象标识} 的原文格式无效`)
  }
  return 条目
}

function 规范术语(术语表) {
  if (术语表 === undefined) return []
  if (!Array.isArray(术语表) || 术语表.length > 200) throw new Error('术语表格式无效：最多 200 条')
  return 术语表.map((项) => {
    if (!是记录(项) || typeof 项.原文 !== 'string' || typeof 项.译文 !== 'string' || !项.原文.trim() || !项.译文.trim()) {
      throw new Error('术语表条目格式无效')
    }
    return { 原文: 项.原文.trim(), 译文: 项.译文.trim() }
  })
}

function 分批(待译, 每批条数, 每批字符) {
  const 批次 = []
  let 当前 = [], 字符数 = 0
  for (const 项 of 待译) {
    const 长度 = 项.原文.length + 项.对象标识.length + 16
    if (当前.length && (当前.length >= 每批条数 || 字符数 + 长度 > 每批字符)) {
      批次.push(当前); 当前 = []; 字符数 = 0
    }
    当前.push(项); 字符数 += 长度
  }
  if (当前.length) 批次.push(当前)
  return 批次
}

function 解析译文(文本, 本批标识) {
  const 精简 = String(文本 ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let 数据
  try { 数据 = JSON.parse(精简) } catch { throw new Error('模型返回的译文格式无效（可能被截断），未修改任何原文') }
  if (!是记录(数据) || !Array.isArray(数据.译文)) throw new Error('模型返回的译文格式无效（缺少译文数组），未修改任何原文')
  const 表 = new Map()
  for (const 项 of 数据.译文) {
    if (!是记录(项) || typeof 项.对象标识 !== 'string' || typeof 项.译文 !== 'string') throw new Error('模型返回的译文条目格式无效，未修改任何原文')
    if (!本批标识.has(项.对象标识)) throw new Error(`模型返回了不属于请求批次的对象标识：${项.对象标识}`)
    if (表.has(项.对象标识)) throw new Error(`模型返回了重复对象标识：${项.对象标识}`)
    表.set(项.对象标识, 项.译文)
  }
  for (const 项 of 本批标识) if (!表.has(项)) throw new Error(`模型返回的译文缺少对象标识：${项}`)
  return 表
}

/** 调用共用文本模型链路完成翻译；调用模型 由调用方注入（主进程使用统一 AI 服务）。 */
async function 翻译条目({ 条目, 目标语言, 术语表, 调用模型, 每批条数 = 默认每批条数, 每批字符 = 默认每批字符, 推送 = () => {}, 信号, 上限条数 = 2000 }) {
  if (typeof 调用模型 !== 'function') throw new Error('翻译必须调用 AI 模型服务，不能使用固定词库')
  if (typeof 目标语言 !== 'string' || !目标语言.trim()) throw new Error('请选择有效的目标语言')
  if (!/^[A-Za-z][A-Za-z-]{1,9}$/.test(目标语言.trim())) throw new Error('目标语言格式无效：请使用 zh、en、ja 一类语言代码')
  const 清单 = 校验条目(条目)
  if (清单.length > 上限条数) throw new Error(`一次翻译的条目过多：最多 ${上限条数} 条，请缩小范围`)
  const 术语 = 规范术语(术语表)
  const 待译 = 清单.filter((项) => 项.原文.trim().length > 0)
  if (待译.length === 0) throw new Error('没有需要翻译的内容：所选对象的文本为空')
  const 批次数 = 分批(待译, Math.max(1, Math.floor(每批条数)), Math.max(500, Math.floor(每批字符)))
  const 结果表 = new Map()
  const 系统提示 = [
    '你是专业翻译。只输出一个 JSON 对象，形如 {"译文":[{"对象标识":"给定标识","译文":"译文"}]}。',
    '必须为请求中的每一个对象标识返回且只返回一条译文，不得增删、改名或合并条目；译文只能是纯文本。',
    '保留原文中的数字、专有名词与换行；术语表优先级最高；不确定时保留原文而不是编造。',
    '不要输出解释、Markdown 代码块或思考过程。',
  ].join('\n')
  for (const [序号, 批次] of 批次数.entries()) {
    if (信号?.aborted) throw new Error('已停止生成')
    推送({ 类型: '状态', 内容: `正在翻译第 ${序号 + 1}/${批次数.length} 批（共 ${批次.length} 个对象）` })
    const 本批标识 = new Set(批次.map((项) => 项.对象标识))
    const 用户内容 = `请把下列条目翻译成 ${目标语言.trim()}，只返回 JSON：\n` + JSON.stringify({
      目标语言: 目标语言.trim(),
      ...(术语.length ? { 术语 } : {}),
      条目: 批次.map((项) => ({ 对象标识: 项.对象标识, 原文: 项.原文, ...(项.来源 ? { 来源: 项.来源 } : {}) })),
    })
    const 模型文本 = await 调用模型({ 系统提示, 用户内容, 推送, 信号 })
    if (信号?.aborted) throw new Error('已停止生成')
    const 本批译文 = 解析译文(模型文本, 本批标识)
    for (const 项 of 批次) {
      const 译文 = 本批译文.get(项.对象标识)
      if (typeof 译文 !== 'string' || !译文.trim()) throw new Error(`对象 ${项.对象标识} 的译文为空，已拒绝写入`)
      结果表.set(项.对象标识, 译文.trim())
    }
  }
  const 译文 = 清单.filter((项) => 结果表.has(项.对象标识)).map((项) => ({ 对象标识: 项.对象标识, 原文: 项.原文, 译文: 结果表.get(项.对象标识) }))
  return { 译文, 批次: 批次数.length, 跳过: 清单.length - 译文.length }
}

/** 应用候选前核对原内容版本；对象消失或原文变化一律阻止覆盖。 */
function 校验译文可应用(候选, 当前条目) {
  if (!Array.isArray(候选) || !Array.isArray(当前条目)) throw new Error('译文候选或当前内容格式无效')
  const 当前表 = new Map(当前条目.map((项) => [项.对象标识, 项.原文]))
  return 候选.map((项) => {
    if (!当前表.has(项.对象标识)) throw new Error(`对象已不存在，已阻止覆盖：${项.对象标识}`)
    if (当前表.get(项.对象标识) !== 项.原文) throw new Error(`对象 ${项.对象标识} 的原文已变化，已阻止覆盖`)
    return 项
  })
}

module.exports = { 翻译条目, 校验译文可应用, 分批 }
