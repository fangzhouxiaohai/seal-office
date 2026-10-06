import type { 演示对象 } from '../deck'
import { 格式化图表数值, 图表配色, type 图表显示 } from '../model/elements'
/** 画布、缩略图、静态导出和放映共享图形，系列标识供分步播放使用。 */
export function ChartRenderer({ 对象, 显示 }: { 对象: 演示对象; 显示?: 图表显示 }) {
  const 原图=对象.图表!
  // 分步播放只裁剪显示范围；静态导出、编辑区与缩略图不传显示范围，始终呈现最终状态。
  const 系列=显示 ? 原图.系列.slice(0,显示.点数.length).map((项,i)=>({...项,数值:项.数值.slice(0,显示.点数[i])})) : 原图.系列
  const 分类=显示 ? 原图.分类.slice(0,Math.max(0,...显示.点数)) : 原图.分类
  const 图={...原图,系列,分类}
  const 图例=图.种类==='饼图'?图.分类.map((名,i)=>({名称:名,颜色:i===0?(图.系列[0]?.颜色??图表配色[0]):图表配色[i%图表配色.length]})):图.系列
  const 右侧=图.图例==='右',底部=图.图例==='下',图例行=底部?Math.ceil(图例.length/4):0
  const 左=图.显示纵轴?76:32,上=图.标题?48:24,右=右侧?440:572,下=308-图例行*18,宽=右-左,高=下-上
  const 数值=图.系列.flatMap(项=>项.数值),最小=Math.min(0,...数值),最大=Math.max(0,...数值),范围=最大-最小||1
  const y=(值:number)=>下-(值-最小)/范围*高,x=(i:number)=>左+(i+.5)/Math.max(1,图.分类.length)*宽
  const 刻度=Array.from({length:5},(_,i)=>最小+范围*i/4)
  const 截短=(值:string,长度=12)=>值.length>长度?`${值.slice(0,长度-1)}…`:值
  let 累计=-Math.PI/2
  // 饼图按完整合计计算比例，分步显示时扇区逐步补齐而不是每步重新占满。
  const 合计=原图.系列[0]?.数值.reduce((和,值)=>和+值,0) || 1
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%" role="img" aria-label={`${图.标题||图.种类}，${图.分类.length}项分类`} data-chart-type={图.种类} style={{fontFamily:'Microsoft YaHei, sans-serif',fontSize:12,fill:'#1A1D24'}}>
    {图.标题&&<text x={300} y={26} textAnchor="middle" fontSize={18} fontWeight={600}><title>{图.标题}</title>{截短(图.标题,30)}</text>}
    {图.种类==='饼图'?<g data-series-id={图.系列[0]?.id}>{图.系列[0]?.数值.map((值,i)=>{
      const 角=值/合计*Math.PI*2,起=累计;累计+=角
      const cx=(左+右)/2,cy=(上+下)/2,r=Math.min(宽,高)/2-8,颜色=i===0?图.系列[0].颜色:图表配色[i%图表配色.length]
      if (!值) return null
      const 描述=`${图.分类[i]}：${格式化图表数值(值,图.数值格式)}`
      return 角>=Math.PI*2-.000001?<circle key={i} cx={cx} cy={cy} r={r} fill={颜色}><title>{描述}</title></circle>:<path key={i} d={`M${cx},${cy} L${cx+r*Math.cos(起)},${cy+r*Math.sin(起)} A${r},${r} 0 ${角>Math.PI?1:0} 1 ${cx+r*Math.cos(累计)},${cy+r*Math.sin(累计)} Z`} fill={颜色} stroke="white"><title>{描述}</title></path>
    })}</g>:<>
      {图.显示纵轴&&<g>{刻度.map((值,i)=><g key={i}><line x1={左} x2={右} y1={y(值)} y2={y(值)} stroke="#E8EBF0"/><text x={左-8} y={y(值)+4} textAnchor="end" fontSize={10}>{格式化图表数值(值,图.数值格式)}</text></g>)}{图.纵轴标题&&<text transform={`translate(14 ${(上+下)/2}) rotate(-90)`} textAnchor="middle">{截短(图.纵轴标题,20)}</text>}</g>}
      {图.显示横轴&&<g><line x1={左} x2={右} y1={y(0)} y2={y(0)} stroke="#718096"/>{图.分类.map((名,i)=>i%Math.max(1,Math.ceil(图.分类.length/8))===0&&<text key={i} x={x(i)} y={下+18} textAnchor="middle" fontSize={10}><title>{名}</title>{截短(名,7)}</text>)}{图.横轴标题&&<text x={(左+右)/2} y={下+36} textAnchor="middle">{截短(图.横轴标题,30)}</text>}</g>}
      {图.系列.map((项,s)=><g key={项.id} data-series-id={项.id}>{图.种类==='折线图'&&<polyline points={项.数值.map((值,i)=>`${x(i)},${y(值)}`).join(' ')} fill="none" stroke={项.颜色} strokeWidth={2}/>} {项.数值.map((值,i)=>{
        const 间=宽/Math.max(1,图.分类.length),柱宽=间*.7/图.系列.length,提示=`${项.名称}，${图.分类[i]}：${格式化图表数值(值,图.数值格式)}`
        return 图.种类==='柱状图'?<rect key={i} x={x(i)-间*.35+s*柱宽} y={Math.min(y(值),y(0))} width={柱宽*.9} height={Math.abs(y(值)-y(0))} fill={项.颜色}><title>{提示}</title></rect>:<circle key={i} cx={x(i)} cy={y(值)} r={3} fill={项.颜色}><title>{提示}</title></circle>
      })}</g>)}
    </>}
    {图.图例!=='无'&&<g>{图例.map((项,i)=><g key={i} transform={`translate(${右侧?456:32+(i%4)*140},${右侧?56+i*20:354-(图例行-1-Math.floor(i/4))*18})`}><rect y={-9} width={10} height={10} fill={项.颜色}/><text x={16}><title>{项.名称}</title>{截短(项.名称,9)}</text></g>)}</g>}
  </svg>
}
