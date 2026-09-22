// 临时脚本：验证表格键盘操作与列宽拖动。验证后删除。
const 调试地址 = 'http://127.0.0.1:9222'
const 目标 = (await (await fetch(`${调试地址}/json`)).json()).find((项) => 项.type === 'page')
const 套接字 = new WebSocket(目标.webSocketDebuggerUrl)
let 序号 = 0
const 等待中 = new Map()
套接字.addEventListener('message', (事件) => {
  const 消息 = JSON.parse(事件.data)
  if (消息.id && 等待中.has(消息.id)) {
    等待中.get(消息.id)(消息)
    等待中.delete(消息.id)
  }
})
const 发送 = (方法, 参数 = {}) =>
  new Promise((解决) => {
    const id = ++序号
    等待中.set(id, 解决)
    套接字.send(JSON.stringify({ id, method: 方法, params: 参数 }))
  })
await new Promise((解决) => 套接字.addEventListener('open', 解决))
const 求值 = async (表达式) =>
  (await 发送('Runtime.evaluate', { expression: 表达式, returnByValue: true, awaitPromise: true }))
    .result?.result?.value
const 等待 = (毫秒) => new Promise((解决) => setTimeout(解决, 毫秒))
const 按键 = async (键) => {
  await 求值(`(() => {
    const 网格 = document.querySelector('.wps-sheet')
    网格.focus()
    网格.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(键)}, bubbles: true }))
  })()`)
  await 等待(500)
}
const 名称框 = async () => 求值(`document.querySelector('.wps-sheet-toolbar__name')?.value`)

await 发送('Page.enable')
await 求值(`document.querySelector('.wps-editor__back')?.click()`)
await 等待(1000)
await 求值(`(() => {
  const 卡片 = Array.from(document.querySelectorAll('.wps-new-card__label')).find((元素) => 元素.textContent.trim() === '新建表格')
  卡片?.click()
})()`)
await 等待(1800)
console.log(`初始选区：${await 名称框()}`)

console.log('--- 方向键 ---')
await 按键('ArrowRight')
console.log(`右移后：${await 名称框()}`)
await 按键('ArrowDown')
console.log(`下移后：${await 名称框()}`)
await 按键('ArrowLeft')
await 按键('ArrowUp')
console.log(`回到：${await 名称框()}`)

console.log('--- 回车进入编辑 ---')
await 按键('Enter')
console.log(`编辑态：${await 求值(`!!document.querySelector('.wps-sheet__editor')`)}`)
await 求值(`(() => {
  const 输入 = document.querySelector('.wps-sheet__editor')
  输入?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
})()`)
await 等待(600)
console.log(`取消后编辑态：${await 求值(`!!document.querySelector('.wps-sheet__editor')`)}`)

console.log('--- 直接输入字符 ---')
await 按键('8')
console.log(`编辑态：${await 求值(`!!document.querySelector('.wps-sheet__editor')`)}`)
console.log(`预填内容：${await 求值(`document.querySelector('.wps-sheet__editor')?.value`)}`)
await 求值(`(() => {
  const 输入 = document.querySelector('.wps-sheet__editor')
  输入?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
})()`)
await 等待(800)
console.log(`提交后 A1：${await 求值(`document.querySelector('[data-地址="A1"]')?.textContent`)}`)

console.log('--- Delete 清空 ---')
await 按键('Delete')
console.log(`清空后 A1：${await 求值(`document.querySelector('[data-地址="A1"]')?.textContent`)}`)

console.log('--- 列宽拖动 ---')
const 拖动前 = await 求值(`document.querySelector('.wps-sheet')?.style.gridTemplateColumns`)
console.log(`拖动前模板：${拖动前?.slice(0, 40)}`)
await 求值(`(() => {
  const 手柄 = document.querySelector('.wps-sheet__col-resizer')
  const 矩形 = 手柄.getBoundingClientRect()
  手柄.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 矩形.left }))
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 矩形.left + 60 }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
})()`)
await 等待(900)
const 拖动后 = await 求值(`document.querySelector('.wps-sheet')?.style.gridTemplateColumns`)
console.log(`拖动后模板：${拖动后?.slice(0, 40)}`)
console.log(`列宽是否变化：${拖动前 !== 拖动后}`)

套接字.close()
console.log('键盘与列宽验证完成')
