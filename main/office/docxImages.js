const path = require('path')
const { 读取图片信息, 文档最大图片字节 } = require('./imageData')

const 转义 = (文本) => String(文本).replace(/[&<>"']/g, (字) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[字]))
const 解码属性 = (文本) => 文本.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[\da-f]+|\d+);/gi, (项) => {
  const 标准 = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
  if (标准[项]) return 标准[项]
  const 数值 = 项.startsWith('&#x') ? parseInt(项.slice(3, -1), 16) : Number(项.slice(2, -1))
  return Number.isInteger(数值) && 数值 > 0 && 数值 <= 0x10ffff ? String.fromCodePoint(数值) : 项
})
function 属性(标签, 名称) {
  const 匹配 = 标签.match(new RegExp(`(?:^|\\s)${名称}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`))
  return 匹配 ? 解码属性(匹配[1] ?? 匹配[2]) : null
}

function Vml尺寸(内容, 轴) {
  const 样式 = 内容.match(/<v:shape(?=[\s>])[^>]*>/i)?.[0] || ''
  const 值 = 属性(样式, 'style')?.match(new RegExp(`(?:^|;)\\s*${轴}\\s*:\\s*([\\d.]+)(px|pt|in|cm|mm)`, 'i'))
  const 倍率 = { px: 1, pt: 4 / 3, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }
  return 值 ? Number(值[1]) * 倍率[值[2].toLowerCase()] : undefined
}

const 绘图正则 = () => /<w:(drawing|pict)(?=[\s>])[^>]*>[\s\S]*?<\/w:\1>/gi

/** 兼容标记中的各分支是同一对象的不同表示，只选一个可读分支。 */
function 选择兼容分支(正文, 图片) {
  const 标记 = /<mc:AlternateContent(?=[\s>])[^>]*>|<\/mc:AlternateContent\s*>/gi
  const 起点栈 = []
  const 替换 = []
  for (const 匹配 of 正文.matchAll(标记)) {
    if (!匹配[0].startsWith('</')) {
      起点栈.push({ 起点: 匹配.index, 内容起点: 匹配.index + 匹配[0].length })
    } else {
      const 开始 = 起点栈.pop()
      if (!开始 || 起点栈.length) continue
      const 内容 = 选择兼容分支(正文.slice(开始.内容起点, 匹配.index), 图片)
      const 分支 = [...内容.matchAll(/<mc:(Choice|Fallback)(?=[\s>])[^>]*>([\s\S]*?)<\/mc:\1\s*>/gi)]
      if (!分支.length) continue
      const 可读 = 分支.find((项) => {
        const 绘图 = [...项[2].matchAll(绘图正则())]
        return 绘图.length > 0 && 绘图.every((图) => 图片.has(图[0]))
      })
      const 选中 = 可读 ?? 分支.find((项) => 项[1] === 'Choice') ?? 分支[0]
      替换.push({ 起点: 开始.起点, 终点: 匹配.index + 匹配[0].length, 内容: 选中[2] })
    }
  }
  for (const 项 of 替换.reverse()) 正文 = 正文.slice(0, 项.起点) + 项.内容 + 正文.slice(项.终点)
  return 正文
}

/** 只读取包内真实引用的图片，关系与尺寸异常均加入导入风险。 */
async function 读取正文图片(压缩包, 正文, 警告) {
  const 文件 = 压缩包.file('word/_rels/document.xml.rels')
  const 关系Xml = 文件 ? await 文件.async('string') : ''
  const 关系 = new Map()
  for (const 匹配 of 关系Xml.matchAll(/<(?:[\w]+:)?Relationship(?=[\s/>])[^>]*>/g)) {
    const 标识 = 属性(匹配[0], 'Id')
    if (标识) 关系.set(标识, { 路径: 属性(匹配[0], 'Target'), 类型: 属性(匹配[0], 'Type'), 模式: 属性(匹配[0], 'TargetMode') })
  }
  const 结果 = new Map()
  const 对象警告 = new Map()
  const 缓存 = new Map()
  let 总字节 = 0
  for (const 匹配 of 正文.matchAll(绘图正则())) {
    const 内容 = 匹配[0]
    if (!/<(?:a:blip|v:imagedata)(?=[\s/>])/.test(内容)) continue
    const 当前警告 = []
    对象警告.set(内容, 当前警告)
    try {
      if ([...内容.matchAll(/<(?:a:blip|v:imagedata)(?=[\s/>])[^>]*>/g)].length !== 1) throw new Error('组合图片未完整导入')
      const 图像 = 内容.match(/<a:blip(?=[\s/>])[^>]*>/)?.[0] || 内容.match(/<v:imagedata(?=[\s/>])[^>]*>/)?.[0] || ''
      const 标识 = 属性(图像, 'r:embed') ?? 属性(图像, 'r:id')
      const 引用 = 关系.get(标识)
      if (属性(图像, 'r:link') || 引用?.模式 === 'External') throw new Error('外部链接图片未导入')
      if (!引用?.路径 || !引用.类型?.endsWith('/image')) throw new Error('图片未导入：图片关系缺失或无效')
      const 包内路径 = path.posix.normalize(引用.路径.startsWith('/') ? 引用.路径.slice(1) : `word/${引用.路径}`)
      const 图片文件 = 压缩包.file(包内路径)
      if (!图片文件) throw new Error('图片未导入：图片资源缺失')
      let 信息 = 缓存.get(包内路径)
      if (!信息) {
        const 字节 = await 图片文件.async('nodebuffer')
        总字节 += 字节.length
        if (总字节 > 文档最大图片字节) throw new Error('图片未导入：文档图片累计超过 100 MB')
        信息 = { 字节, ...读取图片信息(字节) }
        缓存.set(包内路径, 信息)
      }
      const 尺寸 = 内容.match(/<wp:extent(?=[\s/>])[^>]*>/)?.[0] || ''
      const Vml = 匹配[1] === 'pict'
      const 宽 = Vml ? Vml尺寸(内容, 'width') ?? 信息.宽 : Number(属性(尺寸, 'cx')) / 9525
      const 高 = Vml ? Vml尺寸(内容, 'height') ?? 信息.高 : Number(属性(尺寸, 'cy')) / 9525
      if (![宽, 高].every((值) => Number.isFinite(值) && 值 > 0 && 值 <= 32768)) throw new Error('图片未导入：图片显示尺寸无效')
      const 描述 = 内容.match(/<wp:docPr(?=[\s/>])[^>]*>/)?.[0] || 内容.match(/<v:shape(?=[\s>])[^>]*>/)?.[0] || ''
      const 说明 = 属性(描述, 'descr') ?? 属性(描述, 'title') ?? 属性(描述, 'alt') ?? 属性(图像, 'o:title') ?? ''
      if (/<wp:anchor(?=[\s>])/.test(内容) || Vml && /position\s*:\s*absolute/i.test(属性(描述, 'style') || '')) 当前警告.push('浮动图片排版未完整导入')
      const 裁剪 = 内容.match(/<a:srcRect(?=[\s/>])[^>]*>/)?.[0]
      if (裁剪 && ['l', 't', 'r', 'b'].some((键) => 属性(裁剪, 键) !== null && 属性(裁剪, 键) !== '0') ||
          /\s(?:crop(?:top|bottom|left|right)|rotation)="(?!0["\s])/.test(内容)) 当前警告.push('图片裁剪或旋转未完整导入')
      const 变换 = 内容.match(/<a:xfrm(?=[\s/>])[^>]*>/)?.[0] || ''
      if (属性(变换, 'rot') && 属性(变换, 'rot') !== '0' || ['flipH', 'flipV'].some((键) => ['1', 'true'].includes(属性(变换, 键)))) 当前警告.push('图片裁剪或旋转未完整导入')
      if (/<a:(?:tile|alphaModFix|alphaMod|alphaOff|duotone|lum|grayscl|biLevel|blur|glow|outerShdw)(?=[\s/>])/.test(内容)) 当前警告.push('图片特效未完整导入')
      结果.set(内容, `<img src="data:image/${信息.格式};base64,${信息.字节.toString('base64')}" width="${Math.round(宽)}" height="${Math.round(高)}" alt="${转义(说明)}" style="width:${宽}px;height:${高}px;max-width:100%">`)
    } catch (错误) {
      const 信息 = 错误.message || '图片未导入'
      当前警告.push(信息.startsWith('图片') || 信息.startsWith('外部') ? 信息 : `图片未导入：${信息}`)
    }
  }
  const 选中正文 = 选择兼容分支(正文, 结果)
  for (const 匹配 of 选中正文.matchAll(绘图正则())) 警告.push(...(对象警告.get(匹配[0]) || []))
  return { 正文: 选中正文, 图片: 结果 }
}

/** docx 8 的图片文件名固定为 png；按真实字节修正扩展名及对应关系。 */
async function 修正图片媒体(压缩包) {
  const 替换 = new Map()
  for (const 名称 of Object.keys(压缩包.files).filter((名) => /^word\/media\//.test(名) && !压缩包.files[名].dir)) {
    const 文件 = 压缩包.file(名称)
    const 字节 = await 文件.async('nodebuffer')
    const 信息 = 读取图片信息(字节)
    const 扩展 = 信息.格式 === 'jpeg' ? 'jpg' : 信息.格式
    const 新名称 = 名称.replace(/\.[^.]+$/, `.${扩展}`)
    if (新名称 === 名称) continue
    压缩包.file(新名称, 字节)
    压缩包.remove(名称)
    替换.set(名称.slice('word/'.length), 新名称.slice('word/'.length))
  }
  if (!替换.size) return
  for (const 名称 of Object.keys(压缩包.files).filter((名) => 名.endsWith('.rels'))) {
    const xml = await 压缩包.file(名称).async('string')
    压缩包.file(名称, xml.replace(/\bTarget="([^"]+)"/g, (原文, 地址) => 替换.has(地址) ? `Target="${替换.get(地址)}"` : 原文))
  }
}

module.exports = { 读取正文图片, 修正图片媒体 }
