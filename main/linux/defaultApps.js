const { execFile } = require('child_process')
const { 文件关联, MIME类型 } = require('./mimeTypes')
const 桌面文件 = 'sealoffice.desktop'
function 执行XDG(参数) {
  return new Promise((完成, 拒绝) => execFile('xdg-mime', 参数, { timeout: 15000, encoding: 'utf8', maxBuffer: 65536 }, (错误, 输出) => {
    if (错误) 拒绝(new Error('系统文件关联设置失败，请在文件管理器的“打开方式”中选择海豹办公'))
    else 完成(输出.trim())
  }))
}
function 创建Linux默认程序服务({ 已打包, 执行 = 执行XDG }) {
  async function 查询() {
    const 状态 = new Map()
    for (const 类型 of MIME类型) 状态.set(类型, await 执行(['query', 'default', 类型]) === 桌面文件)
    const 格式 = 文件关联.map(项 => ({ 扩展名: 项.ext, 已默认: 状态.get(项.mimeType) }))
    const 未生效 = 格式.filter(项 => !项.已默认).map(项 => 项.扩展名)
    return { 成功: true, 已全部默认: 未生效.length === 0, 格式, 未生效, 清除用户选择的格式: [] }
  }
  async function 应用默认程序() {
    if (!已打包) throw new Error('请使用 Ubuntu 安装版本设置默认程序')
    for (const 类型 of MIME类型) await 执行(['default', 桌面文件, 类型])
    return 查询()
  }
  async function 设置默认程序() {
    const 结果 = await 应用默认程序()
    return { ...结果, 提示: 结果.已全部默认 ? '所有受支持文档格式已使用海豹办公打开' : '部分格式未能关联，请在文件管理器的“打开方式”中选择海豹办公' }
  }
  return {
    应用默认程序, 设置默认程序,
    检查首次提示: async () => ({ 成功: true, 需要询问: false }),
    启动检查默认程序: async () => 已打包 ? { ...await 查询(), 已处理: false } : { 成功: true, 已全部默认: true, 已处理: false },
  }
}
module.exports = { 创建Linux默认程序服务, 桌面文件 }
