// 更新服务：查询地址、平台判定、安装包下载校验（sha256 与字节数不一致必须拒绝）
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createHash } = require('crypto')
const { 创建更新服务, 判定更新平台 } = require('./updater')

const 安装包 = Buffer.from('seal-office-installer-bytes')
const 正确摘要 = createHash('sha256').update(安装包).digest('hex')
const 新版 = { version: '2.7.1', url: 'https://seal.xingmasoft.com/download/seal-office-setup-2.7.1.exe', sha256: 正确摘要, bytes: 安装包.length }

function 准备(选项 = {}) {
  const 临时目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-updater-'))
  const 请求 = vi.fn(async (地址) => 地址.includes('/v1/updates/latest')
    ? new Response(JSON.stringify(选项.查询结果 ?? { hasUpdate: false }), { status: 选项.状态码 ?? 200 })
    : new Response(选项.安装包 ?? 安装包, { status: 200 }))
  const 启动安装程序 = vi.fn(async () => {})
  const 退出 = vi.fn()
  const 打开外部 = vi.fn(async () => {})
  const 服务 = 创建更新服务({ 当前版本: '2.7.0', 平台: 选项.平台 ?? 'windows', 获取服务地址: () => 'https://seal.xingmasoft.com/api', 请求, 临时目录, 启动安装程序, 退出, 打开外部, 退出延迟: 0 })
  return { 服务, 请求, 启动安装程序, 退出, 打开外部, 临时目录, 清理: () => fs.rmSync(临时目录, { recursive: true, force: true }) }
}

describe('更新服务', () => {
  it('按平台判定：商店版、便携版与非 Windows 不走安装包更新', () => {
    expect(判定更新平台({ platform: 'win32', windowsStore: false, env: {} })).toBe('windows')
    expect(判定更新平台({ platform: 'win32', windowsStore: true, env: {} })).toBe('windows-store')
    expect(判定更新平台({ platform: 'win32', windowsStore: false, env: { PORTABLE_EXECUTABLE_DIR: 'D:\\a' } })).toBe('unsupported')
    expect(判定更新平台({ platform: 'linux', windowsStore: false, env: {} })).toBe('unsupported')
  })

  it('查询使用云服务地址、当前平台与版本，并只保留必要字段', async () => {
    const 环境 = 准备({ 查询结果: { hasUpdate: true, version: '2.7.1', mandatory: true, notes: '安全修复', url: 新版.url, sha256: 正确摘要, bytes: 10, publishedAt: 5, extra: 'x' } })
    try {
      const 结果 = await 环境.服务.检查('stable')
      expect(环境.请求.mock.calls[0][0]).toBe('https://seal.xingmasoft.com/api/v1/updates/latest?platform=windows&version=2.7.0&channel=stable')
      expect(结果).toEqual({ hasUpdate: true, version: '2.7.1', mandatory: true, notes: '安全修复', url: 新版.url, sha256: 正确摘要, bytes: 10, publishedAt: 5 })
    } finally { 环境.清理() }
  })

  it('服务端返回错误时带状态码抛出，不伪装成无更新', async () => {
    const 环境 = 准备({ 状态码: 429, 查询结果: { error: '更新检查过于频繁，请稍后再试' } })
    try {
      await expect(环境.服务.检查('stable')).rejects.toMatchObject({ status: 429 })
    } finally { 环境.清理() }
  })

  it('不支持在线更新的平台直接拒绝，不发请求', async () => {
    const 环境 = 准备({ 平台: 'unsupported' })
    try {
      await expect(环境.服务.检查('stable')).rejects.toThrow('当前平台暂不支持在线更新')
      expect(环境.请求).not.toHaveBeenCalled()
    } finally { 环境.清理() }
  })

  it('sha256 与发布记录不一致时拒绝安装、删除下载文件、不启动安装程序', async () => {
    const 环境 = 准备()
    try {
      await expect(环境.服务.安装({ ...新版, sha256: 'b'.repeat(64) })).rejects.toThrow('安装包校验失败：sha256 与发布记录不一致，已拒绝安装')
      expect(环境.启动安装程序).not.toHaveBeenCalled()
      expect(环境.退出).not.toHaveBeenCalled()
      const 残留 = fs.readdirSync(环境.临时目录, { recursive: true }).filter(名称 => String(名称).endsWith('.exe'))
      expect(残留).toEqual([])
    } finally { 环境.清理() }
  })

  it('字节数不一致或超出时拒绝安装', async () => {
    const 环境 = 准备({ 安装包: Buffer.concat([安装包, Buffer.from('多余内容')]) })
    try {
      await expect(环境.服务.安装(新版)).rejects.toThrow('安装包校验失败：文件大小与发布记录不一致，已拒绝安装')
      expect(环境.启动安装程序).not.toHaveBeenCalled()
    } finally { 环境.清理() }
  })

  it('缺少校验值或地址不是 https 时不下载', async () => {
    const 环境 = 准备()
    try {
      await expect(环境.服务.安装({ ...新版, sha256: null })).rejects.toThrow('发布记录缺少安装包校验值，已拒绝安装')
      await expect(环境.服务.安装({ ...新版, url: 'http://example.com/a.exe' })).rejects.toThrow('安装包地址无效，已拒绝下载')
      expect(环境.请求).not.toHaveBeenCalled()
    } finally { 环境.清理() }
  })

  it('校验一致后启动安装程序并退出应用', async () => {
    const 环境 = 准备()
    try {
      const 结果 = await 环境.服务.安装(新版)
      expect(结果).toEqual({ 已启动安装: true })
      const 文件 = 环境.启动安装程序.mock.calls[0][0]
      expect(path.basename(文件)).toBe('seal-office-setup-2.7.1.exe')
      expect(fs.readFileSync(文件)).toEqual(安装包)
      await new Promise(resolve => setTimeout(resolve, 5))
      expect(环境.退出).toHaveBeenCalledOnce()
    } finally { 环境.清理() }
  })

  it('商店版打开微软商店链接，不下载安装包', async () => {
    const 环境 = 准备({ 平台: 'windows-store' })
    try {
      expect(await 环境.服务.安装({ version: '2.7.1', url: 'ms-windows-store://pdp/?productid=9NGPL705R5Z3' })).toEqual({ 已打开商店: true })
      expect(环境.打开外部).toHaveBeenCalledWith('ms-windows-store://pdp/?productid=9NGPL705R5Z3')
      expect(环境.请求).not.toHaveBeenCalled()
      await expect(环境.服务.安装({ version: '2.7.1', url: 'file:///C:/a.exe' })).rejects.toThrow('无法打开微软商店，请手动在商店中搜索海豹办公')
    } finally { 环境.清理() }
  })
})
