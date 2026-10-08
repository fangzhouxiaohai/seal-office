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
export interface 助手对话输入 { 消息: Array<{ 角色: 'user' | 'assistant'; 内容: string }>; 文档上下文: string; 请求标识?: string; 思考强度?: 思考强度; 会话标识?: string; 自动执行?: boolean; 手动压缩?: boolean; 上下文令牌?: number; 文件快照?: string }
export interface 助手流片段 { 请求标识: string; 类型: '思考' | '正文' | '状态' | '计划' | '工具' | '压缩'; 内容: string }
export interface 助手工具请求 { 请求标识: string; 调用标识: string; 工具: string; 参数: unknown }
export interface 助手工具结果 { 请求标识: string; 调用标识: string; 成功: boolean; 数据?: unknown; 错误?: string }
export interface 助手对话结果 { 内容: string; 思考?: string; 已停止?: boolean; 计划?: 助手计划项[]; 摘要?: string; 压缩次数?: number }
export interface 助手结果<T> { 成功: boolean; 数据?: T; 错误?: string }
export interface 本机文件夹结果 { 成功: boolean; 路径?: string; 文件?: Array<{ 名称: string; 路径: string; 扩展名: string; 大小: number; 修改时间: number }>; 错误?: string }
export interface 关联文件领取结果 { 成功: boolean; 路径列表?: string[]; 错误?: string }
export interface 关闭状态 { 未保存数量: number; 备份成功: boolean; 备份错误?: string }
/** 关闭前“保存后退出”的应答：已保存只回传名称，失败带回原因 */
export interface 保存全部应答 {
  成功: boolean
  已保存: string[]
  失败: Array<{ 名称: string; 原因: string }>
  已取消: boolean
}
export interface 放映全屏结果 { 成功: boolean; 会话标识?: string; 错误?: string }
export interface 显示器信息 { 标识: string; 名称: string; 主屏: boolean; 宽?: number; 高?: number; 缩放?: number }
export interface 演讲者打开结果 { 成功: boolean; 会话标识?: string; 显示器名称?: string; 提示?: string; 已有窗口?: boolean; 错误?: string }
export interface 演讲者推送数据 { 快照: unknown; 显示器名称?: string; 提示?: string }
export interface 演讲者状态结果 { 成功: boolean; 状态?: unknown; 会话标识?: string; 显示器名称?: string; 提示?: string; 错误?: string }
export interface 演讲者接口 {
  screens: () => Promise<{ 成功: boolean; 显示器?: 显示器信息[]; 错误?: string }>
  open: (选项: { 显示器?: string }) => Promise<演讲者打开结果>
  update: (会话标识: string, 数据: 演讲者推送数据) => Promise<{ 成功: boolean; 错误?: string }>
  close: (会话标识: string) => Promise<{ 成功: boolean; 错误?: string }>
  control: (会话标识: string | undefined, 动作: string) => Promise<{ 成功: boolean; 错误?: string }>
  state: () => Promise<演讲者状态结果>
  onUpdate: (回调: (数据: 演讲者推送数据) => void) => () => void
  onControl: (回调: (数据: { 会话标识: string; 动作: string }) => void) => () => void
  onClosed: (回调: (数据: { 会话标识: string; 原因: string }) => void) => () => void
  onDisplayChanged: (回调: (数据: { 会话标识: string; 原因: string }) => void) => () => void
}
export interface 默认程序提示结果 { 成功: boolean; 需要询问?: boolean; 错误?: string }
/** 全自动关联结果：未生效列出仍被系统拦下的扩展名 */
export interface 默认程序应用结果 { 成功: boolean; 已全部默认?: boolean; 未生效?: string[]; 清除用户选择的格式?: string[]; 错误?: string }
/** 启动检查结果：已处理表示这次确实改写过程序关联 */
export interface 默认程序启动结果 { 成功: boolean; 已全部默认?: boolean; 已处理?: boolean; 未生效?: string[]; 错误?: string }
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
export interface 比对差异项 { 类型: string; 标识: string; 字段: string; 左: unknown; 右: unknown }
export interface 比对页结果 { 标识: string; 类型: '新增' | '删除' | '移动' | '修改'; 标题?: string; 左索引?: number; 右索引?: number; 位置变化?: boolean; 差异?: 比对差异项[] }
export interface 比对批注结果 { 数量: number; 差异: (比对差异项 & { 页标识?: string })[]; 未归属页面: (比对差异项 & { 页标识?: string })[] }
export interface 比对结果 { 成功: boolean; 汇总?: { 新增页: number; 删除页: number; 移动页: number; 修改页: number; 差异项: number }; 页面?: 比对页结果[]; 批注?: 比对批注结果; 警告?: { 左: string[]; 右: string[] }; 错误?: string }
export interface 演示比对接口 {
  compareFiles: (左路径: string, 右路径: string) => Promise<比对结果>
}
export type 演示服务种类 = '翻译' | '语音' | '识别'
export interface 演示服务配置 { 名称?: string; 地址: string; 模型?: string; 已配置密钥?: boolean; 目标语言?: string; 术语表?: Array<{ 原文: string; 译文: string }>; 声线?: string; 语速?: number; 识别模式?: '图像理解' | '文字识别'; 密钥?: string; 清除密钥?: boolean }
export interface 演示能力项 { 状态: '可用' | '缺少配置'; 原因?: string; 模型?: string; 声线?: string; 名称?: string }
export interface 演示能力表 { 文本: 演示能力项; 语音合成: 演示能力项; 图像识别: 演示能力项; 图像生成: 演示能力项 }
export interface 翻译条目输入 { 对象标识: string; 原文: string; 来源?: string }
export interface 翻译候选 { 对象标识: string; 原文: string; 译文: string }
export interface 校对建议 { 对象标识: string; 原文: string; 问题类型: string; 说明: string; 建议文本: string }
export interface 讲稿项 { 页标识: string; 讲稿: string }
export interface 讲解音频项 { 页标识: string; 缓存键?: string; 类型?: string; 字节数?: number; 命中缓存?: boolean; 音频?: string }
export interface 演示智能接口 {
  capabilities: () => Promise<{ 成功: boolean; 数据?: 演示能力表; 错误?: string }>
  getService: (种类: 演示服务种类) => Promise<{ 成功: boolean; 数据?: 演示服务配置 | null; 错误?: string }>
  saveService: (种类: 演示服务种类, 配置: 演示服务配置) => Promise<{ 成功: boolean; 数据?: 演示服务配置; 错误?: string }>
  clearService: (种类: 演示服务种类) => Promise<{ 成功: boolean; 错误?: string }>
  listServiceKinds: () => Promise<{ 成功: boolean; 数据?: 演示服务种类[]; 错误?: string }>
  migrateLegacyTranslate: (旧配置: { 地址: string; 密钥?: string; 目标语言?: string }) => Promise<{ 成功: boolean; 数据?: { 成功: boolean; 目标语言?: string; 原因?: string }; 错误?: string }>
  probeService: (种类: 演示服务种类, 配置?: Partial<演示服务配置>) => Promise<{ 成功: boolean; 数据?: { 可用: boolean; 原因?: string; 模型列表?: string[]; 警告?: string }; 错误?: string }>
  translate: (输入: { 请求标识: string; 条目: 翻译条目输入[]; 目标语言: string; 术语表?: Array<{ 原文: string; 译文: string }>; 每批条数?: number }) => Promise<{ 成功: boolean; 数据?: { 译文: 翻译候选[]; 批次: number; 跳过: number }; 错误?: string }>
  proofread: (输入: { 请求标识: string; 条目: 翻译条目输入[]; 每批条数?: number }) => Promise<{ 成功: boolean; 数据?: { 建议: 校对建议[]; 批次: number; 检查对象数: number }; 错误?: string }>
  validateTranslation: (候选: 翻译候选[], 当前条目: Array<{ 对象标识: string; 原文: string }>) => Promise<{ 成功: boolean; 数据?: 翻译候选[]; 错误?: string }>
  validateSuggestion: (建议: Array<{ 对象标识: string; 原文: string; 建议文本: string }>, 当前条目: Array<{ 对象标识: string; 原文: string }>) => Promise<{ 成功: boolean; 数据?: Array<{ 对象标识: string; 原文: string; 建议文本: string }>; 错误?: string }>
  voices: () => Promise<{ 成功: boolean; 数据?: Array<{ 标识: string; 名称: string }>; 错误?: string }>
  speak: (输入: { 文本: string }) => Promise<{ 成功: boolean; 数据?: { 音频: string; 类型: string; 字节数: number; 命中缓存: boolean; 缓存键?: string }; 错误?: string }>
  generateScript: (输入: { 请求标识: string; 页列表: Array<{ 页标识: string; 标题?: string; 文本: string; 备注?: string }>; 风格?: string }) => Promise<{ 成功: boolean; 数据?: { 讲稿: 讲稿项[]; 批次: number }; 错误?: string }>
  narrate: (输入: { 请求标识?: string; 讲稿: 讲稿项[] }) => Promise<{ 成功: boolean; 数据?: { 音频: 讲解音频项[]; 失败: Array<{ 页标识: string; 原因: string }> }; 错误?: string }>
  clearAudioCache: () => Promise<{ 成功: boolean; 错误?: string }>
  onStream: (回调: (片段: { 请求标识: string; 类型: string; 内容: string }) => void) => () => void
}
export interface 捕获源条目 { 标识: string; 名称: string; 类型: string; 显示器标识: string; 缩略图: string }
export interface 录制支持结果 { 成功: boolean; WebM?: boolean; 媒体类型?: string; MP4?: boolean; MP4原因?: string; 错误?: string }
export interface 识别状态结果 { 成功: boolean; 可用?: boolean; 模型?: string; 说明?: string; 原因?: string; 错误?: string }
export interface 演示捕获接口 {
  sources: (类型列表: string[]) => Promise<{ 成功: boolean; 源列表?: 捕获源条目[]; 错误?: string }>
  support: () => Promise<录制支持结果>
  saveRecording: (数据: string, 格式: string, 建议名: string) => Promise<{ 成功: boolean; 路径?: string; 字节数?: number; 已取消?: boolean; 错误?: string }>
  recognitionStatus: () => Promise<识别状态结果>
  recognize: (数据: string, 类型: string) => Promise<{ 成功: boolean; 文本?: string; 错误?: string }>
}
export type 生成版式 = '标题幻灯片' | '标题和内容' | '空白'
export interface 生成提纲项 { 页标识: string; 标题: string; 版式: 生成版式; 要点: string[] }
export interface 生成页面项 { 页标识: string; 标题: string; 正文: string; 版式?: 生成版式; 要点: string[] }
export interface 美化建议项 { 页标识: string; 对齐: '左对齐' | '居中' | '右对齐'; 字号建议: number; 要点上限: number; 背景建议: '浅色' | '深色' | '保持不变'; 版式建议: 生成版式; 说明?: string }
export interface 生成图形节点 { 标识: string; 文本: string }
export interface 生成图形连线 { 起点: string; 终点: string; 文本?: string }
export interface 素材条目 { 标识: string; 名称: string; 分类: string; 类型: string; 字节数: number; 来源?: string; 授权: string; 导入时间: string }
export interface 提纲遗漏项 { 类型: string; 说明: string }
export interface 导入提纲结果 { 提纲: Array<{ 标题: string; 要点: string[] }>; 遗漏: 提纲遗漏项[]; 来源: { 名称: string; 类型: string; 字节数: number } }
export interface 素材搜索结果 { 结果: Array<{ 标识: string; 相关度: number; 理由: string }> }
export interface 演示生成接口 {
  outline: (输入: { 请求标识: string; 主题: string; 受众?: string; 页数: number; 风格?: string; 素材约束?: string }) => Promise<{ 成功: boolean; 数据?: { 提纲: 生成提纲项[] }; 错误?: string }>
  pages: (输入: { 请求标识: string; 提纲: 生成提纲项[] }) => Promise<{ 成功: boolean; 数据?: { 页面: 生成页面项[] }; 错误?: string }>
  singlePage: (输入: { 请求标识: string; 内容: string; 版式?: 生成版式 }) => Promise<{ 成功: boolean; 数据?: { 页面: 生成页面项 }; 错误?: string }>
  beautify: (输入: { 请求标识: string; 页面列表: Array<{ 页标识: string; 版式?: string }>; 主题摘要?: string }) => Promise<{ 成功: boolean; 数据?: { 建议: 美化建议项[] }; 错误?: string }>
  diagram: (输入: { 请求标识: string; 主题: string; 类型: '流程' | '层级' | '循环' | '脑图' }) => Promise<{ 成功: boolean; 数据?: { 节点: 生成图形节点[]; 连线: 生成图形连线[] }; 错误?: string }>
  validateCandidates: (候选: Array<{ 页标识: string }>, 当前页面列表: Array<{ 页标识: string; 版本: string }>, 版本表: Record<string, string>) => Promise<{ 成功: boolean; 数据?: Array<{ 页标识: string }>; 错误?: string }>
  readOutline: (输入: { 名称: string; 数据: string }) => Promise<{ 成功: boolean; 数据?: 导入提纲结果; 错误?: string }>
  assets: {
    list: () => Promise<{ 成功: boolean; 数据?: 素材条目[]; 错误?: string }>
    search: (关键词: string) => Promise<{ 成功: boolean; 数据?: 素材条目[]; 错误?: string }>
    read: (标识: string) => Promise<{ 成功: boolean; 数据?: { 数据: string }; 错误?: string }>
    import: (输入: { 数据: string; 类型: string; 名称: string; 分类: string; 来源?: string; 授权: string }) => Promise<{ 成功: boolean; 数据?: { 素材: 素材条目; 去重: boolean }; 错误?: string }>
    updateMeta: (标识: string, 修改: { 名称?: string; 分类?: string; 来源?: string; 授权?: string }) => Promise<{ 成功: boolean; 数据?: { 素材: 素材条目 }; 错误?: string }>
    remove: (标识: string) => Promise<{ 成功: boolean; 错误?: string }>
    semanticSearch: (输入: { 请求标识: string; 查询: string }) => Promise<{ 成功: boolean; 数据?: 素材搜索结果; 错误?: string }>
  }
}
export interface 电子接口 {
  showSaveDialog: (默认文件名: string, 保存类型?: 'word' | 'table' | 'ppt' | 'pdf') => Promise<string | null>
  showOpenDialog: (打开类型?: 'word' | 'table' | 'ppt' | 'pdf') => Promise<string | null>
  showOpenDialogMany: (打开类型: 'pdf' | 'ppt') => Promise<string[]>
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
  presentationSession?: {
    register: (文稿标识: string, 视图标识: string, 初始内容?: unknown, 路径?: string) => Promise<{ 成功: boolean; 版本?: number; 内容?: unknown; 路径?: string; 已保存?: boolean; 错误?: string }>
    read: (文稿标识: string) => Promise<{ 成功: boolean; 版本?: number; 内容?: unknown; 路径?: string; 已保存?: boolean; 错误?: string }>
    commit: (文稿标识: string, 期望版本: number, 内容: unknown, 视图标识: string) => Promise<{ 成功: boolean; 版本?: number; 错误?: string }>
    saved: (文稿标识: string, 路径: string, 视图标识: string) => Promise<{ 成功: boolean; 版本?: number; 错误?: string }>
    claimPath: (文稿标识: string, 路径: string) => Promise<{ 成功: boolean; 错误?: string }>
    releasePath: (文稿标识: string, 路径: string) => Promise<{ 成功: boolean; 错误?: string }>
    unregister: (文稿标识: string, 视图标识: string) => Promise<{ 成功: boolean; 是否最后视图?: boolean; 错误?: string }>
    onChanged: (回调: (消息: { 类型: '会话变更' | '已保存'; 版本?: number; 内容?: unknown; 路径?: string }) => void) => () => void
    identity: () => Promise<{ 成功: boolean; 文稿标识?: string; 视图标识?: string }>
  }
  presentationBatch?: {
    check: (任务列表: Array<{ 标识: string; 名称?: string; 路径: string }>) => Promise<{ 成功: boolean; 结果?: Array<{ 标识: string; 名称?: string; 路径?: string; 成功: boolean; 已取消?: boolean; 错误?: string; 页数?: number }>; 汇总?: { 总数: number; 成功: number; 失败: number; 已取消: number }; 错误?: string }>
  }
  presentationTools?: {
    writeResources: (条目列表: Array<{ 标识: string; 类型?: string; 数据: string; 名称?: string }>, 目录: string) => Promise<{ 成功: boolean; 结果?: Array<{ 标识: string; 类型?: string; 路径?: string; 字节数?: number; 成功: boolean; 错误?: string }>; 汇总?: { 总数: number; 成功: number; 失败: number }; 错误?: string }>
    compressImage: (输入: { 数据: string; 类型: string }, 选项: { 质量?: number; 最大边?: number }) => Promise<{ 成功: boolean; 数据?: string; 类型?: string; 原字节数?: number; 新字节数?: number; 宽?: number; 高?: number; 错误?: string }>
  }
  newPresentationWindow?: (文稿标识: string, 视图标识: string) => Promise<{ 成功: boolean; 窗口标识?: string; 错误?: string }>
  tilePresentationWindows?: (布局: '平铺' | '层叠') => Promise<{ 成功: boolean; 布局?: string; 位置?: Array<{ x: number; y: number; 宽: number; 高: number }>; 错误?: string }>
  presentationCompare?: 演示比对接口
  presentationCapture?: 演示捕获接口
  recentList: () => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  recentAdd: (条目: 最近文档记录) => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  recentRemove: (路径: string) => Promise<{ 成功: boolean; 数据?: Array<最近文档记录>; 错误?: string }>
  revealInFolder: (路径: string) => Promise<{ 成功: boolean; 错误?: string }>
  exportToPdf: (html: string, 默认文件名: string) => Promise<文件保存结果 & { 已取消?: boolean }>
  printDocument?: (内容: string, 格式: 'html' | 'pdf') => Promise<{ 成功: boolean; 已取消?: boolean; 错误?: string }>
  printPreview?: (内容: string, 格式: 'html' | 'pdf') => Promise<{ 成功: boolean; 数据?: string; 错误?: string }>
  reportUnsavedCount: (数量: number) => Promise<{ 成功: boolean; 错误?: string }>
  enterSlideshowFullscreen: () => Promise<放映全屏结果>
  exitSlideshowFullscreen: (标识: string) => Promise<{ 成功: boolean; 错误?: string }>
  onSlideshowEnded: (回调: (标识: string) => void) => () => void
  /** 只允许 http、https、mailto；主进程再次校验协议。 */
  openExternal: (地址: string) => Promise<{ 成功: boolean; 错误?: string }>
  presenter?: 演讲者接口
  onCloseStateRequested: (回调: (标识: string) => void) => () => void
  respondCloseState: (标识: string, 状态: 关闭状态) => Promise<{ 成功: boolean; 错误?: string }>
  onSaveAllRequested?: (回调: (标识: string) => void) => () => void
  respondSaveAll?: (标识: string, 结果: 保存全部应答) => Promise<{ 成功: boolean; 错误?: string }>
  setDefaultApp: () => Promise<{ 成功: boolean; 已全部默认?: boolean; 未生效?: string[]; 需要管理员权限?: boolean; 提示?: string; 错误?: string }>
  applyDefaultApp?: () => Promise<默认程序应用结果>
  checkDefaultAppOnStartup?: () => Promise<默认程序启动结果>
  defaultAppCheckState?: () => Promise<{ 成功: boolean; 已禁用?: boolean; 错误?: string }>
  checkDefaultAppPrompt?: () => Promise<默认程序提示结果>
  checkIntegrity: () => Promise<完整性检查结果>
  getHelpContent: () => Promise<Record<string, string>>
  getAppInfo: () => Promise<应用信息>
  cloud?: { invoke: (action: string, input?: unknown) => Promise<{ 成功: boolean; 数据?: any; 错误?: string }> }
  ai: {
    getConfig: () => Promise<助手结果<助手配置>>
    saveConfig: (配置: 助手配置输入) => Promise<助手结果<助手配置>>
    clearConfig: () => Promise<助手结果<助手配置>>
    chat: (对话: 助手对话输入) => Promise<助手结果<助手对话结果>>
    cancel: (标识: string) => Promise<助手结果<never>>
    guide?: (标识: string, 内容: string) => Promise<助手结果<never>>
    onStream: (回调: (片段: 助手流片段) => void) => () => void
    getSession?: (标识: string) => Promise<助手结果<助手会话 | null>>
    clearSession?: (标识: string) => Promise<助手结果<never>>
    updateSessionPlan?: (标识: string, 计划: 助手计划项[]) => Promise<助手结果<never>>
    bindSession?: (来源: string, 目标: string) => Promise<助手结果<never>>
    discardSessionProposal?: (标识: string) => Promise<助手结果<never>>
    onToolCall?: (回调: (请求: 助手工具请求) => void) => () => void
    submitToolResult?: (结果: 助手工具结果) => Promise<助手结果<never>>
  }
  presentationAi?: 演示智能接口
  presentationGeneration?: 演示生成接口
  office: { writeDocx: (模型: unknown) => Promise<any>; readDocx: (数据: string) => Promise<any>; readXlsx: (数据: string) => Promise<any>; writeXlsx: (模型: unknown) => Promise<any>; readPptx: (数据: string) => Promise<any>; writePptx: (模型: unknown) => Promise<any> }
  pdf: { extract: (数据: string, 页码: number[]) => Promise<any>; merge: (列表: string[]) => Promise<any>; delete: (数据: string, 页码: number[]) => Promise<any>; rotate: (数据: string, 页码: number[], 角度: number) => Promise<any>; insertBlank: (数据: string, 位置: number) => Promise<any>; insertPages: (数据: string, 插入数据: string, 页码: number[], 位置: number) => Promise<any>; editPage: (数据: string, 操作: unknown) => Promise<any>; exportToPath: (html: string, 保存路径: string) => Promise<文件保存结果> }
}
declare global { interface Window { electronAPI?: 电子接口 } }
const 取后端 = (): 电子接口 | null => typeof window !== 'undefined' ? window.electronAPI ?? null : null
const 失败 = <T = never>(提示: string): Promise<{ 成功: boolean; 数据?: T; 错误: string }> => Promise.resolve({ 成功: false, 错误: 提示 })
export const 桥接 = {
  get 可用() { return 取后端() !== null },
  get 放映全屏可用() { return typeof 取后端()?.enterSlideshowFullscreen === 'function' },
  enterSlideshowFullscreen: (): Promise<放映全屏结果> => 取后端()?.enterSlideshowFullscreen?.() ?? 失败('当前环境不支持系统全屏'),
  exitSlideshowFullscreen: (标识: string) => 取后端()?.exitSlideshowFullscreen?.(标识) ?? 失败('当前环境不支持恢复窗口'),
  onSlideshowEnded: (回调: (标识: string) => void): (() => void) => 取后端()?.onSlideshowEnded?.(回调) ?? (() => {}),
  presenter: {
    get 可用() { return typeof 取后端()?.presenter?.open === 'function' },
    screens: (): Promise<{ 成功: boolean; 显示器?: 显示器信息[]; 错误?: string }> => 取后端()?.presenter?.screens() ?? 失败('当前环境不支持显示器检测'),
    open: (选项: { 显示器?: string }): Promise<演讲者打开结果> => 取后端()?.presenter?.open(选项) ?? 失败('当前环境不支持演讲者视图'),
    update: (会话标识: string, 数据: 演讲者推送数据) => 取后端()?.presenter?.update(会话标识, 数据) ?? 失败('当前环境不支持演讲者视图'),
    close: (会话标识: string) => 取后端()?.presenter?.close(会话标识) ?? 失败('当前环境不支持演讲者视图'),
    control: (会话标识: string | undefined, 动作: string) => 取后端()?.presenter?.control(会话标识, 动作) ?? 失败('当前环境不支持演讲者控制'),
    state: (): Promise<演讲者状态结果> => 取后端()?.presenter?.state() ?? 失败('当前环境不支持演讲者视图'),
    onUpdate: (回调: (数据: 演讲者推送数据) => void): (() => void) => 取后端()?.presenter?.onUpdate?.(回调) ?? (() => {}),
    onControl: (回调: (数据: { 会话标识: string; 动作: string }) => void): (() => void) => 取后端()?.presenter?.onControl?.(回调) ?? (() => {}),
    onClosed: (回调: (数据: { 会话标识: string; 原因: string }) => void): (() => void) => 取后端()?.presenter?.onClosed?.(回调) ?? (() => {}),
    onDisplayChanged: (回调: (数据: { 会话标识: string; 原因: string }) => void): (() => void) => 取后端()?.presenter?.onDisplayChanged?.(回调) ?? (() => {}),
  },
  /** 演讲者窗口使用：按发送者解析会话，无需自行持有会话标识 */
  getPresenterViewState: (): Promise<演讲者状态结果> => 取后端()?.presenter?.state() ?? 失败('当前环境不支持演讲者视图'),
  sendPresenterControl: (动作: string): Promise<{ 成功: boolean; 错误?: string }> => 取后端()?.presenter?.control(undefined, 动作) ?? 失败('当前环境不支持演讲者控制'),
  onPresenterUpdate: (回调: (数据: 演讲者推送数据) => void): (() => void) => 取后端()?.presenter?.onUpdate?.(回调) ?? (() => {}),
  get 关联文件可用() { return typeof 取后端()?.takePendingAssociatedFiles === 'function' && typeof 取后端()?.onAssociatedFilesAvailable === 'function' },
  showSaveDialog: (名称: string, 保存类型?: 'word' | 'table' | 'ppt' | 'pdf') => 取后端()?.showSaveDialog(名称, 保存类型) ?? Promise.resolve(null),
  showOpenDialog: (打开类型?: 'word' | 'table' | 'ppt' | 'pdf') => 取后端()?.showOpenDialog(打开类型) ?? Promise.resolve(null),
  showOpenDialogMany: (打开类型: 'pdf' | 'ppt') => 取后端()?.showOpenDialogMany(打开类型) ?? Promise.resolve([]),
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
  presentationCompare: {
    compareFiles: (左路径: string, 右路径: string): Promise<比对结果> =>
      取后端()?.presentationCompare?.compareFiles(左路径, 右路径) ?? 失败('当前环境不支持演示文稿比对'),
  },
  presentationCapture: {
    sources: (类型列表: string[]): Promise<{ 成功: boolean; 源列表?: 捕获源条目[]; 错误?: string }> => 取后端()?.presentationCapture?.sources(类型列表) ?? 失败('当前环境不支持屏幕捕获，请使用 Windows 桌面版'),
    support: (): Promise<录制支持结果> => 取后端()?.presentationCapture?.support() ?? 失败('当前环境不支持屏幕录制，请使用 Windows 桌面版'),
    saveRecording: (数据: string, 格式: string, 建议名: string): Promise<{ 成功: boolean; 路径?: string; 字节数?: number; 已取消?: boolean; 错误?: string }> => 取后端()?.presentationCapture?.saveRecording(数据, 格式, 建议名) ?? 失败('当前环境不支持录制保存'),
    recognitionStatus: (): Promise<识别状态结果> => 取后端()?.presentationCapture?.recognitionStatus() ?? 失败('当前环境不支持文字识别'),
    recognize: (数据: string, 类型: string): Promise<{ 成功: boolean; 文本?: string; 错误?: string }> => 取后端()?.presentationCapture?.recognize(数据, 类型) ?? 失败('当前环境不支持文字识别'),
  },
  recentList: (): Promise<{ 成功: boolean; 数据?: 最近文档记录[]; 错误?: string }> => 取后端()?.recentList?.() ?? 失败('当前环境不支持最近文档读取'),
  recentAdd: (条目: 最近文档记录) => 取后端()?.recentAdd?.(条目) ?? 失败('当前环境不支持最近文档记录'),
  presentationSession: {
    register: (文稿标识: string, 视图标识: string, 初始内容?: unknown, 路径?: string) =>
      取后端()?.presentationSession?.register(文稿标识, 视图标识, 初始内容, 路径) ?? 失败('当前环境不支持文稿会话'),
    read: (文稿标识: string) => 取后端()?.presentationSession?.read(文稿标识) ?? 失败('当前环境不支持文稿会话'),
    commit: (文稿标识: string, 期望版本: number, 内容: unknown, 视图标识: string) =>
      取后端()?.presentationSession?.commit(文稿标识, 期望版本, 内容, 视图标识) ?? 失败('当前环境不支持文稿会话'),
    saved: (文稿标识: string, 路径: string, 视图标识: string) =>
      取后端()?.presentationSession?.saved(文稿标识, 路径, 视图标识) ?? 失败('当前环境不支持文稿会话'),
    claimPath: (文稿标识: string, 路径: string) => 取后端()?.presentationSession?.claimPath(文稿标识, 路径) ?? 失败('当前环境不支持文稿会话'),
    releasePath: (文稿标识: string, 路径: string) => 取后端()?.presentationSession?.releasePath(文稿标识, 路径) ?? 失败('当前环境不支持文稿会话'),
    unregister: (文稿标识: string, 视图标识: string) => 取后端()?.presentationSession?.unregister(文稿标识, 视图标识) ?? 失败('当前环境不支持文稿会话'),
    onChanged: (回调: (消息: { 类型: '会话变更' | '已保存'; 版本?: number; 内容?: unknown; 路径?: string }) => void): (() => void) =>
      取后端()?.presentationSession?.onChanged?.(回调) ?? (() => {}),
    identity: () => 取后端()?.presentationSession?.identity() ?? Promise.resolve({ 成功: false }),
  },
  presentationBatch: {
    check: (任务列表: Array<{ 标识: string; 名称?: string; 路径: string }>) =>
      取后端()?.presentationBatch?.check(任务列表) ?? 失败('当前环境不支持批量工具'),
  },
  presentationTools: {
    writeResources: (条目列表: Array<{ 标识: string; 类型?: string; 数据: string; 名称?: string }>, 目录: string) =>
      取后端()?.presentationTools?.writeResources(条目列表, 目录) ?? 失败('当前环境不支持资源提取'),
    compressImage: (输入: { 数据: string; 类型: string }, 选项: { 质量?: number; 最大边?: number }) =>
      取后端()?.presentationTools?.compressImage(输入, 选项) ?? 失败('当前环境不支持图片压缩'),
  },
  newPresentationWindow: (文稿标识: string, 视图标识: string) =>
    取后端()?.newPresentationWindow?.(文稿标识, 视图标识) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持新建窗口' }),
  tilePresentationWindows: (布局: '平铺' | '层叠') =>
    取后端()?.tilePresentationWindows?.(布局) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持重排窗口' }),
  recentRemove: (路径: string) => 取后端()?.recentRemove?.(路径) ?? 失败('当前环境不支持最近文档移除'),
  revealInFolder: (路径: string) => 取后端()?.revealInFolder?.(路径) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持该操作' }),
  exportToPdf: (html: string, 名称: string) => 取后端()?.exportToPdf(html, 名称) ?? 失败('当前环境不支持 PDF 导出'),
  printDocument: (内容: string, 格式: 'html' | 'pdf'): Promise<{ 成功: boolean; 已取消?: boolean; 错误?: string }> =>
    取后端()?.printDocument?.(内容, 格式) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持打印' }),
  printPreview: (内容: string, 格式: 'html' | 'pdf'): Promise<{ 成功: boolean; 数据?: string; 错误?: string }> =>
    取后端()?.printPreview?.(内容, 格式) ?? Promise.resolve({ 成功: false, 错误: '当前环境不支持打印预览' }),
  reportUnsavedCount: (数量: number) => 取后端()?.reportUnsavedCount(数量) ?? 失败('当前环境不支持关闭保护'),
  onCloseStateRequested: (回调: (标识: string) => void): (() => void) => 取后端()?.onCloseStateRequested?.(回调) ?? (() => {}),
  respondCloseState: (标识: string, 状态: 关闭状态) => 取后端()?.respondCloseState?.(标识, 状态) ?? 失败('当前环境不支持关闭前核验'),
  onSaveAllRequested: (回调: (标识: string) => void): (() => void) => 取后端()?.onSaveAllRequested?.(回调) ?? (() => {}),
  respondSaveAll: (标识: string, 结果: 保存全部应答) => 取后端()?.respondSaveAll?.(标识, 结果) ?? 失败('当前环境不支持保存后退出'),
  setDefaultApp: (): ReturnType<电子接口['setDefaultApp']> => 取后端()?.setDefaultApp() ?? Promise.resolve({ 成功: false, 错误: '请使用打包后的应用设置默认程序' }),
  get 默认程序全自动可用() { return typeof 取后端()?.applyDefaultApp === 'function' },
  applyDefaultApp: (): Promise<默认程序应用结果> => 取后端()?.applyDefaultApp?.() ?? 失败('当前环境不支持自动设置默认程序'),
  checkDefaultAppOnStartup: (): Promise<默认程序启动结果> => 取后端()?.checkDefaultAppOnStartup?.() ?? 失败('当前环境不支持启动时检查默认程序'),
  defaultAppCheckState: (): Promise<{ 成功: boolean; 已禁用?: boolean; 错误?: string }> => 取后端()?.defaultAppCheckState?.() ?? Promise.resolve({ 成功: true, 已禁用: false }),
  get 默认程序提示可用() { return typeof 取后端()?.checkDefaultAppPrompt === 'function' },
  checkDefaultAppPrompt: (): Promise<默认程序提示结果> => 取后端()?.checkDefaultAppPrompt?.() ?? 失败('当前环境不支持默认程序首次检查'),
  checkIntegrity: (): Promise<完整性检查结果> => 取后端()?.checkIntegrity() ?? 失败('请使用 Windows 打包版本检查安装目录'),
  openExternal: (地址: string) => 取后端()?.openExternal?.(地址) ?? 失败('当前环境不支持打开外部链接'),
  getHelpContent: () => 取后端()?.getHelpContent() ?? Promise.resolve({}),
  getAppInfo: () => 取后端()?.getAppInfo() ?? Promise.resolve({ 名称: '海豹办公', 英文名称: 'Seal Office', 版本: __APP_VERSION__, 作者: '饮风一笑', 邮箱: '24519660@qq.com', 说明: '本程序永久免费开源', 开源地址: 'https://github.com/fangzhouxiaohai/seal-office', 专业服务: '专业应用开发服务' }),
  ai: {
    get 可用() { return typeof 取后端()?.ai?.getConfig === 'function' && typeof 取后端()?.ai?.chat === 'function' },
    getConfig: (): Promise<助手结果<助手配置>> => 取后端()?.ai?.getConfig() ?? 失败('当前环境不支持智能助手'),
    saveConfig: (配置: 助手配置输入): Promise<助手结果<助手配置>> => 取后端()?.ai?.saveConfig(配置) ?? 失败('当前环境不支持智能助手设置'),
    clearConfig: (): Promise<助手结果<助手配置>> => 取后端()?.ai?.clearConfig() ?? 失败('当前环境不支持智能助手设置'),
    chat: (对话: 助手对话输入): Promise<助手结果<助手对话结果>> => 取后端()?.ai?.chat(对话) ?? 失败('当前环境不支持智能助手对话'),
    cancel: (标识: string): Promise<助手结果<never>> => 取后端()?.ai?.cancel?.(标识) ?? 失败('当前环境不支持停止任务'),
    guide: (标识: string, 内容: string): Promise<助手结果<never>> => 取后端()?.ai?.guide?.(标识, 内容) ?? 失败('当前版本不支持任务引导，请升级桌面版'),
    onStream: (回调: (片段: 助手流片段) => void): (() => void) => 取后端()?.ai?.onStream?.(回调) ?? (() => {}),
    getSession: (标识: string): Promise<助手结果<助手会话 | null>> => 取后端()?.ai?.getSession?.(标识) ?? 失败('当前环境不支持会话记忆读取'),
    clearSession: (标识: string): Promise<助手结果<never>> => 取后端()?.ai?.clearSession?.(标识) ?? 失败('当前环境不支持会话记忆'),
    updateSessionPlan: (标识: string, 计划: 助手计划项[]): Promise<助手结果<never>> => 取后端()?.ai?.updateSessionPlan?.(标识, 计划) ?? 失败('当前环境不支持计划状态保存'),
    bindSession: (来源: string, 目标: string): Promise<助手结果<never>> => 取后端()?.ai?.bindSession?.(来源, 目标) ?? 失败('当前环境不支持保存文件后的对话记忆绑定'),
    discardSessionProposal: (标识: string): Promise<助手结果<never>> => 取后端()?.ai?.discardSessionProposal?.(标识) ?? 失败('当前环境不支持候选记忆更新'),
    onToolCall: (回调: (请求: 助手工具请求) => void): (() => void) => 取后端()?.ai?.onToolCall?.(回调) ?? (() => {}),
    submitToolResult: (结果: 助手工具结果): Promise<助手结果<never>> => 取后端()?.ai?.submitToolResult?.(结果) ?? 失败('当前环境不支持助手工具'),
  },
  presentationAi: {
    get 可用() { return typeof 取后端()?.presentationAi?.capabilities === 'function' },
    capabilities: (): Promise<{ 成功: boolean; 数据?: 演示能力表; 错误?: string }> => 取后端()?.presentationAi?.capabilities() ?? 失败('当前环境不支持演示智能服务核验'),
    getService: (种类: 演示服务种类) => 取后端()?.presentationAi?.getService(种类) ?? 失败('当前环境不支持演示智能服务设置'),
    saveService: (种类: 演示服务种类, 配置: 演示服务配置) => 取后端()?.presentationAi?.saveService(种类, 配置) ?? 失败('当前环境不支持演示智能服务设置'),
    clearService: (种类: 演示服务种类) => 取后端()?.presentationAi?.clearService(种类) ?? 失败('当前环境不支持演示智能服务设置'),
    listServiceKinds: () => 取后端()?.presentationAi?.listServiceKinds() ?? 失败('当前环境不支持演示智能服务设置'),
    migrateLegacyTranslate: (旧配置: { 地址: string; 密钥?: string; 目标语言?: string }) => 取后端()?.presentationAi?.migrateLegacyTranslate(旧配置) ?? 失败('当前环境不支持旧翻译设置迁移'),
    probeService: (种类: 演示服务种类, 配置?: Partial<演示服务配置>) => 取后端()?.presentationAi?.probeService(种类, 配置) ?? 失败('当前环境不支持服务探测'),
    translate: (输入: Parameters<演示智能接口['translate']>[0]) => 取后端()?.presentationAi?.translate(输入) ?? 失败('当前环境不支持演示翻译'),
    proofread: (输入: Parameters<演示智能接口['proofread']>[0]) => 取后端()?.presentationAi?.proofread(输入) ?? 失败('当前环境不支持语义校对'),
    validateTranslation: (候选: 翻译候选[], 当前条目: Array<{ 对象标识: string; 原文: string }>) => 取后端()?.presentationAi?.validateTranslation(候选, 当前条目) ?? 失败('当前环境不支持译文核对'),
    validateSuggestion: (建议: Array<{ 对象标识: string; 原文: string; 建议文本: string }>, 当前条目: Array<{ 对象标识: string; 原文: string }>) => 取后端()?.presentationAi?.validateSuggestion(建议, 当前条目) ?? 失败('当前环境不支持建议核对'),
    voices: () => 取后端()?.presentationAi?.voices() ?? 失败('当前环境不支持声线列表'),
    speak: (输入: { 文本: string }) => 取后端()?.presentationAi?.speak(输入) ?? 失败('当前环境不支持语音合成'),
    generateScript: (输入: Parameters<演示智能接口['generateScript']>[0]) => 取后端()?.presentationAi?.generateScript(输入) ?? 失败('当前环境不支持讲稿生成'),
    narrate: (输入: { 请求标识?: string; 讲稿: 讲稿项[] }) => 取后端()?.presentationAi?.narrate(输入) ?? 失败('当前环境不支持讲解音频合成'),
    clearAudioCache: () => 取后端()?.presentationAi?.clearAudioCache() ?? 失败('当前环境不支持音频缓存清理'),
    onStream: (回调: (片段: { 请求标识: string; 类型: string; 内容: string }) => void): (() => void) => 取后端()?.presentationAi?.onStream?.(回调) ?? (() => {}),
  },
  presentationGeneration: {
    outline: (输入: Parameters<演示生成接口['outline']>[0]) => 取后端()?.presentationGeneration?.outline(输入) ?? 失败('当前环境不支持演示提纲生成'),
    pages: (输入: Parameters<演示生成接口['pages']>[0]) => 取后端()?.presentationGeneration?.pages(输入) ?? 失败('当前环境不支持演示正文生成'),
    singlePage: (输入: Parameters<演示生成接口['singlePage']>[0]) => 取后端()?.presentationGeneration?.singlePage(输入) ?? 失败('当前环境不支持单页生成'),
    beautify: (输入: Parameters<演示生成接口['beautify']>[0]) => 取后端()?.presentationGeneration?.beautify(输入) ?? 失败('当前环境不支持智能美化'),
    diagram: (输入: Parameters<演示生成接口['diagram']>[0]) => 取后端()?.presentationGeneration?.diagram(输入) ?? 失败('当前环境不支持智能图形生成'),
    validateCandidates: (候选: Parameters<演示生成接口['validateCandidates']>[0], 当前页面列表: Parameters<演示生成接口['validateCandidates']>[1], 版本表: Parameters<演示生成接口['validateCandidates']>[2]) =>
      取后端()?.presentationGeneration?.validateCandidates(候选, 当前页面列表, 版本表) ?? 失败('当前环境不支持候选核对'),
    readOutline: (输入: Parameters<演示生成接口['readOutline']>[0]) => 取后端()?.presentationGeneration?.readOutline(输入) ?? 失败('当前环境不支持文档提纲导入'),
    assets: {
      list: () => 取后端()?.presentationGeneration?.assets.list() ?? 失败('当前环境不支持素材库'),
      search: (关键词: string) => 取后端()?.presentationGeneration?.assets.search(关键词) ?? 失败('当前环境不支持素材检索'),
      read: (标识: string) => 取后端()?.presentationGeneration?.assets.read(标识) ?? 失败('当前环境不支持素材读取'),
      import: (输入: Parameters<演示生成接口['assets']['import']>[0]) => 取后端()?.presentationGeneration?.assets.import(输入) ?? 失败('当前环境不支持素材导入'),
      updateMeta: (标识: string, 修改: Parameters<演示生成接口['assets']['updateMeta']>[1]) => 取后端()?.presentationGeneration?.assets.updateMeta(标识, 修改) ?? 失败('当前环境不支持素材信息更新'),
      remove: (标识: string) => 取后端()?.presentationGeneration?.assets.remove(标识) ?? 失败('当前环境不支持素材删除'),
      semanticSearch: (输入: Parameters<演示生成接口['assets']['semanticSearch']>[0]) => 取后端()?.presentationGeneration?.assets.semanticSearch(输入) ?? 失败('当前环境不支持素材智能检索'),
    },
  },
  office: {
    writeDocx: (模型: unknown) => 取后端()?.office.writeDocx(模型) ?? 失败('当前环境不支持文字文档写入'), readDocx: (数据: string) => 取后端()?.office.readDocx(数据) ?? 失败('当前环境不支持文字文档读取'), readXlsx: (数据: string) => 取后端()?.office.readXlsx(数据) ?? 失败('当前环境不支持表格文档读取'), writeXlsx: (模型: unknown) => 取后端()?.office.writeXlsx(模型) ?? 失败('当前环境不支持表格文档写入'), readPptx: (数据: string) => 取后端()?.office.readPptx(数据) ?? 失败('当前环境不支持演示文档读取'), writePptx: (模型: unknown) => 取后端()?.office.writePptx(模型) ?? 失败('当前环境不支持演示文档写入'),
  },
  pdf: {
    insertBlank: (数据: string, 位置: number) => 取后端()?.pdf.insertBlank(数据, 位置) ?? 失败('当前环境不支持 PDF 插入空白页'),
    insertPages: (数据: string, 插入数据: string, 页码: number[], 位置: number) => 取后端()?.pdf.insertPages(数据, 插入数据, 页码, 位置) ?? 失败('当前环境不支持 PDF 插入页面'),
    editPage: (数据: string, 操作: unknown) => 取后端()?.pdf.editPage(数据, 操作) ?? 失败('当前环境不支持 PDF 编辑'),
    extract: (数据: string, 页码: number[]) => 取后端()?.pdf.extract(数据, 页码) ?? 失败('当前环境不支持 PDF 页面提取'), merge: (列表: string[]) => 取后端()?.pdf.merge(列表) ?? 失败('当前环境不支持 PDF 合并'), delete: (数据: string, 页码: number[]) => 取后端()?.pdf.delete(数据, 页码) ?? 失败('当前环境不支持 PDF 删除页面'), rotate: (数据: string, 页码: number[], 角度: number) => 取后端()?.pdf.rotate(数据, 页码, 角度) ?? 失败('当前环境不支持 PDF 旋转页面'), exportToPath: (html: string, 保存路径: string) => 取后端()?.pdf.exportToPath(html, 保存路径) ?? 失败('当前环境不支持 PDF 导出'),
  },
}
