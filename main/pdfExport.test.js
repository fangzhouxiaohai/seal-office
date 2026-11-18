const { 打印选项, 渲染就绪脚本, 等待渲染就绪 } = require('./pdfExport')

describe('Word 转 PDF 的清晰度保障', () => {
  it('按 A4 版心打印且不缩放内容，页边距交由导出 HTML 的 @page 控制', () => {
    expect(打印选项).toMatchObject({
      pageSize: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      scale: 1,
    })
    // Electron 忽略 margins 数值并拒绝过大的自定义边距，边距统一由 @page 声明
    expect(打印选项.margins).toEqual({ marginType: 'none' })
  })

  it('等到字体和图片就绪并完成两帧绘制后才打印', () => {
    expect(渲染就绪脚本).toContain('document.fonts.ready')
    expect(渲染就绪脚本).toContain('document.images')
    expect(渲染就绪脚本).toContain('requestAnimationFrame')
  })

  it('字体就绪后立即返回，不额外等待固定时长', async () => {
    const 执行 = vi.fn(async () => true)
    await 等待渲染就绪({ webContents: { executeJavaScript: 执行 } }, 5000)
    expect(执行).toHaveBeenCalledOnce()
    expect(执行.mock.calls[0][0]).toBe(渲染就绪脚本)
  })

  it('页面脚本抛错时继续打印，不因等待失败中断导出', async () => {
    const 执行 = vi.fn(async () => { throw new Error('页面已销毁') })
    await expect(等待渲染就绪({ webContents: { executeJavaScript: 执行 } }, 5000)).resolves.toBeUndefined()
  })

  it('字体迟迟不就绪时按上限超时返回', async () => {
    const 执行 = vi.fn(() => new Promise(() => {}))
    const 开始 = Date.now()
    await 等待渲染就绪({ webContents: { executeJavaScript: 执行 } }, 50)
    expect(Date.now() - 开始).toBeGreaterThanOrEqual(40)
  })
})
