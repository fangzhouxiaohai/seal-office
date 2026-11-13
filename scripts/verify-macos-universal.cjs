const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { isDeepStrictEqual } = require('node:util')
const { createHash } = require('node:crypto')
const plist = require('plist')
const asar = require('@electron/asar')
const { 读取目标, 打开连接, 停止进程, 有界等待 } = require('./verify-macos-candidate.cjs')

const 原生路径 = arch => `Contents/Resources/app.asar.unpacked/node_modules/@napi-rs/canvas-darwin-${arch}/skia.darwin-${arch}.node`

function 排序字典(值) {
  if (Array.isArray(值)) return 值.map(排序字典)
  if (值 && Object.getPrototypeOf(值) === Object.prototype) return Object.fromEntries(Object.keys(值).sort().map(键 => [键, 排序字典(值[键])]))
  return 值
}

function 规范属性(x64, arm64) {
  const 原数据 = [x64, arm64].map(文件 => {
    if (!fs.lstatSync(文件).isFile()) throw new Error('属性文件不是普通文件')
    return plist.parse(fs.readFileSync(文件, 'utf8'))
  })
  const 业务数据 = 原数据.map(数据 => { const 副本 = { ...数据 }; delete 副本.ElectronAsarIntegrity; return 副本 })
  if (!isDeepStrictEqual(业务数据[0], 业务数据[1])) throw new Error('两种架构的属性内容不一致，拒绝合并')
  for (let i = 0; i < 2; i++) fs.writeFileSync([x64, arm64][i], plist.build(排序字典(原数据[i])))
}

function 校验完整性(应用) {
  const 内容 = path.join(应用, 'Contents'), 资源 = path.join(内容, 'Resources')
  const 属性 = plist.parse(fs.readFileSync(path.join(内容, 'Info.plist'), 'utf8'))
  const 表 = 属性.ElectronAsarIntegrity
  const 名称 = ['app.asar', 'app-arm64.asar', 'app-x64.asar'].sort()
  const 键 = 名称.map(项 => 'Resources/' + 项).sort()
  if (!表 || !isDeepStrictEqual(Object.keys(表).sort(), 键)) throw new Error('通用包完整性路径不一致')
  for (const 项 of 名称) {
    const 记录 = 表['Resources/' + 项]
    const 摘要 = createHash('sha256').update(asar.getRawHeader(path.join(资源, 项)).headerString).digest('hex')
    if (记录?.algorithm !== 'SHA256' || 记录.hash !== 摘要) throw new Error('通用包完整性摘要不一致：' + 项)
  }
  console.log('通过：通用包三份 ASAR 路径和头摘要')
}

function 清除旧签名(目录) {
  for (const 条目 of fs.readdirSync(目录, { withFileTypes: true })) {
    const 文件 = path.join(目录, 条目.name)
    if (条目.isSymbolicLink()) continue
    if (条目.isDirectory() && 条目.name === '_CodeSignature') fs.rmSync(文件, { recursive: true })
    else if (条目.isDirectory()) 清除旧签名(文件)
  }
}

function 对齐副本(x64, arm64) {
  if (![x64, arm64].every(path.isAbsolute) || x64 === arm64) throw new Error('必须提供两个独立的绝对路径副本')
  const 复制项 = [[x64, arm64, 'x64'], [arm64, x64, 'arm64']]
  for (const [来源, 目标, arch] of 复制项) {
    const 源文件 = path.join(来源, 原生路径(arch)), 目标文件 = path.join(目标, 原生路径(arch))
    if (!fs.lstatSync(源文件).isFile()) throw new Error('原生模块不是普通文件')
    if (fs.existsSync(目标文件)) throw new Error('原生模块目标文件已存在，拒绝覆盖')
  }
  for (const [来源, 目标, arch] of 复制项) {
    const 源文件 = path.join(来源, 原生路径(arch)), 目标文件 = path.join(目标, 原生路径(arch))
    fs.mkdirSync(path.dirname(目标文件), { recursive: true })
    fs.copyFileSync(源文件, 目标文件, fs.constants.COPYFILE_EXCL)
  }
  清除旧签名(x64)
  清除旧签名(arm64)
}

async function 合并(x64, arm64, 输出) {
  if (process.platform !== 'darwin') throw new Error('通用包合并必须在 macOS 执行')
  if (![x64, arm64, 输出].every(path.isAbsolute) || fs.existsSync(输出)) throw new Error('输出必须是不存在的绝对路径')
  if (!process.env.RUNNER_TEMP) throw new Error('缺少受控运行目录')
  const 临时根 = fs.realpathSync(process.env.RUNNER_TEMP)
  for (const 值 of [x64, arm64, path.dirname(输出)]) {
    const 实际 = fs.realpathSync(值)
    const 相对 = path.relative(临时根, 实际)
    if (!相对 || 相对.startsWith('..' + path.sep) || 相对 === '..' || path.isAbsolute(相对)) throw new Error('应用副本必须位于运行器临时目录')
  }
  规范属性(path.join(x64, 'Contents/Info.plist'), path.join(arm64, 'Contents/Info.plist'))
  对齐副本(x64, arm64)
  await require('@electron/universal').makeUniversalApp({
    x64AppPath: x64, arm64AppPath: arm64, outAppPath: 输出,
    mergeASARs: false,
    x64ArchFiles: '**/@napi-rs/canvas-darwin-*/skia.darwin-*.node',
  })
  校验完整性(输出)
}

const 图形表达式 = () => `(()=>{if(typeof process==='undefined'||!process.mainModule)return {就绪:false};const e=process.mainModule.require('electron');if(!e.app.getAppPath().endsWith('app-'+process.arch+'.asar'))return {就绪:false};const p=process.mainModule.require('path');const c=process.mainModule.require(p.join(e.app.getAppPath(),'node_modules/@napi-rs/canvas'));return {就绪:true,架构:process.arch,签名:c.createCanvas(2,2).toBuffer('image/png').subarray(0,8).toString('hex')}})()`

async function 运行图形验收(进程, { 端口 = 19332, 总时限 = 60000, 期望架构 } = {}) {
  const 控制 = new AbortController(), 信号 = 控制.signal
  const 计时 = setTimeout(() => 控制.abort(), 总时限)
  let 套接字, 进程错误
  const 启动错误 = 错误 => { 进程错误 = 错误 }
  进程.on('error', 启动错误)
  const 检查 = () => {
    if (信号.aborted) throw new Error('图形模块验收超时或已取消')
    if (进程错误) throw new Error('图形模块验收应用无法启动：' + 进程错误.message)
    if (进程.exitCode !== null || 进程.signalCode !== null) throw new Error('图形模块验收时应用提前退出')
  }
  try {
    console.log('图形验收：连接主进程')
    let 目标
    while (!目标) {
      检查()
      try { 目标 = (await 读取目标(端口, AbortSignal.any([信号, AbortSignal.timeout(2000)]))).find(x => x.webSocketDebuggerUrl) }
      catch (错误) { if (信号.aborted) throw new Error('图形模块验收超时或已取消') }
      if (!目标) await 有界等待(new Promise(resolve => setTimeout(resolve, 100)), 信号)
    }
    套接字 = await 打开连接(目标.webSocketDebuggerUrl, AbortSignal.any([信号, AbortSignal.timeout(5000)]))
    console.log('图形验收：验证架构入口和原生模块')
    let id = 0
    while (true) {
      检查()
      const 序号 = ++id
      const 结果 = await new Promise((resolve, reject) => {
        const 局部信号 = AbortSignal.any([信号, AbortSignal.timeout(5000)])
        const 清理 = () => { 局部信号.removeEventListener('abort', 超时); 套接字.removeListener('message', 收到); 套接字.removeListener('close', 关闭); 套接字.removeListener('error', 失败) }
        const 超时 = () => { 清理(); reject(new Error('图形模块调试执行超时或已取消')) }
        const 关闭 = () => { 清理(); reject(new Error('图形模块调试连接已关闭')) }
        const 失败 = 错误 => { 清理(); reject(错误) }
        const 收到 = 消息 => {
          let 内容
          try { 内容 = JSON.parse(String(消息)) } catch { 清理(); return reject(new Error('图形模块调试响应无效')) }
          if (内容.id !== 序号) return
          清理()
          if (内容.error || 内容.result?.exceptionDetails) reject(new Error(JSON.stringify(内容.error || 内容.result.exceptionDetails)))
          else resolve(内容.result?.result?.value)
        }
        局部信号.addEventListener('abort', 超时, { once: true }); 套接字.on('message', 收到); 套接字.once('close', 关闭); 套接字.once('error', 失败)
        if (局部信号.aborted) return 超时()
        try { 套接字.send(JSON.stringify({ id: 序号, method: 'Runtime.evaluate', params: { expression: 图形表达式(), returnByValue: true } })) } catch (错误) { 失败(错误) }
      })
      if (!结果 || typeof 结果.就绪 !== 'boolean') throw new Error('图形模块调试结果无效')
      if (!结果.就绪) { await 有界等待(new Promise(resolve => setTimeout(resolve, 100)), 信号); continue }
      if (!['x64', 'arm64'].includes(结果.架构) || 结果.签名 !== '89504e470d0a1a0a') throw new Error('原生图形模块未能生成有效 PNG')
      if (期望架构 && 结果.架构 !== 期望架构) throw new Error('图形模块运行架构不符')
      console.log('原生图形模块加载通过：' + 结果.架构)
      return 结果
    }
  } finally {
    clearTimeout(计时)
    套接字?.terminate()
    try { await 停止进程(进程) } finally { 进程.removeListener('error', 启动错误) }
  }
}

async function 校验图形(应用) {
  if (process.platform !== 'darwin' || !path.isAbsolute(应用)) throw new Error('需要苹果系统上的应用绝对路径')
  const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-universal-canvas-'))
  const 进程 = spawn(path.join(应用, 'Contents/MacOS/海豹办公'), ['--inspect=127.0.0.1:19332', `--user-data-dir=${path.join(目录, 'profile')}`], { stdio: 'ignore' })
  const 期望架构 = process.env.EXPECTED_ARCH === 'x86_64' ? 'x64' : process.env.EXPECTED_ARCH
  await 运行图形验收(进程, { 期望架构 })
}

module.exports = { 对齐副本, 规范属性, 校验完整性, 图形表达式, 运行图形验收 }
if (require.main === module) {
  const 参数 = process.argv.slice(2)
  const 任务 = 参数[0] === '--canvas' ? 校验图形(参数[1]) : 合并(...参数)
  任务.catch(error => { console.error(error); process.exitCode = 1 })
}
