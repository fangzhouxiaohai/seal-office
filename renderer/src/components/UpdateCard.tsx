// 自动检查和手动检查共用更新入口、下载进度及安装状态。
// 普通更新显示轻量入口；强制更新自动开始，并保留失败重试。
import { useEffect, useRef, useState } from 'react'
import { App as AntdApp, Button, Modal } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSettings } from '../store/settingsStore'
import { 展示更新, 检查更新, 稍后提醒, use更新卡片, 执行更新, 读取更新平台, 自动检查间隔, 启动检查延迟, 恢复下载状态, 取下载状态, 取下载发布, 正在下载或待安装, 开始下载更新, 取消下载更新, 安装已下载更新, 接收下载进度, 改变下载界面, use下载状态, type 有效发布 } from '../update/updateCenter'
import { 桥接 } from '../ipc/bridge'
import '../update/updateCard.css'

const 含中文 = (文本: string) => /[㐀-鿿]/u.test(文本)
const 补零 = (值: number) => String(值).padStart(2, '0')
export const 发布日期 = (时间?: number) => {
  if (!时间) return ''
  const 日期 = new Date(时间)
  return Number.isNaN(日期.getTime()) ? '' : `${日期.getFullYear()}-${补零(日期.getMonth() + 1)}-${补零(日期.getDate())}`
}

/** 自动检查：开启时启动检查一次并每 4 小时检查一次；关闭时不发任何请求；失败静默 */
function use自动检查(开启: boolean) {
  useEffect(() => {
    if (!开启) return
    let 有效 = true
    const 执行 = () => {
      void 恢复下载状态().then(() => {
        if (!有效 || 正在下载或待安装()) return null
        return 检查更新()
      }).then(结果 => {
        if (有效 && !正在下载或待安装() && 结果?.类型 === '有新版') 展示更新(结果.发布, '自动')
      }).catch(() => {})
    }
    const 启动计时 = setTimeout(执行, 启动检查延迟)
    const 周期计时 = setInterval(执行, 自动检查间隔)
    return () => { 有效 = false; clearTimeout(启动计时); clearInterval(周期计时) }
  }, [开启])
}

function 卡片({ 发布 }: { 发布: 有效发布 }) {
  const { modal, message } = AntdApp.useApp()
  const [更新中, 设更新中] = useState(false)
  const [平台, 设平台] = useState<string | null>(null)
  const 已自动开始 = useRef(false)
  const 状态 = use下载状态()
  const 移动端 = document.documentElement.dataset.sealPlatform === 'app'

  useEffect(() => {
    let 有效 = true
    void 读取更新平台().then(信息 => { if (有效) 设平台(信息.平台) }).catch(错误 => {
      if (有效) modal.error({ title: '更新失败', content: 错误 instanceof Error ? 错误.message : '无法读取版本信息', okText: '确定' })
    })
    return () => { 有效 = false }
  }, [modal])

  const 立即更新 = async () => {
    if (更新中) return
    设更新中(true)
    try {
      const { 平台: 当前平台 } = await 读取更新平台()
      if (当前平台 !== 'web' && 当前平台 !== 'windows-store' && 当前平台 !== 'harmony' && 桥接.update.下载可用) {
        try {
          await 开始下载更新(发布, 发布.mandatory && !移动端 ? '后台' : '前台', Boolean(发布.mandatory))
          if (发布.mandatory && 当前平台 !== 'android') await 安装已下载更新()
        } catch (错误) {
          改变下载界面('隐藏')
          if (!发布.mandatory) 展示更新(发布, '手动')
          throw 错误
        }
        return
      }
      const 结果 = await 执行更新(发布)
      if (!结果.成功) throw new Error(结果.错误)
      if (结果.提示) message.info(结果.提示, 6)
      if (!发布.mandatory) 稍后提醒()
    } catch (错误) {
      modal.error({ title: '更新失败', content: 错误 instanceof Error ? 错误.message : '更新失败，请稍后重试', okText: '确定' })
    } finally {
      设更新中(false)
    }
  }

  useEffect(() => {
    if (!发布.mandatory || !平台 || 已自动开始.current) return
    已自动开始.current = true
    void 立即更新()
  }, [平台, 发布.mandatory])

  if (发布.mandatory) {
    if (状态.界面 !== '隐藏') return null
    if (平台 && 平台 !== 'harmony' && 平台 !== 'windows-store' && 平台 !== 'web' && 更新中) return null
    return <Modal open centered closable={false} maskClosable={false} keyboard={false} footer={null} title="必须更新"><p>当前版本需要更新后才能继续使用。{平台 === 'harmony' ? '请在应用市场完成更新。' : ''}</p><Button type="primary" loading={更新中} onClick={()=>void 立即更新()}>重试更新</Button></Modal>
  }
  return <aside className={`seal-update-entry${移动端 ? ' seal-update-entry--mobile' : ''}`} aria-live="polite"><Button type="primary" loading={更新中} onClick={()=>void 立即更新()}>更新</Button></aside>
}

function 下载界面() {
  const 状态 = use下载状态(), { modal } = AntdApp.useApp()
  const { 语言 } = useSettings()
  const [取消中, 设取消中] = useState(false), [安装中, 设安装中] = useState(false), [重试中, 设重试中] = useState(false), [可重试安装, 设可重试安装] = useState(false)
  const 进度 = 状态.进度
  const 发布 = 取下载发布()
  const 强制 = Boolean(发布?.mandatory || 进度?.强制)
  const 移动端 = document.documentElement.dataset.sealPlatform === 'app'
  useEffect(() => {
    if (!桥接.update.下载可用) return
    const 取消订阅 = 桥接.update.onProgress(值 => {
      try {
        接收下载进度(值)
        if (取下载状态().进度 === 值 && document.documentElement.dataset.sealPlatform === 'app' && (值.阶段 === '失败' || (值.阶段 === '已就绪' && Boolean(值.错误)) || (值.强制 && ['下载中', '校验中', '已就绪', '安装中'].includes(值.阶段)))) 改变下载界面('前台')
      } catch (错误) { modal.error({ title: '下载状态异常', content: 错误 instanceof Error ? 错误.message : '下载状态无效', okText: '确定' }) }
    })
    void 恢复下载状态().then(async () => { const 上次 = 取下载状态().进度; if (上次?.阶段 === '失败' && (await 读取更新平台()).平台 !== 'android') modal.error({ title: '上次更新未完成', content: 上次.错误 || '更新任务失败，请重新检查更新', okText: '确定' }) }).catch(错误 => { modal.error({ title: '更新状态读取失败', content: 错误 instanceof Error ? 错误.message : '请稍后重试', okText: '确定' }) })
    return 取消订阅
  }, [modal])
  useEffect(() => {
    if (进度?.阶段 !== '安装中') return
    let 有效 = true, 已提示 = false
    const 计时 = setInterval(() => {
      void 桥接.update.status().then(结果 => {
        if (!有效) return
        if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '无法读取安装状态')
        接收下载进度(结果.数据)
        if (结果.数据.阶段 === '失败') {
          设可重试安装(true)
          modal.error({title:'安装未完成',content:结果.数据.错误 || '安装程序未启动，请重试',okText:'确定'})
        }
      }).catch(错误 => { if (有效 && !已提示) { 已提示 = true; modal.error({title:'安装状态读取失败',content:错误 instanceof Error ? 错误.message : '请稍后重试',okText:'确定'}) } })
    }, 10000)
    return () => { 有效 = false; clearInterval(计时) }
  }, [进度?.阶段, modal])
  const 取消 = async () => {
    if (取消中) return
    设取消中(true)
    改变下载界面('隐藏')
    try { await 取消下载更新() } catch (错误) { 改变下载界面('前台'); modal.error({title:'取消下载失败',content:错误 instanceof Error ? 错误.message : '请稍后重试',okText:'确定'}) }
    finally { 设取消中(false) }
  }
  const 安装 = async () => {
    if (安装中) return
    设安装中(true)
    try { await 安装已下载更新() } catch (错误) { modal.error({title:'更新失败',content:错误 instanceof Error ? 错误.message : '请稍后重试',okText:'确定'}) }
    finally { 设安装中(false) }
  }
  const 重试 = async () => {
    if (重试中) return
    设重试中(true)
    try {
      let 当前发布 = 发布
      if (!当前发布) {
        const 结果 = await 检查更新()
        if (结果.类型 !== '有新版') throw new Error(结果.类型 === '失败' ? 结果.错误 : '未找到可下载的更新，请重新检查')
        当前发布 = 结果.发布
      }
      const { 平台 } = await 读取更新平台()
      await 开始下载更新(当前发布, 当前发布.mandatory && !移动端 ? '后台' : '前台', Boolean(当前发布.mandatory))
      if (当前发布.mandatory && 平台 !== 'android') await 安装已下载更新()
    } catch (错误) { modal.error({title:'更新失败',content:错误 instanceof Error ? 错误.message : '请稍后重试',okText:'确定'}) }
    finally { 设重试中(false) }
  }
  if (状态.界面 === '隐藏') return null
  const 下载失败 = 进度?.阶段 === '失败' && !可重试安装
  const 已就绪 = 进度?.阶段 === '已就绪' || (进度?.阶段 === '失败' && 可重试安装), 已启动 = 进度?.阶段 === '安装中'
  const 下载中 = !进度 || 进度.阶段 === '下载中' || 进度.阶段 === '校验中'
  const 百分比 = 进度 && 进度.总大小 > 0 ? Math.floor(进度.已下载 / 进度.总大小 * 100) : null
  const 字节 = (数值: number) => 数值 >= 1048576 ? `${(数值 / 1048576).toFixed(1)} MB` : `${(数值 / 1024).toFixed(1)} KB`
  if (状态.界面 === '后台') return <aside className="seal-update-download-mini" aria-live="polite">{下载中 ? <><div className="seal-update-circle" role="progressbar" aria-label="后台下载进度" aria-valuemin={0} aria-valuemax={100} {...(百分比 === null ? {} : {'aria-valuenow':百分比})}><svg viewBox="0 0 40 40" aria-hidden="true"><circle className="seal-update-circle__track" cx="20" cy="20" r="17"/><circle className={百分比 === null ? 'seal-update-circle__value is-indeterminate' : 'seal-update-circle__value'} cx="20" cy="20" r="17" pathLength="100" strokeDasharray={百分比 === null ? '25 75' : `${百分比} 100`} /></svg><span>{百分比 === null ? '下载中' : `${百分比}%`}</span></div><div><strong>正在后台下载</strong>{进度?.版本 ? <span>版本 {进度.版本}</span> : null}<Button size="small" onClick={()=>改变下载界面('前台')}>查看进度</Button></div></> : 已就绪 ? <Button type="primary" loading={安装中} onClick={()=>void 安装()}>更新</Button> : 已启动 ? <strong>安装程序已启动</strong> : null}</aside>
  return <Modal open centered width={440} closable={false} maskClosable={false} keyboard={false} footer={null} title={下载失败?'更新下载失败':已就绪?'更新已下载':已启动?'安装程序已启动':'正在下载更新'}>
    <div className="seal-update-download-dialog">
      <p>{进度?.错误 || (取消中 ? '正在取消下载' : 进度?.阶段 === '校验中' ? '正在校验安装包' : 已就绪 ? 移动端 ? '安装包已校验，请按系统提示完成安装。' : 强制 ? '安装包已校验，正在启动安装。' : '安装包已校验，请选择安装更新。' : 已启动 ? '请按系统提示完成安装。' : '请保持网络连接，下载期间可以继续使用应用。')}</p>
      {移动端 && 进度?.通知可见 === false && 下载中 && !强制 ? <p>通知权限未开启，后台下载进度可能不会显示。</p> : null}
      {发布?.notes?.trim() ? <details className="seal-update-notes-details"><summary>查看更新说明</summary>{语言 === 'en-US' && 含中文(发布.notes) ? <p className="seal-update-card__hint">更新说明原文为中文</p> : null}<div className="seal-update-card__notes" data-ui-language-ignore="true"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>{alt}</span> }}>{发布.notes}</ReactMarkdown></div></details> : null}
      {下载中 ? <><progress aria-label="更新下载进度" max={100} {...(百分比 === null ? {} : {value:百分比})}/><div className="seal-update-download-meta">{进度 ? `${字节(进度.已下载)}${进度.总大小 ? ' / '+字节(进度.总大小) : ''}` : '正在连接更新服务'}{百分比 === null ? '' : ` · ${百分比}%`}</div></> : null}
      <div className="seal-update-download-actions">
        {下载失败 ? <>{!强制 ? <Button onClick={()=>改变下载界面('隐藏')}>关闭</Button> : null}<Button type="primary" loading={重试中} onClick={()=>void 重试()}>重试下载</Button></> : null}
        {下载中 && !强制 ? <><Button disabled={取消中} onClick={()=>void 取消()}>取消下载</Button><Button disabled={取消中} onClick={()=>改变下载界面(移动端 ? '隐藏' : '后台')}>后台下载</Button></> : null}
        {已就绪 && 移动端 ? <>{!强制 ? <Button onClick={()=>改变下载界面('隐藏')}>稍后安装</Button> : null}<Button type="primary" loading={安装中} onClick={()=>void 安装()}>重试安装</Button></> : null}
        {已就绪 && !强制 && !移动端 ? <><Button onClick={()=>改变下载界面('后台')}>稍后安装</Button><Button type="primary" loading={安装中} onClick={()=>void 安装()}>安装更新</Button></> : null}
        {已启动 && !强制 ? <Button onClick={()=>改变下载界面('隐藏')}>知道了</Button> : null}
      </div>
    </div>
  </Modal>
}

/** 只负责展示卡片，不发起自动检查（手动检查结果也经此展示） */
export function 更新卡片宿主() {
  const 状态 = use更新卡片()
  return <>{状态 ? <卡片 key={状态.发布.version} 发布={状态.发布} /> : null}<下载界面 /></>
}

/** 应用级挂载：展示卡片并按设置执行自动检查 */
export default function UpdateCard() {
  const { 自动检查更新 } = useSettings()
  use自动检查(自动检查更新)
  return <更新卡片宿主 />
}
