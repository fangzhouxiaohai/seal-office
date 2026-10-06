import React from 'react'
import { App } from 'antd'
import { 读取图片文件, 允许识别图片类型 } from '../model/capture'
import { 桥接 } from '../../ipc/bridge'

interface Props {
  只读: boolean
  on插入文字: (文本: string) => void
  导入的图片?: { 数据: string; 类型: string; 名称?: string } | null
  on提示?: (标题: string, 内容: string) => void
}

const RecognitionPanel = ({ 只读, on插入文字, 导入的图片, on提示 }: Props) => {
  const { message } = App.useApp()
  const [状态, set状态] = React.useState<{ 可用: boolean; 模型?: string; 原因?: string; 说明?: string }>({ 可用: false, 原因: '正在读取识别服务状态' })
  const [图片, set图片] = React.useState<{ 数据: string; 类型: string; 名称: string } | null>(null)
  const [识别中, set识别中] = React.useState(false)
  const [结果, set结果] = React.useState('')
  const [错误, set错误] = React.useState('')

  React.useEffect(() => {
    void (async () => {
      const 结果状态 = await 桥接.presentationCapture.recognitionStatus()
      if (结果状态.成功) set状态({ 可用: Boolean(结果状态.可用), 模型: 结果状态.模型, 原因: 结果状态.原因, 说明: 结果状态.说明 })
      else set状态({ 可用: false, 原因: 结果状态.错误 ?? '识别服务不可用' })
    })()
  }, [])

  React.useEffect(() => {
    if (导入的图片) { set图片({ 数据: 导入的图片.数据, 类型: 导入的图片.类型, 名称: 导入的图片.名称 ?? '截图.png' }); set结果(''); set错误('') }
  }, [导入的图片])

  const 选择文件 = async (文件: File | undefined) => {
    if (!文件) return
    try {
      const 读取 = await 读取图片文件(文件)
      set图片({ ...读取, 名称: 文件.name })
      set结果(''); set错误('')
    } catch (异常) {
      const 消息 = 异常 instanceof Error ? 异常.message : '图片读取失败'
      set图片(null); set结果(''); set错误(消息)
      on提示?.('图片读取失败', 消息)
    }
  }

  const 开始识别 = async () => {
    if (!图片) { set错误('请先选择图片或截取画面'); return }
    set识别中(true); set错误(''); set结果('')
    try {
      const 响应 = await 桥接.presentationCapture.recognize(图片.数据, 图片.类型)
      if (!响应.成功) throw new Error(响应.错误 ?? '文字识别失败')
      const 文本 = (响应.文本 ?? '').trim()
      if (!文本) throw new Error('模型未返回识别文字，请确认所选模型支持图像输入后重试')
      set结果(文本)
    } catch (异常) {
      const 消息 = 异常 instanceof Error ? 异常.message : '文字识别失败'
      set结果(''); set错误(消息)
      on提示?.('文字识别失败', 消息)
    } finally { set识别中(false) }
  }

  const 复制结果 = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板写入，请手动选择文本复制')
      await navigator.clipboard.writeText(结果)
      message.success('识别文字已复制')
    } catch (异常) {
      const 消息 = 异常 instanceof Error ? 异常.message : '复制失败'
      set错误(消息)
      on提示?.('复制失败', 消息)
    }
  }

  return (
    <section className="wps-recognition-panel" aria-label="图片转文字">
      <fieldset disabled={只读}>
        <legend>图片转文字</legend>
        <p className="wps-recognition-panel__status" role="status">
          {状态.可用 ? `识别模型：${状态.模型 ?? '已配置'}` : `无法识别：${状态.原因 ?? '识别服务不可用'}`}
        </p>
        {状态.可用 && 状态.说明 && <p className="wps-recognition-panel__note">{状态.说明}</p>}
        <label className="wps-recognition-panel__file">
          选择图片
          <input type="file" accept={允许识别图片类型.join(',')} onChange={事件 => void 选择文件(事件.target.files?.[0])} />
        </label>
        {图片 && <p className="wps-recognition-panel__file-name">已选择：{图片.名称}</p>}
        <button type="button" onClick={() => void 开始识别()} disabled={只读 || 识别中 || !状态.可用 || !图片}>{识别中 ? '识别中…' : '开始识别'}</button>
        {结果 && (
          <div className="wps-recognition-panel__result">
            <label>识别结果<textarea aria-label="识别结果" readOnly value={结果} rows={6} /></label>
            <div className="wps-recognition-panel__actions">
              <button type="button" onClick={() => void 复制结果()}>复制文字</button>
              <button type="button" onClick={() => { on插入文字(结果); set结果('') }} disabled={只读}>插入为文本框</button>
              <button type="button" onClick={() => set结果('')}>取消结果</button>
            </div>
          </div>
        )}
        {错误 && <p className="wps-recognition-panel__error" role="status">{错误}</p>}
      </fieldset>
    </section>
  )
}

export default RecognitionPanel
