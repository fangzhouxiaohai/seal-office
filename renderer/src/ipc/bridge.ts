export interface 文件读取结果 { 成功: boolean; 内容?: string; 二进制?: boolean; 扩展名?: string; 文件指纹?: string; 错误?: string }
export interface 文件保存结果 { 成功: boolean; 路径?: string; 文件指纹?: string; 错误?: string }
export interface 文件重命名结果 { 成功: boolean; 路径?: string; 名称?: string; 文件指纹?: string; 错误?: string }
export interface 完整性检查结果 { 成功: boolean; 完整?: boolean; 检查文件数?: number; 异常?: Array<{ 路径: string; 原因: string }>; 错误?: string }
/** 最近文档的持久化记录（主进程 recent.json） */
export interface 最近文档记录 {
  路径: string
  名称: string
  类型: 'word' | 'table' | 'ppt' | 'pdf' | string
  置顶?: boolean
  时间?: number
}
export interface 应用信息 { 名称: string; 英文名称: string; 版本: string; 作者: string; 邮箱: string; 说明: string; 开源地址: string; 专业服务: string }
export type 思考强度 = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
export type 思考参数模式 = 'none' | 'three' | 'four' | 'six' | 'thinking' | 'budget'
export interface 助手配置 { 名称: string; 地址: string; 模型: string; 已配置密钥: boolean; 服务商?: string; 思考强度?: 思考强度; 参数模式?: 思考参数模式; 上下文令牌?: number }
export interface 助手配置输入 { 名称: string; 地址: string; 模型: string; 密钥?: string; 清除密钥?: boolean; 服务商?: string; 思考强度?: 思考强度; 参数模式?: 思考参数模式; 上下文令牌?: number }
export interface 助手计划项 { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_confirmation' }
export interface 助手待确认候选 { 回复: string; 修改: unknown[]; 文档上下文: string; 文件快照: string | null }
export interface 助手会话 { 显示消息: Array<{ 角色: 'user' | 'assistant'; 内容: string; 思考?: string; 状态?: '完成' | '已停止' | '失败'; 阶段?: string }>; 摘要: string; 计划: 助手计划项[]; 压缩次数: number; 待确认候选?: 助手待确认候选 | null }
export interface 助手对话输入 { 消息: Array<{ 角色: 'user' | 'assistant'; 内容: string }>; 文档上下文: string; 请求标识?: string; 思考强度?: 思考强度; 会话标识?: string; 自动执行?: boolean; 上下文令牌?: number; 文件快照?: string }
export interface 助手流片段 { 请求标识: string; 类型: '思考' | '正文' | '状态' | '计划' | '工具' | '压缩'; 内容: string }
export interface 助手工具请求 { 请求标识: string; 调用标识: string; 工具: string; 参数: unknown }
export interface 助手工具结果 { 请求标识: string; 调用标识: string; 成功: boolean; 数据?: unknown; 错误?: string }
export interface 助手对话结果 { 内容: string; 思考?: string; 已停止?: boolean; 计划?: 助手计划项[]; 摘要?: string; 压缩次数?: number }
export interface 助手结果<T> { 成功: boolean; 数据?: T; 错误?: string }
export interface 本机文件夹结果 { 成功: boolean; 路径?: string; 文件?: Array<{ 名称: string; 路径: string; 扩展名: string; 大小: number; 修改时间: number }>; 错误?: string }
export interface 关联文件领取结果 { 成功: boolean; 路径列表?: string[]; 错误?: string }
export interface 关闭状态 { 未保存数量: number; 备份成功: boolean; 备份错误?: string }
export interface 放映全屏结果 { 成功: boolean; 会话标识?: string; 错误?: string }
export interface 默认程序提示结果 { 成功: boolean; 需要询问?: boolean; 错误?: string }
export interface 演示资源条目 { 标识: string; 类型: string; 数据: string }
export interface 演示导出请求 {
  html: string
  格式: string
  页面尺寸: { 宽: number; 高: number }
  条目: Array<{ 序号: number }>
  基础名: string
  目录?: string
  分辨率倍数?: number
  JPEG质量?: number
  讲义每页张数?: number
  输出备注?: boolean
}
export interface 演示导出文件 { 路径: string; 字节数: number }
export interface 演示导出结果 { 成功: boolean; 错误?: string; 已取消?: boolean; 文件列表?: 演示导出文件[]; 页数?: number }
export interface 演示导出接口 {
  run: (请求: 演示导出请求) => Promise<演示导出结果>
  pickDirectory: () => Promise<{ 成功: boolean; 目录?: string; 已取消?: boolean; 错误?: string }>
}
export interface 演示资源接口 {
  add: (数据: string, 类型: string) => Promise<{ 成功: boolean; 标识?: string; 字节数?: number; 类型?: string; 错误?: string }>
  read: (标识: string) => Promise<{ 成功: boolean; 数据?: string; 错误?: string }>
  dropTemporary: (标识: string) => Promise<{ 成功: boolean; 错误?: string }>
  sync: (快照标识: string, 引用标识列表: string[]) => Promise<{ 成功: boolean; 错误?: string }>
  release: (快照标识: string) => Promise<{ 成功: boolean; 错误?: string }>
  export: (标识列表: string[]) => Promise<{ 成功: boolean; 条目?: 演示资源条目[]; 错误?: string }>
  restore: (条目列表: 演示资源条目[]) => Promise<{ 成功: boolean; 错误?: string }>
}
export interface 电子接口 {
  showSaveDialog: (默认文件名: string, 保存类型?: 'word' | 'table' | 'ppt' | 'pdf') => Promise<string | null>
  showOpenDialog: (打开类型?: 'word' | 'table' | 'ppt' | 'pdf') => Promise<string | null>
  showOpenDialogMany: (打开类型: 'pdf') => Promise<string[]>
  takePendingAssociatedFiles: () => Promise<关联文件领取结果>
  onAssociatedFilesAvailable: (回调: () => void) => () => void
  listKnownFolder: (位置: 'desktop' | 'document' | 'download') => Promise<本机文件夹结果>
  saveToFile: (路径: string, 内容: string | Uint8Array, 格式?: '文本' | '二进制', 预期文件指纹?: string | null) => Promise<文件保存结果>
  readFile: (路径: string) => Promise<文件读取结果>
  renameFile: (旧路径: string, 新名称: string, 预期文件指纹?: string) => Promise<文件重命名结果>
  backupSave: (内容: string) => Promise<{ 成功: boolean; 错误?: string }>
  backupLoad: () => Promise<{ 成功: boolean; 内容?: string | null; 错误?: string }>
  backupPreserve: (已读取内容?: string) => Promise<{ 成功: boolean; 路径?: string; 错误?: string }>
  backupClear: () => Promise<{ 成功: boolean; 错误?: string }>
  presentationResources?: 演示资源接口
  presentationExport?: 演示导出接口
  recentList: () => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  recentAdd: (条目: 最近文档记录) => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  recentRemove: (路径: string) => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  revealInFolder: (路径: string) => Promise<{ 成功: boolean; 错误?: string }>
  exportToPdf: (html: string, 默认文件名: string) => Promise<文件保存结果 & { 已取消?: boolean }>
  reportUnsavedCount: (数量: number) => Promise<{ 成功: boolean; 错误?: string }>
  enterSlideshowFullscreen: () => Promise<放映全屏结果>
  exitSlideshowFullscreen: (标识: string) => Promise<{ 成功: boolean; 错误?: string }>
  onSlideshowEnded: (回调: (标识: string) => void) => () => void
  onCloseStateRequested: (回调: (标识: string) => void) => () => void
  respondCloseState: (标识: string, 状态: 关闭状态) => Promise<{ 成功: boolean; 错误?: string }>
  setDefaultApp: () => Promise<{ 成功: boolean; 需要管理员权限?: boolean; 提示?: string; 错误?: string }>
  checkDefaultAppPrompt?: () => Promise<默认程序提示结果>
  checkIntegrity: () => Promise<完整性检查结果>
  getHelpContent: () => Promise<Record<string, string>>
  getAppInfo: () => Promise<应用信息>
  ai: {
    getConfig: () => Promise<助手结果<助手配置>>
    saveConfig: (配置: 助手配置输入) => Promise<助手结果<助手配置>>
    clearConfig: () => Promise<助手结果<助手配置>>
    chat: (对话: 助手对话输入) => Promise<助手结果<助手对话结果>>
    cancel: (标识: string) => Promise<助手结果<never>>
    onStream: (回调: (片段: 助手流片段) => void) => () => void
    getSession?: (标识: string) => Promise<助手结果<助手会话 | null>>
    clearSession?: (标识: string) => Promise<助手结果<never>>
    updateSessionPlan?: (标识: string, 计划: 助手计划项[]) => Promise<助手结果<never>>
    bindSession?: (来源: string, 目标: string) => Promise<助手结果<never>>
    discardSessionProposal?: (标识: string) => Promise<助手结果<never>>
    onToolCall?: (回调: (请求: 助手工具请求) => void) => () => void
    submitToolResult?: (结果: 助手工具结果) => Promise<助手结果<never>>
  }
  office: { writeDocx: (模型: unknown) => Promise<any>; readDocx: (数据: string) => Promise<any>; readXlsx: (数据: string) => Promise<any>; writeXlsx: (模型: unknown) => Promise<any>; readPptx: (数据: string) => Promise<any>; writePptx: (模型: unknown) => Promise<any> }
  pdf: { extract: (数据: string, 页码: number[]) => Promise<any>; merge: (列表: string[]) => Promise<any>; delete: (数据: string, 页码: number[]) => Promise<any>; rotate: (数据: string, 页码: number[], 角度: number) => Promise<any>; exportToPath: (html: string, 保存路径: string) => Promise<文件保存结果> }
}
declare global { interface Window { electronAPI?: 电子接口 } }
const 取后端 = (): 电子接口 | null => typeof window !== 'undefined' ? window.electronAPI ?? null : null
const 失败 = (提示: string) => Promise.resolve({ 成功: false, 错误: 提示 })
export const 桥接 = {
  get 可用() { return 取后端() !== null },
  get 放映全屏可用() { return typeof 取后端()?.enterSlideshowFullscreen === 'function' },
  enterSlideshowFullscreen: (): Promise<放映全屏结果> => 取后端()?.enterSlideshowFullscreen?.() ?? 失败('当前环境不支持系统全屏'),
  exitSlideshowFullscreen: (标识: string) => 取后端()?.exitSlideshowFullscreen?.(标识) ?? 失败('当前环境不支持恢复窗口'),
  onSlideshowEnded: (回调: (标识: string) => void): (() => void) => 取后端()?.onSlideshowEnded?.(回调) ?? (() => {}),
  get 关联文件可用() { return typeof 取后端()?.takePendingAssociatedFiles === 'function' && typeof 取后端()?.onAssociatedFilesAvailable === 'function' },
  showSaveDialog: (名称: string, 保存类型?: 'word' | 'table' | 'ppt' | 'pdf') => 取后端()?.showSaveDialog(名称, 保存类型) ?? Promise.resolve(null),
  showOpenDialog: (打开类型?: 'word' | 'table' | 'ppt' | 'pdf') => 取后端()?.showOpenDialog(打开类型) ?? Promise.resolve(null),
  showOpenDialogMany: (打开类型: 'pdf') => 取后端()?.showOpenDialogMany(打开类型) ?? Promise.resolve([]),
  takePendingAssociatedFiles: (): Promise<关联文件领取结果> => 取后端()?.takePendingAssociatedFiles?.() ?? 失败('当前环境不支持从系统文件关联打开文件'),
  onAssociatedFilesAvailable: (回调: () => void): (() => void) => 取后端()?.onAssociatedFilesAvailable?.(回调) ?? (() => {}),
  listKnownFolder: (位置: 'desktop' | 'document' | 'download'): Promise<本机文件夹结果> => 取后端()?.listKnownFolder(位置) ?? 失败('请使用 Windows 桌面版浏览本机文件夹'),
  saveToFile: (路径: string, 内容: string | Uint8Array, 格式?: '文本' | '二进制', 预期文件指纹?: string | null): Promise<文件保存结果> => {
    const 后端 = 取后端()
    if (!后端) return 失败('当前环境不支持文件保存')
    return 预期文件指纹 === undefined
      ? 后端.saveToFile(路径, 内容, 格式)
      : 后端.saveToFile(路径, 内容, 格式, 预期文件指纹)
  },
  readFile: (路径: string) => 取后端()?.readFile(路径) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持文件读取' }),
  renameFile: (旧路径: string, 新名称: string, 预期文件指纹?: string): Promise<文件重命名结果> => {
    const 后端 = 取后端()
    if (!后端) return 失败('当前环境不支持文件重命名')
    return 预期文件指纹 === undefined
      ? 后端.renameFile(旧路径, 新名称)
      : 后端.renameFile(旧路径, 新名称, 预期文件指纹)
  },
  backupSave: (内容: string) => 取后端()?.backupSave?.(内容) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持备份' }),
  backupLoad: (): Promise<{ 成功: boolean; 内容?: string | null; 错误?: string }> => 取后端()?.backupLoad?.() ?? 失败('当前环境不支持备份读取'),
  backupPreserve: (已读取内容?: string): Promise<{ 成功: boolean; 路径?: string; 错误?: string }> => 取后端()?.backupPreserve?.(已读取内容) ?? 失败('当前环境不支持保留原始备份'),
  backupClear: () => 取后端()?.backupClear?.() ?? 失败('当前环境不支持备份清理'),
  presentationResources: {
    add: (数据: string, 类型: string) => 取后端()?.presentationResources?.add(数据, 类型) ?? 失败('当前环境不支持演示资源保存'),
    read: (标识: string) => 取后端()?.presentationResources?.read(标识) ?? 失败('当前环境不支持演示资源读取'),
    dropTemporary: (标识: string) => 取后端()?.presentationResources?.dropTemporary(标识) ?? 失败('当前环境不支持释放临时资源引用'),
    sync: (快照标识: string, 引用标识列表: string[]) => 取后端()?.presentationResources?.sync(快照标识, 引用标识列表) ?? 失败('当前环境不支持演示资源引用更新'),
    release: (快照标识: string) => 取后端()?.presentationResources?.release(快照标识) ?? 失败('当前环境不支持演示资源引用释放'),
    export: (标识列表: string[]): Promise<{ 成功: boolean; 条目?: 演示资源条目[]; 错误?: string }> =>
      取后端()?.presentationResources?.export(标识列表) ?? 失败('当前环境不支持演示资源备份'),
    restore: (条目列表: 演示资源条目[]) => 取后端()?.presentationResources?.restore(条目列表) ?? 失败('当前环境不支持演示资源恢复'),
  },
  presentationExport: {
    get 可用() { return typeof 取后端()?.presentationExport?.run === 'function' },
    run: (请求: 演示导出请求): Promise<演示导出结果> => 取后端()?.presentationExport?.run(请求) ?? 失败('当前环境不支持演示导出，请使用 Windows 桌面版'),
    pickDirectory: (): Promise<{ 成功: boolean; 目录?: string; 已取消?: boolean; 错误?: string }> =>
      取后端()?.presentationExport?.pickDirectory?.() ?? Promise.resolve({ 成功: false, 已取消: true }),
  },
  recentList: (): Promise<{ 成功: boolean; 数据?: 最近文档记录[]; 错误?: string }> => 取后端()?.recentList?.() ?? 失败('当前环境不支持最近文档读取'),
  recentAdd: (条目: 最近文档记录) => 取后端()?.recentAdd?.(条目) ?? 失败('当前环境不支持最近文档记录'),
  recentRemove: (路径: string) => 取后端()?.recentRemove?.(路径) ?? 失败('当前环境不支持最近文档移除'),
  revealInFolder: (路径: string) => 取后端()?.revealInFolder?.(路径) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持该操作' }),
  exportToPdf: (html: string, 名称: string) => 取后端()?.exportToPdf(html, 名称) ?? 失败('当前环境不支持 PDF 导出'),
  reportUnsavedCount: (数量: number) => 取后端()?.reportUnsavedCount(数量) ?? 失败('当前环境不支持关闭保护'),
  onCloseStateRequested: (回调: (标识: string) => void): (() => void) => 取后端()?.onCloseStateRequested?.(回调) ?? (() => {}),
  respondCloseState: (标识: string, 状态: 关闭状态) => 取后端()?.respondCloseState?.(标识, 状态) ?? 失败('当前环境不支持关闭前核验'),
  setDefaultApp: (): ReturnType<电子接口['setDefaultApp']> => 取后端()?.setDefaultApp() ?? Promise.resolve({ 成功: false, 错误: '请使用打包后的应用设置默认程序' }),
  get 默认程序提示可用() { return typeof 取后端()?.checkDefaultAppPrompt === 'function' },
  checkDefaultAppPrompt: (): Promise<默认程序提示结果> => 取后端()?.checkDefaultAppPrompt?.() ?? 失败('当前环境不支持默认程序首次检查'),
  checkIntegrity: (): Promise<完整性检查结果> => 取后端()?.checkIntegrity() ?? 失败('请使用 Windows 打包版本检查安装目录'),
  getHelpContent: () => 取后端()?.getHelpContent() ?? Promise.resolve({}),
  getAppInfo: () => 取后端()?.getAppInfo() ?? Promise.resolve({ 名称: '海豹办公', 英文名称: 'Seal Office', 版本: __APP_VERSION__, 作者: '饮风一笑', 邮箱: '24519660@qq.com', 说明: '本程序永久免费开源', 开源地址: 'https://github.com/fangzhouxiaohai/seal-office', 专业服务: '专业应用开发服务' }),
  ai: {
    get 可用() { return typeof 取后端()?.ai?.getConfig === 'function' && typeof 取后端()?.ai?.chat === 'function' },
    getConfig: (): Promise<助手结果<助手配置>> => 取后端()?.ai?.getConfig() ?? 失败('当前环境不支持智能助手'),
    saveConfig: (配置: 助手配置输入): Promise<助手结果<助手配置>> => 取后端()?.ai?.saveConfig(配置) ?? 失败('当前环境不支持智能助手设置'),
    clearConfig: (): Promise<助手结果<助手配置>> => 取后端()?.ai?.clearConfig() ?? 失败('当前环境不支持智能助手设置'),
    chat: (对话: 助手对话输入): Promise<助手结果<助手对话结果>> => 取后端()?.ai?.chat(对话) ?? 失败('当前环境不支持智能助手对话'),
    cancel: (标识: string): Promise<助手结果<never>> => 取后端()?.ai?.cancel?.(标识) ?? 失败('当前环境不支持停止任务'),
    onStream: (回调: (片段: 助手流片段) => void): (() => void) => 取后端()?.ai?.onStream?.(回调) ?? (() => {}),
    getSession: (标识: string): Promise<助手结果<助手会话 | null>> => 取后端()?.ai?.getSession?.(标识) ?? 失败('当前环境不支持会话记忆读取'),
    clearSession: (标识: string): Promise<助手结果<never>> => 取后端()?.ai?.clearSession?.(标识) ?? 失败('当前环境不支持会话记忆'),
    updateSessionPlan: (标识: string, 计划: 助手计划项[]): Promise<助手结果<never>> => 取后端()?.ai?.updateSessionPlan?.(标识, 计划) ?? 失败('当前环境不支持计划状态保存'),
    bindSession: (来源: string, 目标: string): Promise<助手结果<never>> => 取后端()?.ai?.bindSession?.(来源, 目标) ?? 失败('当前环境不支持保存文件后的对话记忆绑定'),
    discardSessionProposal: (标识: string): Promise<助手结果<never>> => 取后端()?.ai?.discardSessionProposal?.(标识) ?? 失败('当前环境不支持候选记忆更新'),
    onToolCall: (回调: (请求: 助手工具请求) => void): (() => void) => 取后端()?.ai?.onToolCall?.(回调) ?? (() => {}),
    submitToolResult: (结果: 助手工具结果): Promise<助手结果<never>> => 取后端()?.ai?.submitToolResult?.(结果) ?? 失败('当前环境不支持助手工具'),
  },
  office: {
    writeDocx: (模型: unknown) => 取后端()?.office.writeDocx(模型) ?? 失败('当前环境不支持文字文档写入'), readDocx: (数据: string) => 取后端()?.office.readDocx(数据) ?? 失败('当前环境不支持文字文档读取'), readXlsx: (数据: string) => 取后端()?.office.readXlsx(数据) ?? 失败('当前环境不支持表格文档读取'), writeXlsx: (模型: unknown) => 取后端()?.office.writeXlsx(模型) ?? 失败('当前环境不支持表格文档写入'), readPptx: (数据: string) => 取后端()?.office.readPptx(数据) ?? 失败('当前环境不支持演示文档读取'), writePptx: (模型: unknown) => 取后端()?.office.writePptx(模型) ?? 失败('当前环境不支持演示文档写入'),
  },
  pdf: {
    extract: (数据: string, 页码: number[]) => 取后端()?.pdf.extract(数据, 页码) ?? 失败('当前环境不支持 PDF 页面提取'), merge: (列表: string[]) => 取后端()?.pdf.merge(列表) ?? 失败('当前环境不支持 PDF 合并'), delete: (数据: string, 页码: number[]) => 取后端()?.pdf.delete(数据, 页码) ?? 失败('当前环境不支持 PDF 删除页面'), rotate: (数据: string, 页码: number[], 角度: number) => 取后端()?.pdf.rotate(数据, 页码, 角度) ?? 失败('当前环境不支持 PDF 旋转页面'), exportToPath: (html: string, 保存路径: string) => 取后端()?.pdf.exportToPath(html, 保存路径) ?? 失败('当前环境不支持 PDF 导出'),
  },
}
