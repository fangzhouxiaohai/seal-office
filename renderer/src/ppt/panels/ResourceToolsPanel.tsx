import React from 'react'
import { App, Modal, Table } from 'antd'
import type { 演示文稿 } from '../deck'
import { 更新幻灯片 } from '../deck'
import { 桥接 } from '../../ipc/bridge'
import { 收集演示资源标识 } from '../model/migrations'
import './tools.css'

interface Props {
  文稿: 演示文稿
  只读: boolean
  on修改: (文稿: 演示文稿) => void
  打开?: boolean
  on关闭?: () => void
}

interface 提取结果项 { 标识: string; 类型?: string; 路径?: string; 字节数?: number; 成功: boolean; 错误?: string }

/** 便捷工具：把文稿内资源提取到目录，以及对图片资源重采样压缩。 */
export default function ResourceToolsPanel({ 文稿, 只读, on修改, 打开 = false, on关闭 }: Props) {
  const { modal, message } = App.useApp()
  const [提取结果, set提取结果] = React.useState<提取结果项[]>([])
  const [汇总, set汇总] = React.useState<{ 总数: number; 成功: number; 失败: number } | null>(null)
  const [执行中, set执行中] = React.useState(false)
  const [目标对象, set目标对象] = React.useState('')
  const [质量, set质量] = React.useState(0.8)
  const [最大边, set最大边] = React.useState(1600)
  const [预览, set预览] = React.useState<{ 原字节数: number; 新字节数: number; 宽?: number; 高?: number; 数据?: string; 类型?: string } | null>(null)

  const 图片对象 = 文稿.幻灯片列表.flatMap((页, 页序) => (页.对象列表 ?? [])
    .filter(对象 => 对象.类型 === '图片' && 对象.资源标识)
    .map(对象 => ({ 对象, 页序, 页标识: 页.id, 页标题: 页.title })))

  const 提取资源 = async () => {
    const 标识列表 = [...new Set(收集演示资源标识(文稿))]
    if (标识列表.length === 0) { modal.warning({ title: '没有可提取的资源', content: '当前文稿没有图片或媒体资源。' }); return }
    set执行中(true)
    try {
      const 目录选择 = await 桥接.presentationExport.pickDirectory()
      if (!目录选择?.成功 || !目录选择.目录) { message.info('已取消选择提取目录，文稿没有变化'); return }
      const 导出 = await 桥接.presentationResources.export(标识列表)
      if (!导出?.成功 || !导出.条目) throw new Error(导出?.错误 ?? '无法读取文稿资源字节')
      const 返回 = await 桥接.presentationTools.writeResources(导出.条目, 目录选择.目录) as { 成功: boolean; 结果?: 提取结果项[]; 汇总?: { 总数: number; 成功: number; 失败: number }; 错误?: string }
      if (!返回.成功) throw new Error(返回.错误 ?? '资源提取失败')
      set提取结果(返回.结果 ?? [])
      set汇总(返回.汇总 ?? null)
    } catch (错误) {
      modal.error({ title: '资源提取失败', content: 错误 instanceof Error ? 错误.message : '资源提取未能完成' })
    } finally {
      set执行中(false)
    }
  }

  const 选择图片 = (键: string) => { set目标对象(键); set预览(null) }

  const 执行预览 = async () => {
    const 目标 = 图片对象.find(项 => `${项.页标识}:${项.对象.id}` === 目标对象)
    if (!目标) { modal.warning({ title: '请选择图片对象', content: '先选择要压缩的图片对象。' }); return }
    const 类型 = 文稿.资源索引?.[目标.对象.资源标识 ?? '']?.类型
    if (!类型) throw new Error('图片资源类型缺失，无法压缩')
    set执行中(true)
    try {
      const 读取 = await 桥接.presentationResources.read(目标.对象.资源标识 ?? '') as { 成功: boolean; 数据?: string; 错误?: string }
      if (!读取.成功 || !读取.数据) throw new Error(读取.错误 ?? '无法读取图片字节')
      const 返回 = await 桥接.presentationTools.compressImage({ 数据: 读取.数据, 类型 }, { 质量, 最大边 }) as { 成功: boolean; 数据?: string; 类型?: string; 原字节数?: number; 新字节数?: number; 宽?: number; 高?: number; 错误?: string }
      if (!返回.成功) throw new Error(返回.错误 ?? '图片压缩失败')
      set预览({ 原字节数: 返回.原字节数 ?? 0, 新字节数: 返回.新字节数 ?? 0, 宽: 返回.宽, 高: 返回.高, 数据: 返回.数据, 类型: 返回.类型 })
    } catch (错误) {
      set预览(null)
      modal.error({ title: '图片压缩失败', content: 错误 instanceof Error ? 错误.message : '图片压缩未能完成' })
    } finally {
      set执行中(false)
    }
  }

  const 应用压缩 = async () => {
    const 目标 = 图片对象.find(项 => `${项.页标识}:${项.对象.id}` === 目标对象)
    if (只读 || !目标 || !预览?.数据) return
    try {
      const 结果 = await 桥接.presentationResources.add(预览.数据, 预览.类型 ?? 'image/png') as { 成功: boolean; 标识?: string; 字节数?: number; 错误?: string }
      if (!结果.成功 || !结果.标识) throw new Error(结果.错误 ?? '压缩后的图片无法写入资源库')
      const 页 = 文稿.幻灯片列表.find(项 => 项.id === 目标.页标识)
      if (!页) throw new Error('目标页面已被删除')
      const 对象列表 = (页.对象列表 ?? []).map(项 => 项.id === 目标.对象.id ? { ...项, 资源标识: 结果.标识 } : 项)
      const 新标识 = 结果.标识
      on修改({
        ...更新幻灯片(文稿, 页.id, { 对象列表 }),
        资源索引: { ...(文稿.资源索引 ?? {}), [新标识]: { 指纹: 新标识, 类型: 预览.类型 ?? 'image/png', 字节数: 结果.字节数 ?? 预览.新字节数 } },
      })
      message.success(`已替换为压缩后的图片（${预览.原字节数} → ${预览.新字节数} 字节），可用撤销还原`)
      set预览(null)
    } catch (错误) {
      modal.error({ title: '应用压缩结果失败', content: 错误 instanceof Error ? 错误.message : '无法替换图片资源' })
    }
  }

  return (
    <Modal title="便捷工具" open={打开} onCancel={on关闭} footer={null} width={680} destroyOnHidden>
      <div className="wps-tools__group">
        <h3>资源提取</h3>
        <div className="wps-ppt-properties__actions">
          <button type="button" onClick={() => void 提取资源()} disabled={执行中 || 只读}>{执行中 ? '正在处理…' : '提取全部资源到目录'}</button>
        </div>
        {只读 && <p className="wps-tools__hint">当前文稿为只读状态，提取仍可查看结果，但压缩不会替换图片。</p>}
        {汇总 && <p className="wps-tools__hint">共 {汇总.总数} 个资源：成功 {汇总.成功}，失败 {汇总.失败}</p>}
        {提取结果.length > 0 && (
          <Table<提取结果项>
            size="small"
            rowKey={(项, i) => `${项.标识}-${i}`}
            pagination={false}
            dataSource={提取结果}
            columns={[
              { title: '资源', dataIndex: '标识', render: (值: string) => String(值).slice(0, 12) },
              { title: '结果', render: (_, 项) => 项.成功 ? <span className="wps-tools__ok">成功</span> : <span className="wps-tools__fail">失败</span> },
              { title: '说明', render: (_, 项) => 项.成功 ? `${项.路径}（${项.字节数} 字节）` : (项.错误 ?? '') },
            ]}
          />
        )}
      </div>
      <div className="wps-tools__group">
        <h3>图片压缩</h3>
        {图片对象.length === 0
          ? <p className="wps-tools__hint">当前文稿没有可压缩的图片对象。</p>
          : (
            <>
              <label className="wps-tools__field">目标图片
                <select aria-label="目标图片" value={目标对象} onChange={事件 => 选择图片(事件.target.value)}>
                  <option value="">请选择</option>
                  {图片对象.map(项 => <option key={`${项.页标识}:${项.对象.id}`} value={`${项.页标识}:${项.对象.id}`}>第 {项.页序 + 1} 页 · {项.页标题 || '未命名页'}</option>)}
                </select>
              </label>
              <label className="wps-tools__field">质量（0-1）
                <input aria-label="压缩质量" type="number" min={0.1} max={1} step={0.05} value={质量} onChange={事件 => set质量(Number(事件.target.value))} />
              </label>
              <label className="wps-tools__field">最大边（0 表示不限制）
                <input aria-label="最大边" type="number" min={0} step={100} value={最大边} onChange={事件 => set最大边(Number(事件.target.value))} />
              </label>
              <div className="wps-ppt-properties__actions">
                <button type="button" onClick={() => void 执行预览()} disabled={执行中 || !目标对象}>压缩预览</button>
                <button type="button" onClick={() => void 应用压缩()} disabled={只读 || !预览?.数据}>替换为压缩图片</button>
              </div>
              {预览 && <p className="wps-tools__hint">压缩结果：{预览.原字节数} → {预览.新字节数} 字节{预览.宽 && 预览.高 ? `，${预览.宽}×${预览.高}` : ''}。替换后可一次撤销还原。</p>}
              <p className="wps-tools__hint">压缩后没有变小的图片会明确提示并保持原图，不会静默替换。</p>
            </>
          )}
      </div>
    </Modal>
  )
}
