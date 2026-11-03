// CSL-JSON 文献模型：Zotero、citeproc 与本编辑器共用的唯一数据格式。
// 引文域里的 itemData 就是这个结构，因此字段名必须与 CSL-JSON 规范一致，不能改写。

/** CSL 姓名：机构等单字段姓名使用 literal，个人姓名使用 family/given */
export interface Csl姓名 {
  family?: string
  given?: string
  literal?: string
  suffix?: string
  'non-dropping-particle'?: string
}

/** CSL 日期：结构化使用 date-parts（年、月、日），无法解析时保留 literal 原文 */
export interface Csl日期 {
  'date-parts'?: number[][]
  literal?: string
  raw?: string
}

/** 一条文献条目。索引签名保留 CSL 的其余字段，避免转换时丢数据 */
export interface Csl条目 {
  id: string
  type: string
  title?: string
  author?: Csl姓名[]
  editor?: Csl姓名[]
  translator?: Csl姓名[]
  'container-author'?: Csl姓名[]
  'collection-editor'?: Csl姓名[]
  director?: Csl姓名[]
  interviewer?: Csl姓名[]
  composer?: Csl姓名[]
  'original-author'?: Csl姓名[]
  recipient?: Csl姓名[]
  issued?: Csl日期
  accessed?: Csl日期
  'container-title'?: string
  'collection-title'?: string
  volume?: string
  issue?: string
  page?: string
  'number-of-pages'?: string
  edition?: string
  publisher?: string
  'publisher-place'?: string
  DOI?: string
  ISBN?: string
  ISSN?: string
  URL?: string
  language?: string
  note?: string
  abstract?: string
  genre?: string
  medium?: string
  'event-title'?: string
  'event-place'?: string
  archive?: string
  'call-number'?: string
  /** 来源回链：来自 Zotero 文库的条目保留条目键与文库编号，便于刷新与跳转 */
  zoteroItemKey?: string
  zoteroLibraryID?: number
  [字段: string]: unknown
}

/** 引文簇里的单条引用。字段名沿用 CSL citation schema，便于与 Zotero 域代码互换 */
export interface 引文项 {
  id: string
  locator?: string
  label?: string
  prefix?: string
  suffix?: string
  'suppress-author'?: boolean
  'author-only'?: boolean
}

/** 引文簇：同一位置的全部引用，加文档级属性 */
export interface 引文簇引用 {
  citationID: string
  citationItems: 引文项[]
  properties: { noteIndex: number }
}

/** 引文样式：样式标识、显示名、默认语言与原始 CSL 文本 */
export interface 引文样式 {
  标识: string
  名称: string
  语言: string
  内容: string
  来源: string
  许可: string
}

/** 文档级引文偏好：决定引文与书目的排版结果 */
export interface 引文偏好 {
  样式标识: string
  语言: string
}

/** 渲染后的书目条目 */
export interface 书目条目 {
  序号: number
  /** 条目标识（CSL 条目 id） */
  标识: string
  /** 带标记的 HTML，来自 citeproc 的 csl-entry；左侧编号已剥离 */
  文字: string
  /** 样式的左侧编号列（如 [1]），无编号样式为空字符串 */
  编号文字: string
}

/** 整篇文档的渲染结果 */
export interface 渲染结果 {
  引文: Array<{ 标识: string; 文字: string }>
  书目: 书目条目[]
}
