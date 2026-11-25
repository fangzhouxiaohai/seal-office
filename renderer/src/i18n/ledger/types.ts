/** 文案台账条目：中文为来源语言，英文必填；占位符写作 {名称}，两种语言必须一致。 */
export interface 台账条目 {
  zh: string
  en: string
  /** 仅部分平台使用时登记，缺省为全部平台 */
  platforms?: Array<'windows' | 'macos' | 'linux' | 'android' | 'harmony' | 'web'>
}
