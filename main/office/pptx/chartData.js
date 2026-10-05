const 图表配色 = ['#2B6CF6','#718096','#B57624','#33806B','#925A83']
function 校验图表(对象) {
  const 图 = 对象.图表, 字段 = (值,允许) => { if (!值 || typeof 值 !== 'object' || Object.keys(值).some(键=>!允许.includes(键))) throw new Error('图表含未知属性，已阻止有损保存') }
  字段(对象,['id','类型','x','y','width','height','旋转','锁定','图表'])
  字段(图,['种类','标题','分类','系列','图例','横轴标题','纵轴标题','显示横轴','显示纵轴','数值格式'])
  if (对象.旋转) throw new Error('原生图表暂不支持旋转')
  if (!['柱状图','折线图','饼图'].includes(图.种类) || !['标题','横轴标题','纵轴标题'].every(键=>typeof 图[键]==='string') || !['下','右','无'].includes(图.图例) || !['0','0.00','0%','0.00%','#,##0'].includes(图.数值格式) || !['显示横轴','显示纵轴'].every(键=>typeof 图[键]==='boolean')) throw new Error('图表设置无效')
  if (!Array.isArray(图.分类) || !图.分类.length || 图.分类.length>100 || 图.分类.some(值=>typeof 值!=='string'||!值.trim()) || !Array.isArray(图.系列) || !图.系列.length || 图.系列.length>12 || (图.种类==='饼图' && 图.系列.length!==1)) throw new Error('图表须有一至一百项分类和一至十二个系列，饼图仅支持一个系列')
  if (图.种类==='饼图' && 图.分类.length>12) throw new Error('饼图最多支持十二项分类')
  const 标识=new Set()
  for (const 项 of 图.系列) {
    字段(项,['id','名称','数值','颜色'])
    if (!/^series-(0|[1-9]\d*)$/.test(项.id) || Number(项.id.slice(7))>2147483647 || 标识.has(项.id) || typeof 项.名称!=='string'||!项.名称.trim() || !/^#[0-9a-f]{6}$/i.test(项.颜色) || !Array.isArray(项.数值) || 项.数值.length!==图.分类.length || 项.数值.some(值=>!Number.isFinite(值) || Math.abs(值)>1e12)) throw new Error('图表系列标识、名称、颜色或数值无效')
    if (图.种类==='饼图' && (项.数值.some(值=>值<0)||项.数值.every(值=>值===0))) throw new Error('饼图数值须非负且至少一项大于零')
    标识.add(项.id)
  }
}

module.exports = { 校验图表, 图表配色 }
