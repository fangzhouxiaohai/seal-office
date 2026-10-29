import { expect, it, vi } from 'vitest'
import { 自适应列宽 } from './autoFitColumns'
import { 创建工作表, 写入单元格 } from './model'
it('按显示结果、换行和分段字体计算列宽，忽略跨列标题，保留空列，原模型可撤销',()=>{
  let sheet=创建工作表('测试',10,6)
  sheet=写入单元格(sheet,'A1','跨列很长很长的标题')
  sheet.合并区域=['A1:C1']
  sheet=写入单元格(sheet,'A2','中文\n四个汉字')
  sheet=写入单元格(sheet,'B2','=100+23')
  sheet=写入单元格(sheet,'C2','AB')
  sheet.单元格.C2.富文本=[{文本:'A',格式:{字号:40}},{文本:'B',格式:{字号:10}}]
  const before=[...sheet.列宽]
  const fitted=自适应列宽(sheet,(text,format)=>text.length*(format.字号??20))
  expect(fitted.列宽.slice(0,3)).toEqual([98,78,68])
  expect(fitted.列宽.slice(3)).toEqual(before.slice(3))
  expect(sheet.列宽).toEqual(before)
  expect(()=>自适应列宽({...sheet,保护:'本机'},()=>100)).toThrow('保护')
})

it('来源点数字号换算为像素后参与实际文字测量', () => {
  const context = { font: '', measureText: vi.fn(() => ({ width: 96 })) }
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as any)
  try {
    const sheet = 写入单元格(创建工作表('字号', 2, 2), 'A1', '合成文字')
    sheet.单元格.A1.格式.字号 = 12
    自适应列宽(sheet)
    expect(context.font).toContain('16px')
  } finally { spy.mockRestore() }
})
