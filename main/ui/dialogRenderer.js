void (async () => {
  const 内容 = await window.应用弹窗.读取()
  if (!内容) throw new Error('无法读取退出确认内容')
  for (const [名称, 值] of Object.entries(内容.颜色 || {})) if (值) document.documentElement.style.setProperty(`--${名称}`, 值)
  document.getElementById('标题').textContent = 内容.标题
  document.getElementById('原因').textContent = 内容.原因
  document.getElementById('说明').textContent = 内容.说明
  const 选择 = async (序号) => {
    for (const 按钮 of document.querySelectorAll('button')) 按钮.disabled = true
    try {
      const 结果 = await window.应用弹窗.选择(序号)
      if (!结果?.成功) throw new Error('退出确认请求已失效，请关闭弹窗后重试')
    } catch (错误) {
      document.getElementById('说明').textContent = 错误 instanceof Error ? 错误.message : '退出确认失败，请重试'
      for (const 按钮 of document.querySelectorAll('button')) 按钮.disabled = false
    }
  }
  for (const [序号, 标签] of 内容.按钮.entries()) {
    const 按钮 = document.createElement('button')
    按钮.type = 'button'
    按钮.textContent = 标签
    按钮.className = `seal-dialog-button${序号 === 内容.取消选择 ? '' : ' seal-dialog-button--danger'}`
    按钮.addEventListener('click', () => { void 选择(序号) })
    document.getElementById('按钮').append(按钮)
    if (序号 === 内容.默认选择) 按钮.focus()
  }
  document.getElementById('关闭').addEventListener('click', () => { void 选择(内容.取消选择) })
  document.addEventListener('keydown', (事件) => {
    if (事件.key === 'Escape') { 事件.preventDefault(); void 选择(内容.取消选择) }
    if (事件.key !== 'Tab') return
    const 按钮 = [...document.querySelectorAll('button:not(:disabled)')]
    if (!按钮.length) return
    if (事件.shiftKey && document.activeElement === 按钮[0]) { 事件.preventDefault(); 按钮.at(-1).focus() }
    else if (!事件.shiftKey && document.activeElement === 按钮.at(-1)) { 事件.preventDefault(); 按钮[0].focus() }
  })
})().catch((错误) => {
  document.getElementById('原因').textContent = 错误 instanceof Error ? 错误.message : '确认弹窗无法加载'
  document.getElementById('说明').textContent = '当前窗口已保留。请关闭此弹窗，检查内容并保存文件后再退出。'
  document.getElementById('关闭').addEventListener('click', () => window.close())
})
