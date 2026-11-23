import { 从Html表格构建工作表, type Xlsx工作表元数据 } from './sheetImport'
import { 导入网页型旧版表格 } from './htmlXlsImport'
import { 重算工作簿, type Sheet } from './model'
import { Csv转表格Html, 文本转Html } from '../textImport'
import type { 文本编码 } from '../ipc/bridge'

type Input = { source?: string; kind: 'xls'|'sheets'|'csv'|'tsv'|'text'; text?: string; encoding?: 文本编码; sheets?: Array<{ 名称: string; html: string; 页面设置?: Sheet['页面设置']; 元数据?: Xlsx工作表元数据 }> }
self.onmessage = (event: MessageEvent<Input>) => {
  try {
    const { kind, text = '', encoding } = event.data
    if (kind === 'text') { self.postMessage({ result: { html: 文本转Html(text) } }); return }
    let sheets: Sheet[]
    const loss = new Set<string>()
    if (kind === 'xls') sheets = 导入网页型旧版表格(text, {}, loss)
    else {
      const entries = event.data.sheets ?? [{ 名称: 'Sheet1', html: Csv转表格Html(text, encoding, kind === 'tsv' ? '\t' : ',') }]
      sheets = entries.map((entry, i) => {
        const model = 从Html表格构建工作表(entry.html, entry.名称, entry.页面设置, entry.元数据)
        if (!model) throw new Error('工作表内容无效')
        self.postMessage({ stage: 'sheets', done: i+1, total: entries.length })
        return model
      })
      sheets = 重算工作簿(sheets)
    }
    if (event.data.source) Object.assign(sheets[0], { 另存来源: event.data.source, 导入损失: [...loss] })
    self.postMessage({ result: { sheets, snapshot: JSON.stringify(sheets), loss: [...loss] } })
  } catch (e) { self.postMessage({ error: (e as Error).message }) }
}
