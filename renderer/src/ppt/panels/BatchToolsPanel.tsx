import React from 'react'
import { App, Modal, Table } from 'antd'
import type { 演示文稿 } from '../deck'
import { 桥接, type 演示导出文件 } from '../../ipc/bridge'
import { 生成导出Html } from '../export/exportHtml'
import { 规划导出页, 默认导出选项, type 导出选项 } from '../model/exportPlan'
import { 读取页面尺寸 } from '../model/pageSize'
import { 内置主题列表, 应用主题, 统一字体 } from '../model/themes'
import type { 图片地址表 } from '../render/SlideObjects'
import './tools.css'

export type 批量操作 = '资源检查' | '批量导出PDF' | '转图片PPT' | '统一主题与字体'

interface 批量结果项 {
  标识: string
  名称: string
  成功: boolean
  已取消?: boolean
  错误?: string
  页数?: number
  文件?: 演示导出文件[]
  说明?: string
}

interface Props {
  文稿: 演示文稿
  图片地址: 图片地址表
  打开?: boolean
  只读?: boolean
  on关闭?: () => void
}

const 操作列表: 批量操作[] = ['资源检查', '批量导出PDF', '转图片PPT', '统一主题与字体']

/** 需要写盘的操作：只读状态下必须禁用，避免在只读预期下改写用户文件。 */
const 需要写入 = (操作: 批量操作) => 操作 !== '资源检查'


/** 批量工具：逐文件独立结果、失败不撤销其他成功输出、可随时取消。 */
export default function BatchToolsPanel({ 文稿, 图片地址, 打开 = false, 只读 = false, on关闭 }: Props) {
  const { modal, message } = App.useApp()
  const [文件列表, set文件列表] = React.useState<string[]>([])
  const [操作, set操作] = React.useState<批量操作>('资源检查')
  const [结果, set结果] = React.useState<批量结果项[]>([])
  const [执行中, set执行中] = React.useState(false)
  const [主题标识, set主题标识] = React.useState(内置主题列表[0]?.标识 ?? '')
  const [标题字体, set标题字体] = React.useState('')
  const [正文字体, set正文字体] = React.useState('')
  const [覆盖显式字体, set覆盖显式字体] = React.useState(false)
  const [输出方式, set输出方式] = React.useState<'另存为新文件' | '覆盖原文件'>('另存为新文件')
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
    if (只读 && 需要写入(操作)) {
      modal.warning({ title: '无法执行批量操作', content: '当前为只读状态，写入类批量操作已禁用。请先解除只读。' })
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
      } else if (操作 === '统一主题与字体') {
        await 执行统一批量()
      } else {
        await 执行导出批量()
      }
    } catch (错误) {
      modal.error({ title: '批量操作失败', content: 错误 instanceof Error ? 错误.message : '批量操作未能完成' })
    } finally {
      set执行中(false)
    }
  }

  /** 覆盖原文件前二次确认；取消确认时不写盘、也不改动任何文件。 */
  const 确认覆盖 = () => new Promise<boolean>(解决 => {
    modal.confirm({
      title: '覆盖原文件？',
      content: '所选演示文稿将被直接覆盖，不保留原文件副本。请确认这些文件已备份或不再需要。含未完整支持内容的文件会被自动阻止覆盖。',
      okText: '覆盖写入', cancelText: '取消',
      onOk: () => 解决(true), onCancel: () => 解决(false),
    })
  })

  /** 批量统一主题与字体：逐文件读取→应用主题与字体→写回，单个文件失败不影响其他文件。 */
  const 执行统一批量 = async () => {
    const 主题 = 内置主题列表.find(项 => 项.标识 === 主题标识)
    if (!主题) {
      modal.warning({ title: '无法执行批量操作', content: '请选择要统一使用的主题。' })
      return
    }
    const 要字体 = 标题字体.trim().length > 0 || 正文字体.trim().length > 0
    if (输出方式 === '覆盖原文件' && !(await 确认覆盖())) {
      message.info('已取消覆盖，未写入任何文件')
      return
    }
    const 累计: 批量结果项[] = []
    for (const 项 of 转为任务列表()) {
      if (取消标记.current) {
        累计.push({ ...项, 成功: false, 已取消: true })
        set结果([...累计])
        continue
      }
      try {
        const 读取 = await 桥接.readFile(项.路径)
        if (!读取?.成功 || !读取.内容) throw new Error(读取?.错误 ?? '文件读取失败')
        const 解析 = await 桥接.office.readPptx(读取.内容 as string)
        if (!解析?.成功 || !解析.演示文稿) throw new Error(解析?.错误 ?? '无法解析演示文稿，文件可能已损坏')
        const 警告: string[] = Array.isArray(解析.警告) ? 解析.警告 : []
        if (输出方式 === '覆盖原文件' && 警告.length > 0) {
          throw new Error(`原文件含未完整支持的内容（${警告.join('；')}），已阻止覆盖；请改用另存为新文件`)
        }
        let 新稿 = 应用主题(解析.演示文稿 as 演示文稿, 主题)
        let 字体说明 = ''
        if (要字体) {
          const 结果字体 = 统一字体(新稿, {
            ...(标题字体.trim() ? { 标题字体: 标题字体.trim() } : {}),
            ...(正文字体.trim() ? { 正文字体: 正文字体.trim() } : {}),
            ...(覆盖显式字体 ? { 覆盖显式字体: true } : {}),
          })
          新稿 = 结果字体.文稿
          字体说明 = `；字体应用 ${结果字体.应用数量} 处` + (结果字体.跳过显式字体 ? `，保留显式字体 ${结果字体.跳过显式字体} 处` : '')
        }
        const 写出 = await 桥接.office.writePptx({ ...新稿, 资源条目: 解析.资源条目 ?? [] })
        if (!写出?.成功 || !写出.数据) throw new Error(写出?.错误 ?? '无法写入演示文稿')
        const 目标 = 输出方式 === '覆盖原文件' ? 项.路径 : `${项.路径.replace(/\.pptx$/i, '')}-统一主题.pptx`
        const 保存 = await 桥接.saveToFile(目标, 写出.数据, '二进制')
        if (!保存?.成功) throw new Error(保存?.错误 ?? '写盘失败')
        累计.push({ ...项, 成功: true, 说明: `主题「${主题.名称}」${字体说明}；写入 ${目标}` })
      } catch (错误) {
        累计.push({ ...项, 成功: false, 错误: 错误 instanceof Error ? 错误.message : '统一主题与字体失败' })
      }
      set结果([...累计])
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
          <button
            type="button"
            onClick={() => void 执行()}
            disabled={执行中 || (只读 && 需要写入(操作))}
            title={只读 && 需要写入(操作) ? '只读状态：写入类批量操作已禁用，请先解除只读' : undefined}
          >{执行中 ? '正在执行…' : '开始执行'}</button>
          <button type="button" onClick={取消} disabled={!执行中}>取消</button>
        </div>
        {操作 === '统一主题与字体' && (
          <div className="wps-ppt-properties__actions">
            <label className="wps-tools__field">主题
              <select aria-label="统一主题" value={主题标识} onChange={事件 => set主题标识(事件.target.value)} disabled={执行中}>
                {内置主题列表.map(主题 => <option key={主题.标识} value={主题.标识}>{主题.名称}</option>)}
              </select>
            </label>
            <label className="wps-tools__field">标题字体
              <input aria-label="标题字体" value={标题字体} onChange={事件 => set标题字体(事件.target.value)} placeholder="留空表示不统一" disabled={执行中} />
            </label>
            <label className="wps-tools__field">正文字体
              <input aria-label="正文字体" value={正文字体} onChange={事件 => set正文字体(事件.target.value)} placeholder="留空表示不统一" disabled={执行中} />
            </label>
            <label className="wps-tools__field">输出方式
              <select aria-label="输出方式" value={输出方式} onChange={事件 => set输出方式(事件.target.value as '另存为新文件' | '覆盖原文件')} disabled={执行中}>
                <option value="另存为新文件">另存为新文件</option>
                <option value="覆盖原文件">覆盖原文件</option>
              </select>
            </label>
            <label className="wps-tools__check">
              <input type="checkbox" checked={覆盖显式字体} onChange={事件 => set覆盖显式字体(事件.target.checked)} disabled={执行中} />
              同时覆盖显式设置的字体
            </label>
          </div>
        )}
        {操作 === '统一主题与字体' && (
          <p className="wps-tools__hint">
            统一主题会更新使用主题色的文本，并保留用户显式设置的颜色；字体默认只改写未显式设置字体的文本框，需要连同显式字体一起改写时勾选上方选项。
            覆盖原文件会先二次确认，含未完整支持内容的文件会被阻止覆盖，请改用另存为新文件。
          </p>
        )}
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
              { title: '说明', render: (_, 项) => 项.成功 ? (项.说明 ?? `${项.页数 ?? 0} 页${项.文件?.length ? `；${项.文件.map(文件 => 文件.路径).join('、')}` : ''}`) : (项.错误 ?? '') },
            ]}
          />
        </div>
      )}
    </Modal>
  )
}
