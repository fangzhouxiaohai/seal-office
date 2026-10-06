const 效果表 = { 无: '', 淡入淡出: 'fade', 推进: 'push', 切出: 'cut', 擦除: 'wipe', 形状: 'zoom', 抽出: 'pull', 分割: 'split' }
const 方向表 = { 左: 'l', 右: 'r', 上: 'u', 下: 'd' }
function 写入切换(页) {
  for (const 键 of ['切换','换片']) if (页[键] !== undefined && (!页[键] || typeof 页[键] !== 'object' || Array.isArray(页[键]))) throw new Error('播放参数无效：设置必须为完整对象')
  if (!页.切换 && !页.过渡效果 && !页.换片) return ''
  const s = 页.切换 ?? { 效果: 页.过渡效果 ?? '无', 持续毫秒: 500, 方向: '左', 方式: '外', 轴: '水平' }, w = 页.换片 ?? { 单击: true }
  if (!(s.效果 in 效果表) || !Number.isInteger(s.持续毫秒) || s.持续毫秒 < 0 || s.持续毫秒 > 60000 || !(s.方向 in 方向表) || !['内','外'].includes(s.方式) || !['水平','垂直'].includes(s.轴) || typeof w.单击 !== 'boolean' || (w.自动毫秒 !== undefined && (!Number.isInteger(w.自动毫秒) || w.自动毫秒 < 100 || w.自动毫秒 > 86400000))) throw new Error('不支持或无效的幻灯片切换参数')
  const 名称 = 效果表[s.效果], 属性 = ['push','wipe','pull'].includes(名称) ? ` dir="${方向表[s.方向]}"` : 名称 === 'zoom' ? ` dir="${s.方式 === '内' ? 'in' : 'out'}"` : 名称 === 'split' ? ` orient="${s.轴 === '水平' ? 'horz' : 'vert'}" dir="${s.方式 === '内' ? 'in' : 'out'}"` : ''
  return `<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" spd="med" p14:dur="${s.持续毫秒}" advClick="${w.单击 ? 1 : 0}"${w.自动毫秒 === undefined ? '' : ` advTm="${w.自动毫秒}"`}>${名称 ? `<p:${名称}${属性}/>` : ''}</p:transition>`
}
function 读取切换(xml) {
  const 匹配 = xml.match(/<p:transition\b[^>]*(?:\/>|>[\s\S]*?<\/p:transition>)/)
  if (!匹配) return { 存在: false, 风险: false }
  // 切换音效与切换效果共存于同一个 p:transition，音效单独读取，不参与切换风险判定。
  const 文本 = 匹配[0].replace(/<p:sndAc\b[^>]*>[\s\S]*?<\/p:sndAc>/g, ''), 头 = 文本.slice(0,文本.indexOf('>')+1), 属性 = Object.fromEntries([...头.matchAll(/([\w:]+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1],m[3]])), 子 = 文本.match(/<p:(fade|push|cut|wipe|zoom|pull|split)\b([^>]*)\/>/)
  const 内文 = 文本.replace(/^<p:transition[^>]*>/,'').replace(/<\/p:transition>$/,'').trim()
  if (Object.keys(属性).some(k=>!['spd','advClick','advTm','p14:dur','xmlns:p14'].includes(k)) || (内文 && (!子 || 子[0] !== 内文))) return { 存在: true, 风险: true }
  const a = Object.fromEntries([...((子?.[2])??'').matchAll(/(\w+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1],m[3]])), 名称 = 子?.[1] ?? ''
  if (Object.keys(a).some(k=>!(['push','wipe','pull','zoom'].includes(名称) ? ['dir'] : 名称==='split' ? ['orient','dir'] : []).includes(k)) || (['push','wipe','pull'].includes(名称) && a.dir && !Object.values(方向表).includes(a.dir)) || (['zoom','split'].includes(名称) && a.dir && !['in','out'].includes(a.dir)) || (名称==='split' && a.orient && !['horz','vert'].includes(a.orient)) || (属性.advClick && !['0','1','true','false'].includes(属性.advClick)) || (属性.spd && !['slow','med','fast'].includes(属性.spd))) return { 存在: true, 风险: true }
  const 切换 = { 效果: Object.keys(效果表).find(k=>效果表[k]===名称), 持续毫秒: 属性['p14:dur'] === undefined ? ({slow:1000,med:500,fast:250}[属性.spd] ?? 500) : Number(属性['p14:dur']), 方向: Object.keys(方向表).find(k=>方向表[k]===a.dir) ?? '左', 方式: a.dir==='in' ? '内' : '外', 轴: a.orient==='vert' ? '垂直' : '水平' }
  const 换片 = { 单击: !['0','false'].includes(属性.advClick), ...(属性.advTm===undefined ? {} : { 自动毫秒: Number(属性.advTm) }) }
  try { 写入切换({切换,换片}) } catch { return { 存在:true,风险:true } }
  return { 存在: true, 风险: false, 效果: 切换.效果 === '无' ? null : 切换.效果, 切换, 换片 }
}
module.exports = { 写入切换, 读取切换 }
