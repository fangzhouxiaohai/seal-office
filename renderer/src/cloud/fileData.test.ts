import {describe,it,expect,vi} from 'vitest'
import {extractUpload,retrieval} from './fileData'
import {桥接} from '../ipc/bridge'
describe('知识文件正文检索',()=>{
  it('表格原始值和演示表格、图表数据都可被关键词检索',async()=>{
    const sheet=vi.spyOn(桥接.office,'readXlsx').mockResolvedValue({成功:true,工作表列表:[{name:'预算',单元格:{A1:{原始值:'乌鲁木齐',显示值:'乌鲁木齐'},B1:{原始值:'300',显示值:'300'}}}]} as any)
    const ppt=vi.spyOn(桥接.office,'readPptx').mockResolvedValue({成功:true,演示文稿:{幻灯片列表:[{title:'汇报',文本框列表:[],对象列表:[{表格:{单元格:[[{文本:'新疆销售'}]]}},{图表:{标题:'燃气',分类:['一期'],系列:[{名称:'营收',数值:[128]}]}}]}]}} as any)
    try{const a=await extractUpload('预算.xlsx','UEs='),b=await extractUpload('汇报.pptx','UEs=');expect(a[0]).toMatchObject({location:'预算'});expect(a[0].text).toContain('乌鲁木齐');expect(b[0].text).toContain('新疆销售');expect(b[0].text).toContain('128');expect(retrieval([...a,...b],'新疆')[0].text).toContain('新疆销售')}finally{sheet.mockRestore();ppt.mockRestore()}
  })
})
