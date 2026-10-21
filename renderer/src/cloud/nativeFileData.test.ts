import {createRequire} from 'node:module'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {afterEach,expect,it,vi} from 'vitest'
import {extractUpload,读取演示来源,读取PDF来源数据,知识文件接受格式,演示模板接受格式,PDF资料接受格式} from './fileData'
import {桥接} from '../ipc/bridge'
import {创建工作表,写入单元格} from '../sheet/model'
import {创建演示文稿,创建文本框} from '../ppt/deck'

const require=createRequire(import.meta.url),{writeSeal,readSeal}=require('../../../main/office/sealFormat.js')
afterEach(()=>{vi.restoreAllMocks()})
function realCodec(){return vi.spyOn(桥接.office,'readSeal').mockImplementation(async(ext,data)=>{try{return {成功:true,...await readSeal(ext,Buffer.from(data,'base64'))}}catch(error){return {成功:false,错误:(error as Error).message}}})}
const encode=async(type:string,value:unknown)=>(await writeSeal(type,value)).toString('base64')

it('四种专属格式及历史别名都出现在知识、演示与 PDF 资料选择器中',()=>{
  expect(知识文件接受格式.split(',')).toEqual(expect.arrayContaining(['.sldoc','.slxls','.slppt','.spdf','.sealdoc','.sealsheet','.sealshow']))
  expect(演示模板接受格式.split(',')).toEqual(expect.arrayContaining(['.pptx','.slppt','.sealshow']))
  expect(PDF资料接受格式.split(',')).toEqual(['.pdf','.spdf'])
})
it.each(['sldoc','sealdoc'])('%s 真正解包后提取正文、表格与生僻字，不把图片字节当作知识文本',async(ext)=>{
  realCodec();const data=await encode('word',{html:'<h1>专属𠮷🦭</h1><p>阿拉伯 العربية é</p><table><tr><td>00123</td></tr></table><img src="data:image/png;base64,AA==">',页面设置:{方向:'横向'},警告:['来源记录']})
  const passages=await extractUpload('资料.'+ext,data);expect(passages).toEqual([{location:'正文',text:'专属𠮷🦭阿拉伯 العربية é00123'}]);expect(passages[0].text).not.toContain('base64')
})
it.each(['slxls','sealsheet'])('%s 提取全部工作表文字与缓存显示值，保留工作表位置',async(ext)=>{
  realCodec();const first=写入单元格(写入单元格(创建工作表('一表𠮷',10,6),'A1','预算🦭'),'B1','=SUM(12,13)'),second=写入单元格(创建工作表('第二表',10,6),'A1','跨表资料')
  const data=await encode('table',{工作表列表:[first,second]}),passages=await extractUpload('预算.'+ext,data)
  expect(passages.map(p=>p.location)).toEqual(['一表𠮷','第二表']);expect(passages[0].text).toContain('预算🦭');expect(passages[0].text).toContain('25');expect(passages[1].text).toContain('跨表资料')
})
it.each(['slppt','sealshow'])('%s 模板与资料入口读取真实模型、备注和对象文字，不调用 PPTX 解析器',async(ext)=>{
  const read=realCodec(),legacy=vi.spyOn(桥接.office,'readPptx'),deck=创建演示文稿('原生演示.'+ext)
  deck.幻灯片列表[0].文本框列表=[创建文本框(40,40,600,80,'新疆汇报𠮷🦭')];deck.幻灯片列表[0].备注='讲者备注';deck.幻灯片列表[0].对象列表=[{id:'table',类型:'表格',表格:{单元格:[[{文本:'营收数据'}]]}} as any]
  const data=await encode('ppt',{演示文稿:deck,资源条目:[],警告:['原始来源记录']}),opened=await 读取演示来源('模板.'+ext,data),passages=await extractUpload('模板.'+ext,data)
  expect(opened.演示文稿).toEqual(deck);expect(opened.警告).toEqual(['原始来源记录']);expect(passages[0].text).toContain('新疆汇报𠮷🦭');expect(passages[0].text).toContain('讲者备注');expect(passages[0].text).toContain('营收数据');expect(read).toHaveBeenCalledTimes(2);expect(legacy).not.toHaveBeenCalled()
})
it('SPDF 资料先校验专属包再向 PDF 阅读/扫描识别提供原始 PDF 字节',async()=>{
  realCodec();const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Native PDF',{font});const bytes=Buffer.from(await pdf.save()),data=await encode('pdf',{PDF数据:bytes.toString('base64')})
  const unwrapped=await 读取PDF来源数据('原件.spdf',data);expect(Buffer.from(unwrapped,'base64')).toEqual(bytes);expect((await PDFDocument.load(unwrapped)).getPageCount()).toBe(1)
  expect(await 读取PDF来源数据('原件.pdf',bytes.toString('base64'))).toBe(bytes.toString('base64'))
})
it('损坏专属内容和类型混淆会阻止资料导入，不把无效 ZIP 当文字继续处理',async()=>{
  realCodec();await expect(extractUpload('损坏.sldoc',Buffer.from('bad zip').toString('base64'))).rejects.toThrow()
  const table=await encode('table',{工作表列表:[创建工作表('数据',10,6)]});await expect(读取演示来源('伪装.slppt',table)).rejects.toThrow();await expect(读取PDF来源数据('伪装.spdf',table)).rejects.toThrow()
})
