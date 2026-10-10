import 格式列表 from '../../main/documentFormats.json'
export const 文档格式 = 格式列表
export const 查找文档格式 = (路径: string) => 文档格式.find(项 => 项.extension === 路径.match(/\.([^\\/.]+)$/)?.[1]?.toLowerCase())
export const 可保存扩展 = (类型: string) => new Set(文档格式.filter(项 => (项.type === 类型 || (项.extension === 'json' && 类型 === 'table')) && !项.readOnlySource).map(项 => `.${项.extension}`))
export const 文档格式说明 = '文字、表格、演示和 PDF 文档（含 CSV、旧版 Office、模板与开放文档格式）'
