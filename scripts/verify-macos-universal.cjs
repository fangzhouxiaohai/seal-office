const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { isDeepStrictEqual } = require('node:util')
const { createHash } = require('node:crypto')
const plist = require('plist')
const asar = require('@electron/asar')

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

async function 校验图形(应用) {
  if (process.platform !== 'darwin' || !path.isAbsolute(应用)) throw new Error('需要苹果系统上的应用绝对路径')
  const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-universal-canvas-'))
  const 进程 = spawn(path.join(应用, 'Contents/MacOS/海豹办公'), ['--inspect=127.0.0.1:19332', `--user-data-dir=${path.join(目录, 'profile')}`], { stdio: 'ignore' })
  let 套接字
  try {
    let 目标
    for (let 次数 = 0; 次数 < 300 && !目标; 次数++) {
      if (进程.exitCode !== null) throw new Error('图形模块验收时应用提前退出')
      try { 目标 = (await (await fetch('http://127.0.0.1:19332/json/list')).json()).find(x => x.webSocketDebuggerUrl) } catch {}
      if (!目标) await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!目标) throw new Error('图形模块验收调试接口未就绪')
    套接字 = new WebSocket(目标.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { 套接字.addEventListener('open', resolve, { once: true }); 套接字.addEventListener('error', reject, { once: true }) })
    const 结果 = await new Promise((resolve, reject) => {
      const 计时 = setTimeout(() => reject(new Error('图形模块加载超时')), 30000)
      套接字.addEventListener('message', 事件 => {
        const 内容 = JSON.parse(String(事件.data))
        if (内容.id !== 1) return
        clearTimeout(计时)
        if (内容.error || 内容.result?.exceptionDetails) reject(new Error(JSON.stringify(内容.error || 内容.result.exceptionDetails)))
        else resolve(内容.result?.result?.value)
      })
      套接字.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(async()=>{let e;for(let i=0;i<200;i++){try{e=process.mainModule.require('electron');if(e.app.getAppPath().endsWith('app-'+process.arch+'.asar'))break}catch{}await new Promise(r=>setTimeout(r,100))}if(!e||!e.app.getAppPath().endsWith('app-'+process.arch+'.asar'))throw Error('架构应用入口未就绪');const p=process.mainModule.require('path');const c=process.mainModule.require(p.join(e.app.getAppPath(),'node_modules/@napi-rs/canvas'));return {arch:process.arch,bytes:c.createCanvas(2,2).toBuffer('image/png').length}})()`, awaitPromise: true, returnByValue: true } }))
    })
    if (!结果 || !['x64', 'arm64'].includes(结果.arch) || !(结果.bytes > 0)) throw new Error('原生图形模块未能生成图片')
    console.log('原生图形模块加载通过：' + 结果.arch)
  } finally {
    套接字?.close()
    if (进程.exitCode === null) 进程.kill('SIGTERM')
  }
}

module.exports = { 对齐副本, 规范属性, 校验完整性 }
if (require.main === module) {
  const 参数 = process.argv.slice(2)
  const 任务 = 参数[0] === '--canvas' ? 校验图形(参数[1]) : 合并(...参数)
  任务.catch(error => { console.error(error); process.exitCode = 1 })
}
