const JSZip = require('jszip')
const pptxgen = require('pptxgenjs')
const path = require('path')

// 画布 960×540 像素按 72dpi 折算为 13.33×7.5 英寸（LAYOUT_WIDE）
const 像素转英寸 = (像素) => Math.round((像素 / 72) * 10000) / 10000
// OOXML 的 EMU（每英寸 914400）按同一 72dpi 基准折算回画布像素
const EMU转像素 = (emu) => Math.round((Number(emu) / 12700) * 100) / 100

/** 去掉颜色值里的 #，pptxgenjs 只接受无井号的十六进制 */
const 规整颜色 = (颜色, 默认) => {
  if (typeof 颜色 !== 'string') return 默认
  const 文本 = 颜色.replace(/^#/, '').toUpperCase()
  return /^[0-9A-F]{6}$/.test(文本) ? 文本 : 默认
}

/** 从幻灯片实际内容判断当前文本框解析器会跳过的对象。 */
function 收集幻灯片警告(xml, 警告) {
  const 有标签 = (标签) => new RegExp(`<${标签}[\\s/>]`, 'i').test(xml)
  if (有标签('p:pic')) 警告.add('图片未导入')
  const 无文字图形 = Array.from(xml.matchAll(/<p:sp(?:\s[^>]*)?>([\s\S]*?)<\/p:sp>/gi))
    .some((匹配) => !/<a:t[\s/>]/i.test(匹配[1]) && /<(?:p:spPr|a:prstGeom|a:xfrm)[\s/>]/i.test(匹配[1]))
  if (无文字图形 || 有标签('p:cxnSp')) 警告.add('图形未导入')
  if (有标签('p:graphicFrame')) 警告.add('图表或表格未导入')
  if (有标签('p:video') || 有标签('p:audio') || 有标签('a:videoFile') || 有标签('a:audioFile')) 警告.add('媒体未导入')
  if (有标签('p:timing')) 警告.add('动画未导入')
  if (有标签('p:transition')) 警告.add('幻灯片切换效果未导入')
}

/** 按部件关系寻找实际关联的版式和母版，忽略压缩包中的孤立资源。 */
async function 关联目标(压缩包, 来源, 关系类型) {
  const 关系路径 = path.posix.join(path.posix.dirname(来源), '_rels', `${path.posix.basename(来源)}.rels`)
  const 关系文件 = 压缩包.file(关系路径)
  if (关系文件 === null) return []
  const xml = await 关系文件.async('string')
  const 目标列表 = []
  for (const 匹配 of xml.matchAll(/<Relationship\b[^>]*\/?\s*>/gi)) {
    const 标签 = 匹配[0]
    const 类型 = 标签.match(/\bType="([^"]+)"/i)?.[1]
    const 目标 = 标签.match(/\bTarget="([^"]+)"/i)?.[1]
    const 模式 = 标签.match(/\bTargetMode="([^"]+)"/i)?.[1]
    if (!类型?.endsWith(`/${关系类型}`) || !目标 || 模式 === 'External') continue
    目标列表.push(目标.startsWith('/') ? 目标.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(来源), 目标)))
  }
  return 目标列表
}

async function 收集母版警告(压缩包, 幻灯片文件名, 警告) {
  for (const 幻灯片路径 of 幻灯片文件名) {
    for (const 版式路径 of await 关联目标(压缩包, 幻灯片路径, 'slideLayout')) {
      for (const 母版路径 of await 关联目标(压缩包, 版式路径, 'slideMaster')) {
        const 母版文件 = 压缩包.file(母版路径)
        if (母版文件 === null) continue
        const xml = await 母版文件.async('string')
        if (/<p:(?:pic|graphicFrame|cxnSp)[\s/>]/i.test(xml) || /<p:sp(?:\s[^>]*)?>[\s\S]*?<a:prstGeom[\s/>]/i.test(xml)) {
          警告.add('母版图形未导入')
          return
        }
      }
    }
  }
}

async function 读取pptx(数据) {
  const 压缩包 = await JSZip.loadAsync(Buffer.from(数据))
  const 文件名 = Object.keys(压缩包.files)
    .filter((名称) => /^ppt\/slides\/slide\d+\.xml$/.test(名称))
    .sort((甲, 乙) => 甲.localeCompare(乙, undefined, { numeric: true }))
  const 幻灯片列表 = []
  const 警告 = new Set()
  for (const 名称 of 文件名) {
    const xml = await 压缩包.file(名称).async('string')
    收集幻灯片警告(xml, 警告)
    幻灯片列表.push(解析幻灯片Xml(xml, 幻灯片列表.length))
  }
  await 收集母版警告(压缩包, 文件名, 警告)
  if (幻灯片列表.length === 0) {
    幻灯片列表.push({
      id: 'slide-0',
      title: '新建幻灯片',
      版式: '标题幻灯片',
      背景色: '#FFFFFF',
      文本框列表: [
        {
          id: 'box-0-title',
          x: 80,
          y: 60,
          width: 800,
          height: 120,
          text: '单击此处添加标题',
          字号: 40,
          加粗: true,
          斜体: false,
          下划线: false,
          颜色: '#1A1D24',
          对齐: 'center',
        },
      ],
    })
  }
  return {
    演示文稿: {
      id: 'deck-imported',
      name: '导入演示文稿',
      幻灯片列表,
      当前索引: 0,
    },
    警告: Array.from(警告),
  }
}

/** 解析单张幻灯片 XML：背景色 + 各形状的位置与文字样式 */
function 解析幻灯片Xml(xml, 序号) {
  // 幻灯片背景色
  let 背景色 = '#FFFFFF'
  const 背景匹配 = xml.match(/<p:bg>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"[\s\S]*?<\/p:bg>/)
  if (背景匹配 !== null) {
    背景色 = `#${背景匹配[1].toUpperCase()}`
  }
  const 文本框列表 = []
  const 形状正则 = /<p:sp>([\s\S]*?)<\/p:sp>/g
  let 形状匹配
  while ((形状匹配 = 形状正则.exec(xml)) !== null) {
    const 解析 = 解析形状Xml(形状匹配[1], 序号, 文本框列表.length)
    if (解析 !== null) 文本框列表.push(解析)
  }
  // 宽松回退：形状级解析无结果时（如手工构造的最小 XML），按裸 <a:t> 提取
  if (文本框列表.length === 0) {
    const 文本列表 = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g), (匹配) => 解码(匹配[1]))
      .filter((项) => 项.trim().length > 0)
    if (文本列表.length > 0) {
      const 标题文本 = 文本列表[0]
      const 正文文本 = 文本列表.slice(1)
      文本框列表.push({
        id: `box-${序号}-title`,
        x: 80,
        y: 60,
        width: 800,
        height: 120,
        text: 标题文本,
        字号: 40,
        加粗: true,
        斜体: false,
        下划线: false,
        颜色: '#1A1D24',
        对齐: 'center',
      })
      if (正文文本.length > 0) {
        文本框列表.push({
          id: `box-${序号}-content`,
          x: 80,
          y: 220,
          width: 800,
          height: 240,
          text: 正文文本.join('\n'),
          字号: 24,
          加粗: false,
          斜体: false,
          下划线: false,
          颜色: '#1A1D24',
          对齐: 'left',
        })
      }
    }
  }
  const 首框 = 文本框列表[0]
  const 标题文本 = 首框 !== undefined ? 首框.text.split('\n')[0] : '幻灯片'
  return {
    id: `slide-${序号}`,
    title: 标题文本,
    版式: 文本框列表.length > 1 ? '标题和内容' : '标题幻灯片',
    背景色,
    文本框列表,
  }
}

/** 解析单个 <p:sp> 形状；无文字时返回 null */
function 解析形状Xml(形状Xml, 序号, 框序号) {
  const 文本列表 = Array.from(形状Xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g), (匹配) => 解码(匹配[1]))
  // 无文字的装饰形状不导入为文本框
  const 合并文本 = 文本列表.filter((项) => 项.trim().length > 0).join('\n')
  if (合并文本.length === 0) {
    return null
  }
  // 位置与尺寸（EMU → 画布像素），缺省时给一个居中偏上的默认框
  const 位置 = 形状Xml.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/)
  const 尺寸 = 形状Xml.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/)
  // 字符样式取首个带样式的 rPr；对齐取首个 pPr
  const 首个rPr = 形状Xml.match(/<a:rPr([^>]*)\/?>/)
  const 字号 = 首个rPr !== null && /sz="(\d+)"/.test(首个rPr[1]) ? Number(RegExp.$1) / 100 : 24
  const 颜色匹配 = 形状Xml.match(/<a:rPr[^>]*>[\s\S]{0,400}?<a:srgbClr val="([0-9A-Fa-f]{6})"/)
  const 对齐匹配 = 形状Xml.match(/<a:pPr[^>]*algn="(\w+)"/)
  return {
    id: `box-${序号}-${框序号}`,
    x: 位置 !== null ? EMU转像素(位置[1]) : 80,
    y: 位置 !== null ? EMU转像素(位置[2]) : 60,
    width: 尺寸 !== null ? EMU转像素(尺寸[1]) : 800,
    height: 尺寸 !== null ? EMU转像素(尺寸[2]) : 120,
    text: 合并文本,
    字号: Math.min(Math.max(Math.round(字号), 8), 96),
    加粗: 首个rPr !== null && /b="1"/.test(首个rPr[1]),
    斜体: 首个rPr !== null && /i="1"/.test(首个rPr[1]),
    下划线: false,
    颜色: 颜色匹配 !== null ? `#${颜色匹配[1].toUpperCase()}` : '#1A1D24',
    对齐: 对齐匹配 !== null ? 对齐映射(对齐匹配[1]) : 'left',
  }
}

const 对齐映射 = (algn) => {
  if (algn === 'ctr') return 'center'
  if (algn === 'r' || algn === 'end') return 'right'
  return 'left'
}

async function 写入pptx(模型) {
  const 文稿 = new pptxgen()
  文稿.layout = 'LAYOUT_WIDE'
  // 富格式契约：{ 幻灯片: [{ 背景色, 文本框: [{ x, y, width, height, text, 字号, 加粗, 斜体, 颜色, 对齐, 片段 }] }] }
  // 旧契约 { 幻灯片: [{ 文本 }] } 与 { 幻灯片列表: [{ 标题, 内容 }] } 仍兼容。
  let 幻灯片列表 = []
  if (模型 && Array.isArray(模型.幻灯片)) {
    幻灯片列表 = 模型.幻灯片
  } else if (模型 && Array.isArray(模型.幻灯片列表)) {
    幻灯片列表 = 模型.幻灯片列表
  }
  if (幻灯片列表.length === 0) 幻灯片列表.push({ 文本: '' })
  幻灯片列表.forEach((幻灯片数据) => {
    const 页面 = 文稿.addSlide()
    const 背景 = 规整颜色(幻灯片数据.背景色, 'FFFFFF')
    页面.background = { color: 背景 }
    if (Array.isArray(幻灯片数据.文本框)) {
      // 富格式：逐文本框按位置与样式写入
      幻灯片数据.文本框.forEach((框) => {
        const 公共样式 = {
          x: 像素转英寸(框.x ?? 80),
          y: 像素转英寸(框.y ?? 60),
          w: 像素转英寸(框.width ?? 800),
          h: 像素转英寸(框.height ?? 120),
          fontSize: typeof 框.字号 === 'number' && 框.字号 > 0 ? 框.字号 : 24,
          bold: 框.加粗 === true,
          italic: 框.斜体 === true,
          color: 规整颜色(框.颜色, '1A1D24'),
          align: 框.对齐 === 'center' ? 'center' : 框.对齐 === 'right' ? 'right' : 'left',
          fontFace: 'Microsoft YaHei',
          valign: 'top',
        }
        if (Array.isArray(框.片段) && 框.片段.length > 0) {
          const 运行列表 = 框.片段
            .filter((片段) => 片段 && typeof 片段.文本 === 'string')
            .map((片段) => ({
              text: 片段.文本,
              options: {
                bold: 片段.加粗 === true || 公共样式.bold,
                italic: 片段.斜体 === true || 公共样式.italic,
                color: 规整颜色(片段.颜色, 公共样式.color),
                underline: 片段.下划线 === true ? { style: 'sng' } : undefined,
              },
            }))
          if (运行列表.length > 0) {
            页面.addText(运行列表, 公共样式)
            return
          }
        }
        页面.addText(typeof 框.text === 'string' ? 框.text : '', 公共样式)
      })
      return
    }
    // 旧契约：把文本压平进单个文本框
    let 文本内容 = ''
    if (typeof 幻灯片数据.文本 === 'string') {
      文本内容 = 幻灯片数据.文本
    } else {
      const 片段列表 = []
      if (幻灯片数据.标题) 片段列表.push(幻灯片数据.标题)
      if (Array.isArray(幻灯片数据.内容)) {
        幻灯片数据.内容.forEach((项) => {
          if (项 && typeof 项.文字 === 'string') 片段列表.push(项.文字)
        })
      }
      文本内容 = 片段列表.join('\n')
    }
    const 行列表 = 文本内容.split('\n')
    if (行列表.length === 0) {
      页面.addText('', { x: 0.5, y: 0.5, w: 10, h: 0.5, fontFace: 'Microsoft YaHei', fontSize: 24 })
    } else {
      const 段落列表 = 行列表.map((行) => ({
        text: 行,
        options: { fontFace: 'Microsoft YaHei', fontSize: 24, color: '1A1D24', breakLine: true },
      }))
      if (段落列表.length > 0) 段落列表[段落列表.length - 1].options.breakLine = false
      页面.addText(段落列表, { x: 0.5, y: 0.5, w: 11, h: 7 })
    }
  })
  return Buffer.from(await 文稿.write({ outputType: 'arraybuffer' }))
}

function 解码(文本) {
  const 实体映射 = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }
  // 单次正则匹配所有命名实体和数字实体（十进制/十六进制），避免顺序问题
  return 文本.replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (匹配) => {
    if (匹配 in 实体映射) {
      return 实体映射[匹配]
    }
    if (匹配.startsWith('&#x')) {
      return String.fromCharCode(parseInt(匹配.slice(3, -1), 16))
    }
    return String.fromCharCode(parseInt(匹配.slice(2, -1), 10))
  })
}

module.exports = { 读取pptx, 写入pptx }
