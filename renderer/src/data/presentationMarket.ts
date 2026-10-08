import {创建演示文稿,创建幻灯片,创建文本框,type 演示文稿,type 幻灯片} from '../ppt/deck'
import {创建图形,创建图表,创建表格} from '../ppt/model/elements'

// 原创主题内容与十套视觉方案组成 300 套模板，全部由原生可编辑对象构成。
const topics = [
  ['工作汇报','年度工作总结','季度业务复盘','项目进度汇报','团队周报','经营分析报告'],
  ['商业计划','创业商业计划','产品上市方案','客户合作提案','品牌推广策略','门店经营计划'],
  ['教育培训','新员工入职培训','课程教学设计','读书分享会','校园活动策划','职业技能培训'],
  ['产品技术','产品功能介绍','技术方案评审','数字化转型规划','数据分析汇报','研发成果展示'],
  ['人事行政','职业成长规划','岗位竞聘演讲','人才培养方案','组织文化建设','行政服务优化'],
  ['行业专题','乡村发展项目','健康科普讲座','绿色能源介绍','文旅项目策划','公益活动汇报'],
] as const
export const marketCategories=topics.map(t=>t[0])
export const marketStyles=[
  {name:'海湾蓝',color:'#245BD6',paper:'#F1F5FF',ink:'#13213D'},
  {name:'潮汐青',color:'#007D85',paper:'#EFFAF9',ink:'#143539'},
  {name:'森林绿',color:'#247348',paper:'#F3F8F0',ink:'#223C2A'},
  {name:'晨光橙',color:'#BA4A16',paper:'#FFF7EF',ink:'#493021'},
  {name:'紫罗兰',color:'#6744A6',paper:'#F6F2FF',ink:'#302341'},
  {name:'海豹夜航',color:'#213655',paper:'#EEF2F6',ink:'#192C47'},
  {name:'珊瑚红',color:'#AE344D',paper:'#FFF1F4',ink:'#42242C'},
  {name:'沙丘金',color:'#816322',paper:'#FAF6EB',ink:'#3F3522'},
  {name:'极地灰',color:'#465567',paper:'#F1F3F5',ink:'#23303F'},
  {name:'湖光蓝',color:'#16688B',paper:'#EDF9FF',ink:'#143642'},
] as const
export interface MarketTemplate {id:string;name:string;category:string;topic:string;style:number;description:string;pages:number}
export const marketTemplates:MarketTemplate[]=topics.flatMap(([category,...titles])=>titles.flatMap((topic,ti)=>marketStyles.map((style,index)=>({id:`seal-market-${topics.findIndex(t=>t[0]===category)}-${ti}-${index}`,name:`${topic} · ${style.name}`,category,topic,style:index,description:'9 页原创模板，含目录、指标、对比、流程、进度、数据表与行动计划；示例数据可替换。',pages:9}))))

export function createMarketDeck(template:MarketTemplate):演示文稿 {
  const style=marketStyles[template.style],deck=创建演示文稿(template.name+'.pptx')
  const text=(x:number,y:number,w:number,h:number,value:string,size=24,color:string=style.ink)=>({...创建文本框(x,y,w,h,value,size),颜色:color})
  const shape=(x:number,y:number,w:number,h:number,fill:string,kind:'矩形'|'圆角矩形'|'椭圆'='圆角矩形')=>({...创建图形(kind),x,y,width:w,height:h,形状:{...创建图形(kind).形状!,填充:fill,线条:fill,线宽:0}})
  const page=(title:string,index:number):幻灯片=>({...创建幻灯片('空白',title),背景色:style.paper,文本框列表:[{...text(54,35,840,75,title,34),加粗:true},text(54,494,660,25,'海豹办公 · '+template.topic,12),text(842,494,60,25,`${index} / 9`,12)],对象列表:[shape(54,117,90,5,style.color,'矩形')],备注:'模板说明：所有文字、图形、表格和图表均可编辑。示例数据仅用于说明版式，使用前请替换并注明来源。'})
  const cover=page(template.topic,1)
  cover.背景色=style.color
  cover.文本框列表=[{...text(60,180,720,150,template.topic,48,'#FFFFFF'),加粗:true},text(64,352,700,55,`${template.category} / 汇报人：请填写 / 日期：请填写`,23,'#FFFFFF'),text(64,460,700,30,'海豹办公 · 原创可编辑演示模板',16,'#FFFFFF')]
  const variant=template.style%3
  cover.对象列表=[shape(variant===0?758:690,variant===1?55:115,260,260,style.paper,variant===2?'矩形':'椭圆'),shape(variant===0?820:790,variant===1?0:285,170,170,style.paper,'椭圆')]
  const agenda=page('汇报目录',2)
  const headings=['目标与背景','关键成果','问题与建议','执行路径','下一步行动']
  headings.forEach((v,i)=>{agenda.文本框列表.push(text(78,155+i*57,72,44,`0${i+1}`,26,style.color),text(178,155+i*57,650,44,v,25))})
  const metrics=page('目标与关键指标',3)
  ;['完成率','满意度','交付周期'].forEach((v,i)=>{const x=54+i*292;metrics.对象列表!.push(shape(x,180,268,210,'#FFFFFF'));metrics.文本框列表.push(text(x+20,201,230,38,v,23),{...text(x+20,261,230,80,['85%','92%','14 天'][i],44,style.color),加粗:true},text(x+20,350,230,36,'示例数据 · 请替换',16))})
  const compare=page('现状与改进建议',4)
  ;['现状观察','改进方案'].forEach((v,i)=>{const x=54+i*440;compare.对象列表!.push(shape(x,160,412,287,'#FFFFFF'));compare.文本框列表.push({...text(x+20,176,374,50,v,27,style.color),加粗:true},text(x+20,244,368,166,i===0?'• 信息分散，协作进度难追踪\n• 缺少统一的评价标准\n• 关键环节需要明确责任':'• 建立统一的任务与资料目录\n• 制定可量化的阶段目标\n• 定期复盘并记录改进结果',22))})
  const flow=page('实施路径',5)
  ;['调研诊断','制定方案','组织执行','验收复盘'].forEach((v,i)=>{const x=54+i*226;flow.对象列表!.push(shape(x,205,184,145,i%2? '#FFFFFF':style.color));flow.文本框列表.push(text(x+15,230,154,40,`0${i+1}`,25,i%2?style.color:'#FFFFFF'),text(x+15,284,154,45,v,23,i%2?style.ink:'#FFFFFF'));if(i<3)flow.文本框列表.push(text(x+190,255,35,50,'→',28,style.color))})
  const timeline=page('阶段安排与里程碑',6)
  timeline.对象列表!.push(shape(76,246,800,5,style.color,'矩形'))
  ;['准备阶段','试点阶段','推广阶段','总结阶段'].forEach((v,i)=>{const x=65+i*222;timeline.对象列表!.push(shape(x+5,236,24,24,style.color,'椭圆'));timeline.文本框列表.push(text(x,173,200,50,`第 ${i+1} 阶段`,23,style.color),text(x,284,200,55,v,25),text(x,355,205,65,'负责人：请填写\n完成日期：请填写',18))})
  const data=page('数据与趋势（示例）',7),chart=创建图表('柱状图')
  chart.x=64;chart.y=150;chart.width=812;chart.height=315
  chart.图表={...chart.图表!,标题:'阶段目标与完成情况',分类:['阶段一','阶段二','阶段三','阶段四'],系列:[{id:'series-0',名称:'目标',数值:[30,50,70,90],颜色:style.color},{id:'series-1',名称:'完成',数值:[28,48,66,85],颜色:'#95A3B5'}]}
  data.对象列表!.push(chart)
  const action=page('行动计划',8),table=创建表格(5,4)
  table.x=54;table.y=165;table.width=852;table.height=280;table.表格!.列宽=[252,200,200,200];table.表格!.行高=Array(5).fill(56)
  const rows=[['行动事项','负责人','截止时间','验收标准'],['确认目标与范围','待安排','请填写','范围评审通过'],['完成重点任务','待安排','请填写','交付成果核对'],['开展检查与复盘','待安排','请填写','问题闭环记录'],['制定下一阶段计划','待安排','请填写','责任与日期明确']]
  table.表格!.单元格=rows.map((row,r)=>row.map(v=>({文本:v,背景:r===0?style.color:r%2?'#FFFFFF':style.paper,颜色:r===0?'#FFFFFF':style.ink,字号:19,加粗:r===0,对齐:'left' as const})))
  action.对象列表!.push(table)
  const end=page('感谢聆听 · 交流与讨论',9);end.文本框列表.push(text(90,207,780,130,'把目标写清楚\n让每一步行动可以跟进',38,style.color),text(90,380,780,55,'联系信息：请填写',22))
  deck.幻灯片列表=[cover,agenda,metrics,compare,flow,timeline,data,action,end]
  deck.幻灯片列表=deck.幻灯片列表.map(slide=>({...slide,背景填充:{类型:'纯色',颜色:slide.背景色}}))
  return deck
}
