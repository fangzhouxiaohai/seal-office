// 保存前快照与回滚：校验失败且用户选择“另存为副本”时，把原文件恢复为保存前字节
const fs = require('fs')
const os = require('os')
const path = require('path')
const { 写入xlsx } = require('./xlsxCodec')
const { 创建xlsx保存守护 } = require('./xlsxSaveGuard')

describe('xlsx 保存守护', () => {
  let 目录
  beforeEach(() => { 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-xlsx-guard-')) })
  afterEach(() => { fs.rmSync(目录, { recursive: true, force: true }) })

  it('保存前保留旧字节，回读校验读取磁盘文件，另存副本时原件字节与保存前完全一致', async () => {
    const 守护 = 创建xlsx保存守护()
    const 路径 = path.join(目录, '全校.xlsx')
    const 原字节 = await 写入xlsx({ 工作表: [{ 名称: '成绩', 数据: [['原始']] }] })
    fs.writeFileSync(路径, 原字节)
    const 快照 = 守护.保留快照(路径)
    expect(快照).toMatchObject({ 有原文件: true })
    const 模型 = { 工作表: [{ 名称: '成绩', 数据: [['修改后']] }] }
    const 新字节 = await 写入xlsx(模型)
    // 模拟写盘时写坏：磁盘内容与模型不一致
    fs.writeFileSync(路径, await 写入xlsx({ 工作表: [{ 名称: '成绩', 数据: [['写坏']] }] }))
    const 校验 = await 守护.校验(快照.标识, 模型)
    expect(校验.一致).toBe(false)
    expect(校验.失败[0]).toMatchObject({ 表: '成绩', 位置: 'A1', 项目: '单元格内容' })
    expect(守护.恢复原文件(快照.标识)).toEqual({ 已恢复: true })
    expect(fs.readFileSync(路径).equals(原字节)).toBe(true)
    expect(新字节.length).toBeGreaterThan(0)
  })

  it('校验后文件又被外部修改时拒绝回滚，避免覆盖他人改动', async () => {
    const 守护 = 创建xlsx保存守护()
    const 路径 = path.join(目录, '共享.xlsx')
    fs.writeFileSync(路径, await 写入xlsx({ 行: [['甲']] }))
    const 快照 = 守护.保留快照(路径)
    const 模型 = { 行: [['乙']] }
    fs.writeFileSync(路径, await 写入xlsx(模型))
    expect((await 守护.校验(快照.标识, 模型)).一致).toBe(true)
    fs.writeFileSync(路径, 'external')
    expect(() => 守护.恢复原文件(快照.标识)).toThrow('文件已在保存后被修改，无法恢复原文件')
    expect(fs.readFileSync(路径, 'utf8')).toBe('external')
  })

  it('保存前文件不存在时如实告知无法自动回滚', async () => {
    const 守护 = 创建xlsx保存守护()
    const 路径 = path.join(目录, '新建.xlsx')
    const 快照 = 守护.保留快照(路径)
    expect(快照.有原文件).toBe(false)
    const 模型 = { 行: [['甲']] }
    fs.writeFileSync(路径, await 写入xlsx(模型))
    await 守护.校验(快照.标识, 模型)
    expect(() => 守护.恢复原文件(快照.标识)).toThrow('保存前该位置没有文件，无法恢复原文件')
    expect(fs.existsSync(路径)).toBe(true)
  })

  it('未知或已释放的快照拒绝校验与回滚，只保留有限数量的快照', async () => {
    const 守护 = 创建xlsx保存守护({ 上限: 2 })
    const 路径 = path.join(目录, '甲.xlsx')
    fs.writeFileSync(路径, 'x')
    const 第一 = 守护.保留快照(路径)
    守护.保留快照(路径)
    守护.保留快照(路径)
    await expect(守护.校验(第一.标识, { 行: [] })).rejects.toThrow('保存快照已失效')
    const 第四 = 守护.保留快照(路径)
    守护.释放(第四.标识)
    expect(() => 守护.恢复原文件(第四.标识)).toThrow('保存快照已失效')
  })
})
