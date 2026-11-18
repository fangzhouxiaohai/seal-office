// Windows 安装辅助进程：等待主进程退出后重新校验，再启动已验证安装程序。
const fs = require('fs')
const { createHash } = require('crypto')
const { spawn } = require('child_process')

async function 等待退出再安装({ 存活, 等待, 校验, 启动, 最大次数 = 240 }) {
  let n = 0
  while (存活()) {
    if (n++ >= 最大次数) throw new Error('海豹办公未退出，已取消启动安装程序')
    await 等待()
  }
  await 校验()
  await 启动()
}

async function 执行() {
  const [pidText, 文件, 摘要, 大小, 结果路径, 任务标识] = process.argv.slice(2)
  const pid = Number(pidText), bytes = Number(大小)
  if (!Number.isSafeInteger(pid) || pid <= 0 || !/^[a-f0-9]{64}$/i.test(摘要 || '') || !Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('安装参数无效')
  const 存活 = () => { try { process.kill(pid, 0); return true } catch (e) { if (e.code === 'ESRCH') return false; return true } }
  const 校验 = async () => {
    const stat = fs.lstatSync(文件)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes) throw new Error('安装包校验失败，请重新下载')
    const hash = createHash('sha256')
    for await (const chunk of fs.createReadStream(文件)) hash.update(chunk)
    if (hash.digest('hex') !== 摘要.toLowerCase()) throw new Error('安装包校验失败，请重新下载')
  }
  const 启动 = () => new Promise((resolve, reject) => {
    const child = spawn(文件, [], { detached:true, stdio:'ignore', windowsHide:true })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
  try {
    await 等待退出再安装({ 存活, 等待: () => new Promise(r => setTimeout(r, 500)), 校验, 启动 })
    fs.writeFileSync(结果路径, JSON.stringify({ 成功:true, 任务标识 }), { mode:0o600 })
  } catch (e) {
    fs.writeFileSync(结果路径, JSON.stringify({ 成功:false, 错误:e.message || '启动安装程序失败', 任务标识 }), { mode:0o600 })
    throw e
  }
}

if (require.main === module) 执行().catch(() => { process.exitCode = 1 })
module.exports = { 等待退出再安装 }
