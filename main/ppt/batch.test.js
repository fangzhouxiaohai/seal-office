const fs = require('fs')
const os = require('os')
const path = require('path')
const { 执行批量任务, 检查演示文件, 批量检查 } = require('./batch')
const { 写入pptx } = require('../office/pptxCodec')

const 任务 = (标识) => ({ 标识, 名称: `${标识}.pptx`, 路径: `E:\\资料\\${标识}.pptx` })

const 临时目录 = () => fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), 'seal-batch-'))

describe('批量任务编排', () => {
  it('全部成功时逐项返回结果并汇总', async () => {
    const 结果 = await 执行批量任务([任务('甲'), 任务('乙'), 任务('丙')], async (项) => ({ 输出: `${项.标识}-已处理` }))
    expect(结果.结果.map(项 => 项.成功)).toEqual([true, true, true])
    expect(结果.结果[0]).toMatchObject({ 标识: '甲', 名称: '甲.pptx', 输出: '甲-已处理' })
    expect(结果.汇总).toEqual({ 总数: 3, 成功: 3, 失败: 0, 已取消: 0 })
  })

  it('单项失败不撤销其他成功输出', async () => {
    const 结果 = await 执行批量任务([任务('甲'), 任务('乙'), 任务('丙')], async (项) => {
      if (项.标识 === '乙') throw new Error('文件被占用')
      return { 输出: `${项.标识}-已处理` }
    })
    expect(结果.结果.map(项 => 项.成功)).toEqual([true, false, true])
    expect(结果.结果[1].错误).toBe('文件被占用')
    expect(结果.汇总).toEqual({ 总数: 3, 成功: 2, 失败: 1, 已取消: 0 })
  })

  it('取消后保留已完成结果，未处理项标记已取消，可再次执行剩余项', async () => {
    let 已处理 = 0
    let 请求取消 = false
    const 结果 = await 执行批量任务([任务('甲'), 任务('乙'), 任务('丙')], async (项) => {
      已处理 += 1
      if (项.标识 === '乙') 请求取消 = true
      return { 输出: `${项.标识}-已处理` }
    }, { 已取消: () => 请求取消 })
    expect(结果.结果[0].成功).toBe(true)
    expect(结果.结果[1].成功).toBe(true)
    expect(结果.结果[2]).toMatchObject({ 标识: '丙', 已取消: true, 成功: false })
    expect(结果.汇总).toMatchObject({ 总数: 3, 成功: 2, 已取消: 1 })
    expect(已处理).toBe(2)

    const 剩余 = 结果.结果.filter(项 => !项.成功 && 项.已取消).map(项 => ({ 标识: 项.标识, 名称: 项.名称, 路径: 项.路径 }))
    const 重试 = await 执行批量任务(剩余, async (项) => ({ 输出: `${项.标识}-已处理` }))
    expect(重试.汇总).toMatchObject({ 总数: 1, 成功: 1 })
  })

  it('输入无效时给出真实原因', async () => {
    await expect(执行批量任务(null, async () => ({}))).rejects.toThrow('任务列表无效')
    await expect(执行批量任务([任务('甲')], null)).rejects.toThrow('批量操作无效')
    await expect(执行批量任务([{ 名称: '缺少标识' }], async () => ({}))).rejects.toThrow('任务标识')
  })
})

describe('演示文件检查', () => {
  it('真实 PPTX 通过结构与资源检查', async () => {
    const 目录 = 临时目录()
    const 文件 = path.join(目录, '真实.pptx')
    fs.writeFileSync(文件, await 写入pptx({ 幻灯片: [{ id: '页', 背景色: '#FFFFFF', 文本框: [{ id: '文字', text: '批量检查', x: 0, y: 0, width: 200, height: 60, 字号: 18 }] }] }))
    const 结果 = await 检查演示文件(文件)
    expect(结果).toMatchObject({ 成功: true, 页数: 1, 警告: [] })
    fs.rmSync(目录, { recursive: true, force: true })
  })

  it('文件不存在或内容不是演示文稿时报告真实原因', async () => {
    const 目录 = 临时目录()
    const 缺失 = await 检查演示文件(path.join(目录, '不存在.pptx'))
    expect(缺失.成功).toBe(false)
    expect(缺失.错误).toContain('无法读取')
    const 坏文件 = path.join(目录, '坏.pptx')
    fs.writeFileSync(坏文件, '这不是演示文稿')
    const 坏 = await 检查演示文件(坏文件)
    expect(坏.成功).toBe(false)
    expect(坏.错误.length).toBeGreaterThan(0)
    expect(await 检查演示文件(123)).toMatchObject({ 成功: false })
    fs.rmSync(目录, { recursive: true, force: true })
  })

  it('批量检查逐文件给出结果，损坏文件不影响其他文件', async () => {
    const 目录 = 临时目录()
    const 好文件 = path.join(目录, '好.pptx')
    fs.writeFileSync(好文件, await 写入pptx({ 幻灯片: [{ id: '页', 背景色: '#FFFFFF', 文本框: [] }] }))
    const 坏文件 = path.join(目录, '坏.pptx')
    fs.writeFileSync(坏文件, '坏内容')
    const 结果 = await 批量检查([{ 标识: '好', 名称: '好.pptx', 路径: 好文件 }, { 标识: '坏', 名称: '坏.pptx', 路径: 坏文件 }])
    expect(结果.结果[0]).toMatchObject({ 标识: '好', 成功: true })
    expect(结果.结果[1]).toMatchObject({ 标识: '坏', 成功: false })
    expect(结果.汇总).toMatchObject({ 总数: 2, 成功: 1, 失败: 1 })
    fs.rmSync(目录, { recursive: true, force: true })
  })
})
