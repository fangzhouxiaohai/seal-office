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
  const [打印中, set打印中] = useState(false)

  useEffect(() => {
    let 取消 = false
    set数据(null)
    set错误('')
    void 桥接.printPreview(内容, 格式).then((结果) => {
      if (取消) return
      if (结果.成功 && 结果.数据) set数据(结果.数据)
      else set错误(结果.错误 || '无法生成打印预览')
    }).catch((原因: unknown) => {
      if (!取消) set错误(原因 instanceof Error ? 原因.message : '无法生成打印预览')
    })
    return () => { 取消 = true }
  }, [内容, 格式])

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
    {错误 ? <div role="alert">{错误}</div> : 数据
      ? <PdfViewer 数据={数据} 文件名={标题} />
      : <div className="seal-print-preview__loading"><Spin /> 正在生成预览…</div>}
  </Modal>
}
