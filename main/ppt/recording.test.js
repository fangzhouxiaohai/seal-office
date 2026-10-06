const path = require('path')
const os = require('os')
const fs = require('fs')
const { 创建录制服务 } = require('./recording')

const 临时目录 = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seal-recording-'))

describe('录制服务', () => {
  it('列出屏幕与窗口捕获源并带上真实类型与缩略图', async () => {
    const 捕获源 = vi.fn(async ({ types, thumbnailSize }) => {
      expect(types).toEqual(['screen', 'window'])
      expect(thumbnailSize.width).toBeGreaterThan(0)
      return [
        { id: 'screen:0:0', name: '整个屏幕', display_id: '1', thumbnail: { toDataURL: () => 'data:image/png;base64,AAAA' } },
        { id: 'window:123:0', name: '记事本', display_id: '', thumbnail: { isEmpty: () => true, toDataURL: () => { throw new Error('空缩略图不应被转换') } } },
      ]
    })
    const 服务 = 创建录制服务({ 捕获源 })
    const 结果 = await 服务.列出捕获源(['screen', 'window'])
    expect(结果.源列表).toEqual([
      { 标识: 'screen:0:0', 名称: '整个屏幕', 类型: 'screen', 显示器标识: '1', 缩略图: 'data:image/png;base64,AAAA' },
      { 标识: 'window:123:0', 名称: '记事本', 类型: 'window', 显示器标识: '', 缩略图: '' },
    ])
  })

  it('拒绝非法捕获类型与非数组输入', async () => {
    const 服务 = 创建录制服务({ 捕获源: vi.fn() })
    await expect(服务.列出捕获源(['camera'])).rejects.toThrow('捕获类型')
    await expect(服务.列出捕获源('screen')).rejects.toThrow('捕获类型')
  })

  it('缺少桌面捕获能力时给出真实原因', async () => {
    const 服务 = 创建录制服务({ 捕获源: null })
    await expect(服务.列出捕获源(['screen'])).rejects.toThrow('桌面捕获')
  })

  it('默认捕获源把调用参数原样传给 desktopCapturer，不使用空选项', async () => {
    const getSources = vi.fn(async () => [])
    const 服务 = 创建录制服务({ 取模块: () => ({ desktopCapturer: { getSources } }) })
    await 服务.列出捕获源(['screen', 'window'])
    expect(getSources).toHaveBeenCalledTimes(1)
    expect(getSources.mock.calls[0][0]).toMatchObject({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
  })

  it('运行环境缺少 desktopCapturer 时报告真实原因', async () => {
    const 服务 = 创建录制服务({ 取模块: () => ({}) })
    await expect(服务.列出捕获源(['screen'])).rejects.toThrow('不支持桌面捕获')
  })

  it('保存 WebM 录制使用原子写入并报告真实字节数', async () => {
    const 目录 = 临时目录()
    const 字节 = Buffer.from('webm-bytes')
    const 服务 = 创建录制服务({ 选择保存路径: async () => path.join(目录, '演示录制.webm') })
    const 结果 = await 服务.保存录制({ 数据: 字节.toString('base64'), 格式: 'webm', 建议名: '演示录制' })
    expect(结果.路径).toBe(path.join(目录, '演示录制.webm'))
    expect(结果.字节数).toBe(字节.length)
    expect(fs.readFileSync(结果.路径)).toEqual(字节)
    expect(fs.readdirSync(目录).filter(名 => 名.includes('part'))).toEqual([])
  })

  it('MP4 未通过编码与授权验证时拒绝保存并说明原因', async () => {
    const 服务 = 创建录制服务({ 选择保存路径: async () => 'E:\\Temp\\录制.mp4' })
    await expect(服务.保存录制({ 数据: Buffer.from('x').toString('base64'), 格式: 'mp4', 建议名: '录制' })).rejects.toThrow('MP4')
  })

  it('校验编码数据、大小限制与空录制', async () => {
    const 服务 = 创建录制服务({ 选择保存路径: async () => 'E:\\Temp\\录制.webm', 最大字节: 4 })
    await expect(服务.保存录制({ 数据: '!!!', 格式: 'webm', 建议名: '录制' })).rejects.toThrow('编码')
    await expect(服务.保存录制({ 数据: '', 格式: 'webm', 建议名: '录制' })).rejects.toThrow('空')
    await expect(服务.保存录制({ 数据: Buffer.from('12345').toString('base64'), 格式: 'webm', 建议名: '录制' })).rejects.toThrow('大小限制')
  })

  it('用户取消保存时明确返回取消状态，不产生文件', async () => {
    const 目录 = 临时目录()
    const 服务 = 创建录制服务({ 选择保存路径: async () => null })
    const 结果 = await 服务.保存录制({ 数据: Buffer.from('webm').toString('base64'), 格式: 'webm', 建议名: '录制' })
    expect(结果).toEqual({ 已取消: true })
    expect(fs.readdirSync(目录)).toEqual([])
  })

  it('磁盘写入失败时清理半成品并返回真实错误', async () => {
    const 目录 = 临时目录()
    const 存储 = {
      writeFile: async () => { throw Object.assign(new Error('磁盘已满'), { code: 'ENOSPC' }) },
      rename: fs.promises.rename,
      unlink: fs.promises.unlink,
    }
    const 服务 = 创建录制服务({ 选择保存路径: async () => path.join(目录, '失败.webm'), 存储 })
    await expect(服务.保存录制({ 数据: Buffer.from('webm').toString('base64'), 格式: 'webm', 建议名: '失败' })).rejects.toThrow('磁盘已满')
    expect(fs.readdirSync(目录)).toEqual([])
  })

  it('建议名过滤路径分隔符并补齐扩展名', async () => {
    const 目录 = 临时目录()
    let 收到建议名 = ''
    const 服务 = 创建录制服务({ 选择保存路径: async (建议名) => { 收到建议名 = 建议名; return path.join(目录, 建议名) } })
    await 服务.保存录制({ 数据: Buffer.from('webm').toString('base64'), 格式: 'webm', 建议名: '../../坏:名字' })
    expect(收到建议名.endsWith('.webm')).toBe(true)
    expect(收到建议名.includes('/')).toBe(false)
    expect(收到建议名.includes('\\')).toBe(false)
    expect(收到建议名.includes(':')).toBe(false)
  })

  it('超大录制内容按大小限制快速拒绝，不在编码校验上回溯崩溃', async () => {
    const 服务 = 创建录制服务({ 选择保存路径: async () => 'E:\\Temp\\大录制.webm', 最大字节: 1024 })
    const 大内容 = Buffer.alloc(9 * 1024 * 1024).toString('base64')
    await expect(服务.保存录制({ 数据: 大内容, 格式: 'webm', 建议名: '大录制' })).rejects.toThrow('大小限制')
  })

  it('读取支持情况如实标注 WebM 可用、MP4 未开放', () => {
    const 服务 = 创建录制服务({})
    expect(服务.读取支持情况()).toMatchObject({ WebM: true, MP4: false, MP4原因: expect.stringContaining('MP4') })
  })
})
