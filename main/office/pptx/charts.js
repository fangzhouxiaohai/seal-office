const { 读取对象标识 } = require('./objectIds')
const JSZip = require('jszip')
const ExcelJS = require('exceljs')
const sax = require('sax')
const { 读取关系 } = require('./relations')
const { 读取部件 } = require('./parts')
const 转义 = 值 => String(值).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const 命名空间 = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
const 关系前缀 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const { 校验图表, 图表配色 } = require('./chartData')
function 标题Xml(文字) { return 文字 ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>${转义(文字)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : '' }
function 引用Xml(类型,公式,值,格式) { return `<c:${类型}Ref><c:f>${公式}</c:f><c:${类型}Cache>${类型==='num'?`<c:formatCode>${转义(格式)}</c:formatCode>`:''}<c:ptCount val="${值.length}"/>${值.map((项,i)=>`<c:pt idx="${i}"><c:v>${转义(项)}</c:v></c:pt>`).join('')}</c:${类型}Cache></c:${类型}Ref>` }
function 图表Xml(图) {
  const 类型={柱状图:'barChart',折线图:'lineChart',饼图:'pieChart'}[图.种类]
  const 系列=图.系列.map((项,i)=>{
    const 列=String.fromCharCode(66+i),颜色=项.颜色.slice(1)
    return `<c:ser><c:idx val="${Number(项.id.slice(7))}"/><c:order val="${i}"/><c:tx>${引用Xml('str',`'数据'!$${列}$1`,[项.名称])}</c:tx><c:spPr>${图.种类==='折线图'?`<a:ln w="25400"><a:solidFill><a:srgbClr val="${颜色}"/></a:solidFill></a:ln>`:`<a:solidFill><a:srgbClr val="${颜色}"/></a:solidFill>`}</c:spPr>${图.种类==='折线图'?'<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>':图.种类==='饼图'?图.分类.map((_,点)=>`<c:dPt><c:idx val="${点}"/><c:spPr><a:solidFill><a:srgbClr val="${点===0?颜色:图表配色[点%图表配色.length].slice(1)}"/></a:solidFill></c:spPr></c:dPt>`).join(''):''}<c:cat>${引用Xml('str',`'数据'!$A$2:$A$${图.分类.length+1}`,图.分类)}</c:cat><c:val>${引用Xml('num',`'数据'!$${列}$2:$${列}$${图.分类.length+1}`,项.数值,图.数值格式)}</c:val></c:ser>`
  }).join('')
  const 轴=(纵)=>`<c:${纵?'valAx':'catAx'}><c:axId val="${纵?20:10}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${图[纵?'显示纵轴':'显示横轴']?0:1}"/><c:axPos val="${纵?'l':'b'}"/>${标题Xml(图[纵?'纵轴标题':'横轴标题'])}${纵?`<c:numFmt formatCode="${转义(图.数值格式)}" sourceLinked="0"/>`:''}<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${纵?10:20}"/><c:crosses val="autoZero"/>${纵?'<c:crossBetween val="between"/>':'<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>'}</c:${纵?'valAx':'catAx'}>`
  // 饼图不显示坐标轴，设置仍作为本机元数据保留以便切换类型。
  const 元=Buffer.from(JSON.stringify({横轴标题:图.横轴标题,纵轴标题:图.纵轴标题,显示横轴:图.显示横轴,显示纵轴:图.显示纵轴})).toString('base64url')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${命名空间}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${关系前缀.slice(0,-1)}"><c:lang val="zh-CN"/><c:chart>${标题Xml(图.标题)}<c:autoTitleDeleted val="${图.标题?0:1}"/><c:plotArea><c:${类型}>${图.种类==='柱状图'?'<c:barDir val="col"/><c:grouping val="clustered"/>':图.种类==='折线图'?'<c:grouping val="standard"/>':''}<c:varyColors val="${图.种类==='饼图'?1:0}"/>${系列}${图.种类==='柱状图'?'<c:gapWidth val="150"/>':''}${图.种类==='饼图'?'<c:firstSliceAng val="0"/>':'<c:axId val="10"/><c:axId val="20"/>'}</c:${类型}>${图.种类==='饼图'?'':轴(false)+轴(true)}</c:plotArea>${图.图例==='无'?'':`<c:legend><c:legendPos val="${图.图例==='下'?'b':'r'}"/><c:overlay val="0"/></c:legend>`}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:externalData r:id="data"><c:autoUpdate val="0"/></c:externalData>${图.种类==='饼图'?`<c:extLst><c:ext uri="{D0FA15E1-CBC3-4D64-ADDE-4458DA281321}"><seal:axes xmlns:seal="urn:seal-office:chart" value="${元}"/></c:ext></c:extLst>`:''}</c:chartSpace>`
}
function 图框Xml(对象,编号,关系) {
  const emu=值=>Math.round(值*12700)
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${编号}" name="seal-id:${Buffer.from(对象.id).toString('base64url')}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noMove="${对象.锁定?1:0}" noResize="${对象.锁定?1:0}"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(对象.x)}" y="${emu(对象.y)}"/><a:ext cx="${emu(对象.width)}" cy="${emu(对象.height)}"/></p:xfrm><a:graphic><a:graphicData uri="${命名空间}"><c:chart xmlns:c="${命名空间}" r:id="${关系}"/></a:graphicData></a:graphic></p:graphicFrame>`
}
async function 数据工作簿(图) {
  const 簿=new ExcelJS.Workbook(),表=簿.addWorksheet('数据')
  表.addRow(['分类',...图.系列.map(项=>项.名称)])
  图.分类.forEach((分类,r)=>表.addRow([分类,...图.系列.map(项=>项.数值[r])]))
  图.系列.forEach((_,i)=>{表.getColumn(i+2).numFmt=图.数值格式})
  return 簿.xlsx.writeBuffer()
}
async function 工作簿存在外部内容(原字节,图) {
  const 原=await JSZip.loadAsync(原字节),预期=await JSZip.loadAsync(await 数据工作簿(图))
  const 文件列表=包=>Object.keys(包.files).filter(名=>!包.files[名].dir).sort()
  if (JSON.stringify(文件列表(原))!==JSON.stringify(文件列表(预期))) return true
  const 忽略时间=文=>文.replace(/<dcterms:(created|modified)\b[^>]*>[\s\S]*?<\/dcterms:\1>/g,'')
  for (const 名 of 文件列表(原)) if (忽略时间(await 原.file(名).async('string'))!==忽略时间(await 预期.file(名).async('string'))) return true
  return false
}
async function 准备图表(包,页路径,对象列表) {
  const 结果=new Map(),页号=页路径.match(/slide(\d+)\.xml$/)[1]
  let 序号=0
  for (const 对象 of 对象列表.filter(项=>项.类型==='图表')) {
    校验图表(对象)
    const 名称=`seal-chart-${页号}-${++序号}`,图=对象.图表
    包.file(`ppt/embeddings/${名称}.xlsx`,await 数据工作簿(图))
    包.file(`ppt/charts/${名称}.xml`,图表Xml(图))
    包.file(`ppt/charts/_rels/${名称}.xml.rels`,`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="data" Type="${关系前缀}package" Target="../embeddings/${名称}.xlsx"/></Relationships>`)
    结果.set(对象.id,名称)
  }
  return 结果
}
function 树(xml) {
  const 根={子:[]},栈=[根],解析=sax.parser(true)
  解析.ondoctype=()=>{throw new Error('图表不能包含文档类型声明')}
  解析.onopentag=标签=>{const 节点={名:标签.name,属性:标签.attributes,子:[],文:''};栈.at(-1).子.push(节点);栈.push(节点)}
  解析.ontext=文=>{栈.at(-1).文+=文};解析.onclosetag=()=>栈.pop();解析.write(xml).close();return 根
}
const 子=(节点,名)=>节点?.子.find(项=>项.名===名)
const 后代=(节点,名)=>节点?节点.子.flatMap(项=>[...(项.名===名?[项]:[]),...后代(项,名)]):[]
const 值=(节点,名)=>子(节点,名)?.属性.val
const 标题=节点=>后代(子(节点,'c:title'),'a:t').map(项=>项.文).join('')
function 缓存(引用) {
  const 点=后代(引用,'c:pt').sort((甲,乙)=>Number(甲.属性.idx)-Number(乙.属性.idx))
  const 数量=Number(后代(引用,'c:ptCount')[0]?.属性.val)
  if (点.length!==数量 || 点.some((项,i)=>Number(项.属性.idx)!==i)) throw new Error('图表缓存数据不完整')
  return 点.map(项=>子(项,'c:v')?.文)
}
function 工作簿引用(引用,簿) {
  const 公式=后代(引用,'c:f')[0]?.文,匹配=公式?.match(/^(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/)
  if (!匹配 || (匹配[5] && 匹配[3]!==匹配[5])) throw new Error('图表数据引用暂不支持，请保留来源文件')
  const 表=簿.getWorksheet((匹配[1]??匹配[2]).replace(/''/g,"'")),起=Number(匹配[4]),终=Number(匹配[6]??匹配[4])
  if (!表 || 起<1 || 终<起 || 终-起>100) throw new Error('图表工作簿引用范围无效')
  return Array.from({length:终-起+1},(_,i)=>表.getCell(`${匹配[3]}${起+i}`).value)
}
async function 读取图表(包,页路径,xml) {
  const 对象列表=[],警告=[],关系=await 读取关系(包,页路径),移除=new Set()
  for (const 匹配 of xml.matchAll(/<p:graphicFrame\b[^>]*>[\s\S]*?<\/p:graphicFrame>/g)) {
    const 框=树(匹配[0]),图引用=后代(框,'c:chart')[0]
    if (!图引用) continue
    const 关系项=关系.get(图引用.属性['r:id'])
    if (!关系项 || 关系项.外部 || !关系项.类型.endsWith('/chart')) throw new Error('图表关系缺失或不支持外部图表')
    const 图Xml=await 读取部件(包,关系项.目标).async('string'),根=树(图Xml),图节点=后代(根,'c:chart')[0],绘图区=子(图节点,'c:plotArea')
    const 类型=绘图区?.子.filter(项=>['c:barChart','c:lineChart','c:pieChart'].includes(项.名))
    if (!类型?.length || 类型.length!==1) {警告.push('图表类型未完整导入');continue}
    const 图型=类型[0],种类={'c:barChart':'柱状图','c:lineChart':'折线图','c:pieChart':'饼图'}[图型.名]
    const 数据引用=后代(根,'c:externalData')[0],图关系=await 读取关系(包,关系项.目标),数据关系=图关系.get(数据引用?.属性['r:id'])
    if (!数据关系 || 数据关系.外部 || !数据关系.类型.endsWith('/package')) {警告.push('图表缺少可编辑的嵌入工作簿');continue}
    const 工作簿字节=await 读取部件(包,数据关系.目标).async('nodebuffer')
    const 簿=new ExcelJS.Workbook();await 簿.xlsx.load(工作簿字节)
    const 取值=引用=>{const 真值=工作簿引用(引用,簿),缓存值=缓存(引用);if(JSON.stringify(真值.map(String))!==JSON.stringify(缓存值)) 警告.push('图表缓存与嵌入工作簿不一致，已读取工作簿实际数据');return 真值}
    const 系列节点=图型.子.filter(项=>项.名==='c:ser'),分类=取值(子(系列节点[0],'c:cat'))
    const 系列=系列节点.map(项=>{
      if (JSON.stringify(取值(子(项,'c:cat')))!==JSON.stringify(分类)) throw new Error('图表各系列分类不一致')
      const 名称=取值(子(项,'c:tx'))
      if (名称.length!==1) throw new Error('图表系列名称引用无效')
      return {id:`series-${值(项,'c:idx')}`,名称:名称[0],数值:取值(子(项,'c:val')),颜色:`#${后代(子(项,'c:spPr'),'a:srgbClr')[0]?.属性.val??''}`}
    })
    const 横轴=子(绘图区,'c:catAx'),纵轴=子(绘图区,'c:valAx'),图例=子(图节点,'c:legend')
    let 坐标={横轴标题:标题(横轴),纵轴标题:标题(纵轴),显示横轴:值(横轴,'c:delete')!=='1',显示纵轴:值(纵轴,'c:delete')!=='1'}
    if (种类==='饼图') {const 元=后代(根,'seal:axes')[0];if (元) 坐标=JSON.parse(Buffer.from(元.属性.value,'base64url').toString('utf8'))}
    const 图={种类,标题:标题(图节点),分类,系列,图例:图例?(值(图例,'c:legendPos')==='b'?'下':'右'):'无',...坐标,数值格式:后代(系列节点[0],'c:formatCode')[0]?.文}
    const 标=后代(框,'p:cNvPr')[0],位置=后代(框,'a:off')[0]?.属性,尺寸=后代(框,'a:ext')[0]?.属性,锁=后代(框,'a:graphicFrameLocks')[0]?.属性
    const 对象={id:读取对象标识(标.属性.name,页路径,标.属性.id),类型:'图表',x:Number(位置?.x)/12700,y:Number(位置?.y)/12700,width:Number(尺寸?.cx)/12700,height:Number(尺寸?.cy)/12700,...(锁?.noMove==='1'?{锁定:true}:{}),图表:图}
    try {校验图表(对象)} catch(错) {throw new Error(`图表数据无法导入：${错.message}`)}
    // 比较真实原生内容；任何未支持的效果或属性都会触发来源保护。
    if (图表Xml(图)!==图Xml || 图框Xml(对象,Number(标.属性.id),图引用.属性['r:id'])!==匹配[0]) 警告.push('图表外部属性未完整导入')
    if (await 工作簿存在外部内容(工作簿字节,图)) 警告.push('图表数据工作簿外部内容未完整导入')
    if (Array.from(xml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)).some(项=>项.index>匹配.index && /<a:t\b/.test(项[0]) && !/descr="seal-element:/.test(项[0]))) 警告.push('图表与文字图层未完整导入')
    对象列表.push(对象);移除.add(匹配[0])
  }
  return {对象列表,警告,剩余:xml.replace(/<p:graphicFrame\b[^>]*>[\s\S]*?<\/p:graphicFrame>/g,片=>移除.has(片)?'':片)}
}
module.exports={校验图表,准备图表,图框Xml,读取图表}
