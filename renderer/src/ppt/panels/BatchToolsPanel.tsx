import React from 'react'
import { App, Modal, Table } from 'antd'
import type { 演示文稿 } from '../deck'
import { 桥接, type 演示导出文件 } from '../../ipc/bridge'
import { 生成导出Html } from '../export/exportHtml'
import { 规划导出页, 默认导出选项, type 导出选项 } from '../model/exportPlan'
import { 读取页面尺寸 } from '../model/pageSize'
import type { 图片地址表 } from '../render/SlideObjects'
import './tools.css'

export type 批量操作 = '资源检查' | '批量导出PDF' | '转图片PPT'

interface 批量结果项 {
  标识: string
  名称: string
  成功: boolean
  已取消?: boolean
  错误?: string
  页数?: number
  文件?: 演示导出文件[]
}

interface Props {
  文稿: 演示文稿
  图片地址: 图片地址表
  打开?: boolean
  on关闭?: () => void
}

const 操作列表: 批量操作[] = ['资源检查', '批量导出PDF', '转图片PPT']

/** 批量工具：逐文件独立结果、失败不撤销其他成功输出、可随时取消。 */
export default function BatchToolsPanel({ 文稿, 图片地址, 打开 = false, on关闭 }: Props) {
  const { modal, message } = App.useApp()
  const [文件列表, set文件列表] = React.useState<string[]>([])
  const [操作, set操作] = React.useState<批量操作>('资源检查')
  const [结果, set结果] = React.useState<批量结果项[]>([])
  const [执行中, set执行中] = React.useState(false)
  const 取消标记 = React.useRef(false)

  const 选择文件 = async () => {
    try {
      const 选择 = await 桥接.showOpenDialogMany('ppt' as const)
      if (!Array.isArray(选择)) throw new Error('文件选择未返回结果')
      set文件列表(选择)
      set结果([])
      if (选择.length === 0) message.info('未选择任何演示文稿')
    } catch (错误) {
      modal.error({ title: '选择文件失败', content: 错误 instanceof Error ? 错误.message : '无法打开文件选择窗口' })
    }
  }

  const 转为任务列表 = () => 文件列表.map((路径, i) => ({ 标识: `文件${i + 1}`, 名称: 路径.split(/[\\/]/).pop() ?? 路径, 路径 }))

  const 执行 = async () => {
    if (文件列表.length === 0) {
      modal.warning({ title: '无法执行批量操作', content: '请先选择至少一个演示文稿文件。' })
      return
    }
    set执行中(true)
    取消标记.current = false
    set结果([])
    try {
      if (操作 === '资源检查') {
        const 返回 = await 桥接.presentationBatch.check(转为任务列表())
        if (!返回.成功) throw new Error((返回 as { 错误?: string }).错误 ?? '批量检查失败')
        set结果(((返回 as { 结果?: 批量结果项[] }).结果) ?? [])
      } else {
        await 执行导出批量()
      }
    } catch (错误) {
      modal.error({ title: '批量操作失败', content: 错误 instanceof Error ? 错误.message : '批量操作未能完成' })
    } finally {
      set执行中(false)
    }
  }

  const 执行导出批量 = async () => {
    const 目录选择 = await 桥接.presentationExport.pickDirectory()
    if (!目录选择?.成功 || !目录选择.目录) {
      set结果(转为任务列表().map(项 => ({ ...项, 成功: false, 错误: '已取消选择导出位置' })))
      return
    }
    const 基础选项: 导出选项 = { ...默认导出选项, 格式: 'PDF', 范围: '全部', ...(文稿.讲义设置 ? { 讲义设置: 文稿.讲义设置, 讲义每页张数: 文稿.讲义设置.每页张数 } : {}), ...(文稿.备注设置 ? { 备注设置: 文稿.备注设置 } : {}) }
    const 页面尺寸 = 读取页面尺寸(文稿)
    const 累计: 批量结果项[] = []
    for (const 项 of 转为任务列表()) {
      if (取消标记.current) {
        累计.push({ ...项, 成功: false, 已取消: true })
        set结果([...累计])
        continue
      }
      try {
        const 导出页 = 规划导出页(文稿, 基础选项)
        const html = 生成导出Html(文稿, 基础选项, 图片地址, 页面尺寸, 文稿.name)
        const 返回 = await 桥接.presentationExport.run({
          html,
          格式: 操作 === '转图片PPT' ? '图片型PPTX' : 'PDF',
          页面尺寸,
          条目: 导出页.map((页项, i) => ({ 序号: i, 标识: 页项.页.id })),
          基础名: `${(项.名称 ?? '演示文稿').replace(/\.[^.]+$/, '')}${操作 === '转图片PPT' ? '-图片版' : ''}`,
          目录: 目录选择.目录,
          分辨率倍数: 基础选项.分辨率倍数,
          JPEG质量: 基础选项.JPEG质量,
        })
        if (!返回?.成功) throw new Error(返回?.错误 ?? '导出失败')
        累计.push({ ...项, 成功: true, 页数: 返回.页数, 文件: 返回.文件列表 })
      } catch (错误) {
        累计.push({ ...项, 成功: false, 错误: 错误 instanceof Error ? 错误.message : '导出失败' })
      }
      set结果([...累计])
    }
  }

  const 取消 = () => {
    取消标记.current = true
    message.info('已请求取消：当前文件处理完成后停止，已完成的结果会保留')
  }

  const 汇总 = {
    总数: 结果.length,
    成功: 结果.filter(项 => 项.成功).length,
    失败: 结果.filter(项 => !项.成功 && !项.已取消).length,
    已取消: 结果.filter(项 => 项.已取消).length,
  }

  return (
    <Modal title="批量工具" open={打开} onCancel={on关闭} footer={null} width={680} destroyOnHidden>
      <div className="wps-tools__group">
        <div className="wps-ppt-properties__actions">
          <button type="button" onClick={() => void 选择文件()} disabled={执行中}>选择演示文稿（可多选）</button>
          <select aria-label="批量操作" value={操作} onChange={事件 => set操作(事件.target.value as 批量操作)} disabled={执行中}>
            {操作列表.map(项 => <option key={项} value={项}>{项}</option>)}
          </select>
          <button type="button" onClick={() => void 执行()} disabled={执行中}>{执行中 ? '正在执行…' : '开始执行'}</button>
          <button type="button" onClick={取消} disabled={!执行中}>取消</button>
        </div>
        {文件列表.length === 0
          ? <p className="wps-tools__hint">尚未选择文件。</p>
          : <ol className="wps-tools__files">{文件列表.map(路径 => <li key={路径}>{路径}</li>)}</ol>}
        <p className="wps-tools__hint">每个文件独立记录结果；单个文件失败不会撤销其他文件的成功输出；取消后已完成结果保留，可再次执行剩余文件。</p>
      </div>
      {结果.length > 0 && (
        <div className="wps-tools__group">
          <p className="wps-tools__hint">共 {汇总.总数} 个：成功 {汇总.成功}，失败 {汇总.失败}，已取消 {汇总.已取消}</p>
          <Table<批量结果项>
            size="small"
            rowKey="标识"
            pagination={false}
            dataSource={结果}
            columns={[
              { title: '文件', dataIndex: '名称' },
              { title: '结果', render: (_, 项) => 项.成功 ? <span className="wps-tools__ok">成功</span> : 项.已取消 ? '已取消' : <span className="wps-tools__fail">失败</span> },
              { title: '说明', render: (_, 项) => 项.成功 ? `${项.页数 ?? 0} 页${项.文件?.length ? `；${项.文件.map(文件 => 文件.路径).join('、')}` : ''}` : (项.错误 ?? '') },
            ]}
          />
        </div>
      )}
    </Modal>
  )
}
