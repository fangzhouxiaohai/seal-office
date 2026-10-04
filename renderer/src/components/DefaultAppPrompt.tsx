import { useEffect, useRef, useState } from 'react'
import { App as AntdApp, Modal } from 'antd'
import { 桥接 } from '../ipc/bridge'

export default function DefaultAppPrompt() {
  const { modal } = AntdApp.useApp()
  const 请求 = useRef<ReturnType<typeof 桥接.checkDefaultAppPrompt> | null>(null)
  const 已展示 = useRef(false)
  const [询问, 设询问] = useState(false)
  const [执行中, 设执行中] = useState(false)
  useEffect(() => {
    if (!桥接.默认程序提示可用 || 已展示.current) return
    let 有效 = true
    请求.current ??= 桥接.checkDefaultAppPrompt()
    void 请求.current.then(结果 => {
      if (!有效) return
      已展示.current = true
      if (!结果.成功) throw new Error(结果.错误 || '无法检查系统默认程序')
      if (!结果.需要询问) return
      设询问(true)
    }).catch(错误 => { if (有效) { 已展示.current = true; modal.error({ title: '默认程序检查失败', content: 错误 instanceof Error ? 错误.message : '系统关联检查失败', okText: '确定' }) } })
    return () => { 有效 = false }
  }, [modal])
  const 确认设置 = async () => {
    if (执行中) return
    设执行中(true)
    try {
      const 设置 = await 桥接.setDefaultApp()
      if (!设置.成功) throw new Error(设置.错误 || '系统关联设置失败')
    } catch (错误) { modal.error({ title: '设置默认程序失败', content: 错误 instanceof Error ? 错误.message : '无法设置系统文件关联', okText: '确定' }) }
    finally { 设执行中(false); 设询问(false) }
  }
  return <Modal open={询问} destroyOnHidden title="将海豹办公设为默认程序" okText="设为默认程序" cancelText="暂不设置" confirmLoading={执行中} cancelButtonProps={{ disabled: 执行中 }} maskClosable={false} keyboard={!执行中} closable={!执行中} onOk={() => void 确认设置()} onCancel={() => 设询问(false)}>
    <p>是否使用海豹办公默认打开 DOCX、XLSX、PPTX 和 PDF？确认后请在系统的海豹办公专属页面完成关联。</p>
    <p>本次选择后，程序不会再次主动询问，可随时在设置中心更改。</p>
  </Modal>
}
