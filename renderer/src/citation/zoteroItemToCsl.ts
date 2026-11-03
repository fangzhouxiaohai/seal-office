// Zotero Web API / Local API 条目 → CSL-JSON。
//
// 为什么不用 Zotero 自带的 format=csljson 一个通道走到底：
// Local API 的 csljson 导出在部分版本上不可用（返回 400），且 group 库与
// 旧版本的字段命名有差异。本地映射保证两条通道都能得到同一份结构，
// 也让映射规则可以被逐条单测覆盖，而不是依赖远端行为。

/** Zotero 条目类型到 CSL 类型的映射，未列出的按原文小写保留 */
const 类型映射: Record<string, string> = {
  journalArticle: 'article-journal',
  magazineArticle: 'article-magazine',
  newspaperArticle: 'article-newspaper',
  bookSection: 'chapter',
  book: 'book',
  thesis: 'thesis',
  dissertation: 'thesis',
  report: 'report',
  conferencePaper: 'paper-conference',
  webpage: 'webpage',
  blogPost: 'post-weblog',
  forumPost: 'post',
  letter: 'personal_communication',
  email: 'personal_communication',
  manuscript: 'manuscript',
  bookSectionDraft: 'chapter',
  artwork: 'graphic',
  film: 'motion_picture',
  audioRecording: 'song',
  videoRecording: 'motion_picture',
  interview: 'interview',
  patent: 'patent',
  standard: 'standard',
  legislation: 'legislation',
  case: 'legal_case',
  statute: 'legislation',
  map: 'map',
  dataset: 'dataset',
  computerProgram: 'software',
  presentation: 'speech',
  encyclopediaArticle: 'entry-encyclopedia',
  dictionaryEntry: 'entry-dictionary',
  preprint: 'article',
}

/** Zotero 创作者类型到 CSL 姓名数组字段的映射 */
const 角色映射: Record<string, string> = {
  author: 'author',
  creator: 'author',
  editor: 'editor',
  translator: 'translator',
  seriesEditor: 'collection-editor',
  bookAuthor: 'container-author',
  contributor: 'author',
  director: 'director',
  interviewer: 'interviewer',
  composer: 'composer',
  presenter: 'author',
  reviewedAuthor: 'reviewed-author',
  recipient: 'recipient',
  artist: 'author',
  commenter: 'author',
  cosponsor: 'author',
  producer: 'director',
  scriptwriter: 'author',
  wordsBy: 'author',
  programmer: 'author',
}

export interface Zotero条目数据 {
  key?: string
  version?: number
  libraryID?: number
  data?: {
    key?: string
    itemType?: string
    title?: string
    creators?: Array<{
      creatorType?: string
      name?: string
      firstName?: string
      lastName?: string
      fieldMode?: number
    }>
    date?: string
    publicationTitle?: string
    bookTitle?: string
    proceedingsTitle?: string
    websiteTitle?: string
    blogTitle?: string
    encyclopediaTitle?: string
    dictionaryTitle?: string
    series?: string
    volume?: string
    issue?: string
    pages?: string
    numPages?: string
    edition?: string
    publisher?: string
    place?: string
    DOI?: string
    ISBN?: string
    ISSN?: string
    url?: string
    language?: string
    abstractNote?: string
    extra?: string
    genre?: string
    medium?: string
    conferenceName?: string
    university?: string
    institution?: string
    reportType?: string
    thesisType?: string
    accessDate?: string
    archive?: string
    callNumber?: string
    [字段: string]: unknown
  }
  [字段: string]: unknown
}

function 取数据(条目: Zotero条目数据): NonNullable<Zotero条目数据['data']> {
  return 条目?.data ?? {}
}

function 去空白(值: unknown): string | undefined {
  if (typeof 值 !== 'string') return undefined
  const 结果 = 值.trim()
  return 结果.length > 0 ? 结果 : undefined
}

/**
 * Zotero 的 date 字段常带附加原文，例如 "2020-05-01 2020年5月" 或 "2020"。
 * 只取能被识别为年月日的部分，识别不了就整体落到 literal，不猜。
 */
export function 解析日期(值: string | undefined): { 'date-parts'?: number[][]; literal?: string; raw?: string } | undefined {
  const 原文 = 去空白(值)
  if (!原文) return undefined
  const 匹配 = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?(?:\s|$)/.exec(原文)
  if (!匹配) return { literal: 原文, raw: 原文 }
  const [年, 月, 日] = [Number(匹配[1]), Number(匹配[2] ?? 0), Number(匹配[3] ?? 0)]
  const 部件: number[] = [年]
  let 有非法部分 = false
  if (匹配[2] !== undefined) {
    if (月 >= 1 && 月 <= 12) 部件.push(月)
    else 有非法部分 = true
  }
  if (部件.length === 2 && 匹配[3] !== undefined) {
    if (日 >= 1 && 日 <= 31) 部件.push(日)
    else 有非法部分 = true
  }
  const 剩余 = 原文.slice(匹配[0].length).trim()
  return { 'date-parts': [部件], ...(剩余 || 有非法部分 ? { raw: 原文 } : {}) }
}

function 建姓名(作者: NonNullable<NonNullable<Zotero条目数据['data']>['creators']>[number]): Record<string, unknown> | null {
  const 单字段 = 去空白(作者.name)
  if (单字段) return { literal: 单字段 }
  const 姓 = 去空白(作者.lastName)
  const 名 = 去空白(作者.firstName)
  if (!姓 && !名) return null
  return { ...(姓 ? { family: 姓 } : {}), ...(名 ? { given: 名 } : {}), ...(姓 ? {} : { literal: 名! }) }
}

/** 取容器名：不同条目类型把期刊/书名/会议名放在不同字段 */
function 取容器名(数据: NonNullable<Zotero条目数据['data']>): string | undefined {
  return 去空白(数据.publicationTitle) ?? 去空白(数据.bookTitle)
    ?? 去空白(数据.proceedingsTitle) ?? 去空白(数据.websiteTitle)
    ?? 去空白(数据.blogTitle) ?? 去空白(数据.encyclopediaTitle)
    ?? 去空白(数据.dictionaryTitle)
}

/** 从 extra 字段里读一行 "字段: 值"，用于无法在界面里录入的 CSL 字段 */
function 读附加字段(extra: string | undefined, 名称: string): string | undefined {
  if (!extra) return undefined
  const 行 = new RegExp(`^${名称}\\s*[:：]\\s*(.+)$`, 'im').exec(extra)
  return 行 ? 去空白(行[1]) : undefined
}

/**
 * 把一条 Zotero 条目转为 CSL-JSON。
 * 目标 id 优先使用传入的备用键，保证同一文献在本编辑器内有稳定标识。
 */
export function zoteroItemToCsl(条目: Zotero条目数据, 备用id?: string): Record<string, unknown> {
  const 数据 = 取数据(条目)
  const 键 = 去空白(数据.key) ?? 去空白(条目.key) ?? 备用id
  if (!键) throw new Error('无法转换文献：缺少条目键')
  const 类型原文 = 去空白(数据.itemType) ?? 'document'
  const 结果: Record<string, unknown> = {
    id: 键,
    type: 类型映射[类型原文] ?? 类型原文.toLowerCase(),
  }

  const 标题 = 去空白(数据.title)
  if (标题) 结果.title = 标题

  const 姓名分组: Record<string, Array<Record<string, unknown>>> = {}
  for (const 作者 of 数据.creators ?? []) {
    const 角色 = 角色映射[去空白(作者.creatorType) ?? 'author'] ?? 'author'
    const 姓名 = 建姓名(作者)
    if (!姓名) continue
    ;(姓名分组[角色] ??= []).push(姓名)
  }
  for (const [角色, 列表] of Object.entries(姓名分组)) 结果[角色] = 列表
  if (!结果.author && 姓名分组.contributor) 结果.author = 姓名分组.contributor

  const 出版日期 = 解析日期(去空白(数据.date))
  if (出版日期) 结果.issued = 出版日期
  const 访问日期 = 解析日期(去空白(数据.accessDate))
  if (访问日期) 结果.accessed = 访问日期

  const 容器 = 取容器名(数据)
  if (容器) 结果['container-title'] = 容器
  const 丛书 = 去空白(数据.series)
  if (丛书) 结果['collection-title'] = 丛书

  for (const [目标, 源] of [
    ['volume', 数据.volume], ['issue', 数据.issue], ['page', 数据.pages],
    ['number-of-pages', 数据.numPages], ['edition', 数据.edition],
    ['publisher', 数据.publisher], ['publisher-place', 数据.place],
    ['DOI', 数据.DOI], ['ISBN', 数据.ISBN], ['ISSN', 数据.ISSN],
    ['URL', 数据.url], ['language', 数据.language], ['abstract', 数据.abstractNote],
    ['genre', 数据.genre], ['medium', 数据.medium],
    ['event-title', 数据.conferenceName], ['archive', 数据.archive],
    ['call-number', 数据.callNumber],
  ] as const) {
    const 值 = 去空白(源)
    if (值) 结果[目标] = 值
  }

  // 学位论文与报告把机构名放在不同字段，统一补到 publisher，避免参考文献缺出版者
  const 机构 = 去空白(数据.university) ?? 去空白(数据.institution)
  if (机构 && !结果.publisher) 结果.publisher = 机构

  // 其它类型专用字段通过 extra 传递，与 Zotero 的常规约定一致
  const 附加: Array<[string, string]> = [['note', 'note'], ['original-date', 'original-date'], ['number', 'number']]
  for (const [目标, 名称] of 附加) {
    const 值 = 读附加字段(去空白(数据.extra), 名称)
    if (值) 结果[目标] = 值
  }

  结果.zoteroItemKey = 键
  const 文库 = typeof 数据.libraryID === 'number' ? 数据.libraryID : 条目.libraryID
  if (typeof 文库 === 'number') 结果.zoteroLibraryID = 文库

  return 结果
}

/** 批量转换，跳过无法转换的条目并返回跳过的键，供界面如实提示 */
export function 批量转换(列表: Zotero条目数据[]): { 条目: Record<string, unknown>[]; 跳过: string[] } {
  const 条目: Record<string, unknown>[] = []
  const 跳过: string[] = []
  for (const 一项 of 列表) {
    try {
      条目.push(zoteroItemToCsl(一项))
    } catch {
      跳过.push(去空白(一项?.data?.key) ?? 去空白(一项?.key) ?? '未知条目')
    }
  }
  return { 条目, 跳过 }
}
