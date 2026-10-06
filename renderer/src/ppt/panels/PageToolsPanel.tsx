import React from 'react'
import { App, Modal } from 'antd'
import type { 演示文稿 } from '../deck'
import { 桥接 } from '../../ipc/bridge'
import { 恢复导入图片 } from '../render/resources'
import { 合并演示文稿, 拆分演示文稿, 页面数量上限, 校验合并 } from '../model/pages'
import './tools.css'

interface Props {
  文稿: 演示文稿
  只读: boolean
  on修改: (文稿: 演示文稿) => void
  /** 拆分出的新文稿交给上层新建标签 */
  on拆分: (新文稿: 演示文稿) => void
  打开?: boolean
  on关闭?: () => void
  初始视图?: '合并' | '拆分'
}

/** 页面工具：把来源演示文稿的页面合并到当前文稿，或把选定页面拆分为新文稿。 */
export default function PageToolsPanel({ 文稿, 只读, on修改, on拆分, 打开 = false, on关闭, 初始视图 = '合并' }: Props) {
  const { modal, message } = App.useApp()
  const [视图, set视图] = React.useState<'合并' | '拆分'>(初始视图)
  const [来源, set来源] = React.useState<演示文稿 | null>(null)
  const [选中, set选中] = React.useState<string[]>([])
  const [加载中, set加载中] = React.useState(false)

  React.useEffect(() => { if (打开) set视图(初始视图) }, [打开, 初始视图])

  const 选择来源 = async () => {
    set加载中(true)
    try {
      const 路径 = await 桥接.showOpenDialog('ppt' as const)
      if (!路径) { message.info('未选择文件，当前文稿没有变化'); return }
      const 读取 = await 桥接.readFile(路径)
      if (!读取?.成功 || !读取.内容) throw new Error(读取?.错误 ?? '无法读取所选演示文稿')
      const 解析 = await 桥接.office.readPptx(读取.内容)
      if (!解析?.成功 || !解析.演示文稿) throw new Error(解析?.错误 ?? '所选文件不是可读取的演示文稿')
      const 候选 = await 恢复导入图片({ 演示文稿: 解析.演示文稿, 资源条目: 解析.资源条目 })
      校验合并(文稿, 候选)
      set来源(候选)
    } catch (错误) {
      set来源(null)
      modal.error({ title: '无法载入来源文稿', content: 错误 instanceof Error ? 错误.message : '所选文件无法作为合并来源' })
    } finally {
      set加载中(false)
    }
  }

  const 执行合并 = () => {
    if (只读 || !来源) return
    try {
      const 结果 = 合并演示文稿(文稿, 来源)
      on修改(结果)
      set来源(null)
      message.success(`已追加 ${来源.幻灯片列表.length} 页，可用撤销还原`)
    } catch (错误) {
      modal.error({ title: '合并失败', content: 错误 instanceof Error ? 错误.message : '无法合并这两份文稿' })
    }
  }

  const 执行拆分 = () => {
    if (只读) return
    try {
      const 新稿 = 拆分演示文稿(文稿, 选中)
      on拆分(新稿)
      set选中([])
      message.success(`已把 ${新稿.幻灯片列表.length} 页拆分为新文稿`)
    } catch (错误) {
      modal.error({ title: '拆分失败', content: 错误 instanceof Error ? 错误.message : '无法拆分选定的页面' })
    }
  }

  const 选中页 = 文稿.幻灯片列表.filter(页 => 选中.includes(页.id))

  return (
    <Modal title="页面工具" open={打开} onCancel={on关闭} footer={null} width={640} destroyOnHidden>
      <div className="wps-ppt-properties__actions">
        <button type="button" aria-pressed={视图 === '合并'} onClick={() => set视图('合并')}>合并演示文稿</button>
        <button type="button" aria-pressed={视图 === '拆分'} onClick={() => set视图('拆分')}>拆分页面</button>
      </div>
      {只读 && <p className="wps-tools__hint">当前文稿为只读状态，无法合并或拆分；请先解除只读或定稿。</p>}
      {视图 === '合并' ? (
        <fieldset disabled={只读 || 加载中}>
          <legend>把另一份演示文稿的页面追加到当前文稿（当前 {文稿.幻灯片列表.length} 页，上限 {页面数量上限} 页）</legend>
          <div className="wps-ppt-properties__actions">
            <button type="button" onClick={() => void 选择来源()} disabled={只读 || 加载中}>{加载中 ? '正在读取…' : '选择来源演示文稿'}</button>
            <button type="button" onClick={执行合并} disabled={只读 || !来源}>追加到当前文稿</button>
          </div>
          {来源 ? (
            <>
              <p className="wps-tools__hint">来源：{来源.name}，共 {来源.幻灯片列表.length} 页；合并后 {文稿.幻灯片列表.length + 来源.幻灯片列表.length} 页。</p>
              <ol className="wps-tools__files">{来源.幻灯片列表.map((页, i) => <li key={页.id}>{i + 1}. {页.title || '未命名页'}</li>)}</ol>
            </>
          ) : <p className="wps-tools__hint">尚未选择来源文件。取消选择不会改动当前文稿。</p>}
          <p className="wps-tools__hint">合并后可一次撤销还原；来源文件不会被修改。</p>
        </fieldset>
      ) : (
        <fieldset disabled={只读}>
          <legend>把选定页面输出为新文稿（当前 {文稿.幻灯片列表.length} 页）</legend>
          <div className="wps-ppt-properties__actions">
            <button type="button" onClick={() => set选中(文稿.幻灯片列表.map(页 => 页.id))}>全选</button>
            <button type="button" onClick={() => set选中([])}>清空选择</button>
            <button type="button" onClick={执行拆分} disabled={只读 || 选中.length === 0}>拆分为新文稿</button>
          </div>
          <ol className="wps-tools__files">
            {文稿.幻灯片列表.map((页, i) => (
              <li key={页.id}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`选择第 ${i + 1} 页`}
                    checked={选中.includes(页.id)}
                    disabled={只读}
                    onChange={事件 => set选中(当前 => 事件.target.checked ? [...当前, 页.id] : 当前.filter(标识 => 标识 !== 页.id))}
                  />
                  {i + 1}. {页.title || '未命名页'}
                </label>
              </li>
            ))}
          </ol>
          <p className="wps-tools__hint">
            已选 {选中.length} 页{选中页.length > 0 ? `：${选中页.slice(0, 5).map(页 => 页.title || '未命名页').join('、')}${选中页.length > 5 ? ' 等' : ''}` : ''}。
            拆分只创建新文稿，当前文稿保持不变；不能把全部页面拆出，至少保留一页。
          </p>
        </fieldset>
      )}
    </Modal>
  )
}
