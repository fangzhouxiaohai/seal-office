/** 跨桌面、移动与 Web 共享的字体目录类型。 */
export type 字体来源 = 'system' | 'custom' | 'builtin' | 'embedded' | 'compat'

export interface 字体记录 {
  标识: string
  名称: string
  家族: string
  显示名?: string
  英文名?: string
  别名: string[]
  样式: string
  字重: number
  斜体: boolean
  格式: string
  大小: number
  集合?: boolean
  字面序号?: number
  中文字形: boolean
  拉丁字形: boolean
  可嵌入: boolean
  授权位?: number
  来源: 字体来源
  文件名?: string
  /** 只有浏览器内置字体才带可直接加载的 URL；系统字体由本机字体栈解析。 */
  地址?: string
  /** 文档嵌入字体所属的文档标识，只用于来源说明。 */
  文档标识?: string
  /** 兼容候选没有真实字体文件，只参与回退链。 */
  缺失?: boolean
}

export interface 字体目录数据 {
  系统: 字体记录[]
  自定义: 字体记录[]
  平台: string
  扫描时间: string
  目录: string[]
  跳过: number
  字体目录?: string
}

export interface 字体目录结果 {
  成功: boolean
  数据?: 字体目录数据
  错误?: string
}

export interface 字体读取结果 {
  成功: boolean
  数据?: 字体记录 & { 数据: string }
  错误?: string
}

export interface 字体导入结果 {
  成功: boolean
  数据?: {
    已取消?: boolean
    导入: 字体记录[]
    重复: Array<{ 名称: string; 文件: string }>
    失败: Array<{ 文件: string; 原因: string }>
  }
  错误?: string
}
