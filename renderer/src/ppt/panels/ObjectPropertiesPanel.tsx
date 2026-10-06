import { 对象允许编辑, 对象可以移动, 对象支持旋转 } from '../model/objectPermissions'
import DiagramStructurePanel from './DiagramStructurePanel'
import { useState } from 'react'
import ElementContentPanel from './ElementContentPanel'
import type { 幻灯片, 演示文稿, 演示对象 } from '../deck'
import type { 几何修改 } from '../model/objectOperations'
import { 校验链接数据, 校验媒体数据 } from '../model/mediaObjects'
interface Props { 页: 幻灯片; 选中: string[]; 只读: boolean; on修改: (修改: 几何修改) => void; on操作: (命令: string) => void; on替换?: (对象: 演示对象) => void; on选中?: (标识: string[]) => void; 文稿?: 演示文稿; on选择封面?: () => void; on提示?: (标题: string, 内容: string) => void }
function 数值项({ 名称, 值, 禁用, on提交 }: { 名称: string; 值: number; 禁用: boolean; on提交: (值: number) => void }) {
  const [草稿, set草稿] = useState<string | null>(null)
  const 提交 = () => { if (草稿 !== null && !禁用) { on提交(草稿.trim() === '' ? NaN : Number(草稿)); set草稿(null) } }
  return <label>{名称}<input aria-label={名称} type="number" step="0.1" disabled={禁用} value={草稿 ?? 值} onChange={事件 => set草稿(事件.target.value)} onBlur={提交} onKeyDown={事件 => { if (事件.key === 'Enter') 事件.currentTarget.blur(); if (事件.key === 'Escape') set草稿(null) }} /></label>
}
export default function ObjectPropertiesPanel({ 页, 选中, 只读, on修改, on操作, on替换, on选中, 文稿, on选择封面, on提示 }: Props) {
  const 对象 = 页.对象列表?.find(项 => 项.id === 选中[0])
  if (!对象) return null
  const 禁用 = 只读 || 选中.some(id => !对象可以移动(页,id)), 裁剪 = 对象.裁剪 ?? { 左: 0, 上: 0, 右: 0, 下: 0 }
  const 操作按钮 = (命令: string, 名称: string, 不可用 = 禁用) => <button key={命令} type="button" disabled={不可用} onClick={() => on操作(命令)}>{名称}</button>
  const 替换 = (修改: Partial<演示对象>) => {
    if (禁用 || !on替换) return
    try { on替换({ ...对象, ...修改 }) } catch (错误) { on提示?.('对象设置失败', 错误 instanceof Error ? 错误.message : '设置无效') }
  }
  const 媒体 = 对象.媒体
  const 链接 = 对象.链接
  const 页面标识 = (文稿?.幻灯片列表 ?? [页]).map(项 => 项.id)
  return <aside className="wps-ppt-properties" aria-label="对象属性">
    <h2>{选中.length > 1 ? `已选 ${选中.length} 个对象` : `${对象.类型}属性`}</h2>
    <fieldset disabled={禁用}><legend>位置和尺寸（像素）</legend><div className="wps-ppt-properties__fields">{(['x','y','width','height','旋转'] as const).map((键,i) => <数值项 key={`${对象.id}-${键}`} 名称={['水平位置','垂直位置','宽度','高度','旋转角度'][i]} 值={对象[键] ?? 0} 禁用={禁用 || (键 === '旋转' && 选中.some(id => { const 项 = 页.对象列表?.find(项 => 项.id === id); return !项 || !对象支持旋转(项) }))} on提交={值 => on修改({ [键]: 值 })} />)}</div></fieldset>
    {对象.类型 === '图片' && 选中.length === 1 && <fieldset disabled={禁用}><legend>裁剪（百分比）</legend><div className="wps-ppt-properties__fields">{(['左','上','右','下'] as const).map(边 => <数值项 key={`${对象.id}-${边}`} 名称={`${边}裁剪`} 值={裁剪[边] * 100} 禁用={禁用} on提交={值 => on修改({ 裁剪: { ...裁剪, [边]: 值 / 100 } })} />)}</div></fieldset>}
    {对象.类型 === '媒体' && 媒体 && 选中.length === 1 && <fieldset disabled={禁用} data-媒体属性>
      <legend>{媒体.种类}播放设置</legend>
      <div className="wps-ppt-properties__fields">
        <label>音量<input aria-label="媒体音量" type="number" min={0} max={100} step={5} value={媒体.音量} disabled={禁用} onChange={事件 => 替换({ 媒体: 校验媒体数据({ ...媒体, 音量: Number(事件.target.value) }) })} /></label>
        <label>开始（秒）<input aria-label="媒体开始秒" type="number" min={0} step={0.5} value={(媒体.开始毫秒 ?? 0) / 1000} disabled={禁用} onChange={事件 => { const 秒 = Number(事件.target.value); const 值 = Number.isFinite(秒) && 秒 > 0 ? Math.round(秒 * 1000) : undefined; 替换({ 媒体: 校验媒体数据({ ...媒体, 开始毫秒: 值 }) }) }} /></label>
        <label>结束（秒）<input aria-label="媒体结束秒" type="number" min={0} step={0.5} value={媒体.结束毫秒 === undefined ? 0 : 媒体.结束毫秒 / 1000} disabled={禁用} onChange={事件 => { const 秒 = Number(事件.target.value); const 值 = Number.isFinite(秒) && 秒 > 0 ? Math.round(秒 * 1000) : undefined; 替换({ 媒体: 校验媒体数据({ ...媒体, 结束毫秒: 值 }) }) }} /></label>
      </div>
      <div className="wps-ppt-properties__actions">
        <label className="wps-animation-check"><input type="checkbox" checked={媒体.循环} disabled={禁用} onChange={事件 => 替换({ 媒体: 校验媒体数据({ ...媒体, 循环: 事件.target.checked }) })} />循环播放</label>
        <label className="wps-animation-check"><input type="checkbox" checked={媒体.自动播放} disabled={禁用} onChange={事件 => 替换({ 媒体: 校验媒体数据({ ...媒体, 自动播放: 事件.target.checked }) })} />进入页面自动播放</label>
      </div>
      <div className="wps-ppt-properties__actions">
        <button type="button" disabled={禁用 || !on选择封面} onClick={() => on选择封面?.()}>设置封面图片</button>
        <button type="button" disabled={禁用 || !媒体.封面资源标识} onClick={() => 替换({ 媒体: 校验媒体数据({ ...媒体, 封面资源标识: undefined }) })}>恢复默认封面</button>
      </div>
      <p>封面图片使用现有 PNG/JPEG 资源；结束时间为 0 表示播放到媒体结尾。</p>
    </fieldset>}
    {['图片','媒体'].includes(对象.类型) && 选中.length === 1 && <fieldset disabled={禁用} data-动作属性>
      <legend>动作与超链接</legend>
      <div className="wps-ppt-properties__fields">
        <label>动作<select aria-label="链接类型" value={链接?.类型 ?? '无'} disabled={禁用} onChange={事件 => {
          const 类型 = 事件.target.value
          if (类型 === '无') { const 新对象 = { ...对象 }; delete 新对象.链接; if (on替换) on替换(新对象); return }
          const 目标 = 类型 === '页' ? (页面标识[0] ?? '') : 类型 === '网页' ? 'https://' : ''
          try { 替换({ 链接: 校验链接数据({ 类型, 目标 } as never, 页面标识) }) } catch (错误) { on提示?.('动作设置失败', 错误 instanceof Error ? 错误.message : '动作无效') }
        }}><option value="无">无动作</option><option value="网页">打开网页</option><option value="页">跳转到页面</option><option value="结束">结束放映</option></select></label>
        {链接?.类型 === '页' && <label>目标页<select aria-label="跳转目标页" value={链接.目标} disabled={禁用} onChange={事件 => 替换({ 链接: 校验链接数据({ 类型: '页', 目标: 事件.target.value }, 页面标识) })}>{页面标识.map((标识, 序号) => <option key={标识} value={标识}>第 {序号 + 1} 页</option>)}</select></label>}
        {链接?.类型 === '网页' && <label>网址<input aria-label="链接网址" type="text" defaultValue={链接.目标} disabled={禁用} onBlur={事件 => { try { 替换({ 链接: 校验链接数据({ 类型: '网页', 目标: 事件.target.value.trim() }, 页面标识) }) } catch (错误) { on提示?.('链接地址无效', 错误 instanceof Error ? 错误.message : '请输入 http 或 https 网址'); 事件.target.value = 链接.目标 } }} /></label>}
      </div>
      <p>只允许 http、https、mailto 与文稿内页面跳转；填写其他协议会被拒绝。</p>
    </fieldset>}
    {on替换 && 选中.length === 1 && <ElementContentPanel key={`内容-${对象.id}`} 对象={对象} 禁用={禁用} on替换={on替换}/>}
    {对象.语义类型 && <DiagramStructurePanel key={`结构-${对象.id}`} 页={页} 组={对象} 禁用={禁用} on操作={on操作}/>}
    {对象.子对象标识 && <fieldset className="wps-ppt-element-members"><legend>组合成员</legend><div className="wps-ppt-properties__actions">{对象.子对象标识.map(id => { const 子 = 页.对象列表?.find(项 => 项.id === id); return <button key={id} title={子?.形状?.文本 || 子?.类型} type="button" disabled={只读 || !对象允许编辑(页,id,true)} onClick={() => { if (对象允许编辑(页,id,true)) on选中?.([id]) }}>{子?.形状?.文本 || 子?.形状?.种类 || 子?.类型}</button> })}</div>{对象.语义类型 && <p>外部软件中为可编辑形状与文本组合，本机保留{对象.语义类型}连接结构。</p>}</fieldset>}
    <fieldset><legend>排列</legend><div className="wps-ppt-properties__actions">{['左','水平居中','右','上','垂直居中','下'].map(方向 => 操作按钮(`对齐:${方向}`, 方向, 禁用 || 选中.length < 2))}{['水平','垂直'].map(方向 => 操作按钮(`分布:${方向}`, `${方向}分布`, 禁用 || 选中.length < 3))}{['置顶','置底','上移','下移'].map(方向 => 操作按钮(`图层:${方向}`, 方向))}</div></fieldset>
    <div className="wps-ppt-properties__actions">{操作按钮('组合', '组合', 禁用 || 选中.length < 2)}{操作按钮('取消组合', '取消组合', 禁用 || 对象.类型 !== '组合')}{操作按钮(对象.锁定 ? '解锁' : '锁定', 对象.锁定 ? '解锁' : '锁定', 只读 || 选中.some(id => !对象允许编辑(页,id,!!对象.锁定)))}{操作按钮('删除', '删除')}</div>
  </aside>
}
