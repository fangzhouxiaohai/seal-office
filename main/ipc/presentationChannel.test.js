const { 注册演示通道 } = require('./presentationChannel')
const { 创建资源存储 } = require('../ppt/resources')

describe('演示资源通道', () => {
  it('实际通道释放文稿和历史后能插入新资源，不残留总容量占用', () => {
    const 处理 = new Map()
    const 资源 = 创建资源存储({ 最大单项字节: 4, 最大总字节: 4 })
    注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 资源)
    const 调用 = (名称, ...参数) => 处理.get(名称)(null, ...参数)
    const 首次 = 调用('presentation.resource.add', 'MTIzNA==', 'application/octet-stream')
    调用('presentation.resource.sync', '文稿', [首次.标识])
    调用('presentation.resource.sync', '历史', [首次.标识])
    调用('presentation.resource.dropTemporary', 首次.标识)
    调用('presentation.resource.release', '文稿')
    expect(调用('presentation.resource.read', 首次.标识).成功).toBe(true)
    调用('presentation.resource.release', '历史')
    expect(调用('presentation.resource.read', 首次.标识).成功).toBe(false)
    expect(调用('presentation.resource.add', 'NTY3OA==', 'application/octet-stream').成功).toBe(true)
  })
  it('校验输入并返回真实失败原因', async () => {
    const 处理 = new Map()
    const 资源 = {
      加入: vi.fn(() => '指纹'),
      读取: vi.fn(() => Buffer.from('abcd')),
      解除引用: vi.fn(),
      同步快照: vi.fn(), 释放快照: vi.fn(), 导出: vi.fn(() => []), 恢复: vi.fn(),
    }
    注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 资源)
    const 调用 = (名称, ...参数) => 处理.get(名称)(null, ...参数)
    expect(调用('presentation.resource.add', '!!!', 'image/png')).toMatchObject({ 成功: false, 错误: expect.stringContaining('格式') })
    expect(资源.加入).not.toHaveBeenCalled()
    expect(调用('presentation.resource.add', Buffer.from('abcd').toString('base64'), 'image/png')).toMatchObject({ 成功: false, 错误: expect.stringContaining('图片') })
    expect(调用('presentation.resource.add', Buffer.from('abcd').toString('base64'), 'application/octet-stream')).toMatchObject({ 成功: true, 标识: '指纹', 字节数: 4 })
    expect(调用('presentation.resource.read', '指纹')).toMatchObject({ 成功: true, 数据: Buffer.from('abcd').toString('base64') })
    expect(调用('presentation.resource.dropTemporary', '指纹')).toMatchObject({ 成功: true })
    expect(资源.解除引用).toHaveBeenCalledWith('指纹')
    expect(调用('presentation.resource.sync', '文稿一', ['指纹', '指纹'])).toMatchObject({ 成功: true })
    expect(资源.同步快照).toHaveBeenCalledWith('文稿一', ['指纹', '指纹'])
    资源.导出.mockImplementation(() => { throw new Error('资源字节缺失') })
    expect(调用('presentation.resource.export', ['指纹'])).toMatchObject({ 成功: false, 错误: '资源字节缺失' })
  })
})

describe('截屏、录屏与识别通道', () => {
  const 建通道 = (服务) => {
    const 处理 = new Map()
    注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 创建资源存储(), 服务)
    return (名称, ...参数) => 处理.get(名称)(null, ...参数)
  }

  it('缺少录屏与识别服务时返回真实原因而不是空结果', async () => {
    const 调用 = 建通道({})
    expect(await 调用('presentation.capture.sources', ['screen'])).toMatchObject({ 成功: false, 错误: expect.stringContaining('录屏') })
    expect(await 调用('presentation.recording.support')).toMatchObject({ 成功: false, 错误: expect.stringContaining('录屏') })
    expect(await 调用('presentation.recognition.status')).toMatchObject({ 成功: false, 错误: expect.stringContaining('识别') })
    expect(await 调用('presentation.recognition.recognize', 'AAAA', 'image/png')).toMatchObject({ 成功: false, 错误: expect.stringContaining('识别') })
  })

  it('转发捕获源、录制保存、支持情况与识别结果', async () => {
    const 录制服务 = {
      列出捕获源: vi.fn(async (类型) => ({ 源列表: [{ 标识: 'screen:0:0', 类型: 类型[0] }] })),
      保存录制: vi.fn(async () => ({ 路径: 'E:\\Temp\\录制.webm', 字节数: 12 })),
      读取支持情况: vi.fn(() => ({ WebM: true, MP4: false, MP4原因: '未开放' })),
    }
    const 识别服务 = {
      读取状态: vi.fn(async () => ({ 可用: true, 模型: 'vision-1' })),
      识别: vi.fn(async () => ({ 文本: '识别文字' })),
    }
    const 调用 = 建通道({ 录制服务, 识别服务 })
    expect(await 调用('presentation.capture.sources', ['screen'])).toMatchObject({ 成功: true, 源列表: [{ 标识: 'screen:0:0' }] })
    expect(await 调用('presentation.recording.save', 'AAAA', 'webm', '录制')).toMatchObject({ 成功: true, 路径: 'E:\\Temp\\录制.webm' })
    expect(await 调用('presentation.recording.support')).toMatchObject({ 成功: true, WebM: true, MP4: false })
    expect(await 调用('presentation.recognition.status')).toMatchObject({ 成功: true, 可用: true })
    expect(await 调用('presentation.recognition.recognize', 'AAAA', 'image/png')).toMatchObject({ 成功: true, 文本: '识别文字' })
  })

  it('用户取消保存时返回取消状态而不是失败', async () => {
    const 调用 = 建通道({ 录制服务: { 列出捕获源: vi.fn(), 保存录制: async () => ({ 已取消: true }), 读取支持情况: vi.fn() } })
    expect(await 调用('presentation.recording.save', 'AAAA', 'webm', '录制')).toEqual({ 成功: true, 已取消: true })
  })

  it('服务异常时返回模型与磁盘的真实原因', async () => {
    const 调用 = 建通道({
      录制服务: { 列出捕获源: async () => { throw new Error('读取捕获源失败：系统未返回捕获源') }, 保存录制: async () => { throw new Error('保存录制失败：磁盘已满') }, 读取支持情况: () => ({}) },
      识别服务: { 读取状态: async () => ({ 可用: false, 原因: '请先在设置中心配置模型服务' }), 识别: async () => { throw new Error('模型未返回识别文字，请确认所选模型支持图像输入') } },
    })
    expect(await 调用('presentation.capture.sources', ['screen'])).toMatchObject({ 成功: false, 错误: expect.stringContaining('系统未返回捕获源') })
    expect(await 调用('presentation.recording.save', 'AAAA', 'mp4', '录制')).toMatchObject({ 成功: false, 错误: expect.stringContaining('磁盘已满') })
    expect(await 调用('presentation.recognition.status')).toMatchObject({ 成功: true, 可用: false, 原因: expect.stringContaining('设置中心') })
    expect(await 调用('presentation.recognition.recognize', 'AAAA', 'image/png')).toMatchObject({ 成功: false, 错误: expect.stringContaining('未返回识别文字') })
  })
})
