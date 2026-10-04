const 种类表 = { 矩形: 'rect', 圆角矩形: 'roundRect', 椭圆: 'ellipse', 菱形: 'diamond', 三角形: 'triangle', 箭头: 'rightArrow', 星形: 'star5', 爱心: 'heart', 艺术字: 'rect', 连接线: 'line' }
const 转义 = 值 => String(值).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const 转EMU = 值 => Math.round(值 * 12700)
const 颜色 = 值 => { if (typeof 值 !== 'string' || !/^#[0-9a-f]{6}$/i.test(值)) throw new Error('原生对象颜色无效'); return 值.slice(1) }
function 校验字段(对象, 允许) { if (!对象 || typeof 对象 !== 'object' || Object.keys(对象).some(键 => !允许.includes(键))) throw new Error('原生对象含未知属性，已阻止有损保存') }
function 校验形状(对象) {
  校验字段(对象, ['id','类型','x','y','width','height','旋转','锁定','形状','连接','子对象标识'])
  if (对象.子对象标识 !== undefined) throw new Error('图形不能携带组合成员')
  const 形 = 对象.形状
  校验字段(形, ['种类','文本','填充','线条','线宽','颜色','字号','加粗'])
  if (!种类表[形.种类] || typeof 形.文本 !== 'string' || typeof 形.加粗 !== 'boolean' || !Number.isFinite(形.字号) || 形.字号 <= 0 || !Number.isFinite(形.线宽) || 形.线宽 < 0) throw new Error('原生形状数据无效')
  ;['填充','线条','颜色'].forEach(键 => 颜色(形[键]))
  if (形.种类 === '连接线' && !对象.连接) throw new Error('连接线缺少端点')
  if (对象.连接 && 形.种类 !== '连接线') throw new Error('非连接线对象不能携带端点')
  if (对象.连接) {
    校验字段(对象.连接,['起点','终点','起点位置','终点位置'])
    for (const 端 of [对象.连接.起点,对象.连接.终点]) { 校验字段(端,['对象','边']); if (typeof 端.对象 !== 'string' || !['左','右','上','下'].includes(端.边)) throw new Error('连接点数据无效') }
    for (const 点 of [对象.连接.起点位置,对象.连接.终点位置]) { 校验字段(点,['x','y']); if (!Number.isFinite(点.x) || !Number.isFinite(点.y)) throw new Error('连接点坐标无效') }
  }
}
function 非视觉(对象, 编号) {
  return `<p:cNvPr id="${编号}" name="seal-id:${Buffer.from(对象.id).toString('base64url')}" descr="seal-element:${Buffer.from(JSON.stringify(对象)).toString('base64url')}"/>`
}
function 文字(文本, 样式) {
  return `<a:bodyPr anchor="ctr"/><a:lstStyle/>${文本.split('\n').map(行 => `<a:p><a:pPr algn="${样式.对齐 === 'left' ? 'l' : 样式.对齐 === 'right' ? 'r' : 'ctr'}"/><a:r><a:rPr lang="zh-CN" sz="${Math.round(样式.字号 * 100)}" b="${样式.加粗 ? 1 : 0}"><a:solidFill><a:srgbClr val="${颜色(样式.颜色)}"/></a:solidFill><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/>${样式.艺术字 ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${颜色(样式.线条)}"/></a:solidFill></a:ln>` : ''}</a:rPr><a:t>${转义(行)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${Math.round(样式.字号 * 100)}"/></a:p>`).join('')}`
}
function 写入形状(对象, 编号, 原生标识) {
  校验形状(对象)
  const 形 = 对象.形状, 线 = 对象.连接
  const 翻转 = 线 ? `${线.终点位置.x < 线.起点位置.x ? ' flipH="1"' : ''}${线.终点位置.y < 线.起点位置.y ? ' flipV="1"' : ''}` : ''
  if (线) {
    const 起 = 原生标识?.get(线.起点.对象), 终 = 原生标识?.get(线.终点.对象), 点号 = { 上: 0, 左: 1, 下: 2, 右: 3 }
    if (!起 || !终) throw new Error('连接器引用的原生节点缺失')
    return `<p:cxnSp><p:nvCxnSpPr>${非视觉(对象,编号)}<p:cNvCxnSpPr><a:cxnSpLocks noMove="${对象.锁定 ? 1 : 0}" noResize="${对象.锁定 ? 1 : 0}"/><a:stCxn id="${起}" idx="${点号[线.起点.边]}"/><a:endCxn id="${终}" idx="${点号[线.终点.边]}"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${翻转}><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(Math.abs(线.终点位置.x-线.起点位置.x))}" cy="${转EMU(Math.abs(线.终点位置.y-线.起点位置.y))}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${转EMU(形.线宽)}"><a:solidFill><a:srgbClr val="${颜色(形.线条)}"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`
  }
  return `<p:sp><p:nvSpPr>${非视觉(对象, 编号)}<p:cNvSpPr><a:spLocks noMove="${对象.锁定 ? 1 : 0}" noResize="${对象.锁定 ? 1 : 0}"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm rot="${Math.round((对象.旋转 ?? 0) * 60000)}"${翻转}><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/></a:xfrm><a:prstGeom prst="${种类表[形.种类]}"><a:avLst/></a:prstGeom>${形.种类 === '艺术字' || 线 ? '<a:noFill/>' : `<a:solidFill><a:srgbClr val="${颜色(形.填充)}"/></a:solidFill>`}<a:ln w="${转EMU(形.线宽)}">${形.种类 === '艺术字' ? '<a:noFill/>' : `<a:solidFill><a:srgbClr val="${颜色(形.线条)}"/></a:solidFill>`}${线 ? '<a:tailEnd type="triangle"/>' : ''}</a:ln></p:spPr><p:txBody>${文字(形.文本, { ...形, 艺术字: 形.种类 === '艺术字' })}</p:txBody></p:sp>`
}
module.exports = { 写入形状, 校验形状, 校验字段, 非视觉, 文字, 颜色, 转EMU }
