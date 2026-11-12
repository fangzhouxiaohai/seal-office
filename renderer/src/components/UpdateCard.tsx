// 更新卡片：自动检查与手动检查共用同一套界面。
// Windows / Web 位于窗口左下角从底部滑入；Android / HarmonyOS 位于屏幕中上部从顶部落下。
// 非强制更新可「稍后」（本次运行内不再提醒）；强制更新只保留「立即更新」，无关闭按钮，点遮罩不关闭。
import { useEffect, useId, useState } from 'react'
import { App as AntdApp, Button } from 'antd'
import { useSettings } from '../store/settingsStore'
import { 展示更新, 检查更新, 稍后提醒, use更新卡片, 执行更新, 读取更新平台, 自动检查间隔, 启动检查延迟, type 有效发布 } from '../update/updateCenter'
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
      void 检查更新().then(结果 => {
        if (有效 && 结果.类型 === '有新版') 展示更新(结果.发布, '自动')
      }).catch(() => {})
    }
    const 启动计时 = setTimeout(执行, 启动检查延迟)
    const 周期计时 = setInterval(执行, 自动检查间隔)
    return () => { 有效 = false; clearTimeout(启动计时); clearInterval(周期计时) }
  }, [开启])
}

function 卡片({ 发布 }: { 发布: 有效发布 }) {
  const { modal, message } = AntdApp.useApp()
  const { 语言 } = useSettings()
  const 标题标识 = useId()
  const [展开说明, 设展开说明] = useState(true)
  const [更新中, 设更新中] = useState(false)
  const [网页版, 设网页版] = useState(false)
  const 移动端 = document.documentElement.dataset.sealPlatform === 'app'
  const 说明 = (发布.notes ?? '').trim()
  const 日期 = 发布日期(发布.publishedAt)

  useEffect(() => {
    let 有效 = true
    void 读取更新平台().then(信息 => { if (有效) 设网页版(信息.平台 === 'web') }).catch(() => {})
    return () => { 有效 = false }
  }, [])

  const 立即更新 = async () => {
    if (更新中) return
    设更新中(true)
    try {
      const 结果 = await 执行更新(发布)
      if (!结果.成功) modal.error({ title: '更新失败', content: 结果.错误, okText: '确定' })
      else if (结果.提示) message.info(结果.提示, 6)
    } catch (错误) {
      modal.error({ title: '更新失败', content: 错误 instanceof Error ? 错误.message : '更新失败，请稍后重试', okText: '确定' })
    } finally {
      设更新中(false)
    }
  }

  const 主体 = (
    <section
      className={`seal-update-card ${移动端 ? 'seal-update-card--top' : 'seal-update-card--bottom'}`}
      role={发布.mandatory ? 'alertdialog' : 'dialog'}
      aria-modal={发布.mandatory ? true : undefined}
      aria-labelledby={标题标识}
    >
      <header className="seal-update-card__head">
        <h2 id={标题标识} className="seal-update-card__title">{`发现新版本 ${发布.version}`}</h2>
        {日期 ? <span className="seal-update-card__time">{`发布时间：${日期}`}</span> : null}
      </header>
      {发布.mandatory ? <p className="seal-update-card__reason">此版本为强制更新，包含必须安装的安全或兼容修复。更新完成前，每次启动都会再次提醒。</p> : null}
      {网页版 ? <p className="seal-update-card__hint">新版本已部署，刷新页面即可使用，无需下载安装。</p> : null}
      <div className="seal-update-card__notes-head">
        <span>更新说明</span>
        {说明 ? <Button type="link" size="small" aria-expanded={展开说明} onClick={() => 设展开说明(值 => !值)}>{展开说明 ? '收起' : '展开'}</Button> : null}
      </div>
      {!说明 ? <p className="seal-update-card__empty">本次更新未填写说明</p> : 展开说明 ? <>
        {语言 === 'en-US' && 含中文(说明) ? <p className="seal-update-card__hint">更新说明原文为中文</p> : null}
        <div className="seal-update-card__notes" data-ui-language-ignore="true">{说明}</div>
      </> : null}
      <div className="seal-update-card__actions">
        {发布.mandatory ? null : <Button disabled={更新中} onClick={稍后提醒}>稍后</Button>}
        <Button type="primary" loading={更新中} onClick={() => void 立即更新()}>{网页版 ? '刷新页面' : '立即更新'}</Button>
      </div>
    </section>
  )
  // 强制更新使用遮罩拦截操作；遮罩不绑定关闭事件，点击不会关闭卡片
  return 发布.mandatory ? <div className="seal-update-mask" data-testid="update-mask">{主体}</div> : 主体
}

/** 只负责展示卡片，不发起自动检查（手动检查结果也经此展示） */
export function 更新卡片宿主() {
  const 状态 = use更新卡片()
  return 状态 ? <卡片 key={状态.发布.version} 发布={状态.发布} /> : null
}

/** 应用级挂载：展示卡片并按设置执行自动检查 */
export default function UpdateCard() {
  const { 自动检查更新 } = useSettings()
  use自动检查(自动检查更新)
  return <更新卡片宿主 />
}
