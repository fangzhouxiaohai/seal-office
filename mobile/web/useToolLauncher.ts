import { App } from 'antd'
import { useAppStore } from '../../renderer/src/store'
import { lookupEntry, routeForEntry, type ToolEntry } from './toolCatalog'

export function useToolLauncher() {
  const store = useAppStore()
  const { modal, message } = App.useApp()
  const go = (key: string) => { store.setNavKey(key); store.setModule('home') }
  async function open(entry: ToolEntry) {
    try {
      const action = entry.action
      if (action.kind === 'document') { store.createDoc(action.type); return }
      if (action.kind === 'navigate') {
        if (action.key === 'settings') store.showSettings()
        else if (action.key === 'help') store.showHelp()
        else if (action.key === 'pdf') store.createDoc('pdf')
        else store.handleNav(action.key, text => message.info(text))
        return
      }
      if (action.kind === 'resume') {
        const { WORD_TEMPLATES } = await import('../../renderer/src/data/templates')
        const resume = WORD_TEMPLATES.find(template => template.id === 'word-resume-001')
        if (!resume) throw new Error('未能读取个人简历模板')
        store.createDoc('word',resume.内容,{名称:'个人简历.docx'})
        return
      }
      if (action.kind === 'assistant' && action.task === '助手') { window.dispatchEvent(new Event('seal-open-assistant')); return }
      go(routeForEntry(entry))
    } catch (error) {
      modal.error({ title:'打开服务失败', content:error instanceof Error ? error.message : '请稍后重试' })
    }
  }
  return { go, open, openScan: () => open(lookupEntry('文件扫描')) }
}
