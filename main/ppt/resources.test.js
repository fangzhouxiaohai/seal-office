const { 创建资源存储 } = require('./resources')

describe('演示资源存储', () => {
  it('相同字节去重，引用解除后仍可供撤销恢复', () => {
    const 存储 = 创建资源存储({ 最大单项字节: 8, 最大总字节: 16 })
    const 首次 = 存储.加入(Buffer.from('sample'), 'image/png')
    const 再次 = 存储.加入(Buffer.from('sample'), 'image/png')
    expect(再次).toBe(首次)
    expect(存储.读取(首次).toString()).toBe('sample')
    存储.解除引用(首次)
    存储.解除引用(首次)
    expect(存储.读取(首次).toString()).toBe('sample')
    存储.增加引用(首次)
    expect(存储.列表()).toMatchObject([{ 标识: 首次, 引用次数: 1 }])
  })

  it('超过大小限制与引用错误返回实际原因', () => {
    const 存储 = 创建资源存储({ 最大单项字节: 4, 最大总字节: 8 })
    expect(() => 存储.加入(Buffer.from('12345'), 'image/png')).toThrow(/单项/)
    const 标识 = 存储.加入(Buffer.from('1234'), 'image/png')
    expect(() => 存储.解除引用('不存在')).toThrow(/不存在/)
    存储.解除引用(标识)
    expect(() => 存储.解除引用(标识)).toThrow(/引用/)
  })
})
