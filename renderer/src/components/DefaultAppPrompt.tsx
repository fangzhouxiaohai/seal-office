import { useEffect, useRef, useState } from 'react'
import { App as AntdApp, Modal } from 'antd'
import { 桥接 } from '../ipc/bridge'
import { useSettings } from '../store/settingsStore'

/**
 * 默认程序处理：
 * - 开关打开时启动检查，发现不是默认程序就弹确认框，点“立即设为默认”打开系统页面确认；
 *   设置后回读真实结果，若系统仍要求手动确认，再引导打开系统页面。
 * - 开关关闭时沿用首次安装的询问弹窗。
 */
export default function DefaultAppPrompt() {
  const { modal, message } = AntdApp.useApp()
  const { 启动时检查默认程序 } = useSettings()
  const 请求 = useRef<ReturnType<typeof 桥接.checkDefaultAppPrompt> | null>(null)
  const 自动请求 = useRef<ReturnType<typeof 桥接.checkDefaultAppOnStartup> | null>(null)
  const 已展示 = useRef(false)
  const [询问, 设询问] = useState(false)
  const [未生效, 设未生效] = useState<string[]>([])
  const [执行中, 设执行中] = useState(false)
  /** 弹窗来源：自动检查还是首次安装询问，决定确认后走哪条设置通道 */
  const [来源, 设来源] = useState<'自动' | '首次'>('自动')

  /** 系统仍拦下时说明剩余格式，并可直接打开系统页面兜底 */
  const 提示剩余 = (剩余: string[], 说明: string) => {
    设未生效(剩余)
    modal.warning({
      title: 'Windows 仍要求手动确认',
      content: `${说明}${剩余.length > 0 ? ` 需要确认：${剩余.map((项) => `.${项}`).join('、')}。` : ''}点“打开系统页面”后在海豹办公的默认应用页里确认一次即可，之后启动时会检查当前关联状态。`,
      okText: '打开系统页面',
      cancelText: '稍后处理',
      onOk: () => { void 桥接.setDefaultApp() },
    })
  }

  useEffect(() => {
    if (已展示.current) return
    // 开关打开：启动检查；不是默认程序时先问一次，确认后注册并提示系统设置
    if (启动时检查默认程序) {
      if (!桥接.默认程序全自动可用) return
      已展示.current = true
      const 有效 = { 值: true }
      void 桥接.defaultAppCheckState().then((状态) => {
        if (!有效.值) return
        // 验收专用开关：带 --skip-default-app-check 启动时不做任何关联改动
        if (状态.成功 && 状态.已禁用) {
          void 桥接.checkDefaultAppPrompt().then((结果) => {
            if (有效.值 && 结果.成功 && 结果.需要询问) { 设来源('首次'); 设询问(true) }
          }).catch(() => {})
          return
        }
        自动请求.current ??= 桥接.checkDefaultAppOnStartup()
        void 自动请求.current.then((结果) => {
          if (!有效.值) return
          if (!结果.成功) throw new Error(结果.错误 || '无法检查系统默认程序')
          if (结果.已全部默认) return
          设来源('自动')
          设未生效(结果.未生效 ?? [])
          设询问(true)
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
      设来源('首次')
      设询问(true)
    }).catch(错误 => { if (有效) { 已展示.current = true; modal.error({ title: '默认程序检查失败', content: 错误 instanceof Error ? 错误.message : '系统关联检查失败', okText: '确定' }) } })
    return () => { 有效 = false }
  }, [modal, 启动时检查默认程序])

  /** 确认后注册应用并检查默认状态，并如实回报结果 */
  const 确认设置 = async () => {
    if (执行中) return
    设执行中(true)
    try {
      const 结果 = 来源 === '自动' ? await 桥接.applyDefaultApp() : await 桥接.setDefaultApp()
      if (!结果.成功) throw new Error(结果.错误 || '系统关联设置失败')
      if (结果.已全部默认 === false) {
        设询问(false)
        // 启动自检这条路径需要用户明确知道系统拦下了什么，用弹窗说明；
        // 手动/首次安装这条路径保持轻提示，避免打断当前操作
        if (来源 === '自动') 提示剩余(结果.未生效 ?? [], '海豹办公已注册，请在 Windows 默认应用页面确认关联。')
        else message.warning(`需要在 Windows 默认应用页面确认：${(结果.未生效 ?? []).map((项) => `.${项}`).join('、')}。可在设置中心手动设置，或在系统“默认应用”页面确认。`, 6)
        return
      }
      message.success('已将 DOCX、XLSX、PPTX、PDF 设为海豹办公打开')
    } catch (错误) {
      modal.error({ title: '设置默认程序失败', content: 错误 instanceof Error ? 错误.message : '无法设置系统文件关联', okText: '确定' })
    } finally {
      设执行中(false)
      设询问(false)
    }
  }

  const 是自检询问 = 来源 === '自动' && 未生效.length > 0
  return (
    <Modal
      open={询问}
      destroyOnHidden
      title={是自检询问 ? '是否把海豹办公设为默认程序？' : '将海豹办公设为默认程序'}
      okText={是自检询问 ? '立即设为默认' : '设为默认程序'}
      cancelText="暂不设置"
      confirmLoading={执行中}
      cancelButtonProps={{ disabled: 执行中 }}
      maskClosable={false}
      keyboard={!执行中}
      closable={!执行中}
      onOk={() => void 确认设置()}
      onCancel={() => 设询问(false)}
    >
      {是自检询问 ? (
        <>
          <p>检测到部分文件类型目前不是由海豹办公打开。你可以将 DOCX、XLSX、PPTX、PDF 的默认打开程序设为海豹办公。</p>
          <p>Windows 的默认应用设置需要你在系统页面确认。此操作会注册海豹办公的打开能力，并引导你完成选择。</p>
        </>
      ) : (
        <p>是否使用海豹办公默认打开 DOCX、XLSX、PPTX 和 PDF？确认后将注册打开能力，需要时进入 Windows 默认应用页面完成选择。</p>
      )}
    </Modal>
  )
}
