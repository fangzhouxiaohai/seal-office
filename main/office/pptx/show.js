// 自定义放映与全局放映设置的原生读写。
// 原生结构（已用真实文件反向核验，见 E:\DevCache\ppt-upgrade-evidence\task7\native-format-probe.md）：
//   ppt/presentation.xml 的 <p:custShowLst>（位于 <p:notesSz/> 之后）保存自定义放映列表，<p:sld r:id> 引用已有幻灯片关系；
//   ppt/presProps.xml 的 <p:showPr> 保存范围（p:sldAll / p:custShow@id / p:sldRg@st@end）、循环（@loop）与换片方式（@useTimings）。

const 标识前缀 = '放映-'

function 转义Xml(文本) {
  return String(文本).replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[字符]))
}

function 读取属性表(标签) {
  return Object.fromEntries([...标签.matchAll(/\s([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map((匹配) => [匹配[1], 匹配[3]]))
}

/** 幻灯片部件路径 → 关系标识；写入自定义放映时必须引用真实存在的幻灯片关系。 */
function 幻灯片关系表(关系Xml) {
  const 表 = new Map()
  for (const 匹配 of 关系Xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const 属性 = 读取属性表(匹配[0])
    if (!属性.Id || !属性.Type || !属性.Target) continue
    if (!属性.Type.endsWith('/slide')) continue
    const 目标 = 属性.Target.replace(/^\.\//, '')
    const 名称 = 目标.startsWith('/') ? 目标.slice(1) : `ppt/${目标}`
    表.set(名称, 属性.Id)
  }
  return 表
}

/**
 * 写入自定义放映列表。校验失败必须抛错，不能静默丢弃用户数据。
 * @returns 新的演示清单 XML
 */
function 写入自定义放映(清单Xml, 幻灯片列表, 关系Xml, 自定义放映) {
  const 去旧 = 清单Xml.replace(/<p:custShowLst\b[^>]*>[\s\S]*?<\/p:custShowLst>/g, '')
  if (自定义放映 === undefined || 自定义放映.length === 0) return 去旧
  const 页面标识集合 = new Set(幻灯片列表.map((页) => 页.id))
  const 关系 = 幻灯片关系表(关系Xml)
  const 片段 = 自定义放映.map((放映, 序号) => {
    if (!放映 || typeof 放映 !== 'object' || typeof 放映.名称 !== 'string' || 放映.名称.trim().length === 0 ||
        !Array.isArray(放映.页面标识列表) || 放映.页面标识列表.length === 0) {
      throw new Error('自定义放映参数无效：缺少名称或页面')
    }
    const 引用 = 放映.页面标识列表.map((标识) => {
      const 索引 = 幻灯片列表.findIndex((页) => 页.id === 标识)
      if (索引 < 0 || !页面标识集合.has(标识)) throw new Error(`自定义放映「${放映.名称}」引用了不存在的页面，已阻止有损保存`)
      const 关系标识 = 关系.get(`ppt/slides/slide${索引 + 1}.xml`)
      if (!关系标识) throw new Error(`自定义放映「${放映.名称}」的第 ${索引 + 1} 页缺少幻灯片关系，已阻止有损保存`)
      return `<p:sld r:id="${关系标识}"/>`
    }).join('')
    return `<p:custShow name="${转义Xml(放映.名称)}" id="${序号 + 1}"><p:sldLst>${引用}</p:sldLst></p:custShow>`
  }).join('')
  const 列表 = `<p:custShowLst>${片段}</p:custShowLst>`
  // 架构顺序：notesSz 之后、defaultTextStyle 之前
  const 笔记节点 = 去旧.match(/<p:notesSz\b[^>]*\/?>/)
  const 位置 = 笔记节点 ? 笔记节点.index + 笔记节点[0].length : 去旧.indexOf('<p:defaultTextStyle')
  if (位置 < 0) throw new Error('演示清单缺少插入自定义放映的位置，已阻止有损保存')
  return `${去旧.slice(0, 位置)}${列表}${去旧.slice(位置)}`
}

/** 写入全局放映设置；返回 null 表示无需写入。 */
function 写入放映设置(模型, 自定义放映 = []) {
  const 循环 = 模型.循环放映
  const 设置 = 模型.放映设置
  if (循环 === undefined && 设置 === undefined) return null
  if (循环 !== undefined && typeof 循环 !== 'boolean') throw new Error('循环放映状态无效')
  if (设置 !== undefined && (typeof 设置 !== 'object' || 设置 === null || Array.isArray(设置))) throw new Error('放映设置参数无效')
  const 属性 = []
  if (循环 !== undefined) 属性.push(`loop="${循环 ? 1 : 0}"`)
  属性.push(`useTimings="${设置?.换片方式 === '手动' ? 0 : 1}"`)
  const 范围 = 设置?.范围
  let 范围节点 = '<p:sldAll/>'
  if (范围?.类型 === '自定义放映') {
    const 序号 = 自定义放映.findIndex((项) => 项.id === 范围.放映标识)
    if (序号 < 0) throw new Error('放映范围引用的自定义放映不存在，已阻止有损保存')
    范围节点 = `<p:custShow id="${序号 + 1}"/>`
  } else if (范围?.类型 === '页码范围') {
    const 起 = 范围.起始, 止 = 范围.结束
    if (!Number.isInteger(起) || !Number.isInteger(止) || 起 < 1 || 止 < 起) throw new Error('放映页码范围无效')
    范围节点 = `<p:sldRg st="${起}" end="${止}"/>`
  } else if (范围 !== undefined && 范围?.类型 !== '全部') {
    throw new Error('放映范围类型无效')
  }
  return `<p:showPr ${属性.join(' ')}><p:present/>${范围节点}</p:showPr>`
}

/** 解析全局放映设置；无法完整表达的内容必须进入警告集合。 */
function 读取放映设置(放映节点, 原生标识映射, 警告) {
  if (!放映节点) return { 放映设置: undefined, 循环放映: undefined }
  const 首标签 = 放映节点.slice(0, 放映节点.indexOf('>') + 1)
  const 属性 = 读取属性表(首标签)
  const 未知属性 = Object.keys(属性).filter((键) => !['loop', 'useTimings'].includes(键))
  const 内容 = 放映节点.replace(/^<p:showPr[^>]*>/, '').replace(/<\/p:showPr>$/, '')
  const 子节点 = [...内容.matchAll(/<p:(sldAll|sldRg|custShow|present)\b[^>]*\/?>/g)].map((匹配) => 匹配[0])
  const 未知子节点 = 内容.replace(/<p:(?:sldAll|sldRg|custShow|present)\b[^>]*\/?>/g, '').trim()
  const 范围节点 = 子节点.find((项) => /<p:(?:sldAll|sldRg|custShow)\b/.test(项))
  let 范围
  if (!范围节点 || /<p:sldAll\b/.test(范围节点)) 范围 = { 类型: '全部' }
  else if (/<p:sldRg\b/.test(范围节点)) {
    const 起 = Number(读取属性表(范围节点).st), 止 = Number(读取属性表(范围节点).end)
    if (Number.isInteger(起) && Number.isInteger(止) && 起 >= 1 && 止 >= 起) 范围 = { 类型: '页码范围', 起始: 起, 结束: 止 }
  } else {
    const 我们的标识 = 原生标识映射.get(Number(读取属性表(范围节点).id))
    if (我们的标识) 范围 = { 类型: '自定义放映', 放映标识: 我们的标识 }
  }
  const 换片方式 = 属性.useTimings === undefined || ['1', 'true'].includes(属性.useTimings) ? '使用计时' : '手动'
  if (未知属性.length || 未知子节点 || 范围 === undefined ||
      !['0', '1', 'true', 'false'].includes(String(属性.loop ?? '0')) ||
      (属性.useTimings !== undefined && !['0', '1', 'true', 'false'].includes(属性.useTimings))) {
    警告.add('全局放映设置未完整导入')
  }
  return { 放映设置: { 范围: 范围 ?? { 类型: '全部' }, 换片方式 }, 循环放映: ['1', 'true'].includes(String(属性.loop)) }
}

/**
 * 解析自定义放映列表。引用不到真实页面、缺少标识或名称时丢弃该放映并告警，不假装完整导入。
 * 原生只保存数字标识与名称，读取时用「放映-<原生标识>」作为本机稳定标识，并用映射驱动放映范围。
 */
function 读取自定义放映(清单Xml, 关系映射, 页面标识列表, 警告) {
  const 整体 = 清单Xml.match(/<p:custShowLst\b[^>]*>([\s\S]*?)<\/p:custShowLst>/)
  if (!整体) return { 自定义放映: undefined, 原生标识映射: new Map() }
  const 结果 = []
  const 原生标识映射 = new Map()
  const 已用原生标识 = new Set()
  let 有丢弃 = false
  for (const 匹配 of 整体[1].matchAll(/<p:custShow\b[^>]*>([\s\S]*?)<\/p:custShow>/g)) {
    const 属性 = 读取属性表(匹配[0].slice(0, 匹配[0].indexOf('>') + 1))
    const 原生标识 = Number(属性.id)
    const 名称 = 属性.name
    if (!Number.isInteger(原生标识) || 原生标识 < 1 || 已用原生标识.has(原生标识) ||
        typeof 名称 !== 'string' || 名称.trim().length === 0) {
      有丢弃 = true
      continue
    }
    const 引用 = [...匹配[1].matchAll(/<p:sld\b[^>]*\/?>/g)].map((项) => 关系映射.get(读取属性表(项[0])['r:id']))
    if (引用.length === 0 || 引用.some((索引) => 索引 === undefined)) {
      有丢弃 = true
      continue
    }
    已用原生标识.add(原生标识)
    const 标识 = `${标识前缀}${原生标识}`
    原生标识映射.set(原生标识, 标识)
    结果.push({ id: 标识, 名称, 页面标识列表: 引用.map((索引) => 页面标识列表[索引]) })
  }
  if (有丢弃) 警告.add('自定义放映未完整导入')
  return { 自定义放映: 结果, 原生标识映射 }
}

module.exports = { 写入自定义放映, 写入放映设置, 读取放映设置, 读取自定义放映, 幻灯片关系表, 转义Xml }
