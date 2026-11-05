import { useEffect, useRef } from 'react'
import { App } from 'antd'
import { useAppStore } from '../../renderer/src/store'
import Icon from '../../renderer/src/components/Icon'
import { mobileSection } from './home'
import { 底部标签栏可见, 计算返回去向 } from '../../renderer/src/navigation/backLevel'

export default function MobileNavigation() {
  const store = useAppStore(), { message } = App.useApp()
  const route = { module: store.module, navKey: store.navKey, tab: store.activeWorkspaceTabId }
  const routes = useRef([route]), restoring = useRef(false)
  useEffect(() => {
    if (restoring.current) { restoring.current = false; return }
    if (route.module === 'home' && route.navKey === 'home') { routes.current = [route]; return }
    const previous = routes.current[routes.current.length - 1]
    if (JSON.stringify(previous) !== JSON.stringify(route)) routes.current.push(route)
  }, [route.module, route.navKey, route.tab])
  const navigate = (key: string) => {
    store.goHome()
    store.setNavKey(key)
  }
  useEffect(() => {
    const send = (action: string, seq?: number, backToDesktop?: boolean) => window.uni?.webView?.postMessage({ data: { action, token: window.sealNative?.token, seq, backToDesktop } })
    const visible = (node: Element) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none' && !node.querySelector('.ant-zoom-leave,.ant-fade-leave')
    const back = (event: Event) => {
      if (event.defaultPrevented) return
      event.preventDefault()
      const overlays = [...document.querySelectorAll('.ant-modal-wrap,.ant-drawer-open')].filter(visible)
      const top = overlays[overlays.length - 1]
      if (top) {
        const close = top.querySelector<HTMLButtonElement>('.ant-modal-close,.ant-drawer-close,.assistant-collapse,.ant-modal-confirm-btns button:not(:disabled):not(.ant-btn-dangerous)')
        if (close) close.click()
        return
      }
      // 底部主导航只要实际可见，本次返回就应直接交给系统退到桌面。
      if (计算返回去向({ 浮层数: 0 }) === '回到桌面') {
        const seq = (event as CustomEvent<{ seq?: number }>).detail?.seq
        void store.刷新工作状态备份().then(result => { if (result.成功 && 底部标签栏可见(document)) send('back-root', seq, true); else if (!result.成功) message.error(result.错误 || '保存工作区失败，请重试') }).catch(() => message.error('保存工作区失败，请重试'))
        return
      }
      // 不显示底部主导航的子页，先让当前模块处理其内部层级。
      if (!window.dispatchEvent(new Event('seal-before-native-back', {cancelable:true}))) return
      routes.current.pop()
      const previous = routes.current[routes.current.length - 1]
      restoring.current = true
      if (previous?.tab && previous.module !== 'home' && store.workspaceTabs.some(tab => tab.id === previous.tab)) store.selectWorkspaceTab(previous.tab)
      else store.setModule(previous?.module ?? 'home')
      store.setNavKey(previous?.navKey ?? 'home')
    }
    const persist = () => { void store.刷新工作状态备份().then((result) => { if (!result.成功) message.error(result.错误 || '保存工作区失败') }).catch((error) => message.error(error instanceof Error ? error.message : '保存工作区失败')) }
    const healthy = () => send('healthy')
    window.addEventListener('seal-native-back', back); window.addEventListener('seal-persist-workspace', persist); window.addEventListener('seal-native-probe', healthy)
    let lastState = ''
    let firstPaintDone = false
    let paintScheduled = false
    let active = true
    const frames: number[] = []
    const report = () => {
      if (!active || !window.sealNative) return
      // 原生启动画面要等工作台实际绘制后再退出，不能先露出网页加载占位。
      if (!firstPaintDone) {
        if (!paintScheduled && document.querySelector('.wps-titlebar') && document.querySelector('.seal-mobile-nav') && !document.querySelector('.startup-screen')) {
          paintScheduled = true
          const first = requestAnimationFrame(() => {
            const second = requestAnimationFrame(() => { firstPaintDone = true; report() })
            frames.push(second)
          })
          frames.push(first)
        }
        return
      }
      const state = { action: 'state', token: window.sealNative.token, backToDesktop: 底部标签栏可见(document), unsaved: store.workspaceTabs.filter((tab) => tab.dirty).length }
      const value = JSON.stringify(state)
      if (value !== lastState) { lastState = value; window.uni?.webView?.postMessage({ data: state }) }
    }
    const observer = new MutationObserver(report)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden'] })
    window.addEventListener('seal-native-ready', report)
    document.addEventListener('fullscreenchange', report)
    report()
    return () => { active = false; frames.forEach(cancelAnimationFrame); observer.disconnect(); window.removeEventListener('seal-native-back', back); window.removeEventListener('seal-persist-workspace', persist); window.removeEventListener('seal-native-probe', healthy); window.removeEventListener('seal-native-ready', report); document.removeEventListener('fullscreenchange', report) }
  }, [store, message])
  return <>
    <nav className="seal-mobile-nav" aria-label="移动工作台导航">
      {[{key:'home',section:'home',label:'首页',icon:'home'},{key:'my-cloud',section:'cloud',label:'云盘',icon:'folder'},{key:'apps',section:'services',label:'服务',icon:'grid'},{key:'market',section:'templates',label:'模板',icon:'page-view'},{key:'mobile-profile',section:'mine',label:'我的',icon:'users'}].map(item=><button key={item.key} aria-label={item.label==='首页'?'返回首页':item.label} aria-current={store.module==='home'&&mobileSection(store.navKey)===item.section?'page':undefined} onClick={()=>navigate(item.key)}><Icon name={item.icon} size={23} variant="outline"/><span>{item.label}</span></button>)}
    </nav>
  </>
}
