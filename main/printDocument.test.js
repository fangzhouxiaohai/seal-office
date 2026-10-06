const fs = require('fs')
const { 打印文档 } = require('./printDocument')

describe('打印主进程链路', () => {
  it('加载独立打印文档、等待字体、收到回调后清理临时文件', async () => {
    let 文件路径 = ''
    let 已销毁 = false
    class 测试窗口 {
      webContents = {
        executeJavaScript: vi.fn(async () => true),
        print: vi.fn((_选项, 回调) => 回调(true)),
      }
      async loadFile(路径) { 文件路径 = 路径; expect(fs.readFileSync(路径, 'utf8')).toContain('打印测试') }
      isDestroyed() { return 已销毁 }
      destroy() { 已销毁 = true }
    }
    expect(await 打印文档('<html><body>打印测试</body></html>', 'html', 测试窗口)).toEqual({ 成功: true })
    expect(已销毁).toBe(true)
    expect(fs.existsSync(文件路径)).toBe(false)
  })

  it('用户取消和无效输入不报告为打印成功', async () => {
    class 取消窗口 {
      webContents = { print: (_选项, 回调) => 回调(false, 'Print job canceled') }
      async loadFile() {}
      isDestroyed() { return false }
      destroy() {}
    }
    expect(await 打印文档(Buffer.from('%PDF-1.4').toString('base64'), 'pdf', 取消窗口)).toMatchObject({ 成功: false, 已取消: true })
    expect(await 打印文档('', 'html', 取消窗口)).toMatchObject({ 成功: false, 错误: '打印内容无效' })
  })
})
