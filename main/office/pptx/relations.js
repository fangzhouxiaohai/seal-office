const path = require('path')
const sax = require('sax')
const { 解析部件路径, 读取部件 } = require('./parts')

function 解析关系(xml, 来源) {
  const 关系 = new Map()
  const 解析器 = sax.parser(true)
  let 深度 = 0, 根数量 = 0
  const 拒绝 = (原因) => { throw new Error(`演示文件无效：关系文件${原因}（${来源}）`) }
  解析器.onerror = () => 拒绝('结构损坏')
  解析器.ondoctype = () => 拒绝('包含不允许的文档类型')
  解析器.onopentag = 标签 => {
    if (深度 === 0) {
      if (++根数量 !== 1 || 标签.name !== 'Relationships') 拒绝('根节点损坏')
    } else {
      if (深度 !== 1 || 标签.name !== 'Relationship') 拒绝('节点结构损坏')
      const { Id, Type, Target, TargetMode } = 标签.attributes
      if (!Id || !Type || !Target || (TargetMode !== undefined && !['Internal', 'External'].includes(TargetMode))) 拒绝('属性无效')
      if (关系.has(Id)) 拒绝(`标识重复：${Id}`)
      关系.set(Id, { 标识: Id, 类型: Type, 外部: TargetMode === 'External', 目标: TargetMode === 'External' ? Target : 解析部件路径(来源, Target) })
    }
    深度++
  }
  解析器.onclosetag = () => { 深度-- }
  解析器.ontext = 文本 => { if (文本.trim()) 拒绝('包含非预期文本') }
  解析器.oncdata = () => 拒绝('包含非预期文本')
  解析器.write(xml).close()
  if (根数量 !== 1 || 深度 !== 0) 拒绝('结构损坏')
  return 关系
}

async function 读取关系(压缩包, 来源) {
  const 路径 = path.posix.join(path.posix.dirname(来源), '_rels', `${path.posix.basename(来源)}.rels`)
  if (!压缩包.file(路径)) return new Map()
  return 解析关系(await 读取部件(压缩包, 路径).async('string'), 来源)
}

async function 关联目标(压缩包, 来源, 类型) {
  const 目标 = []
  for (const 关系 of (await 读取关系(压缩包, 来源)).values()) {
    if (关系.外部 || !关系.类型.endsWith(`/${类型}`)) continue
    读取部件(压缩包, 关系.目标)
    目标.push(关系.目标)
  }
  return 目标
}

module.exports = { 解析关系, 读取关系, 关联目标 }
