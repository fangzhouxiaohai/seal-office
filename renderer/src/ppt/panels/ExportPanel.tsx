import React from 'react'
import { App as AntdApp, Button, Modal, Space, Table, Tag } from 'antd'
import type { 演示文稿 } from '../deck'
import type { 图片地址表 } from '../render/SlideObjects'
import { 读取页面尺寸 } from '../model/pageSize'
import {
  导出格式列表,
  默认导出选项,
  规划导出页,
  校验导出选项,
  type 导出格式,
  type 导出选项,
  type 导出范围,
} from '../model/exportPlan'
import { 生成导出Html } from '../export/exportHtml'
import { 桥接, type 演示导出文件 } from '../../ipc/bridge'

interface Props {
  文稿: 演示文稿
  图片地址: 图片地址表
  选定页?: string[]
  打开: boolean
  on关闭: () => void
}

/** 需要栅格化的格式 */
const 图像格式: 导出格式[] = ['PNG', 'JPEG', 'PDF', '扫描件PDF', '图片型PPTX']

function 字节转文本(字节数: number): string {
  if (字节数 < 1024) return `${字节数} 字节`
  if (字节数 < 1024 * 1024) return `${(字节数 / 1024).toFixed(1)} KB`
  return `${(字节数 / 1024 / 1024).toFixed(2)} MB`
}

/** 导出面板：范围、格式、分辨率与输出位置，写盘完成后才报告成功 */
export default function ExportPanel({ 文稿, 图片地址, 选定页 = [], 打开, on关闭 }: Props) {
  const { modal, message } = AntdApp.useApp()
  const [选项, set选项] = React.useState<导出选项>({ ...默认导出选项, 选定页 })
  const [目录, set目录] = React.useState<string | undefined>(undefined)
  const [执行中, set执行中] = React.useState(false)
  const [结果, set结果] = React.useState<演示导出文件[] | null>(null)
  const 页面尺寸 = React.useMemo(() => 读取页面尺寸(文稿), [文稿])
  const 可用 = 桥接.presentationExport.可用

  React.useEffect(() => { if (打开) { set结果(null); set选项(当前 => ({ ...当前, 选定页: 选定页.length > 0 ? 选定页 : 当前.选定页 })) } }, [打开])

  const 校验信息 = React.useMemo(() => {
    try {
      校验导出选项(选项)
      return { 页: 规划导出页(文稿, 选项), 错误: '' }
    } catch (错误) {
      return { 页: [], 错误: 错误 instanceof Error ? 错误.message : '导出设置无效' }
    }
  }, [文稿, 选项])

  const 更新 = (修改: Partial<导出选项>) => set选项(当前 => {
    const 下一个 = { ...当前, ...修改 }
    // 格式与讲义/备注互斥时立即回落，避免提交时才报错
    if (下一个.格式 !== 'PDF') { 下一个.讲义每页张数 = 1; 下一个.输出备注 = false }
    return 下一个
  })

  const 选择目录 = async () => {
    const 结果目录 = await 桥接.presentationExport.pickDirectory()
    if (结果目录?.成功 && 结果目录.目录) { set目录(结果目录.目录); message.success('已选择导出位置') }
    else if (!结果目录?.已取消) modal.error({ title: '选择导出位置失败', content: 结果目录?.错误 || '系统未返回可用目录' })
  }

  const 开始导出 = async () => {
    try { 校验导出选项(选项) } catch (错误) { modal.error({ title: '导出设置无效', content: 错误 instanceof Error ? 错误.message : '请检查导出设置' }); return }
    let 页列表: ReturnType<typeof 规划导出页>
    try { 页列表 = 规划导出页(文稿, 选项) } catch (错误) { modal.error({ title: '无法导出', content: 错误 instanceof Error ? 错误.message : '没有可导出的页面' }); return }
    let html = ''
    try { html = 生成导出Html(文稿, 选项, 图片地址, 页面尺寸, 文稿.name) } catch (错误) { modal.error({ title: '导出内容生成失败', content: 错误 instanceof Error ? 错误.message : '资源未就绪' }); return }
    set执行中(true)
    try {
      const 响应 = await 桥接.presentationExport.run({
        html,
        格式: 选项.格式,
        页面尺寸,
        条目: 页列表.map(项 => ({ 序号: 项.序号 })),
        基础名: 文稿.name,
        目录,
        分辨率倍数: 选项.分辨率倍数,
        JPEG质量: 选项.JPEG质量,
        讲义每页张数: 选项.讲义每页张数,
        输出备注: 选项.输出备注,
      })
      if (响应?.已取消) { message.info('已取消导出'); return }
      if (!响应?.成功) { modal.error({ title: '导出失败', content: 响应?.错误 || '导出未完成，未写入文件' }); return }
      set结果(响应.文件列表 ?? [])
      message.success(`导出完成，共 ${响应.文件列表?.length ?? 0} 个文件`)
    } catch (错误) {
      modal.error({ title: '导出失败', content: 错误 instanceof Error ? 错误.message : '导出未完成' })
    } finally { set执行中(false) }
  }

  return (
    <Modal
      className="wps-export-dialog"
      title="导出演示文稿"
      open={打开}
      onCancel={on关闭}
      width={640}
      footer={<Space><Button onClick={on关闭}>关闭</Button><Button type="primary" loading={执行中} disabled={!可用 || !!校验信息.错误 || 执行中} onClick={() => void 开始导出()}>开始导出</Button></Space>}
    >
      {!可用 && <p role="alert" className="wps-export-warning">当前环境不支持演示导出，请使用 Windows 桌面版；网页预览仍可通过「导出为网页」使用。</p>}
      <div className="wps-export-grid">
        <label>导出格式
          <select aria-label="导出格式" value={选项.格式} onChange={事件 => 更新({ 格式: 事件.target.value as 导出格式 })}>
            {导出格式列表.map(格式 => <option key={格式} value={格式}>{格式}</option>)}
          </select>
        </label>
        <label>页面范围
          <select aria-label="页面范围" value={选项.范围} onChange={事件 => 更新({ 范围: 事件.target.value as 导出范围 })}>
            <option value="全部">全部页面</option>
            <option value="当前页">当前页</option>
            <option value="选定页">选定页面</option>
          </select>
        </label>
        <label>输出尺寸
          <span aria-label="输出尺寸">{页面尺寸.宽} × {页面尺寸.高} 画布像素</span>
        </label>
        {图像格式.includes(选项.格式) && (
          <label>分辨率
            <select aria-label="分辨率" value={选项.分辨率倍数} onChange={事件 => 更新({ 分辨率倍数: Number(事件.target.value) })}>
              {[1, 2, 3, 4].map(值 => <option key={值} value={值}>{`${值}×（${页面尺寸.宽 * 值}×${页面尺寸.高 * 值}）`}</option>)}
            </select>
          </label>
        )}
        {选项.格式 === 'JPEG' && (
          <label>画质
            <select aria-label="画质" value={选项.JPEG质量} onChange={事件 => 更新({ JPEG质量: Number(事件.target.value) })}>
              {[0.6, 0.8, 0.92, 1].map(值 => <option key={值} value={值}>{`${Math.round(值 * 100)}%`}</option>)}
            </select>
          </label>
        )}
        {选项.格式 === 'PDF' && (
          <label>讲义每页张数
            <select aria-label="讲义每页张数" value={选项.讲义每页张数} onChange={事件 => 更新({ 讲义每页张数: Number(事件.target.value) as 1 | 2 | 3 | 6 })}>
              <option value={1}>每页一张（默认）</option>
              <option value={2}>2 张</option>
              <option value={3}>3 张</option>
              <option value={6}>6 张</option>
            </select>
          </label>
        )}
      </div>
      <div className="wps-export-checks">
        <label><input type="checkbox" checked={选项.含隐藏页} onChange={事件 => 更新({ 含隐藏页: 事件.target.checked })} />包含隐藏页面</label>
        {选项.格式 === 'PDF' && <label><input type="checkbox" checked={选项.输出备注} onChange={事件 => 更新({ 输出备注: 事件.target.checked })} />在每页下方输出演讲备注</label>}
      </div>
      {选项.范围 === '选定页' && (
        <div className="wps-export-pages">
          <p>选择要导出的页面</p>
          {文稿.幻灯片列表.map((页, 序号) => (
            <label key={页.id}>
              <input type="checkbox" checked={选项.选定页.includes(页.id)} onChange={事件 => 更新({ 选定页: 事件.target.checked ? [...选项.选定页, 页.id] : 选项.选定页.filter(标识 => 标识 !== 页.id) })} />
              {序号 + 1}. {页.title}{页.隐藏 ? '（已隐藏）' : ''}
            </label>
          ))}
        </div>
      )}
      <div className="wps-export-summary">
        {校验信息.错误 ? <Tag color="error">{校验信息.错误}</Tag> : <Tag color="processing">将导出 {校验信息.页.length} 页</Tag>}
        {选项.格式 === '图片型PPTX' && <Tag>副本中的文字不再可编辑，原 PPTX 不受影响</Tag>}
        {选项.格式 === '扫描件PDF' && <Tag>扫描风格图片型 PDF，文字不可选中</Tag>}
        {目录 && <Tag>输出位置：{目录}</Tag>}
      </div>
      <Space style={{ marginTop: 8 }}>
        <Button onClick={() => void 选择目录()} disabled={!可用 || 执行中}>选择输出位置</Button>
        {!目录 && <span className="wps-export-hint">未选择时导出前会弹出系统目录选择框</span>}
      </Space>
      {结果 && (
        <div className="wps-export-result">
          <p>本次实际写入的文件</p>
          <Table<演示导出文件> size="small" rowKey="路径" pagination={false} dataSource={结果} columns={[
            { title: '文件', dataIndex: '路径', ellipsis: true },
            { title: '大小', dataIndex: '字节数', width: 110, render: (值: number) => 字节转文本(值) },
          ]} />
        </div>
      )}
    </Modal>
  )
}
