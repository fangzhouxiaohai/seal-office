const { 注册演示通道 } = require('./presentationChannel')
const { 创建资源存储 } = require('../ppt/resources')

describe('演示资源通道', () => {
  it('实际通道释放文稿和历史后能插入新资源，不残留总容量占用', () => {
    const 处理 = new Map()
    const 资源 = 创建资源存储({ 最大单项字节: 4, 最大总字节: 4 })
    注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 资源)
    const 调用 = (名称, ...参数) => 处理.get(名称)(null, ...参数)
    const 首次 = 调用('presentation.resource.add', 'MTIzNA==', 'image/png')
    调用('presentation.resource.sync', '文稿', [首次.标识])
    调用('presentation.resource.sync', '历史', [首次.标识])
    调用('presentation.resource.dropTemporary', 首次.标识)
    调用('presentation.resource.release', '文稿')
    expect(调用('presentation.resource.read', 首次.标识).成功).toBe(true)
    调用('presentation.resource.release', '历史')
    expect(调用('presentation.resource.read', 首次.标识).成功).toBe(false)
    expect(调用('presentation.resource.add', 'NTY3OA==', 'image/png').成功).toBe(true)
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
    expect(调用('presentation.resource.add', Buffer.from('abcd').toString('base64'), 'image/png')).toMatchObject({ 成功: true, 标识: '指纹', 字节数: 4 })
    expect(调用('presentation.resource.read', '指纹')).toMatchObject({ 成功: true, 数据: Buffer.from('abcd').toString('base64') })
    expect(调用('presentation.resource.dropTemporary', '指纹')).toMatchObject({ 成功: true })
    expect(资源.解除引用).toHaveBeenCalledWith('指纹')
    expect(调用('presentation.resource.sync', '文稿一', ['指纹', '指纹'])).toMatchObject({ 成功: true })
    expect(资源.同步快照).toHaveBeenCalledWith('文稿一', ['指纹', '指纹'])
    资源.导出.mockImplementation(() => { throw new Error('资源字节缺失') })
    expect(调用('presentation.resource.export', ['指纹'])).toMatchObject({ 成功: false, 错误: '资源字节缺失' })
  })
})
