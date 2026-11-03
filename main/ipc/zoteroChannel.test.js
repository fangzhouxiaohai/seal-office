const { 注册Zotero通道, 允许动作 } = require('./zoteroChannel')

/** 造一个最小 ipcMain，只记录注册的处理器 */
function 造ipc() {
  const 处理器 = new Map()
  return { handle: (名称, 函数) => 处理器.set(名称, 函数), 处理器 }
}

/** 造一个假 Zotero 客户端 */
function 造客户端(覆盖 = {}) {
  return {
    探测: async () => ({ 版本: '3', 实例: 'S1' }),
    列条目: async ({ 关键词 }) => ({ 格式: 'csljson', 会话: { 版本: '3', 实例: 'S1' }, 条目: [{ id: 关键词 || 'A' }] }),
    列集合: async () => ({ 会话: { 版本: '3', 实例: 'S1' }, 集合: [] }),
    ...覆盖,
  }
}

describe('Zotero 通道', () => {
  it('注册 zotero.invoke 处理器', () => {
    const ipc = 造ipc()
    注册Zotero通道(ipc, { 客户端: 造客户端() })
    expect(ipc.处理器.has('zotero.invoke')).toBe(true)
  })

  it('白名单内的动作可调用并返回成功信封', async () => {
    const ipc = 造ipc()
    注册Zotero通道(ipc, { 客户端: 造客户端() })
    const 结果 = await ipc.处理器.get('zotero.invoke')(null, '探测', {})
    expect(结果).toEqual({ 成功: true, 数据: { 版本: '3', 实例: 'S1' } })
  })

  it('白名单外的动作被拒绝', async () => {
    const ipc = 造ipc()
    注册Zotero通道(ipc, { 客户端: 造客户端() })
    const 结果 = await ipc.处理器.get('zotero.invoke')(null, '删除全部', {})
    expect(结果.成功).toBe(false)
    expect(结果.错误).toBe('不支持的 Zotero 操作')
  })

  it('非法参数被拒绝', async () => {
    const ipc = 造ipc()
    注册Zotero通道(ipc, { 客户端: 造客户端() })
    for (const 参数 of [null, '文本', []]) {
      const 结果 = await ipc.处理器.get('zotero.invoke')(null, '列条目', 参数)
      expect(结果.成功).toBe(false)
      expect(结果.错误).toBe('Zotero 请求参数无效')
    }
  })

  it('客户端错误转成中文信封并保留状态码', async () => {
    const ipc = 造ipc()
    const 客户端 = 造客户端({
      列条目: async () => { throw Object.assign(new Error('未检测到 Zotero'), { status: 502 }) },
    })
    注册Zotero通道(ipc, { 客户端 })
    const 结果 = await ipc.处理器.get('zotero.invoke')(null, '列条目', {})
    expect(结果).toEqual({ 成功: false, 错误: '未检测到 Zotero', 状态码: 502 })
  })

  it('允许动作清单与实际实现一致', () => {
    expect([...允许动作].sort()).toEqual(['列条目', '列集合', '探测'])
  })
})
