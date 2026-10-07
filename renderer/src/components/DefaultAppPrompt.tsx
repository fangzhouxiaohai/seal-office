import { useEffect, useRef, useState } from 'react'
import { App as AntdApp, Modal } from 'antd'
import { 桥接 } from '../ipc/bridge'
import { useSettings } from '../store/settingsStore'

/**
 * 默认程序处理：开关打开时启动即检查并静默设为默认（与 WPS 一致，不弹窗、不跳系统页面）；
 * 开关关闭时沿用首次安装的询问弹窗。
 */
export default function DefaultAppPrompt() {
  const { modal, message } = AntdApp.useApp()
  const { 启动时检查默认程序 } = useSettings()
  const 请求 = useRef<ReturnType<typeof 桥接.checkDefaultAppPrompt> | null>(null)
  const 自动请求 = useRef<ReturnType<typeof 桥接.checkDefaultAppOnStartup> | null>(null)
  const 已展示 = useRef(false)
  const [询问, 设询问] = useState(false)
  const [执行中, 设执行中] = useState(false)
  useEffect(() => {
    if (已展示.current) return
    // 开关打开：全自动，不再打扰用户；失败只记录，不打断启动
    if (启动时检查默认程序) {
      if (!桥接.默认程序全自动可用) return
      已展示.current = true
      const 有效 = { 值: true }
      // 验收专用开关：带 --skip-default-app-check 启动时不做任何关联改动
      void 桥接.defaultAppCheckState().then((状态) => {
        if (!有效.值) return
        if (状态.成功 && 状态.已禁用) {
          void 桥接.checkDefaultAppPrompt().then((结果) => {
            if (有效.值 && 结果.成功 && 结果.需要询问) 设询问(true)
          }).catch(() => {})
          return
        }
        自动请求.current ??= 桥接.checkDefaultAppOnStartup()
        void 自动请求.current.then((结果) => {
          if (!有效.值) return
          if (!结果.成功) throw new Error(结果.错误 || '无法检查系统默认程序')
          if (!结果.已全部默认) {
            modal.warning({
              title: '部分格式仍不是默认程序',
              content: `Windows 未允许自动设为默认：${(结果.未生效 ?? []).map((项) => `.${项}`).join('、')}。可在设置中心手动设置，或在系统“默认应用”页面确认。`,
              okText: '知道了',
            })
          }
        }).catch((错误: unknown) => {
          if (有效.值) modal.error({ title: '默认程序检查失败', content: 错误 instanceof Error ? 错误.message : '系统关联检查失败', okText: '确定' })
        })
      }).catch(() => { 有效.值 = false })
      return () => { 有效.值 = false }
    }
    if (!桥接.默认程序提示可用) return
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
  }, [modal, 启动时检查默认程序])
  const 确认设置 = async () => {
    if (执行中) return
    设执行中(true)
    try {
      const 设置 = await 桥接.setDefaultApp()
      if (!设置.成功) throw new Error(设置.错误 || '系统关联设置失败')
      // 全自动生效时只提示一句；系统仍要求手动确认时同样用提示（系统页面会同时打开），不弹阻塞对话框
      if (设置.已全部默认 === false) message.warning(设置.提示 || 'Windows 未允许自动关联全部格式，请在系统默认应用页面确认。', 6)
      else message.success(设置.提示 || '已将 DOCX、XLSX、PPTX、PDF 设为海豹办公打开')
    } catch (错误) { modal.error({ title: '设置默认程序失败', content: 错误 instanceof Error ? 错误.message : '无法设置系统文件关联', okText: '确定' }) }
    finally { 设执行中(false); 设询问(false) }
  }
  return <Modal open={询问} destroyOnHidden title="将海豹办公设为默认程序" okText="设为默认程序" cancelText="暂不设置" confirmLoading={执行中} cancelButtonProps={{ disabled: 执行中 }} maskClosable={false} keyboard={!执行中} closable={!执行中} onOk={() => void 确认设置()} onCancel={() => 设询问(false)}>
    <p>是否使用海豹办公默认打开 DOCX、XLSX、PPTX 和 PDF？确认后会自动完成关联，无需再到系统页面逐项选择。</p>
    <p>本次选择后，程序不会再次主动询问。若希望每次启动都自动检查并设为默认，可在设置中心打开“启动时检查默认程序”。</p>
  </Modal>
}
