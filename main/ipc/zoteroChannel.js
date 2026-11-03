// Zotero 本机文献库通道。
//
// 与 cloud.invoke 分开是有意的：Zotero 访问的是用户本机数据，不经过云端、
// 不需要登录、也不应受云端会话状态影响。把它塞进 cloudChannel 会让
// 「云端不可用」与「Zotero 没开」两类故障混在一起，用户难以判断。
const { createZoteroLocalApi } = require('../zotero/localApi')

/** 可用动作白名单，避免渲染进程通过通道名调用任意方法 */
const 允许动作 = new Set(['探测', '列条目', '列集合'])

function 注册Zotero通道(ipcMain, 依赖 = {}) {
  let 客户端 = 依赖.客户端 ?? null
  const 取客户端 = () => 客户端 ?? (客户端 = createZoteroLocalApi(依赖))

  ipcMain.handle('zotero.invoke', async (_event, 动作, 输入 = {}) => {
    try {
      if (typeof 动作 !== 'string' || !允许动作.has(动作)) throw new Error('不支持的 Zotero 操作')
      if (输入 === null || typeof 输入 !== 'object' || Array.isArray(输入)) throw new Error('Zotero 请求参数无效')
      const 结果 = await 取客户端()[动作](输入)
      return { 成功: true, 数据: 结果 }
    } catch (错误) {
      return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : 'Zotero 操作失败', 状态码: 错误?.status }
    }
  })
}

module.exports = { 注册Zotero通道, 允许动作 }
