// 从独立演示实例录制真实操作；不读取用户的文档或模型配置。
const fs = require('fs')
const path = require('path')
const 根 = path.resolve(__dirname, '../..')
const 配置 = JSON.parse(fs.readFileSync(path.join(根, 'docs/promo/storyboard.json'), 'utf8'))
const 工作目录 = path.join(根, `release/promo/work-v${配置.版本}/recordings`)
const 素材目录 = path.join(根, 'docs/promo/assets')
const 端口 = Number(process.argv[2] || 9346)
const 刷新片段 = new Set(process.argv.slice(3))
const 暂停 = 毫秒 => new Promise(完成 => setTimeout(完成, 毫秒))

async function 主程序() {
  const 页面 = (await (await fetch(`http://127.0.0.1:${端口}/json/list`)).json()).find(项 => 项.url.endsWith('/dist/index.html'))
  if (!页面) throw new Error('未找到成品主页面')
  const 连接 = new WebSocket(页面.webSocketDebuggerUrl)
  await new Promise((完成, 失败) => { 连接.addEventListener('open', 完成, { once: true }); 连接.addEventListener('error', 失败, { once: true }) })
  let 编号 = 0
  const 等待响应 = new Map()
  连接.addEventListener('message', 事件 => {
    const 响应 = JSON.parse(String(事件.data))
    const 请求 = 等待响应.get(响应.id)
    if (!请求) return
    等待响应.delete(响应.id)
    clearTimeout(请求.超时)
    if (响应.error || 响应.result?.exceptionDetails) 请求.失败(new Error(响应.error?.message || 响应.result.exceptionDetails.exception?.description))
    else 请求.完成(响应.result)
  })
  const 调用 = (method, params = {}) => new Promise((完成, 失败) => {
    const id = ++编号
    const 超时 = setTimeout(() => { 等待响应.delete(id); 失败(new Error('录制页面调用超时：' + method)) }, 15000)
    等待响应.set(id, { 完成, 失败, 超时 })
    连接.send(JSON.stringify({ id, method, params }))
  })
  const 执行 = async expression => (await 调用('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value
  const 等待 = async (expression, 时限 = 15000) => {
    const 截止 = Date.now() + 时限
    while (Date.now() < 截止) { if (await 执行(expression)) return; await 暂停(100) }
    throw new Error('录制条件未满足：' + expression)
  }
  let 当前录制 = null
  const 点击 = async (expression, 说明) => {
    const 位置 = await 执行(`(() => { const 项 = ${expression}; if (!项 || 项.disabled) throw new Error('操作入口不可用'); const 位置 = 项.getBoundingClientRect(); return { x:位置.x + 位置.width / 2,y:位置.y + 位置.height / 2 }; })()`)
    if (当前录制) 当前录制.操作.push({ 秒: (Date.now() - 当前录制.开始) / 1000, ...位置, 说明 })
    await 调用('Input.dispatchMouseEvent', { type: 'mouseMoved', ...位置 })
    await 暂停(180)
    await 调用('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...位置 })
    await 调用('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...位置 })
  }
  const 按钮 = 名称 => `[...document.querySelectorAll('button')].find(项 => 项.getAttribute('aria-label') === ${JSON.stringify(名称)} || 项.textContent.trim() === ${JSON.stringify(名称)})`
  const 标签 = 名称 => `[...document.querySelectorAll('.wps-global-tab__select')].find(项 => 项.textContent.includes(${JSON.stringify(名称)}))`
  const 键 = async (key, code, virtualKey, modifiers = 0) => {
    await 调用('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey, modifiers })
    await 调用('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey, modifiers })
  }
  const 文本输入 = async 文本 => {
    for (const 字 of 文本) { await 调用('Input.insertText', { text: 字 }); await 暂停(105) }
  }
  const 录制 = async (名称, 操作) => {
    const 目录 = path.join(工作目录, 名称)
    if (!刷新片段.has(名称) && fs.existsSync(path.join(目录, 'manifest.json'))) { const 原 = JSON.parse(fs.readFileSync(path.join(目录, 'manifest.json'), 'utf8')); if (原.版本 !== 配置.版本) throw new Error('素材版本不一致'); console.log('复用已完成片段：' + 名称); return }
    fs.mkdirSync(目录, { recursive: true })
    当前录制 = { 名称, 版本: 配置.版本, 开始: Date.now(), 画面: [], 操作: [] }
    const 元数据 = 当前录制
    let 继续 = true
    const 保存帧 = async () => {
      while (继续) {
        const 帧开始 = Date.now()
        const 秒 = (帧开始 - 元数据.开始) / 1000
        const 图片 = await 调用('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        const 文件 = String(元数据.画面.length).padStart(4, '0') + '.png'
        fs.writeFileSync(path.join(目录, 文件), Buffer.from(图片.data, 'base64'))
        元数据.画面.push({ 文件, 秒 })
        await 暂停(Math.max(0, 166 - (Date.now() - 帧开始)))
      }
    }
    const 捕捉 = 保存帧()
    try { await 暂停(900); await 操作(); await 暂停(1400) }
    finally { 继续 = false; await 捕捉; 当前录制 = null }
    元数据.时长 = (Date.now() - 元数据.开始) / 1000
    delete 元数据.开始
    fs.writeFileSync(path.join(目录, 'manifest.json'), JSON.stringify(元数据, null, 2))
    for (const [后缀, 序号] of [['start',0], ['middle',Math.floor(元数据.画面.length / 2)], ['end',元数据.画面.length - 1]]) fs.copyFileSync(path.join(目录, 元数据.画面[序号].文件), path.join(素材目录, `${名称}-${后缀}.png`))
    console.log(JSON.stringify({ 片段: 名称, 秒: 元数据.时长, 帧数: 元数据.画面.length }))
  }
  fs.mkdirSync(素材目录, { recursive: true })
  try {
    await 调用('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await 等待("document.querySelectorAll('.wps-global-tab__select').length === 4 && document.fonts.status === 'loaded'")
    const 暂不按钮 = await 执行(`Boolean(${按钮('暂不设置')})`)
    if (暂不按钮) { await 点击(按钮('暂不设置'), '跳过演示实例默认程序提示'); await 暂停(500) }
    if (await 执行("[...document.querySelectorAll('.ant-modal')].some(项=>项.getClientRects().length>0)")) throw new Error('演示窗口存在导入提示')
    await 点击("document.querySelector('.wps-global-tabs__home')", '回到首页')
    await 录制('home', async () => {
      await 点击(标签('产品发布计划.docx'), '切换文字文档'); await 暂停(700)
      await 点击(标签('项目预算.xlsx'), '切换表格'); await 暂停(700)
      await 点击(标签('秋季发布汇报.pptx'), '切换演示'); await 暂停(700)
      await 点击("document.querySelector('.wps-global-tabs__home')", '回到首页')
    })
    await 点击(标签('产品发布计划.docx'), '打开文字文档')
    await 录制('word', async () => {
      await 点击(按钮('视图'), '查看文档视图')
      await 点击(按钮('导航窗格'), '展开标题导航')
      await 暂停(900)
      await 点击("[...document.querySelectorAll('.wps-editor-navigation__item')].find(项=>项.textContent.includes('项目目标'))", '定位项目目标')
      await 暂停(850)
      await 点击(按钮('关闭导航窗格'), '收起标题导航')
      await 点击(按钮('开始'), '返回编辑功能区')
      await 执行("(() => { const 编辑区=document.querySelector('.wps-editor-canvas__content'); const 段=[...编辑区.querySelectorAll('p')].find(项=>项.textContent.includes('项目办公室')); 编辑区.focus(); const 选区=getSelection(); const 范围=document.createRange(); 范围.selectNodeContents(段); 范围.collapse(false); 选区.removeAllRanges(); 选区.addRange(范围); })()")
      await 文本输入(' · 演示资料')
      await 等待("Boolean(document.querySelector('.wps-global-tab__dirty'))")
      await 点击(按钮('保存'), '保存文字文档')
      await 等待("!document.querySelector('.wps-global-tab__dirty')")
    })
    await 点击(标签('项目预算.xlsx'), '打开项目预算')
    await 录制('sheet', async () => {
      await 点击("document.querySelector('[data-地址=\"D3\"]')", '选择预算单元格')
      await 点击("document.querySelector('[aria-label=\"公式栏\"]')", '输入预算公式')
      await 键('a', 'KeyA', 65, 2)
      await 文本输入('=B3*C3')
      await 键('Enter', 'Enter', 13)
      await 暂停(900)
      await 点击("[...document.querySelectorAll('.wps-sheet-tabs [role=tab]')].find(项=>项.textContent.includes('执行记录'))", '切换执行记录工作表')
      await 暂停(900)
      await 点击("[...document.querySelectorAll('.wps-sheet-tabs [role=tab]')].find(项=>项.textContent.includes('项目预算'))", '返回预算工作表')
    })
    await 点击(标签('秋季发布汇报.pptx'), '打开演示文稿')
    await 录制('slides', async () => {
      await 点击("document.querySelector('.wps-ppt-thumb[data-索引=\"1\"]')", '选择第二张幻灯片')
      await 暂停(1000)
      await 点击("document.querySelector('.wps-ppt-thumb[data-索引=\"0\"]')", '返回封面')
      await 点击(按钮('幻灯片放映'), '打开幻灯片放映功能区')
      await 点击(按钮('从头开始'), '开始放映')
      await 等待("Boolean(document.querySelector('.wps-slideshow'))")
      await 暂停(1400)
      await 键('ArrowRight','ArrowRight',39)
      await 暂停(1400)
      await 键('Escape','Escape',27)
      await 等待("!document.querySelector('.wps-slideshow')")
    })
    await 点击(标签('发布资料清单.pdf'), '打开 PDF')
    await 等待("document.querySelector('.pdf-viewer__counter')?.textContent.includes('共 1 页') && !document.querySelector('button[aria-label=\"缩小\"]').disabled")
    if (await 执行("document.querySelector('.pdf-viewer__zoom')?.textContent === '100%'")) await 点击(按钮('缩小'), '调整 PDF 缩放')
    await 录制('pdf', async () => {
      await 点击(按钮('展开 PDF 工具'), '展开页面工具')
      await 暂停(1000)
      await 点击(按钮('提取页面'), '查看页面提取')
      await 暂停(1000)
      await 点击(按钮('旋转页面'), '查看页面旋转')
      await 暂停(1000)
      await 点击(按钮('收起 PDF 工具'), '收起工具，专注阅读')
    })
    await 点击(标签('产品发布计划.docx'), '回到文字文档')
    await 录制('assistant', async () => {
      await 点击(按钮('打开智能助手'), '打开智能助手')
      await 等待("Boolean(document.querySelector('.assistant-drawer__scope'))")
      await 暂停(1000)
      await 点击(按钮('模型设置'), '展开模型服务配置')
      await 暂停(1500)
      await 点击(按钮('收起模型设置'), '返回文件对话')
      await 执行("document.querySelector('.assistant-drawer__messages').scrollTop=0")
      await 暂停(1800)
      await 执行("(()=>{const 区=document.querySelector('.assistant-drawer__messages');区.scrollTop=区.scrollHeight})()")
      await 暂停(1800)
      await 点击(按钮('复制Python代码'), '复制示例代码')
      await 点击("document.querySelector('textarea[aria-label=\"发送给智能助手的消息\"]')", '输入文件修改需求')
      await 文本输入('请把这份计划整理成三项行动建议。')
      await 暂停(600)
    })
    if (await 执行("Boolean(document.querySelector('.ant-drawer-open .ant-drawer-close'))")) await 点击("document.querySelector('.ant-drawer-open .ant-drawer-close')", '收起智能助手')
    await 暂停(700)
    await 点击("document.querySelector('.wps-global-tabs__home')", '回到首页')
    await 等待("Boolean(document.querySelector('button[aria-label=\"切换深浅模式\"]'))")
    await 点击(按钮('演示模板市场'), '打开演示模板市场')
    await 等待("document.querySelectorAll('.seal-market-tools button').length===3")
    await 录制('market', async () => {
      await 点击("document.querySelector('.seal-market-tools [data-tool=\"document\"]')", '查看文档生成演示')
      await 暂停(900)
      await 点击("[...document.querySelectorAll('.ant-modal')].find(项=>项.getClientRects().length>0).querySelector('.ant-modal-close')", '返回模板市场')
      await 暂停(600)
      await 执行("document.querySelector('.seal-market').parentElement.scrollTop=200")
      await 暂停(1000)
    })
    await 点击(按钮('知识库'), '打开知识库')
    await 等待("Boolean(document.querySelector('.seal-cloud-list .seal-cloud-card'))")
    await 录制('knowledge', async () => {
      await 点击(按钮('阅读与提问'), '阅读内置文件与备份指南')
      await 暂停(1800)
      await 点击(按钮('返回知识列表'), '返回原创指南')
      await 暂停(800)
    })
    await 点击(按钮('我的云空间'), '打开云空间入口')
    await 等待("Boolean(document.querySelector('.seal-cloud-empty'))")
    await 录制('cloud', async () => {
      await 暂停(1000)
      await 点击(按钮('登录并开通云空间'), '查看用户主动开通入口')
      await 暂停(1400)
      await 点击("[...document.querySelectorAll('.ant-modal')].find(项=>项.getClientRects().length>0).querySelector('.ant-modal-close')", '保持默认关闭，返回云空间')
      await 暂停(700)
    })
    await 录制('tools', async () => {
      await 点击("[...document.querySelectorAll('.wps-home-sidebar button')].find(项=>项.textContent.trim()==='日历') || [...document.querySelectorAll('button')].find(项=>项.textContent.trim()==='日历')", '查看本机日历')
      await 暂停(1400)
      await 点击("document.querySelector('.wps-global-tabs__home')", '回到首页')
      await 点击(按钮('切换深浅模式'), '切换深色外观')
      await 暂停(1400)
      await 点击(按钮('切换深浅模式'), '恢复浅色外观')
    })
    await 点击(标签('产品发布计划.docx'), '回到文字文档')
    await 录制('help', async () => {
      await 点击(按钮('帮助手册'), '打开帮助手册')
      await 等待("Boolean(document.querySelector('.help-manual--dialog'))")
      await 暂停(800)
      await 点击("document.querySelector('input[aria-label=\"搜索帮助内容\"]')", '搜索 PDF 操作')
      await 文本输入('PDF')
      await 暂停(700)
      await 点击("[...document.querySelectorAll('.help-manual__topic')].find(项=>项.textContent.includes('阅读和处理 PDF'))", '查看 PDF 操作步骤')
    })
    console.log('1.9.8 成品操作录制完成；助手恢复标明为示例的公开演示会话，未发送模型请求。')
  } finally { 连接.close() }
}
主程序().catch(错误 => { console.error(错误.message); process.exitCode = 1 })
