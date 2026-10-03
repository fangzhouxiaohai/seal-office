import { useCallback, useEffect, useState } from 'react'
import { App as AntdApp, Button } from 'antd'
import { 基准文件名, 记录最近文档, 读取本地文件内容 } from '../fileOpen'
import { 桥接 } from '../ipc/bridge'
import { useAppStore } from '../store'
import './localTools.css'

export type 本机位置 = 'desktop' | 'document' | 'download'
interface 本机文件 { 名称: string; 路径: string; 扩展名: string; 大小: number; 修改时间: number }
const 位置标题: Record<本机位置, string> = { desktop: '桌面', document: '文档', download: '下载' }
const 格式化大小 = (大小: number) => 大小 < 1024 ? `${大小} 字节` : 大小 < 1024 * 1024 ? `${(大小 / 1024).toFixed(1)} KB` : `${(大小 / 1024 / 1024).toFixed(1)} MB`

export default function LocalFilesPage({ 位置 }: { 位置: 本机位置 }) {
  const { message, modal } = AntdApp.useApp()
  const { createDoc, refreshRecents } = useAppStore()
  const [文件, 设文件] = useState<本机文件[]>([])
  const [目录, 设目录] = useState('')
  const [加载中, 设加载中] = useState(false)
  const [读取错误, 设读取错误] = useState<string | null>(null)
  const [正在打开, 设正在打开] = useState<string | null>(null)

  const 刷新 = useCallback(async () => {
    设加载中(true)
    设读取错误(null)
    try {
      const 结果 = await 桥接.listKnownFolder(位置)
      if (!结果.成功 || !结果.文件 || !结果.路径) throw new Error(结果.错误 || '文件夹内容不完整')
      设文件(结果.文件)
      设目录(结果.路径)
    } catch (错误) {
      const 原因 = 错误 instanceof Error ? 错误.message : '无法访问本机文件夹'
      设文件([])
      设目录('')
      设读取错误(原因)
      modal.error({ title: `读取${位置标题[位置]}失败`, content: 原因 })
    } finally {
      设加载中(false)
    }
  }, [位置, modal])

  useEffect(() => { void 刷新() }, [刷新])

  const 打开文件 = async (目标: 本机文件) => {
    设正在打开(目标.路径)
    try {
      const 内容 = await 读取本地文件内容(目标.路径)
      const 初始内容 = 内容.类型 === 'ppt' ? 内容.演示文稿 : 内容.类型 === 'table' ? (内容.工作表列表 ?? 内容.内容) : 内容.内容
      createDoc(内容.类型, 初始内容, { 路径: 目标.路径, 警告: 内容.警告, 页面设置: 内容.页面设置, 文件指纹: 内容.文件指纹 })
      const 已记录 = await 记录最近文档(目标.路径, 基准文件名(目标.路径), 内容.类型)
      if (已记录) {
        refreshRecents()
        message.success(`已打开「${目标.名称}」`)
      }
    } catch (错误) {
      modal.error({ title: '打开文件失败', content: 错误 instanceof Error ? 错误.message : '无法打开该文件' })
    } finally {
      设正在打开(null)
    }
  }

  return <div className="local-page">
    <header className="local-page__header">
      <div><h1>{位置标题[位置]}</h1><p>{目录 || '浏览本机可编辑的文档、表格、演示文稿及 PDF 文件。'}</p></div>
      <div className="local-page__actions"><Button onClick={() => void 刷新()} loading={加载中}>刷新</Button></div>
    </header>
    {读取错误 ? <div className="local-page__error"><strong>无法显示文件</strong><p>{读取错误}</p><Button onClick={() => void 刷新()}>重试</Button></div>
      : <div className="local-files" aria-label={`${位置标题[位置]}文件列表`}>
        <div className="local-files__row local-files__row--head"><span>名称</span><span>大小</span><span>修改时间</span><span>操作</span></div>
        {文件.length === 0 && !加载中 ? <p className="local-files__empty">此文件夹没有可打开的文件。</p> : null}
        {文件.map((项) => <div className="local-files__row" key={项.路径}>
          <span className="local-files__name" title={项.名称}>{项.名称}</span>
          <span className="local-files__muted">{格式化大小(项.大小)}</span>
          <span className="local-files__muted">{new Date(项.修改时间).toLocaleString('zh-CN')}</span>
          <Button type="link" onClick={() => void 打开文件(项)} loading={正在打开 === 项.路径} disabled={正在打开 !== null && 正在打开 !== 项.路径}>打开</Button>
        </div>)}
      </div>}
  </div>
}
