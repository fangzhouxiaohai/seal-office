const { 注册演示通道 } = require('./presentationChannel')

describe('演示资源通道', () => {
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
