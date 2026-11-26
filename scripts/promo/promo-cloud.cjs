// 宣传视频录制用的本机隔离云服务（2.8.0 起）。
// - 以测试类路径启动 seal-server（H2 内存库、临时数据目录），演示短信验证码写入本地文件，不外发、不连线上服务；
// - 用桌面端同一个云服务客户端（main/cloud/service.js）登录演示账号、开通云空间并写入隔离演示文件；
// - 录制时网页界面的 cloud.invoke 经 cloudChannel 的同一套动作表转发，与桌面版行为一致。
// 画面中的文件、大小、移动与预览均来自这台本机服务的真实接口，不伪造结果。
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')

const root = path.resolve(__dirname, '../..')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function 空闲端口() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

/** 启动隔离云服务；返回 { url, 读取验证码, 停止 } */
async function 启动隔离云服务(工作目录, { 超时 = 240000 } = {}) {
  const 目录 = path.join(工作目录, 'promo-cloud')
  fs.rmSync(目录, { recursive: true, force: true })
  fs.mkdirSync(目录, { recursive: true })
  const 端口 = await 空闲端口(), 验证码文件 = path.join(目录, 'sms.jsonl'), 日志 = fs.openSync(path.join(目录, 'server.log'), 'w')
  const 参数 = ['-q', '-B', 'spring-boot:test-run', '-Dspring-boot.run.main-class=com.sealoffice.cloud.promo.PromoDemoServer',
    `-Dspring-boot.run.arguments=--server.port=${端口} --seal.data-dir=${path.join(目录, 'data')} --seal.erasure-dir=${path.join(目录, 'erasure')}`]
  const 进程 = spawn(process.platform === 'win32' ? 'mvn.cmd' : 'mvn', 参数, {
    cwd: path.join(root, 'seal-server'), env: { ...process.env, SEAL_PROMO_SMS_FILE: 验证码文件 }, stdio: ['ignore', 日志, 日志],
    shell: process.platform === 'win32', detached: process.platform !== 'win32', windowsHide: true,
  })
  const url = `http://127.0.0.1:${端口}`
  const 停止 = () => {
    try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(进程.pid), '/T', '/F'], { windowsHide: true }) : process.kill(-进程.pid, 'SIGTERM') } catch { /* 已退出 */ }
  }
  const 开始 = Date.now()
  while (Date.now() - 开始 < 超时) {
    if (进程.exitCode !== null) throw new Error('录制用云服务启动失败，见 ' + path.join(目录, 'server.log'))
    try { if ((await fetch(url + '/v1/capabilities')).ok) break } catch { /* 尚未就绪 */ }
    await pause(1000)
  }
  if (Date.now() - 开始 >= 超时) { 停止(); throw new Error('录制用云服务启动超时') }
  const 读取验证码 = 手机号 => {
    const 行 = fs.existsSync(验证码文件) ? fs.readFileSync(验证码文件, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
    return 行.filter(项 => 项.phone === 手机号).at(-1)?.code
  }
  return { url, 目录, 读取验证码, 停止 }
}

/** 演示用本机凭据保管：固定演示密钥，只保存在录制工作目录 */
function 演示安全存储() {
  const { seal, unseal } = require('../../main/cloud/crypto')
  const 密钥 = Buffer.alloc(32, 23)
  return {
    isEncryptionAvailable: () => true,
    encryptString: 文本 => seal(密钥, Buffer.from(文本), 'promo-device'),
    decryptString: 字节 => unseal(密钥, 字节, 'promo-device').toString(),
  }
}

/** 登录演示账号并开通云空间，返回已解锁的云服务客户端 */
async function 准备演示账号(云, 工作目录, 手机号 = '13800138000') {
  const { createService } = require('../../main/cloud/service')
  const 本机目录 = path.join(云.目录, 'client-' + 手机号)
  fs.mkdirSync(本机目录, { recursive: true })
  const 客户端 = createService({ directory: 本机目录, safeStorage: 演示安全存储() })
  await 客户端.setServer(云.url)
  await 客户端.sendCode(手机号)
  let 验证码
  for (let i = 0; i < 50 && !验证码; i++) { 验证码 = 云.读取验证码(手机号); if (!验证码) await pause(100) }
  if (!验证码) throw new Error('未取得演示验证码')
  await 客户端.login(手机号, 验证码)
  if (!客户端.status().account.enabled) { await 客户端.enable(true); 客户端.ackRecovery() }
  if (!客户端.status().account.hasPassword) {
    // 设置演示登录密码，使账号面板显示“修改登录密码”与验证方式切换；同号验证码 60 秒限频，需等待
    await pause(61000)
    await 客户端.sendCode(手机号, 'password')
    let 密码验证码
    for (let i = 0; i < 50 && (!密码验证码 || 密码验证码 === 验证码); i++) { 密码验证码 = 云.读取验证码(手机号); if (!密码验证码 || 密码验证码 === 验证码) await pause(100) }
    await 客户端.setPassword({ password: 'Seal-Office-2.8.0-Demo-Only', code: 密码验证码 })
  }
  return 客户端
}

/** 写入隔离演示文件：两个文件夹与几份大小不同的文档（其中一份 DOCX 带未声明的 w15 编号属性，用于演示预览修复） */
async function 写入演示文件(客户端) {
  const { 生成docx } = require('../../main/office/docxWriter')
  const JSZip = require('jszip')
  const 段落 = (文字列表) => ({ 段落: 文字列表.map((文本, 序号) => ({ 类型: '段落', 级别: 序号 === 0 ? 1 : 0, 对齐: '左', 列表: '无', 文字: [{ 文本, 加粗: 序号 === 0 }] })) })
  const docx = async (文字列表, 补w15 = false) => {
    const 字节 = await 生成docx(段落(文字列表))
    if (!补w15) return 字节
    const 包 = await JSZip.loadAsync(字节)
    // 模拟部分编辑器生成的编号定义：使用 w15 前缀却未在根元素声明命名空间（Word 可打开，浏览器严格解析会报错）
    包.file('word/numbering.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0" w15:restartNumberingAfterBreak="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>')
    const 类型 = await 包.file('[Content_Types].xml').async('string')
    if (!类型.includes('numbering.xml')) 包.file('[Content_Types].xml', 类型.replace('</Types>', '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'))
    return 包.generateAsync({ type: 'nodebuffer' })
  }
  const 保存 = (name, data, parent = null) => 客户端.save({ linkId: randomUUID(), name, filename: name, data: Buffer.from(data).toString('base64'), parent })
  const 项目 = await 客户端.folder('项目资料', null)
  const 归档 = await 客户端.folder('合同归档', null)
  const 长文 = Array.from({ length: 60 }, (_, i) => `第 ${i + 1} 条：2.8.0 演示资料，用于展示云空间文件大小与预览。`)
  await 保存('季度汇报.docx', await docx(['季度汇报', '一、项目进展', '二、预算执行', ...长文], true))
  await 保存('会议纪要.docx', await docx(['会议纪要', '参会人员：产品、设计、研发', '结论：本周完成拖放移动验收。']))
  await 保存('合作协议.docx', await docx(['合作协议', ...长文.slice(0, 20)]))
  await 保存('需求清单.txt', '需求清单\n1. 云盘拖放移动\n2. 显示文件大小\n3. 预览打印与导出\n'.repeat(30))
  await 保存('资料说明.txt', '项目资料说明（演示）\n', 项目.id)
  await 客户端.flush()
  return { 项目: 项目.id, 归档: 归档.id }
}

/** 以桌面端 cloudChannel 的同一套动作表处理网页界面的云调用 */
function 云调用通道(客户端) {
  const { 注册云端通道 } = require('../../main/ipc/cloudChannel')
  let 处理
  注册云端通道({ handle: (名称, 回调) => { if (名称 === 'cloud.invoke') 处理 = 回调 } }, { cloudService: 客户端 })
  if (!处理) throw new Error('云端通道未注册')
  return (action, input) => 处理(null, action, input || {})
}

module.exports = { 启动隔离云服务, 准备演示账号, 写入演示文件, 云调用通道 }

if (require.main === module) {
  // 自检：node scripts/promo/promo-cloud.cjs [工作目录]
  ;(async () => {
    const 工作目录 = path.resolve(process.argv[2] || path.join(root, '.upgrade-private/promo-cloud-check'))
    const 云 = await 启动隔离云服务(工作目录)
    try {
      const 客户端 = await 准备演示账号(云, 工作目录)
      const 目录 = await 写入演示文件(客户端)
      const 列表 = await 客户端.list()
      console.log(JSON.stringify({ url: 云.url, 文件: 列表.map(项 => ({ 名称: 项.meta.name, 种类: 项.kind, 大小: 项.bytes ?? null, 上级: 项.parent })), 目录 }, null, 2))
    } finally { 云.停止() }
  })().catch(错误 => { console.error(错误); process.exitCode = 1 })
}
