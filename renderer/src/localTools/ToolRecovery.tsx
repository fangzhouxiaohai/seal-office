import { useRef } from 'react'
import { App, Button } from 'antd'
import { exportToolFile } from './useToolDocument'

export default function ToolRecovery({ title, reason, raw, restore }: { title: string; reason: string | null; raw: () => string; restore: (raw: string) => string | null }) {
  const { modal } = App.useApp(), input = useRef<HTMLInputElement>(null)
  const fail = (error: unknown) => { modal.error({ title: '恢复未完成', content: error instanceof Error ? error.message : String(error) }) }
  return <div className="local-page"><h1>{title}</h1><p role="alert">{reason}；原数据已保留。</p><div className="local-page__actions"><Button onClick={() => { try { void exportToolFile(`${title}原始备份.json`, raw()).catch(fail) } catch (error) { fail(error) } }}>导出原始备份</Button><Button onClick={() => input.current?.click()}>从备份恢复</Button></div><input ref={input} hidden type="file" accept=".json" onChange={async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try {
      if (file.size > 5_000_000) throw new Error('文件超过5 MB')
      const content = await file.text()
      modal.confirm({ title: `恢复${title}`, content: '将用备份替换当前无法读取的数据，建议先导出原始备份。', okText: '恢复', cancelText: '取消', onOk: () => { const error = restore(content); if (error) fail(error) } })
    } catch (error) { fail(error) }
  }}/></div>
}
