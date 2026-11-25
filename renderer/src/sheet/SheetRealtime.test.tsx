import { expect, it } from 'vitest'
import { 创建工作表, 批量写入单元格 } from './model'
import { 提取协作工作簿, 校验协作工作簿 } from './sheetRealtimeSource'

// 依赖旧 Node 云服务进程内夹具的双编辑器实时协作用例已随旧后端删除；
// 这里保留不需要服务端的协作源过滤与校验用例。
it('协作源过滤保留独立格式和未知公式缓存，拒绝混合日期基准及无界远端网格',()=>{
  const source=批量写入单元格(创建工作表('过滤',6,6),{A1:'=SEQUENCE(2,2)'})
  source.单元格.B2.格式={加粗:true};source.单元格.D1={原始值:'=_xlfn.FUTURE()',显示值:'1',格式:{},公式来源:{原始值:'=_xlfn.FUTURE()',结果:1,动态数组:true,数组范围:'D1:D2',数组缓存:{D2:0}}}
  const stripped=提取协作工作簿([source])
  expect(stripped[0].单元格.B1).toBeUndefined();expect(stripped[0].单元格.B2).toEqual({原始值:'',显示值:'',格式:{加粗:true}})
  expect(stripped[0].单元格.D1.公式来源?.数组缓存).toEqual({D2:0});expect(校验协作工作簿(stripped)).toBeNull()
  expect(校验协作工作簿([source,{...source,id:'other',日期系统1904:true}])).toContain('日期基准')
  expect(校验协作工作簿([{...source,行数:100000,列数:100000}])).toContain('安全显示范围')
})
