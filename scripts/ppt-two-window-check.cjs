// 任务 13b 真实双窗口验收：启动真实应用（开发服务器 + Electron）后，
// 通过 CDP 打开第二个窗口，验证会话广播、远端修改进入本地撤销栈与关闭语义。
// 用法：node scripts/ppt-two-window-check.cjs <CDP 端口> <输出 JSON 路径>
const fs = require('fs')

const 端口 = Number(process.argv[2] ?? '9411')
const 输出 = process.argv[3] ?? 'E:/DevCache/ppt-upgrade-evidence/task13b/two-window.json'
const 等待 = (毫秒) => new Promise(完成 => setTimeout(完成, 毫秒))

async function 目标列表() {
  const 响应 = await fetch(`http://127.0.0.1:${端口}/json/list`)
  return await 响应.json()
}

async function 连接(入口) {
  const 通道 = new WebSocket(入口.webSocketDebuggerUrl)
  await new Promise((完成, 拒绝) => { 通道.addEventListener('open', 完成); 通道.addEventListener('error', 拒绝) })
  let 序号 = 0
  const 任务表 = new Map()
  通道.addEventListener('message', 事件 => {
    const 响应 = JSON.parse(String(事件.data))
    const 任务 = 任务表.get(响应.id)
    if (!任务) return
    任务表.delete(响应.id)
    clearTimeout(任务.超时)
    if (响应.error || 响应.result?.exceptionDetails) 任务.拒绝(new Error(响应.error?.message ?? 响应.result.exceptionDetails.exception?.description ?? 'CDP 表达式失败'))
    else 任务.完成(响应.result?.result?.value)
  })
  return {
    执行: (表达式, 超时毫秒 = 20000) => new Promise((完成, 拒绝) => {
      const id = ++序号
      const 超时 = setTimeout(() => { 任务表.delete(id); 拒绝(new Error(`CDP 调用超时：${表达式.slice(0, 60)}`)) }, 超时毫秒)
      任务表.set(id, { 完成: 结果 => 完成(结果), 拒绝, 超时 })
      通道.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: 表达式, awaitPromise: true, returnByValue: true } }))
    }),
    关闭: () => 通道.close(),
  }
}

async function 等待条件(页面, 表达式, 说明, 超时毫秒 = 30000) {
  const 截止 = Date.now() + 超时毫秒
  while (Date.now() < 截止) {
    if (await 页面.执行(`Boolean(${表达式})`)) return true
    await 等待(300)
  }
  throw new Error(`等待超时：${说明}`)
}

const 缩略图 = "document.querySelectorAll('.wps-ppt-thumb').length"
const 点击标签 = (名称) => `(() => { const 标签 = [...document.querySelectorAll('.wps-ribbon-tab')].find(项 => 项.textContent.trim() === ${JSON.stringify(名称)}); if (!标签) return false; 标签.click(); return true })()`
const 点击按钮 = (名称) => `(() => { const 按钮 = [...document.querySelectorAll('button')].find(项 => (项.getAttribute('aria-label') ?? 项.textContent.trim()) === ${JSON.stringify(名称)}); if (!按钮 || 按钮.disabled) return false; 按钮.click(); return true })()`

let 当前报告 = null
async function 主流程() {
  const 报告 = { 端口, 步骤: [], 通过: false }
  当前报告 = 报告
  const 页面列表 = await 目标列表()
  const 入口 = 页面列表.find(项 => 项.type === 'page' && /5172|index\.html/.test(项.url ?? ''))
  if (!入口) throw new Error(`没有找到渲染页面目标：${JSON.stringify(页面列表.map(项 => 项.url))}`)
  报告.步骤.push({ 步骤: '连接主窗口', 地址: 入口.url })
  const 甲 = await 连接(入口)

  // 确保有打开的文稿：命令行打开失败时从首页新建一份
  const 有文稿 = await 甲.执行(`Boolean(${缩略图})`)
  if (!有文稿) {
    报告.步骤.push({ 步骤: '命令行未打开文稿，尝试首页新建' })
    const 已新建 = await 甲.执行(`(() => { const 目标 = [...document.querySelectorAll('button')].find(项 => /空白演示|新建演示|演示文稿/.test(项.textContent ?? '')); if (!目标) return false; 目标.click(); return true })()`)
    报告.步骤.push({ 步骤: '点击首页新建入口', 已新建 })
    await 等待(1500)
  }
  await 等待条件(甲, `${缩略图} > 0`, '主窗口出现幻灯片缩略图')
  const 初始页数 = await 甲.执行(缩略图)
  报告.步骤.push({ 步骤: '主窗口就绪', 初始页数 })

  // 打开第二个窗口
  await 甲.执行(点击标签('视图'))
  await 等待(300)
  const 已点新建窗口 = await 甲.执行(点击按钮('新建窗口'))
  报告.步骤.push({ 步骤: '点击新建窗口', 已点新建窗口 })
  if (!已点新建窗口) throw new Error('未找到「新建窗口」入口')

  let 乙 = null
  for (let 次 = 0; 次 < 40 && !乙; 次 += 1) {
    await 等待(500)
    const 列表 = await 目标列表()
    const 候选 = 列表.find(项 => 项.type === 'page' && 项.id !== 入口.id && /5172|index\.html/.test(项.url ?? ''))
    if (候选) 乙 = await 连接(候选)
  }
  if (!乙) throw new Error('第二个窗口没有出现')
  报告.步骤.push({ 步骤: '第二个窗口已出现' })
  await 等待条件(乙, `${缩略图} > 0`, '第二个窗口出现缩略图')
  const 乙初始页数 = await 乙.执行(缩略图)
  报告.步骤.push({ 步骤: '第二个窗口就绪', 页数: 乙初始页数, 与主窗口一致: 乙初始页数 === 初始页数 })

  // 主窗口新增一页：应广播到第二个窗口
  await 甲.执行(点击标签('开始'))
  await 等待(300)
  const 已点新建页 = await 甲.执行(点击按钮('新建幻灯片'))
  await 等待(1200)
  const 甲点击后页数 = await 甲.执行(缩略图)
  报告.步骤.push({ 步骤: '主窗口新建幻灯片', 已点新建页, 主窗口页数: 甲点击后页数 })
  if (甲点击后页数 <= 初始页数) throw new Error(`主窗口新建幻灯片后页数没有增加（${初始页数} → ${甲点击后页数}），无法验证广播`)
  await 等待条件(乙, `${缩略图} > ${乙初始页数}`, '第二个窗口同步到新增页面')
  const 广播后页数 = await 乙.执行(缩略图)
  报告.步骤.push({ 步骤: '远端广播同步', 页数: 广播后页数 })

  // 第二个窗口撤销：远端修改应已进入其本地撤销栈（主窗口一次操作可能产生多次提交，允许多次撤销）
  await 乙.执行(点击标签('开始'))
  await 等待(200)
  const 采样 = []
  let 撤销成功 = false
  for (let 次 = 0; 次 < 4 && !撤销成功; 次 += 1) {
    const 已点 = await 乙.执行(点击按钮('撤销'))
    采样.push({ 第几次: 次 + 1, 已点, 页数: await 乙.执行(缩略图) })
    await 等待(600)
    采样[采样.length - 1].撤销后页数 = await 乙.执行(缩略图)
    if (采样[采样.length - 1].撤销后页数 === 乙初始页数) 撤销成功 = true
    if (!已点) break
  }
  报告.步骤.push({ 步骤: '接收窗口撤销远端修改', 采样, 期望回到: 乙初始页数, 成功: 撤销成功 })
  if (!撤销成功) throw new Error(`接收窗口连续撤销后页数没有回到 ${乙初始页数}：${JSON.stringify(采样)}`)
  报告.通过 = true

  甲.关闭(); 乙.关闭()
  fs.writeFileSync(输出, JSON.stringify(报告, null, 2), 'utf8')
  console.log(JSON.stringify(报告, null, 2))
}

主流程().catch(错误 => {
  const 失败 = { 端口, 错误: 错误?.message ?? String(错误), 已完成的步骤: 当前报告?.步骤 ?? [] }
  try { fs.writeFileSync(输出, JSON.stringify(失败, null, 2), 'utf8') } catch {}
  console.error('TWO_WINDOW_FAIL ' + (错误?.message ?? 错误))
  process.exit(1)
})
