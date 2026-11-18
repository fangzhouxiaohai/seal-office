const { 解析Xml树 } = require('./xmlTree')
const { 读取对象标识 } = require('./objectIds')

const 种类表 = new Map([['rect', '矩形'], ['roundRect', '圆角矩形'], ['ellipse', '椭圆'], ['line', '直线']])
const 子 = (节点, 名称) => 节点?.子.find(项 => 项.名称 === 名称)
const 是真 = 值 => 值 === '1' || 值 === 'true'
const RGB = 节点 => {
  const 值 = 子(子(节点, 'a:solidFill'), 'a:srgbClr')?.属性.val
  return /^[a-f0-9]{6}$/i.test(值 ?? '') ? '#' + 值.toUpperCase() : undefined
}

function 读取外部图形(xml, 路径, 页码) {
  const 对象列表 = [], 警告 = []
  const 剩余 = xml.replace(/<p:(sp|cxnSp)\b[^>]*>[\s\S]*?<\/p:\1>/g, 片段 => {
    if (!片段.includes('a:prstGeom') || /(?:descr|name)=["']seal-|<p:ph\b|<m:oMath/.test(片段)) return 片段
    const 根 = 解析Xml树(片段).子[0]
    const 非视觉 = 子(根.子[0], 'p:cNvPr')
    const 外观 = 子(根, 'p:spPr'), 几何 = 子(外观, 'a:prstGeom')
    const 种类 = 种类表.get(几何?.属性.prst)
    const 定位 = '第 ' + 页码 + ' 页图形「' + (非视觉?.属性.name || 非视觉?.属性.id || '未命名') + '」'
    if (!种类) {
      警告.push(定位 + '的几何类型 ' + 几何?.属性.prst + ' 未导入')
      return 片段
    }
    const 含文字 = /<a:t\b/.test(片段)
    // 纯矩形文本框继续使用文本框模型，保留其主题、占位符和字符格式。
    if (含文字 && 种类 === '矩形' && !子(外观,'a:solidFill') && !RGB(子(外观,'a:ln'))) return 片段
    const 变换 = 子(外观, 'a:xfrm'), 位置 = 子(变换, 'a:off'), 尺寸 = 子(变换, 'a:ext')
    const [x,y,w,h] = [位置?.属性.x,位置?.属性.y,尺寸?.属性.cx,尺寸?.属性.cy].map(值 => Number(值) / 12700)
    const 旋转 = Number(变换?.属性.rot ?? 0) / 60000
    if (!非视觉?.属性.id || ![x,y,w,h,旋转].every(Number.isFinite) || w < 0 || h < 0 || (!w || !h) && (种类 !== '直线' || !w && !h)) {
      警告.push(定位 + '的位置或尺寸无效，图形未完整导入')
      return 片段
    }
    const 段落 = 子(根,'p:txBody')?.子.filter(项 => 项.名称 === 'a:p') ?? []
    const 片段列表 = 段落.flatMap(段 => 段.子.filter(项 => 项.名称 === 'a:r' || 项.名称 === 'a:fld'))
    const 样式 = 子(片段列表[0], 'a:rPr')
    const 字体 = 子(样式,'a:ea')?.属性.typeface || 子(样式,'a:latin')?.属性.typeface
    const 字号 = Number(样式?.属性.sz ?? 1800) / 100
    const 对齐 = { l:'left', r:'right', ctr:'center' }[子(段落[0],'a:pPr')?.属性.algn] ?? 'left'
    const 线 = 子(外观,'a:ln'), 线色 = RGB(线), 填充 = RGB(外观)
    const 线宽 = (线 && !子(线,'a:noFill') && (线色 || 种类 === '直线')) ? Number(线.属性.w ?? 12700) / 12700 : 0
    if (!Number.isFinite(字号) || 字号 <= 0 || !Number.isFinite(线宽) || 线宽 < 0) {
      警告.push(定位 + '的字号或边框宽度无效，未完整导入')
      return 片段
    }
    const 方向 = !w ? '垂直' : !h ? '水平' : 是真(变换.属性.flipH) !== 是真(变换.属性.flipV) ? '上升' : '下降'
    对象列表.push({
      id: 读取对象标识(非视觉.属性.name, 路径, 非视觉.属性.id), 类型:'图形', x, y,
      width:w || 1, height:h || 1, ...(旋转 ? { 旋转 } : {}),
      形状:{
        种类, 文本: 段落.map(段 => 段.子.map(项 => 项.名称 === 'a:br' ? '\n' : 子(项,'a:t')?.文本 ?? '').join('')).join('\n'),
        填充:填充 ?? '#FFFFFF', ...(!填充 ? { 无填充:true } : {}),
        线条:线色 ?? '#000000', 线宽, 字号, 颜色:RGB(样式) ?? '#000000', 加粗:是真(样式?.属性.b),
        ...(字体 ? { 字体 } : {}), 对齐, ...(种类 === '直线' ? { 方向 } : {}),
      },
    })
    if (/<(?:a:(?:gradFill|pattFill|blipFill|schemeClr|alpha|gd|headEnd|tailEnd|hlinkClick|[\w]+3d|stCxn|endCxn|effectLst|effectDag|buChar|buAutoNum|spcBef|spcAft|lnSpc)|p:style)\b|<a:prstDash\b[^>]*val="(?!solid")/.test(片段))
      警告.push(定位 + '的主题、线型或装饰效果未完整导入')
    if (含文字 && (new Set(片段列表.map(项 => JSON.stringify(子(项,'a:rPr')))).size > 1 ||
        /<a:rPr\b[^>]*(?:\bi="(?:1|true)"|\bu="(?!none"))|<a:bodyPr\b[^>]*(?:anchor="(?!ctr")|vert=|rot=)/.test(片段)))
      警告.push(定位 + '的文字排版未完整导入')
    return ''
  })
  return { 对象列表, 剩余, 警告 }
}
module.exports = { 读取外部图形 }
