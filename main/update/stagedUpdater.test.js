const fs = require('fs')
const os = require('os')
const path = require('path')
const { createHash } = require('crypto')
const { 创建暂存更新 } = require('./stagedUpdater')

const 内容 = Buffer.from('真实安装包测试内容')
const 发布 = { hasUpdate: true, version: '2.7.3', url: 'https://example.com/a.deb', sha256: createHash('sha256').update(内容).digest('hex'), bytes: 内容.length }
function 环境(平台 = 'linux') {
  const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-stage-'))
  const 检查 = vi.fn(async () => 发布)
  const 请求 = vi.fn(async () => new Response(内容))
  const 打开安装包 = vi.fn(async () => {})
  const 更新 = []
  const 创建 = () => 创建暂存更新({ 平台, 目录, 检查, 请求, 打开安装包, 通知: 值 => 更新.push(值) })
  return { 目录, 检查, 请求, 打开安装包, 更新, 创建, 清理: () => fs.rmSync(目录, { recursive: true, force: true }) }
}
describe('桌面更新暂存', () => {
  it('苹果系统只打开已校验并持久暂存的磁盘映像', async () => {
    const e = 环境('macos'); try {
      const 信息 = { ...发布, url: 'https://example.com/a.dmg' }
      e.检查.mockResolvedValue(信息)
      await e.创建().下载(信息)
      await e.创建().安装()
      const 文件 = e.打开安装包.mock.calls[0][0]
      expect(文件.endsWith('.dmg')).toBe(true)
      expect(fs.readFileSync(文件)).toEqual(内容)
    } finally { e.清理() }
  })
  it('下载进度、摘要和大小通过后暂存，重启仍可查看并安装', async () => {
    const e = 环境()
    try {
      const a = e.创建(); await a.下载(发布)
      expect(e.更新.some(x => x.阶段 === '下载中' && x.已下载 === 内容.length)).toBe(true)
      expect((await a.状态()).阶段).toBe('已就绪')
      const b = e.创建(); expect((await b.状态()).阶段).toBe('已就绪')
      await b.安装(); expect(e.检查).toHaveBeenCalledTimes(2)
      expect(fs.readFileSync(e.打开安装包.mock.calls[0][0])).toEqual(内容)
    } finally { e.清理() }
  })
  it('拒绝服务端未发布的地址及校验值，不访问该地址', async () => {
    const e = 环境(); try {
      await expect(e.创建().下载({ ...发布, url: 'https://attacker.test/a.deb' })).rejects.toThrow('发布信息已变化')
      expect(e.请求).not.toHaveBeenCalled()
    } finally { e.清理() }
  })
  it('暂存文件被更改后不得安装', async () => {
    const e = 环境(); try {
      const a = e.创建(); await a.下载(发布)
      const 文件 = fs.readdirSync(e.目录).find(x => x.endsWith('.deb'))
      fs.writeFileSync(path.join(e.目录, 文件), '伪造')
      await expect(e.创建().安装()).rejects.toThrow('校验')
      expect(e.打开安装包).not.toHaveBeenCalled()
    } finally { e.清理() }
  })
  it('服务端撤回后禁止安装', async () => {
    const e = 环境(); try {
      const a = e.创建(); await a.下载(发布); e.检查.mockResolvedValue({ hasUpdate: false })
      await expect(a.安装()).rejects.toThrow('发布信息已变化')
      expect(e.打开安装包).not.toHaveBeenCalled()
    } finally { e.清理() }
  })
  it('用户取消中断下载并移除不完整文件，且拒绝并发任务', async () => {
    const e = 环境(); try {
      e.请求.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))))
      const a = e.创建(); const p = a.下载(发布); await new Promise(r => setTimeout(r, 5))
      await expect(a.下载(发布)).rejects.toThrow('正在下载')
      await a.取消(); await expect(p).rejects.toThrow('已取消')
      expect((await a.状态()).阶段).toBe('已取消')
      expect(fs.readdirSync(e.目录).filter(x => x.endsWith('.part'))).toEqual([])
    } finally { e.清理() }
  })
  it('不接受不安全重定向或非 HTTPS 地址', async () => {
    const e = 环境(); try {
      e.检查.mockResolvedValue({ ...发布, url: 'http://example.com/a.deb' })
      await expect(e.创建().下载({ ...发布, url: 'http://example.com/a.deb' })).rejects.toThrow('地址无效')
      expect(e.请求).not.toHaveBeenCalled()
    } finally { e.清理() }
  })
  it('下次启动时显示辅助进程启动安装器失败原因', async () => {
    const e = 环境(); try {
      const state = await e.创建().下载(发布)
      fs.writeFileSync(path.join(e.目录, 'install-result.json'), JSON.stringify({ 成功:false, 错误:'主程序未退出', 任务标识:state.任务标识 }))
      expect(await e.创建().状态()).toMatchObject({ 阶段:'失败', 错误:'主程序未退出', 版本:发布.version })
    } finally { e.清理() }
  })
  it('下载网络超时明确报错而不是误称用户取消', async () => {
    const e = 环境(); try {
      const 请求 = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))))
      const a = 创建暂存更新({ 平台:'linux', 目录:e.目录, 检查:e.检查, 请求, 打开安装包:e.打开安装包, 下载超时:10 })
      await expect(a.下载(发布)).rejects.toThrow('下载超时')
      expect((await a.状态()).阶段).toBe('失败')
    } finally { e.清理() }
  })
  it('空发布信息不得卡住后续下载', async () => {
    const e = 环境(); try {
      const a = e.创建()
      await expect(a.下载(null)).rejects.toThrow('发布信息无效')
      expect((await a.下载(发布)).阶段).toBe('已就绪')
    } finally { e.清理() }
  })
  it('启动安装校验期间拒绝开始新下载或重复安装', async () => {
    const e = 环境(); try {
      const a = e.创建(); await a.下载(发布)
      let 完成
      e.检查.mockImplementation(() => new Promise(resolve => { 完成 = resolve }))
      const 安装 = a.安装()
      await expect(a.下载(发布)).rejects.toThrow('正在安装')
      await expect(a.安装()).rejects.toThrow('正在安装')
      完成(发布)
      await 安装
    } finally { e.清理() }
  })
  it('Windows 已调度安装后拒绝替换安装包，直到进程退出', async () => {
    const e = 环境('windows'); try {
      const a = e.创建(); await a.下载(发布); await a.安装()
      await expect(a.下载(发布)).rejects.toThrow('正在安装')
    } finally { e.清理() }
  })
  it('Windows 未退出时可看到辅助进程超时失败并恢复操作', async () => {
    const e = 环境('windows'); try {
      const a = e.创建(); await a.下载(发布); const state = await a.安装()
      fs.writeFileSync(path.join(e.目录,'install-result.json'), JSON.stringify({成功:false, 任务标识:state.任务标识, 错误:'主程序未退出'}))
      expect(await a.状态()).toMatchObject({阶段:'失败',错误:'主程序未退出'})
      expect((await a.下载(发布)).阶段).toBe('已就绪')
    } finally { e.清理() }
  })
  it('新版本启动时清除与当前版本相同的待安装记录', async () => {
    const e = 环境(); try {
      await e.创建().下载(发布)
      const app = 创建暂存更新({ 平台:'linux', 当前版本:发布.version, 目录:e.目录, 检查:e.检查, 请求:e.请求, 打开安装包:e.打开安装包 })
      expect((await app.状态()).阶段).toBe('空闲')
      expect(fs.existsSync(path.join(e.目录, 'pending.json'))).toBe(false)
      expect(fs.readdirSync(e.目录).some(x => x.endsWith('.deb'))).toBe(false)
    } finally { e.清理() }
  })
  it.each(['失败','取消'])('新任务%s后不会在重启时恢复旧待安装包', async (结果) => {
    const e = 环境(); try {
      const a = e.创建(); await a.下载(发布)
      if (结果 === '失败') {
        e.请求.mockRejectedValueOnce(new Error('网络失败'))
        await expect(a.下载(发布)).rejects.toThrow('网络失败')
      } else {
        e.请求.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))))
        const task = a.下载(发布); await new Promise(resolve => setTimeout(resolve, 5))
        await a.取消(); await expect(task).rejects.toThrow('已取消')
      }
      expect(fs.existsSync(path.join(e.目录, 'pending.json'))).toBe(false)
      expect((await e.创建().状态()).阶段).toBe('空闲')
    } finally { e.清理() }
  })
  it('系统安装器接收后的文件不能被下一次下载或取消删除', async () => {
    const e = 环境('linux'); try {
      const a = e.创建(); await a.下载(发布); await a.安装()
      const 已交付 = e.打开安装包.mock.calls[0][0]
      e.请求.mockRejectedValueOnce(new Error('网络失败'))
      await expect(e.创建().下载(发布)).rejects.toThrow('网络失败')
      expect(fs.existsSync(已交付)).toBe(true)
    } finally { e.清理() }
  })
  it('检查发布信息期间取消可立即结束，不等待网络超时', async () => {
    const e = 环境(); try {
      e.检查.mockImplementation(() => new Promise(() => {}))
      const a = e.创建(); const task = a.下载(发布)
      await new Promise(resolve => setTimeout(resolve, 5))
      const result = await Promise.race([a.取消(), new Promise((_resolve, reject) => setTimeout(() => reject(new Error('取消未及时返回')), 200))])
      expect(result.阶段).toBe('已取消')
      await expect(task).rejects.toThrow('已取消')
    } finally { e.清理() }
  })
})
