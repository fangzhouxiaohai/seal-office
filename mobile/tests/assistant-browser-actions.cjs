const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')

/** Real production UI + CDP touch events. Only account/model responses are isolated fixtures. */
module.exports = async ({ win, evaluate, output, checks }) => {
  const until = async (code, label) => { for (let n = 0; n < 100; n++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 80)) }; throw Error(label) }
  const ball = '.assistant-mobile-launcher', modal = '.assistant-mobile-modal', target = '[aria-label="助手目标文件"]'
  const visible = selector => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});return !!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'})()`
  const rect = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()`)
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const button = async text => evaluate(`(()=>{const b=[...document.querySelectorAll('.assistant-mobile-modal button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('按钮不可用：'+${JSON.stringify(text)});b.click()})()`)
  const send = async text => {
    await evaluate(`(()=>{const input=document.querySelector('.assistant-mobile-modal textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await until(`!document.querySelector('.assistant-mobile-modal .assistant-send').disabled`, '发送按钮必须可用')
    await click('.assistant-mobile-modal .assistant-send')
  }
  const select = value => evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(target)});s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  const scheme = await evaluate('location.protocol') === 'file:' ? 'file' : 'http'
  win.webContents.debugger.attach('1.3')
  const cdp = (method, params) => win.webContents.debugger.sendCommand(method, params)
  const size = async (width, height) => {
    win.setContentSize(width, height)
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await until(`innerWidth===${width}&&innerHeight===${height}&&parseFloat(document.documentElement.style.getPropertyValue('--seal-viewport-height'))===${height}`, '视口尺寸与 CSS 高度同步')
  }
  const touch = (type, x, y) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  const capture = async name => {
    await until(`!document.querySelector('.ant-zoom-enter,.ant-zoom-appear,.ant-zoom-leave')`, '截图等待弹窗动画结束')
    win.webContents.invalidate()
    await new Promise(resolve => setTimeout(resolve, 200))
    fs.writeFileSync(path.join(output, `${name}-${scheme}.png`), (await win.capturePage()).toPNG())
  }
  try {
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await size(390, 844)
    await until(visible(ball), '移动悬浮球必须显示')
    const start = await rect(ball)
    assert.equal(start.width, 56); assert.equal(start.height, 56)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${ball}')).borderRadius`), '50%')
    assert.equal(await evaluate(`!!document.querySelector('${ball} svg[aria-label="海豹办公"][viewBox="0 0 64 64"]')`), true, '生产构建的悬浮球必须显示海豹办公品牌 Logo')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${ball} svg')).pointerEvents`), 'none', 'Logo 不拦截按钮的触摸拖动')
    await capture('assistant-logo')
    checks.push('悬浮球使用海豹办公 Logo；品牌图形不拦截触摸事件')
    await touch('touchStart', start.x + 28, start.y + 28)
    for (let step = 1; step <= 8; step++) await touch('touchMove', start.x + 28 + (100 - start.x) * step / 8, start.y + 28 + (230 - start.y) * step / 8)
    await touch('touchEnd')
    await until(`Math.abs(document.querySelector('${ball}').getBoundingClientRect().x-100)<2`, '拖动必须移动悬浮球')
    assert.equal(await evaluate(visible(modal)), false, '拖动结束不能误触打开')
    assert.ok(await evaluate(`localStorage.getItem('seal.mobile.assistant.position.v1')`))
    checks.push('真实触摸拖动圆形悬浮球；不误触打开；位置持久化')
    const moved = await rect(ball)
    await touch('touchStart', moved.x + 28, moved.y + 28); await touch('touchEnd')
    await until(visible(modal), '轻触打开大弹窗')
    assert.equal(await evaluate(`document.querySelector('${target}').disabled`), true)
    assert.equal(await evaluate(`[...document.querySelectorAll('${modal} button')].find(b=>b.textContent==='工作模式').disabled`), true)
    const panel = await rect(modal)
    assert.ok(panel.width >= 350 && panel.right <= 390 && panel.bottom <= 844, '手机大弹窗完整显示在视口内')
    await evaluate(`window.dispatchEvent(new Event('seal-native-back',{cancelable:true}))`)
    await until(`!${visible(modal)}`, '原生返回键先关闭助手')
    assert.ok(await evaluate(visible('.wps-app')))
    checks.push('点击打开大弹窗；无文件禁用工作；原生返回先收起助手')

    await size(844, 390)
    await until(`document.querySelector('${ball}').getBoundingClientRect().bottom<=390`, '横屏重新约束球位置')
    await click(ball); await until(visible(modal), '横屏弹窗')
    await until(`(()=>{const r=document.querySelector('${modal}')?.getBoundingClientRect();return r&&r.right<=844&&r.bottom<=390})()`, '横屏弹窗边界')
    const landscape = await rect(modal)
    assert.ok(landscape.right <= 844 && landscape.bottom <= 390, JSON.stringify(landscape))
    await capture('assistant-landscape')
    const landscapeComposer = await rect(`${modal} .assistant-drawer__composer`)
    assert.ok(landscapeComposer.bottom <= 390, '横屏输入区和发送按钮必须完整可见：' + JSON.stringify(await evaluate(`['.ant-modal-content','.ant-modal-body','.assistant-drawer__layout','.assistant-mobile-controls','.assistant-drawer__work','.assistant-drawer__composer'].map(s=>{const e=document.querySelector('${modal} '+s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return {selector:s,top:r.top,bottom:r.bottom,height:r.height,flex:c.flex,minHeight:c.minHeight,padding:c.padding,overflow:c.overflow}})`)))
    await click(`${modal} .assistant-collapse`)
    await size(390, 844)
    await evaluate(`(()=>{
      window.__assistantRequests=[];window.__assistantIdentityAllowed=false;
      const api=window.electronAPI, original=api.cloud.invoke;
      api.cloud.invoke=(action,input)=>action==='requireAIIdentity'?Promise.resolve(window.__assistantIdentityAllowed?{成功:true,数据:{accountId:'isolated-browser-fixture',verified:true,method:'phone'}}:{成功:false,需要登录:true,code:'AI_IDENTITY_REQUIRED',错误:'请先登录完成手机号验证的账号'}):original(action,input);
      api.ai.getConfig=async()=>({成功:true,数据:{名称:'离线验收',地址:'https://example.invalid/chat',模型:'fixture',已配置密钥:false}});
      api.ai.getSession=async()=>({成功:true,数据:null});
      api.ai.updateSessionPlan=async()=>({成功:true});
      api.ai.chat=async input=>{window.__assistantRequests.push(input);return {成功:true,数据:{内容:input.只读对话?'这是隔离模型返回的问答；文件未改动。':JSON.stringify({回复:'请确认所选文件的修改。',修改:[{种类:'文字替换',查找:'文件甲正文',替换为:'文件甲已确认修改'}]})}}};
    })()`)
    await click(ball); await until(visible(modal), '普通问答弹窗')
    await send('登录前的草稿')
    await until(visible('.seal-login-modal'), '未登录必须显示原有账号入口')
    assert.equal(await evaluate('window.__assistantRequests.length'), 0, '未验证身份不能调用模型')
    assert.ok(await evaluate(`(()=>{const r=document.querySelector('.seal-login-modal').getBoundingClientRect();return !!document.elementFromPoint(r.left+r.width/2,r.top+40)?.closest('.seal-login-modal')})()`), '登录弹窗不能被助手遮挡')
    await evaluate(`window.dispatchEvent(new Event('seal-native-back',{cancelable:true}))`)
    await until(`!${visible('.seal-login-modal')}`, '原生返回先关闭登录框')
    assert.ok(await evaluate(visible(modal)), '取消登录保留助手和草稿')
    assert.equal(await evaluate(`document.querySelector('${modal} textarea').value`), '登录前的草稿')
    await evaluate('window.__assistantIdentityAllowed=true')
    checks.push('未登录不调用模型；登录弹窗可见；取消登录保留助手草稿')
    await send('一般问答测试')
    await until(`window.__assistantRequests.length===1`, '只读请求必须发送')
    const general = await evaluate('window.__assistantRequests[0]')
    assert.equal(general.只读对话, true); assert.equal(general.文档上下文, '')
    await click(`${modal} .assistant-collapse`)
    checks.push('横竖屏边界与全窗口弹窗；无文件发送只读一般问答')

    const create = async text => {
      await click('[aria-label="服务"]')
      await until(visible('.seal-mobile-create [data-document-type="word"]'), '新建文字入口')
      await click('.seal-mobile-create [data-document-type="word"]')
      await until(visible('.wps-editor-canvas__content[contenteditable="true"]'), '真实编辑器')
      await evaluate(`(()=>{const e=document.querySelector('.wps-editor-canvas__content[contenteditable="true"]');e.focus();e.innerHTML='<p>'+${JSON.stringify(text)}+'</p>';e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(text)}}));e.blur()})()`)
      await click(ball); await until(visible(target), '当前文件选择')
      const id = await evaluate(`document.querySelector('${target}').value`)
      await click(`${modal} .assistant-collapse`)
      return id
    }
    const first = await create('文件甲正文'), second = await create('文件乙正文')
    await click(ball); await until(visible(modal), '打开多文件助手')
    assert.equal(await evaluate(`document.querySelector('${target}').value`), second)
    await select(first); await send('总结所选文件')
    await until(`window.__assistantRequests.length===2`, '文件问答')
    const question = await evaluate('window.__assistantRequests[1]')
    assert.equal(question.只读对话, true); assert.ok(question.文档上下文.includes('文件甲正文')); assert.ok(!question.文档上下文.includes('文件乙正文'))
    await until(`![...document.querySelectorAll('${modal} button')].find(b=>b.textContent==='工作模式').disabled`, '任务结束后切换模式')
    await button('工作模式'); await send('修改所选文件')
    await until(`!![...document.querySelectorAll('${modal} button')].find(b=>b.textContent==='应用修改')`, '工作模式必须先显示修改预览')
    await button('应用修改')
    await until(`![...document.querySelectorAll('${modal} button')].find(b=>b.textContent==='应用修改')`, '确认修改完成')
    await click(`${modal} .assistant-collapse`)
    assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content').textContent`), '文件乙正文', '后台当前文件乙不能被误改')
    await evaluate(`document.querySelector('.wps-global-tab__select').click()`)
    await until(`document.querySelector('.wps-editor-canvas__content')?.textContent==='文件甲已确认修改'`, '仅所选文件甲应用修改')
    checks.push('默认当前文件；指定另一文件问答；确认后只修改指定文件')

    await click(ball); await until(visible(modal), '最终助手布局')
    await until(`document.querySelector('${target}').value===${JSON.stringify(first)}`, '截图对应当前文件')
    await until(`!document.querySelector('.ant-message-notice')`, '截图等待保存提示结束')
    assert.equal(await evaluate(`!!document.querySelector('.ant-modal-confirm-error')`), false, '成功应用候选后不能出现错误弹窗')
    await capture('assistant-mobile')
    await evaluate(`document.querySelector('${modal} textarea').focus()`)
    // CDP keyboard geometry, not an assertion of an APK/real IME installation.
    await size(390, 460)
    await until(`document.documentElement.classList.contains('seal-keyboard-open')`, '键盘收缩识别')
    const composer = await rect(`${modal} .assistant-drawer__composer`)
    assert.ok(composer.y >= 0 && composer.bottom <= 460, '软键盘出现后输入和发送不能被遮挡')
    await capture('assistant-keyboard')
    await size(390, 844)
    await click(`${modal} .assistant-collapse`)
    const beforeReload = await rect(ball)
    win.webContents.reload()
    await until(visible(ball), '重载后恢复悬浮球')
    const afterReload = await rect(ball)
    assert.ok(Math.abs(beforeReload.x - afterReload.x) < 2 && Math.abs(beforeReload.y - afterReload.y) < 2, '恢复相同视口内的拖动位置')
    checks.push('键盘收缩后输入区和发送按钮可见；重启恢复悬浮球位置')
  } finally { win.webContents.debugger.detach() }
}
