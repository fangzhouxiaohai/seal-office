const 效果表 = { 无: '', 淡入淡出: 'fade', 推进: 'push', 切出: 'cut', 擦除: 'wipe', 形状: 'zoom', 抽出: 'pull', 分割: 'split', 溶解: 'dissolve', 涟漪: 'p14:ripple', 新闻快报: 'newsflash', 轮辐: 'wheel', 百叶窗: 'blinds', 梳理: 'comb', 平滑: 'p14:morph' }
const 方向表 = { 左: 'l', 右: 'r', 上: 'u', 下: 'd' }
const 辐条取值 = [1, 2, 3, 4, 6, 8, 12]
/** 各效果允许的原生属性；未登记属性一律判为未完整导入。 */
const 属性表 = { push: ['dir'], wipe: ['dir'], pull: ['dir'], zoom: ['dir'], split: ['orient', 'dir'], blinds: ['dir'], comb: ['dir'], wheel: ['spokes'], morph: ['option'] }
const 子标签 = '<((?:p|p14):(?:fade|push|cut|wipe|zoom|pull|split|dissolve|ripple|newsflash|wheel|blinds|comb|morph))\\b([^>]*)\\/>'

function 校验切换设置(s, w) {
  if (!(s.效果 in 效果表) || !Number.isInteger(s.持续毫秒) || s.持续毫秒 < 0 || s.持续毫秒 > 60000 || !(s.方向 in 方向表) || !['内','外'].includes(s.方式) || !['水平','垂直'].includes(s.轴)) throw new Error('不支持或无效的幻灯片切换参数')
  if (s.辐条 !== undefined && (s.效果 !== '轮辐' || !辐条取值.includes(s.辐条))) throw new Error('不支持或无效的幻灯片切换参数：辐条只适用于轮辐')
  if (typeof w.单击 !== 'boolean' || (w.自动毫秒 !== undefined && (!Number.isInteger(w.自动毫秒) || w.自动毫秒 < 100 || w.自动毫秒 > 86400000))) throw new Error('不支持或无效的幻灯片切换参数')
}
function 子节点(s) {
  const 名称 = 效果表[s.效果]
  if (!名称) return ''
  const 标签 = 名称.startsWith('p14:') ? 名称 : `p:${名称}`
  if (['push', 'wipe', 'pull'].includes(名称)) return `<${标签} dir="${方向表[s.方向]}"/>`
  if (名称 === 'zoom') return `<${标签} dir="${s.方式 === '内' ? 'in' : 'out'}"/>`
  if (名称 === 'split') return `<${标签} orient="${s.轴 === '水平' ? 'horz' : 'vert'}" dir="${s.方式 === '内' ? 'in' : 'out'}"/>`
  if (名称 === 'blinds' || 名称 === 'comb') return `<${标签} dir="${s.轴 === '水平' ? 'horz' : 'vert'}"/>`
  if (名称 === 'wheel') return `<${标签} spokes="${s.辐条 ?? 4}"/>`
  if (名称 === 'p14:morph') return `<${标签} option="byObject"/>`
  return `<${标签}/>`
}
function 写入切换(页) {
  for (const 键 of ['切换','换片']) if (页[键] !== undefined && (!页[键] || typeof 页[键] !== 'object' || Array.isArray(页[键]))) throw new Error('播放参数无效：设置必须为完整对象')
  if (!页.切换 && !页.过渡效果 && !页.换片) return ''
  const s = 页.切换 ?? { 效果: 页.过渡效果 ?? '无', 持续毫秒: 500, 方向: '左', 方式: '外', 轴: '水平' }, w = 页.换片 ?? { 单击: true }
  校验切换设置(s, w)
  return `<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" spd="med" p14:dur="${s.持续毫秒}" advClick="${w.单击 ? 1 : 0}"${w.自动毫秒 === undefined ? '' : ` advTm="${w.自动毫秒}"`}>${子节点(s)}</p:transition>`
}
function 读取切换(xml) {
  const 匹配 = xml.match(/<p:transition\b[^>]*(?:\/>|>[\s\S]*?<\/p:transition>)/)
  if (!匹配) return { 存在: false, 风险: false }
  // 切换音效与切换效果共存于同一个 p:transition，音效单独读取，不参与切换风险判定。
  const 文本 = 匹配[0].replace(/<p:sndAc\b[^>]*>[\s\S]*?<\/p:sndAc>/g, ''), 头 = 文本.slice(0, 文本.indexOf('>') + 1), 属性 = Object.fromEntries([...头.matchAll(/([\w:]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1], m[3]]))
  const 子 = 文本.match(new RegExp(子标签))
  const 内文 = 文本.replace(/^<p:transition[^>]*>/, '').replace(/<\/p:transition>$/, '').trim()
  const 风险返回 = { 存在: true, 风险: true }
  if (Object.keys(属性).some(k => !['spd','advClick','advTm','p14:dur','xmlns:p14'].includes(k)) || (内文 && (!子 || 子[0] !== 内文))) return 风险返回
  const 全名 = 子?.[1] ?? '', 名称 = 全名 ? (全名.startsWith('p14:') ? 全名.slice(4) : 全名.slice(2)) : ''
  const 查找值 = 全名.startsWith('p14:') ? 全名 : 名称
  const a = Object.fromEntries([...((子?.[2]) ?? '').matchAll(/(\w+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1], m[3]]))
  if (Object.keys(a).some(k => !(属性表[名称] ?? []).includes(k))) return 风险返回
  if (['push','wipe','pull'].includes(名称) && a.dir && !Object.values(方向表).includes(a.dir)) return 风险返回
  if (名称 === 'zoom' && a.dir && !['in','out'].includes(a.dir)) return 风险返回
  if (名称 === 'split' && ((a.dir && !['in','out'].includes(a.dir)) || (a.orient && !['horz','vert'].includes(a.orient)))) return 风险返回
  if (['blinds','comb'].includes(名称) && a.dir && !['horz','vert'].includes(a.dir)) return 风险返回
  if (名称 === 'wheel' && a.spokes && !辐条取值.map(String).includes(a.spokes)) return 风险返回
  if (名称 === 'morph' && a.option && a.option !== 'byObject') return 风险返回
  if (属性.advClick && !['0','1','true','false'].includes(属性.advClick)) return 风险返回
  if (属性.spd && !['slow','med','fast'].includes(属性.spd)) return 风险返回
  const 切换 = {
    效果: Object.keys(效果表).find(k => 效果表[k] === 查找值),
    持续毫秒: 属性['p14:dur'] === undefined ? ({ slow: 1000, med: 500, fast: 250 }[属性.spd] ?? 500) : Number(属性['p14:dur']),
    方向: Object.keys(方向表).find(k => 方向表[k] === a.dir) ?? '左',
    方式: a.dir === 'in' ? '内' : '外',
    轴: (a.orient === 'vert' || a.dir === 'vert') ? '垂直' : '水平',
  }
  if (名称 === 'wheel') 切换.辐条 = a.spokes === undefined ? 4 : Number(a.spokes)
  if (!切换.效果) return 风险返回
  const 换片 = { 单击: !['0','false'].includes(属性.advClick), ...(属性.advTm === undefined ? {} : { 自动毫秒: Number(属性.advTm) }) }
  // 外部文件允许单引号、属性空白与不同属性顺序；只要求能由本机参数完整重写。
  try { 写入切换({ 切换, 换片 }) } catch { return 风险返回 }
  return { 存在: true, 风险: false, 效果: 切换.效果 === '无' ? null : 切换.效果, 切换, 换片 }
}
module.exports = { 写入切换, 读取切换 }
