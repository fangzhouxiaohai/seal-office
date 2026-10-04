const fs = require('fs')
const path = require('path')
const { once } = require('events')

const [页面端口, 主端口, 数据目录, 注册表位置, 阶段, 报告路径, 截图目录 = ''] = process.argv.slice(2)
const 等待片刻 = 毫秒 => new Promise(完成 => setTimeout(完成, 毫秒))
const 连接列表 = [], 核验 = []
const 检查 = (条件, 说明) => { if (!条件) throw new Error(说明); 核验.push(说明) }

async function 连接(端口, 选择) {
  let 入口
  for (let 次数 = 0; 次数 < 120; 次数++) {
    try { 入口 = (await (await fetch(`http://127.0.0.1:${端口}/json/list`)).json()).find(选择) } catch {}
    if (入口) break
    await 等待片刻(100)
  }
  if (!入口) throw new Error('成品调试入口未就绪')
  const 通道 = new WebSocket(入口.webSocketDebuggerUrl)
  连接列表.push(通道)
  await once(通道, 'open')
  let 序号 = 0
  const 任务列表 = new Map()
  通道.addEventListener('message', 事件 => {
    const 响应 = JSON.parse(String(事件.data)), 任务 = 任务列表.get(响应.id)
    if (!任务) return
    任务列表.delete(响应.id); clearTimeout(任务.超时)
    if (响应.error || 响应.result?.exceptionDetails) 任务.拒绝(new Error(响应.error?.message || 响应.result.exceptionDetails.exception?.description || '成品核验表达式异常'))
    else 任务.完成(响应.result)
  })
  return {
    执行: 表达式 => new Promise((完成, 拒绝) => {
      const id = ++序号, 超时 = setTimeout(() => { 任务列表.delete(id); 拒绝(new Error('成品核验调用超时')) }, 20000)
      任务列表.set(id, { 完成: 结果 => 完成(结果.result.value), 拒绝, 超时 })
      通道.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: 表达式, awaitPromise: true, returnByValue: true } }))
    }),
  }
}

async function 验收() {
  const 主 = await 连接(主端口, 项 => Boolean(项.webSocketDebuggerUrl))
  const 页面 = await 连接(页面端口, 项 => 项.url.endsWith('/dist/index.html'))
  const 执行 = 页面.执行
  const 等待 = async 表达式 => {
    const 截止 = Date.now() + 20000
    while (Date.now() < 截止) {
      if (await 执行(表达式)) return
      const 错误 = await 执行("document.querySelector('.ant-modal-confirm-error .ant-modal-confirm-content')?.textContent")
      if (错误) throw new Error('成品错误弹窗：' + 错误)
      await 等待片刻(100)
    }
    throw new Error('成品未达到预期状态：' + 表达式)
  }
  const 找按钮 = 名称 => `[...document.querySelectorAll('button')].find(项=>项.textContent.trim()===${JSON.stringify(名称)}||项.getAttribute('aria-label')===${JSON.stringify(名称)})`
  const 点击 = async 名称 => { await 等待(`Boolean(${找按钮(名称)})&&!(${找按钮(名称)}).disabled`); await 执行(`(${找按钮(名称)}).click()`); await 等待片刻(120) }
  const 截图 = async 名称 => {
    if (!截图目录) return
    fs.mkdirSync(截图目录, { recursive: true })
    await 等待("document.fonts.status==='loaded'"); await 等待片刻(300)
    await 主.执行(`(async()=>{const 图=await globalThis.验收窗口.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});if(图.isEmpty())throw new Error('成品截图为空');process.mainModule.require('fs').writeFileSync(${JSON.stringify(path.join(截图目录, 名称 + '.png'))},图.toPNG());return 图.getSize()})()`)
  }
  try {
    await 等待("Boolean(document.querySelector('.wps-titlebar'))")
    const 初始 = await 执行('window.electronAPI.checkDefaultAppPrompt()')
    检查(初始.成功 && !初始.需要询问, '未安装成品不触发安装后首次询问')
    const 安装 = await 主.执行(`(async()=>{
      const electron=process.mainModule.require('electron'),fs=process.mainModule.require('fs'),path=process.mainModule.require('path')
      globalThis.验收窗口=electron.BrowserWindow.getAllWindows().find(项=>项.webContents.getURL().endsWith('/dist/index.html'))
      globalThis.验收窗口.unmaximize();globalThis.验收窗口.setBounds({x:40,y:40,width:1440,height:900})
      const script=path.join(process.resourcesPath,'shell-integration','shellIntegration.ps1')
      const templates=path.join(process.resourcesPath,'shell-new')
      const 模块=process.mainModule.require(path.join(electron.app.getAppPath(),'main','windows','defaultApps.js'))
      globalThis.验收程序路径=模块.获取关联程序路径(electron.app.isPackaged,electron.app.getPath('exe'))
      globalThis.验收关联调用=[];globalThis.验收默认地址=[]
      globalThis.验收关联执行=async action=>{
        globalThis.验收关联调用.push(action)
        const 输出=await new Promise((resolve,reject)=>process.mainModule.require('child_process').execFile(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Action',action,'-ExecutableFile',globalThis.验收程序路径,'-Templates',templates,'-TestRoot',${JSON.stringify(注册表位置)}],{windowsHide:true,timeout:30000,encoding:'utf8'},(error,stdout,stderr)=>error?reject(new Error(stdout||stderr||error.message)):resolve(stdout)))
        const 结果=JSON.parse(输出.replace(/^\\uFEFF/,'').trim());if(!结果.成功)throw new Error(结果.错误);return 结果
      }
      if(${JSON.stringify(阶段)}==='confirm')await globalThis.验收关联执行('Uninstall')
      await globalThis.验收关联执行('Install')
      globalThis.验收默认服务=模块.创建默认程序服务({已打包:electron.app.isPackaged,可执行文件:globalThis.验收程序路径,数据目录:electron.app.getPath('userData'),资源目录:process.resourcesPath,执行注册:globalThis.验收关联执行,打开地址:async 地址=>{globalThis.验收默认地址.push(地址)}})
      for(const 名称 of ['system.checkDefaultAppPrompt','system.setDefaultApp'])electron.ipcMain.removeHandler(名称)
      electron.ipcMain.handle('system.checkDefaultAppPrompt',()=>globalThis.验收默认服务.检查首次提示())
      electron.ipcMain.handle('system.setDefaultApp',()=>globalThis.验收默认服务.设置默认程序())
      electron.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.验收打开路径]})
      const 字节一致=fs.readFileSync(script).equals(fs.readFileSync(path.join(electron.app.getAppPath(),'main','windows','shellIntegration.ps1')))
      return {安装:await globalThis.验收关联执行('GetInstallation'),字节一致,路径正确:globalThis.验收程序路径===(process.env.PORTABLE_EXECUTABLE_FILE||electron.app.getPath('exe')),模板:fs.readdirSync(templates).filter(名称=>名称.startsWith('blank.'))}
    })()`)
    检查(安装.字节一致 && 安装.模板.length === 7, '打包注册组件与七种模板完整')
    检查(安装.安装.已安装, '真实隔离注册表安装成功')
    检查(安装.路径正确, '默认程序路径指向持久启动文件，便携版不指向临时目录')
    await 执行('location.reload()')
    await 等待("Boolean(document.querySelector('.wps-titlebar'))")
    if (阶段 === 'repeat') {
      await 等待片刻(1800)
      检查(!await 执行("Boolean(document.querySelector('.ant-modal'))"), '取消后真实进程重启不再弹窗')
      const 调用 = await 主.执行('globalThis.验收关联调用')
      检查(!调用.includes('InspectDefaults'), '后续启动不重复查询默认状态')
    } else {
      await 等待("document.querySelector('.ant-modal-title')?.textContent==='将海豹办公设为默认程序'")
      检查(true, 阶段 === 'confirm' ? '重新安装新标识恢复一次首次询问' : '首次安装非默认显示自定义确认弹窗')
      await 截图('first-launch-default-app')
      await 点击(阶段 === 'confirm' ? '设为默认程序' : '暂不设置')
      await 等待("!document.querySelector('.ant-modal')")
      const 地址 = await 主.执行('globalThis.验收默认地址')
      检查(阶段 === 'confirm' ? 地址.length === 1 && 地址[0] === 'ms-settings:defaultapps?registeredAppUser=SealOffice' : 地址.length === 0, 阶段 === 'confirm' ? '确认完成真实应用注册并交给系统专属页面' : '取消没有执行设置默认程序动作')
      const 后续 = await 执行('window.electronAPI.checkDefaultAppPrompt()')
      检查(后续.成功 && !后续.需要询问, '首次选择后不再主动询问')
    }
    if (阶段 === 'confirm') {
      await 点击('全局设置')
      await 等待("Boolean([...document.querySelectorAll('[role=menuitem]')].find(项=>项.textContent.trim()==='设置'))")
      await 执行("[...document.querySelectorAll('[role=menuitem]')].find(项=>项.textContent.trim()==='设置').click()")
      await 等待(`Boolean(${找按钮('设为默认程序')})`)
      await 执行(`(${找按钮('设为默认程序')}).scrollIntoView({block:'center'})`)
      await 截图('settings-default-app')
      await 点击('设为默认程序')
      await 等待(`Boolean(${找按钮('设为默认程序')})&&!(${找按钮('设为默认程序')}).disabled`)
      检查((await 主.执行('globalThis.验收默认地址')).length === 2, '设置中心默认程序按钮链路正常')
      for (const 扩展 of ['docx', 'xlsx', 'pptx', 'pdf']) {
        const 名称 = `新建空白.${扩展}`, 文件 = path.join(数据目录, 名称)
        await 主.执行(`process.mainModule.require('fs').copyFileSync(process.mainModule.require('path').join(process.resourcesPath,'shell-new',${JSON.stringify('blank.' + 扩展)}),${JSON.stringify(文件)});globalThis.验收打开路径=${JSON.stringify(文件)};true`)
        await 执行("document.querySelector('.wps-global-tabs__home').click()")
        await 点击('打开'); await 等待(`document.querySelector('.wps-titlebar__doc')?.textContent===${JSON.stringify(名称)}`)
        await 等待片刻(300)
        检查(!await 执行("Boolean(document.querySelector('.ant-modal'))||Boolean(document.querySelector('.wps-global-tab--active .wps-global-tab__dirty'))"), `${扩展} 真实空白模板打开无警告且未误标修改`)
        if (扩展 !== 'pdf') {
          await 点击('保存'); await 等待("!document.querySelector('.wps-global-tab--active .wps-global-tab__dirty')")
          检查(!await 执行("Boolean(document.querySelector('.ant-modal'))"), `${扩展} 空白模板保存成功`)
          await 点击(`关闭 ${名称}`)
          await 执行("document.querySelector('.wps-global-tabs__home').click()")
          await 点击('打开'); await 等待(`document.querySelector('.wps-titlebar__doc')?.textContent===${JSON.stringify(名称)}`)
          检查(!await 执行("Boolean(document.querySelector('.ant-modal'))||Boolean(document.querySelector('.wps-global-tab--active .wps-global-tab__dirty'))"), `${扩展} 保存重开无导入及未保存误报`)
        }
      }
    }
    const 信息 = await 执行('window.electronAPI.getAppInfo()'), 完整性 = await 执行('window.electronAPI.checkIntegrity()')
    检查(完整性.成功 && 完整性.完整, '最终成品完整性校验通过')
    检查(await 执行("document.querySelectorAll('.wps-global-tab__dirty').length===0"), '成品退出前无未保存误报')
    fs.writeFileSync(报告路径, JSON.stringify({ 版本: 信息.版本, 阶段, 数量: 核验.length, 核验, 完整性, 说明: '关联注册与默认查询使用真实系统接口和独立测试注册表；系统设置地址由验收拦截记录，没有改变用户受保护的默认程序。' }, null, 2))
    console.log(JSON.stringify({ 阶段, 数量: 核验.length, 结果: '通过' }))
    await 主.执行('setTimeout(()=>globalThis.验收窗口.close(),300);true')
  } finally { for (const 通道 of 连接列表) 通道.close() }
}
验收().catch(错误 => { console.error(错误.message); process.exitCode = 1 })
