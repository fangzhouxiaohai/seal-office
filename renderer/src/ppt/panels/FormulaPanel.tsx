import { useEffect, useState } from 'react'
import { App as AntdApp } from 'antd'
import type { 演示对象 } from '../deck'
import { 创建公式, 默认公式表达式, 默认公式颜色, 默认公式字号, 更新公式 } from '../model/formulas'
import { 公式内容 } from '../render/FormulaRenderer'

interface Props {
  对象?: 演示对象
  只读: boolean
  on插入: (对象: 演示对象) => void
  on替换: (对象: 演示对象) => void
}

/** 公式面板：受限线性语法输入、即时预览、插入或应用到选中公式。 */
export default function FormulaPanel({ 对象, 只读, on插入, on替换 }: Props) {
  const { modal } = AntdApp.useApp()
  const 选中公式 = 对象?.类型 === '公式' ? 对象 : undefined
  const [表达式, set表达式] = useState(选中公式?.公式?.表达式 ?? 默认公式表达式)
  const [字号, set字号] = useState(选中公式?.公式?.字号 ?? 默认公式字号)
  const [颜色, set颜色] = useState(选中公式?.公式?.颜色 ?? 默认公式颜色)
  useEffect(() => { if (选中公式?.公式) { set表达式(选中公式.公式.表达式); set字号(选中公式.公式.字号); set颜色(选中公式.公式.颜色) } }, [选中公式?.id])
  const 试算 = (执行: () => void) => { try { 执行() } catch (错误) { modal.error({ title: '公式无效', content: 错误 instanceof Error ? 错误.message : '公式表达式无法解析' }) } }
  const 预览对象: 演示对象 = { id: '预览', 类型: '公式', x: 0, y: 0, width: 360, height: 110, 公式: { 表达式, 字号, 颜色 } }
  return (
    <aside className="wps-ppt-properties" aria-label="公式设置">
      <fieldset disabled={只读}><legend>公式</legend>
        <label>表达式<textarea aria-label="公式表达式" value={表达式} onChange={e => set表达式(e.target.value)} rows={2}/></label>
        <p>支持上下标（<code>x^2</code>、<code>a_1</code>）、分数（<code>\frac{'{a}{b}'}</code>）、根号（<code>\sqrt{'{x}'}</code>）与常用希腊字母宏；其他结构会明确报错，不做近似替换。</p>
        <div className="wps-ppt-element__grid">
          <label>字号<input aria-label="公式字号" type="number" min={8} max={96} value={字号} onChange={e => set字号(Number(e.target.value))}/></label>
          <label>颜色<input aria-label="公式颜色" type="color" value={颜色} onChange={e => set颜色(e.target.value)}/></label>
        </div>
        <div className="wps-ppt-formula-preview" aria-label="公式预览"><公式内容 对象={预览对象}/></div>
        <div className="wps-ppt-properties__actions">
          <button type="button" onClick={() => 试算(() => on插入(创建公式(表达式, 字号, 颜色)))}>插入新公式</button>
          <button type="button" disabled={!选中公式} onClick={() => 选中公式 && 试算(() => on替换(更新公式(选中公式, { 表达式, 字号, 颜色 })))}>应用到选中公式</button>
        </div>
        {!选中公式 && <p>在画布选择公式对象后可修改已有公式；当前操作会插入新公式。</p>}
      </fieldset>
    </aside>
  )
}
