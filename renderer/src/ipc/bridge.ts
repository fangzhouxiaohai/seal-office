export interface 文件读取结果 { 成功: boolean; 内容?: string; 二进制?: boolean; 扩展名?: string; 错误?: string }
export interface 文件保存结果 { 成功: boolean; 路径?: string; 错误?: string }
export interface 文件重命名结果 { 成功: boolean; 路径?: string; 名称?: string; 错误?: string }
/** 最近文档的持久化记录（主进程 recent.json） */
export interface 最近文档记录 {
  路径: string
  名称: string
  类型: 'word' | 'table' | 'ppt' | 'pdf' | string
  置顶?: boolean
  时间?: number
}
export interface 应用信息 { 名称: string; 英文名称: string; 版本: string; 作者: string; 邮箱: string; 说明: string; 开源地址: string; 专业服务: string }
export interface 电子接口 {
  showSaveDialog: (默认文件名: string, 保存类型?: 'word' | 'table' | 'ppt' | 'pdf') => Promise<string | null>
  showOpenDialog: (打开类型?: 'word' | 'table' | 'ppt' | 'pdf') => Promise<string | null>
  saveToFile: (路径: string, 内容: string | Uint8Array, 格式?: '文本' | '二进制') => Promise<文件保存结果>
  readFile: (路径: string) => Promise<文件读取结果>
  renameFile: (旧路径: string, 新名称: string) => Promise<文件重命名结果>
  backupSave: (内容: string) => Promise<{ 成功: boolean; 错误?: string }>
  backupLoad: () => Promise<{ 成功: boolean; 内容?: string | null; 错误?: string }>
  backupClear: () => Promise<{ 成功: boolean; 错误?: string }>
  recentList: () => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  recentAdd: (条目: 最近文档记录) => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  recentRemove: (路径: string) => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  revealInFolder: (路径: string) => Promise<{ 成功: boolean; 错误?: string }>
  exportToPdf: (html: string, 默认文件名: string) => Promise<文件保存结果 & { 已取消?: boolean }>
  reportUnsavedCount: (数量: number) => Promise<{ 成功: boolean; 错误?: string }>
  setDefaultApp: () => Promise<{ 成功: boolean; 需要管理员权限?: boolean; 提示?: string; 错误?: string }>
  getHelpContent: () => Promise<Record<string, string>>
  getAppInfo: () => Promise<应用信息>
  office: { writeDocx: (模型: unknown) => Promise<any>; readDocx: (数据: string) => Promise<any>; readXlsx: (数据: string) => Promise<any>; writeXlsx: (模型: unknown) => Promise<any>; readPptx: (数据: string) => Promise<any>; writePptx: (模型: unknown) => Promise<any> }
  pdf: { extract: (数据: string, 页码: number[]) => Promise<any>; merge: (列表: string[]) => Promise<any>; delete: (数据: string, 页码: number[]) => Promise<any>; rotate: (数据: string, 页码: number[], 角度: number) => Promise<any>; exportToPath: (html: string, 保存路径: string) => Promise<文件保存结果> }
}
declare global { interface Window { electronAPI?: 电子接口 } }
const 取后端 = (): 电子接口 | null => typeof window !== 'undefined' ? window.electronAPI ?? null : null
const 失败 = (提示: string) => Promise.resolve({ 成功: false, 错误: 提示 })
export const 桥接 = {
  get 可用() { return 取后端() !== null },
  showSaveDialog: (名称: string, 保存类型?: 'word' | 'table' | 'ppt' | 'pdf') => 取后端()?.showSaveDialog(名称, 保存类型) ?? Promise.resolve(null),
  showOpenDialog: (打开类型?: 'word' | 'table' | 'ppt' | 'pdf') => 取后端()?.showOpenDialog(打开类型) ?? Promise.resolve(null),
  saveToFile: (路径: string, 内容: string | Uint8Array, 格式?: '文本' | '二进制') => 取后端()?.saveToFile(路径, 内容, 格式) ?? 失败('当前环境不支持文件保存'),
  readFile: (路径: string) => 取后端()?.readFile(路径) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持文件读取' }),
  renameFile: (旧路径: string, 新名称: string): Promise<文件重命名结果> => 取后端()?.renameFile(旧路径, 新名称) ?? 失败('当前环境不支持文件重命名'),
  backupSave: (内容: string) => 取后端()?.backupSave?.(内容) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持备份' }),
  backupLoad: (): Promise<{ 成功: boolean; 内容?: string | null; 错误?: string }> => 取后端()?.backupLoad?.() ?? 失败('当前环境不支持备份读取'),
  backupClear: () => 取后端()?.backupClear?.() ?? 失败('当前环境不支持备份清理'),
  recentList: (): Promise<{ 成功: boolean; 数据?: 最近文档记录[]; 错误?: string }> => 取后端()?.recentList?.() ?? 失败('当前环境不支持最近文档读取'),
  recentAdd: (条目: 最近文档记录) => 取后端()?.recentAdd?.(条目) ?? 失败('当前环境不支持最近文档记录'),
  recentRemove: (路径: string) => 取后端()?.recentRemove?.(路径) ?? 失败('当前环境不支持最近文档移除'),
  revealInFolder: (路径: string) => 取后端()?.revealInFolder?.(路径) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持该操作' }),
  exportToPdf: (html: string, 名称: string) => 取后端()?.exportToPdf(html, 名称) ?? 失败('当前环境不支持 PDF 导出'),
  reportUnsavedCount: (数量: number) => 取后端()?.reportUnsavedCount(数量) ?? 失败('当前环境不支持关闭保护'),
  setDefaultApp: () => 取后端()?.setDefaultApp() ?? Promise.resolve({ 成功: false, 提示: '请使用打包后的应用设置默认程序' }),
  getHelpContent: () => 取后端()?.getHelpContent() ?? Promise.resolve({}),
  getAppInfo: () => 取后端()?.getAppInfo() ?? Promise.resolve({ 名称: '海豹办公', 英文名称: 'Seal Office', 版本: __APP_VERSION__, 作者: '饮风一笑', 邮箱: '24519660@qq.com', 说明: '本程序永久免费开源', 开源地址: 'https://github.com/seal-office/seal-office', 专业服务: '专业应用开发服务' }),
  office: {
    writeDocx: (模型: unknown) => 取后端()?.office.writeDocx(模型) ?? 失败('当前环境不支持文字文档写入'), readDocx: (数据: string) => 取后端()?.office.readDocx(数据) ?? 失败('当前环境不支持文字文档读取'), readXlsx: (数据: string) => 取后端()?.office.readXlsx(数据) ?? 失败('当前环境不支持表格文档读取'), writeXlsx: (模型: unknown) => 取后端()?.office.writeXlsx(模型) ?? 失败('当前环境不支持表格文档写入'), readPptx: (数据: string) => 取后端()?.office.readPptx(数据) ?? 失败('当前环境不支持演示文档读取'), writePptx: (模型: unknown) => 取后端()?.office.writePptx(模型) ?? 失败('当前环境不支持演示文档写入'),
  },
  pdf: {
    extract: (数据: string, 页码: number[]) => 取后端()?.pdf.extract(数据, 页码) ?? 失败('当前环境不支持 PDF 页面提取'), merge: (列表: string[]) => 取后端()?.pdf.merge(列表) ?? 失败('当前环境不支持 PDF 合并'), delete: (数据: string, 页码: number[]) => 取后端()?.pdf.delete(数据, 页码) ?? 失败('当前环境不支持 PDF 删除页面'), rotate: (数据: string, 页码: number[], 角度: number) => 取后端()?.pdf.rotate(数据, 页码, 角度) ?? 失败('当前环境不支持 PDF 旋转页面'), exportToPath: (html: string, 保存路径: string) => 取后端()?.pdf.exportToPath(html, 保存路径) ?? 失败('当前环境不支持 PDF 导出'),
  },
}
