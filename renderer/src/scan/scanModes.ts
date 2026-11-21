export const 扫描模式列表 = ['文件扫描', '照片转PDF', '拍照转Word', '拍照转Excel', '提取文字', '图片翻译', '证件扫描', '去除手写', '拍书籍'] as const
export type 扫描模式 = typeof 扫描模式列表[number]
export type 证件类型 = '身份证' | '户口本' | '护照' | '其他'
export type 书籍版式 = '单页' | '双页'

export interface 扫描取景参数 {
  模式: 扫描模式
  切换模式: (模式: 扫描模式) => void
  证件: 证件类型
  切换证件: (证件: 证件类型) => void
  书籍: 书籍版式
  切换书籍: (版式: 书籍版式) => void
  页数: number
  缩略图?: string
  忙碌: boolean
  接收图片: (文件: File[], 来源: '拍照' | '相册') => Promise<void>
  查看结果: () => void
  打开扫描库?: () => void
  返回: () => void
}
