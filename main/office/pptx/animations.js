const 标记 = 'seal-playback-v1'
const 可写入效果 = ['出现', '淡入', '淡出', '进入', '退出', '图表分步']
function 对象编号(xml) {
  return new Map([...xml.matchAll(/<p:cNvPr\b[^>]*>/g)].flatMap(([标签]) => {
    const 名称 = 标签.match(/\bname="seal-id:([^"]+)"/)?.[1], 编号 = 标签.match(/\bid="(\d+)"/)?.[1]
    return 名称 && 编号 ? [[Buffer.from(名称,'base64url').toString('utf8'),编号]] : []
  }))
}
/** 收集需要写入原生构建清单的图表：必须有动态设置，且页面存在指向它的图表分步动画。 */
function 收集图表构建(页) {
  const 图表 = new Map((页?.对象列表 ?? []).filter(项 => 项?.类型 === '图表' && 项.图表?.动态).map(项 => [项.id, 项.图表]))
  const 结果 = {}
  for (const a of 页?.动画序列 ?? []) {
    if (a?.效果 !== '图表分步') continue
    const 图 = 图表.get(a.对象标识)
    if (!图) continue
    结果[a.对象标识] = { 动态: 图.动态, 系列数: 图.系列.length, 分类数: 图.分类.length }
  }
  return 结果
}
function 构建清单Xml(序列, 编号, 图表构建) {
  const 项 = []
  for (const a of 序列) {
    const 构建 = 图表构建?.[a.对象标识]
    if (a.效果 !== '图表分步' || !构建) continue
    const spid = 编号.get(a.对象标识)
    if (!spid) throw new Error('图表分步动画的目标缺少原生对象编号')
    const 子 = 构建.动态?.步进 === '按分类'
      ? Array.from({ length: 构建.分类数 }, (_, i) => `<p:category idx="${i}"/>`).join('')
      : Array.from({ length: 构建.系列数 }, (_, i) => `<p:series idx="${i}"/>`).join('')
    项.push(`<p:bldGraphic spid="${spid}" grpId="0"><p:bldSub><p:bldChart>${子}</p:bldChart></p:bldSub></p:bldGraphic>`)
  }
  return 项.length ? `<p:bldLst>${项.join('')}</p:bldLst>` : ''
}
function 写入动画(xml, 序列 = [], 图表构建 = {}) {
  if (!Array.isArray(序列)) throw new Error('动画序列无效')
  if (!序列.length) return ''
  const 编号 = 对象编号(xml), 标识 = new Set(); let n = 2
  const id = () => ++n, 条件 = delay => `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>`
  const 组 = []; let 组内 = [], 偏移 = 0, 上段长度 = 0
  for (const a of 序列) {
    if (!a || !a.id || 标识.has(a.id) || !编号.has(a.对象标识) || !可写入效果.includes(a.效果) || !['单击','同时','之后'].includes(a.触发) || !Number.isInteger(a.持续毫秒) || a.持续毫秒 < 0 || a.持续毫秒 > 60000) throw new Error('动画参数或目标无效')
    标识.add(a.id)
    if (a.触发 === '单击' || !组.length) { 组内 = []; 组.push({ 等待: a.触发 === '单击', 内容: 组内 }); 偏移 = 0; 上段长度 = 0 }
    else if (a.触发 === '之后') { 偏移 += 上段长度; 上段长度 = 0 }
    上段长度 = Math.max(上段长度,a.持续毫秒)
    const spid = 编号.get(a.对象标识), 出 = ['淡出','退出'].includes(a.效果), 飞 = ['进入','退出'].includes(a.效果), 时长 = Math.max(1,a.持续毫秒)
    const 目标 = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`
    let 动作 = `<p:set><p:cBhvr><p:cTn id="${id()}" dur="${a.效果 === '出现' || a.效果 === '图表分步' ? 时长 : 1}" fill="hold">${条件(出 ? 时长-1 : 0)}</p:cTn>${目标}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${出 ? 'hidden':'visible'}"/></p:to></p:set>`
    if (飞) 动作 += `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${id()}" dur="${时长}" fill="hold"/>${目标}<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${出 ? '#ppt_y':'1+#ppt_h/2'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${出 ? '1+#ppt_h/2':'#ppt_y'}"/></p:val></p:tav></p:tavLst></p:anim>`
    else if (a.效果 !== '出现' && a.效果 !== '图表分步') 动作 += `<p:animEffect transition="${出 ? 'out':'in'}" filter="fade"><p:cBhvr><p:cTn id="${id()}" dur="${时长}"/>${目标}</p:cBhvr></p:animEffect>`
    组内.push(`<p:par><p:cTn id="${id()}" fill="hold">${条件(偏移)}<p:childTnLst><p:par><p:cTn id="${id()}" presetID="${飞 ? 2 : a.效果==='出现' || a.效果==='图表分步' ? 1 : 10}" presetClass="${出 ? 'exit':'entr'}" presetSubtype="${飞 ? 4 : 0}" fill="hold" grpId="0" nodeType="${a.触发==='单击' ? 'clickEffect':a.触发==='同时' ? 'withEffect':'afterEffect'}">${条件(0)}<p:childTnLst>${动作}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`)
  }
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${组.map(g=>`<p:par><p:cTn id="${id()}" fill="hold">${条件(g.等待 ? 'indefinite':0)}<p:childTnLst>${g.内容.join('')}</p:childTnLst></p:cTn></p:par>`).join('')}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${构建清单Xml(序列, 编号, 图表构建)}</p:timing>`
}
function 写入播放扩展(页) {
  const 图表构建 = 收集图表构建(页)
  const 数据 = { 切换: 页.切换, 动画序列: 页.动画序列, ...(Object.keys(图表构建).length ? { 图表构建 } : {}) }
  return `<p:extLst><p:ext uri="${标记}"><seal:playback xmlns:seal="urn:seal-office:playback">${Buffer.from(JSON.stringify(数据)).toString('base64')}</seal:playback></p:ext></p:extLst>`
}
function 读取播放扩展(xml) {
  const 数据 = xml.match(/<seal:playback xmlns:seal="urn:seal-office:playback">([A-Za-z0-9+/=]+)<\/seal:playback>/)?.[1]
  if (!数据) return {}
  try { const 值 = JSON.parse(Buffer.from(数据,'base64').toString('utf8')); return 值 && typeof 值==='object' ? 值 : {} } catch { return {} }
}
function 读取动画(xml) {
  const 扩展 = 读取播放扩展(xml), 序列 = 扩展.动画序列, 实际 = xml.match(/<p:timing>[\s\S]*?<\/p:timing>/)?.[0] ?? ''
  try { if (序列 && 写入动画(xml,序列,扩展.图表构建 ?? {}) === 实际) return 序列 } catch {}
  return 实际 ? null : undefined
}
module.exports = { 写入动画, 读取动画, 写入播放扩展, 读取播放扩展, 收集图表构建 }
