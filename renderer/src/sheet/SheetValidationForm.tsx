import { useState } from 'react'
import type { 单元格数据验证 } from './model'

export interface 验证草稿 {
  类型: '无' | '列表' | '整数' | '小数'
  选项: string
  最小值: string
  最大值: string
  允许空白: boolean
}

export function 创建验证草稿(规则?: 单元格数据验证): 验证草稿 {
  return {
    类型: 规则?.类型 ?? '列表',
    选项: 规则?.类型 === '列表' ? 规则.选项.join('\n') : '',
    最小值: 规则 && 规则.类型 !== '列表' ? String(规则.最小值) : '',
    最大值: 规则 && 规则.类型 !== '列表' ? String(规则.最大值) : '',
    允许空白: 规则?.允许空白 ?? true,
  }
}

export default function SheetValidationForm({ 初始值, on变化 }: { 初始值: 验证草稿; on变化: (草稿: 验证草稿) => void }) {
  const [草稿, set草稿] = useState(初始值)
  const 更新 = (部分: Partial<验证草稿>) => {
    const 下一个 = { ...草稿, ...部分 }
    set草稿(下一个)
    on变化(下一个)
  }
  return <div className="wps-sheet-validation-dialog">
    <label htmlFor="sheet-validation-type">验证类型</label>
    <select id="sheet-validation-type" value={草稿.类型} onChange={(事件) => 更新({ 类型: 事件.target.value as 验证草稿['类型'] })}>
      <option value="列表">选项列表</option>
      <option value="整数">整数区间</option>
      <option value="小数">小数区间</option>
      <option value="无">清除规则</option>
    </select>
    {草稿.类型 === '列表' ? <>
      <label htmlFor="sheet-validation-options">选项（每行一项）</label>
      <textarea id="sheet-validation-options" value={草稿.选项} rows={4} onChange={(事件) => 更新({ 选项: 事件.target.value })} />
    </> : null}
    {草稿.类型 === '整数' || 草稿.类型 === '小数' ? <div className="wps-sheet-validation-dialog__range">
      <label htmlFor="sheet-validation-min">最小值<input id="sheet-validation-min" type="number" step={草稿.类型 === '整数' ? '1' : 'any'} value={草稿.最小值} onChange={(事件) => 更新({ 最小值: 事件.target.value })} /></label>
      <label htmlFor="sheet-validation-max">最大值<input id="sheet-validation-max" type="number" step={草稿.类型 === '整数' ? '1' : 'any'} value={草稿.最大值} onChange={(事件) => 更新({ 最大值: 事件.target.value })} /></label>
    </div> : null}
    {草稿.类型 !== '无' ? <label className="wps-sheet-validation-dialog__checkbox"><input type="checkbox" checked={草稿.允许空白} onChange={(事件) => 更新({ 允许空白: 事件.target.checked })} />允许空白</label> : null}
    <p>规则适用于当前选区。输入不符合规则时会阻止写入。</p>
  </div>
}
