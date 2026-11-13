const { 等待退出再安装 } = require('./installAfterExit')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createHash } = require('crypto')
const { spawn } = require('child_process')

describe('Windows 安装等待退出', () => {
  it('主进程仍运行时不启动，退出后再次核验并启动', async () => {
    const 顺序 = []
    let 调用 = 0
    await 等待退出再安装({
      存活: () => ++调用 <= 2, 等待: async () => 顺序.push('等待'),
      校验: async () => 顺序.push('校验'), 启动: async () => 顺序.push('启动'),
      最大次数: 4,
    })
    expect(顺序).toEqual(['等待','等待','校验','启动'])
  })
  it('进程未退出或校验失败时不启动安装器', async () => {
    const 启动 = vi.fn()
    await expect(等待退出再安装({ 存活: () => true, 等待: async () => {}, 校验: async () => {}, 启动, 最大次数: 2 })).rejects.toThrow('未退出')
    await expect(等待退出再安装({ 存活: () => false, 等待: async () => {}, 校验: async () => { throw new Error('校验失败') }, 启动 })).rejects.toThrow('校验失败')
    expect(启动).not.toHaveBeenCalled()
  })
  it('真实独立进程等待父进程结束后才执行通过校验的程序', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-helper-'))
    const result = path.join(dir, 'result.json')
    const parent = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1200)'], { stdio:'ignore' })
    const bytes = fs.statSync(process.execPath).size
    const hash = createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex')
    const helper = spawn(process.execPath, [require.resolve('./installAfterExit'), String(parent.pid), process.execPath, hash, String(bytes), result], { stdio:'ignore' })
    try {
      await new Promise(resolve => setTimeout(resolve, 300))
      expect(fs.existsSync(result)).toBe(false)
      expect(parent.exitCode).toBe(null)
      const code = await new Promise(resolve => helper.once('exit', resolve))
      expect(code).toBe(0)
      expect(parent.exitCode).not.toBe(null)
      expect(JSON.parse(fs.readFileSync(result, 'utf8')).成功).toBe(true)
    } finally {
      if (parent.exitCode === null) parent.kill()
      if (helper.exitCode === null) helper.kill()
      fs.rmSync(dir, { recursive:true, force:true })
    }
  }, 10000)
  it('打包 asar 内的辅助脚本可由 Electron 节点模式执行', async () => {
    const electron = require('electron')
    const asar = require('@electron/asar')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-asar-helper-'))
    const source = path.join(dir, 'source')
    fs.mkdirSync(source)
    fs.copyFileSync(require.resolve('./installAfterExit'), path.join(source, 'installAfterExit.js'))
    const archive = path.join(dir, 'helper.asar')
    const result = path.join(dir, 'result.json')
    const parent = spawn(process.execPath, ['-e','setTimeout(() => {}, 800)'], { stdio:'ignore' })
    let helper
    try {
      await asar.createPackage(source, archive)
      const bytes = fs.statSync(process.execPath).size
      const hash = createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex')
      helper = spawn(electron, [path.join(archive, 'installAfterExit.js'), String(parent.pid), process.execPath, hash, String(bytes), result, 'test'], { stdio:'ignore', windowsHide:true, env:{ ...process.env, ELECTRON_RUN_AS_NODE:'1' } })
      const code = await new Promise(resolve => helper.once('exit', resolve))
      expect(code).toBe(0)
      expect(JSON.parse(fs.readFileSync(result, 'utf8'))).toMatchObject({ 成功:true, 任务标识:'test' })
    } finally {
      if (parent.exitCode === null) parent.kill()
      if (helper && helper.exitCode === null) helper.kill()
      fs.rmSync(dir, { recursive:true, force:true })
    }
  }, 10000)
})
