// 内置 CSL 样式与语言包。
// 样式来自 Zotero 中文样式仓库（CC BY-SA 3.0）与 CSL 官方样式仓库（CC BY-SA 3.0），
// 语言包来自 citation-style-language/locales（CC BY-SA 3.0）。
// 逐字保留原始文件，不做改写，以便与 Zotero 自身的排版结果对齐。
import gbNumeric from './assets/styles/gb-t-7714-2015-numeric.csl?raw'
import gbAuthorDate from './assets/styles/gb-t-7714-2015-author-date.csl?raw'
import apa from './assets/styles/apa.csl?raw'
import ieee from './assets/styles/ieee.csl?raw'
import nature from './assets/styles/nature.csl?raw'
import vancouver from './assets/styles/vancouver.csl?raw'
import zhCN from './assets/locales/locales-zh-CN.xml?raw'
import enUS from './assets/locales/locales-en-US.xml?raw'
import type { 引文样式 } from './types'

const 样式许可 = 'CC BY-SA 3.0'

/** 内置样式清单，顺序即设置界面的展示顺序，中文规范样式排在最前 */
export const 内置样式: 引文样式[] = [
  {
    标识: 'gb-t-7714-2015-numeric',
    名称: 'GB/T 7714—2015（顺序编码，双语）',
    语言: 'zh-CN',
    内容: gbNumeric,
    来源: 'https://zotero-chinese.com/styles/',
    许可: 样式许可,
  },
  {
    标识: 'gb-t-7714-2015-author-date',
    名称: 'GB/T 7714—2015（著者-出版年，双语）',
    语言: 'zh-CN',
    内容: gbAuthorDate,
    来源: 'https://zotero-chinese.com/styles/',
    许可: 样式许可,
  },
  {
    标识: 'apa',
    名称: 'APA 第 7 版',
    语言: 'en-US',
    内容: apa,
    来源: 'https://www.zotero.org/styles/apa',
    许可: 样式许可,
  },
  {
    标识: 'ieee',
    名称: 'IEEE',
    语言: 'en-US',
    内容: ieee,
    来源: 'https://www.zotero.org/styles/ieee',
    许可: 样式许可,
  },
  {
    标识: 'nature',
    名称: 'Nature',
    语言: 'en-US',
    内容: nature,
    来源: 'https://www.zotero.org/styles/nature',
    许可: 样式许可,
  },
  {
    标识: 'vancouver',
    名称: 'Vancouver（NLM）',
    语言: 'en-US',
    内容: vancouver,
    来源: 'https://www.zotero.org/styles/elsevier-vancouver',
    许可: 样式许可,
  },
]

/** 内置语言包，键为 CSL locale 标识 */
export const 内置语言包: Record<string, string> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

/** 默认样式与语言：中文文档直接落在国标顺序编码制上 */
export const 默认样式标识 = 'gb-t-7714-2015-numeric'
export const 默认语言 = 'zh-CN'

/** 按标识取样式，缺失时回退默认样式，不让界面因样式缺失而空白 */
export function 取内置样式(标识: string): 引文样式 {
  return 内置样式.find((样式) => 样式.标识 === 标识)
    ?? 内置样式.find((样式) => 样式.标识 === 默认样式标识)!
}
