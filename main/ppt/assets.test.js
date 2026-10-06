const fs = require('fs')
const os = require('os')
const path = require('path')
const { 创建素材库, 素材分类 } = require('./assets')

const 临时目录 = () => fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), 'seal-assets-'))
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('测试字节')])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('测试字节')])

describe('本地素材库', () => {
  it('导入、列出、检索、读取与删除形成完整闭环', async () => {
    const 目录 = 临时目录()
    const 库 = 创建素材库({ 根目录: 目录 })
    const 甲 = await 库.导入({ 字节: PNG, 类型: 'image/png', 名称: '商务封面底图', 分类: '背景', 来源: '内部设计', 授权: '自制，可商用' })
    const 乙 = await 库.导入({ 字节: JPEG, 类型: 'image/jpeg', 名称: '数据图表截图', 分类: '图片', 授权: '客户提供' })
    expect(甲.素材.标识).toHaveLength(64)
    expect(乙.素材.分类).toBe('图片')

    const 列表 = await 库.列出()
    expect(列表).toHaveLength(2)
    expect(列表[0].名称).toBeDefined()
    expect(await 库.检索('封面')).toHaveLength(1)
    expect(await 库.检索('图片')).toHaveLength(1)
    expect(await 库.检索('不存在的关键词')).toHaveLength(0)

    const 读出 = await 库.读取(甲.素材.标识)
    expect(Buffer.compare(读出, PNG)).toBe(0)

    await 库.删除(乙.素材.标识)
    expect(await 库.列出()).toHaveLength(1)
    await expect(库.读取(乙.素材.标识)).rejects.toThrow('不存在')
  })

  it('相同字节去重，重复导入复用同一条目', async () => {
    const 库 = 创建素材库({ 根目录: 临时目录() })
    const 甲 = await 库.导入({ 字节: PNG, 类型: 'image/png', 名称: '底图', 分类: '背景', 授权: '自制' })
    const 乙 = await 库.导入({ 字节: PNG, 类型: 'image/png', 名称: '同一张图', 分类: '图片', 授权: '自制' })
    expect(乙.素材.标识).toBe(甲.素材.标识)
    expect(乙.去重).toBe(true)
    expect(await 库.列出()).toHaveLength(1)
  })

  it('元数据不合法时拒绝导入并给出真实原因', async () => {
    const 库 = 创建素材库({ 根目录: 临时目录() })
    await expect(库.导入({ 字节: Buffer.alloc(0), 类型: 'image/png', 名称: 'x', 分类: '背景', 授权: '自制' })).rejects.toThrow('字节')
    await expect(库.导入({ 字节: PNG, 类型: 'image/gif', 名称: 'x', 分类: '背景', 授权: '自制' })).rejects.toThrow('类型')
    await expect(库.导入({ 字节: PNG, 类型: 'image/png', 名称: '', 分类: '背景', 授权: '自制' })).rejects.toThrow('名称')
    await expect(库.导入({ 字节: PNG, 类型: 'image/png', 名称: 'x', 分类: '乱分类', 授权: '自制' })).rejects.toThrow('分类')
    await expect(库.导入({ 字节: PNG, 类型: 'image/png', 名称: 'x', 分类: '背景', 授权: '' })).rejects.toThrow('授权')
    expect(素材分类).toContain('背景')
  })

  it('索引损坏或素材文件缺失时报告真实原因，不静默丢数据', async () => {
    const 目录 = 临时目录()
    const 库 = 创建素材库({ 根目录: 目录 })
    const 甲 = await 库.导入({ 字节: PNG, 类型: 'image/png', 名称: '底图', 分类: '背景', 授权: '自制' })
    fs.rmSync(path.join(目录, `${甲.素材.标识}.png`), { force: true })
    await expect(库.读取(甲.素材.标识)).rejects.toThrow('素材文件缺失')

    const 坏目录 = 临时目录()
    fs.writeFileSync(path.join(坏目录, '素材索引.json'), '这不是 JSON')
    const 坏库 = 创建素材库({ 根目录: 坏目录 })
    await expect(坏库.列出()).rejects.toThrow('索引损坏')
  })

  it('删除图库条目不影响已被文稿引用的资源字节', async () => {
    const 目录 = 临时目录()
    const 库 = 创建素材库({ 根目录: 目录 })
    // 文稿引用由主进程资源存储独立持有，这里用最小假实现验证「删图库不等于删引用」
    const 资源字节 = new Map()
    const 资源存储 = {
      加入: (字节) => { const 标识 = require('crypto').createHash('sha256').update(字节).digest('hex'); 资源字节.set(标识, 字节); return 标识 },
      读取: (标识) => { if (!资源字节.has(标识)) throw new Error('资源不存在'); return 资源字节.get(标识) },
    }
    const 素材 = await 库.导入({ 字节: PNG, 类型: 'image/png', 名称: '底图', 分类: '背景', 授权: '自制' })
    const 文稿引用标识 = 资源存储.加入(await 库.读取(素材.素材.标识))
    await 库.删除(素材.素材.标识)
    expect(await 库.列出()).toHaveLength(0)
    expect(Buffer.compare(资源存储.读取(文稿引用标识), PNG)).toBe(0)
  })

  it('更新元数据后仍可按新名称检索，非法更新被拒绝', async () => {
    const 库 = 创建素材库({ 根目录: 临时目录() })
    const 甲 = await 库.导入({ 字节: PNG, 类型: 'image/png', 名称: '旧名称', 分类: '背景', 授权: '自制' })
    await 库.更新元数据(甲.素材.标识, { 名称: '新名称', 分类: '图标' })
    expect(await 库.检索('新名称')).toHaveLength(1)
    expect((await 库.列出())[0].分类).toBe('图标')
    await expect(库.更新元数据(甲.素材.标识, { 名称: '' })).rejects.toThrow('名称')
    await expect(库.更新元数据('不存在的标识', { 名称: 'x' })).rejects.toThrow('不存在')
  })
})
