import { useEffect, useState } from 'react'
import { App as AntdApp, Button, Modal, Spin } from 'antd'
import { 桥接 } from '../ipc/bridge'
import PdfViewer from '../pdf/PdfViewer'

interface Props {
  内容: string
  格式: 'html' | 'pdf'
  标题: string
  onClose: () => void
}

/** 统一先生成 PDF 预览，确认打印时把同一份数据交给系统打印对话框。 */
export default function PrintPreview({ 内容, 格式, 标题, onClose }: Props) {
  const { message } = AntdApp.useApp()
  const [数据, set数据] = useState<string | null>(null)
  const [错误, set错误] = useState('')
  const [进度, set进度] = useState('正在生成预览…')
  const [重试次数, set重试次数] = useState(0)
  const [打印中, set打印中] = useState(false)

  useEffect(() => {
    let 取消 = false
    const 更新进度 = (事件: Event) => {
      const { current, total } = (事件 as CustomEvent<{ current: number; total: number }>).detail
      if (!取消) set进度(`正在生成第 ${current} / ${total} 页…`)
    }
    window.addEventListener('seal-print-preview-progress', 更新进度)
    set数据(null)
    set错误('')
    set进度('正在生成预览…')
    const 超时 = window.setTimeout(() => {
      取消 = true
      set错误('打印预览生成超时，请重试。文档内容较多时可先另存副本，再分段打印。')
    }, 90_000)
    void 桥接.printPreview(内容, 格式).then((结果) => {
      if (取消) return
      window.clearTimeout(超时)
      if (结果.成功 && 结果.数据) set数据(结果.数据)
      else set错误(结果.错误 || '无法生成打印预览')
    }).catch((原因: unknown) => {
      if (!取消) { window.clearTimeout(超时); set错误(原因 instanceof Error ? 原因.message : '无法生成打印预览') }
    })
    return () => { 取消 = true; window.clearTimeout(超时); window.removeEventListener('seal-print-preview-progress', 更新进度) }
  }, [内容, 格式, 重试次数])

  const 打印 = async () => {
    if (!数据) return
    set打印中(true)
    try {
      const 结果 = await 桥接.printDocument(数据, 'pdf')
      if (!结果.成功 && !结果.已取消) message.error(结果.错误 || '打印失败')
      if (结果.成功) onClose()
    } catch (原因) {
      message.error(原因 instanceof Error ? 原因.message : '打印失败')
    } finally {
      set打印中(false)
    }
  }

  return <Modal open title={`打印预览 · ${标题}`} width={900} onCancel={onClose} destroyOnClose
    className="seal-print-preview" footer={<><Button onClick={onClose}>关闭</Button><Button type="primary" loading={打印中} disabled={!数据} onClick={() => void 打印()}>打印</Button></>}>
    {错误 ? <div className="seal-print-preview__error" role="alert">{错误}<Button onClick={() => set重试次数((次数) => 次数 + 1)}>重试预览</Button></div> : 数据
      ? <PdfViewer 数据={数据} 文件名={标题} />
      : <div className="seal-print-preview__loading" role="status"><Spin /> {进度}</div>}
  </Modal>
}
