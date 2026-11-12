// 表格保存回读校验通道：写盘前快照、写盘后从磁盘回读比对、按需恢复原文件
const fs = require('fs')
const os = require('os')
const path = require('path')
const { 注册Office通道 } = require('./officeChannel')
const { 写入xlsx } = require('../office/xlsxCodec')

function 创建通道() {
  const 处理器 = new Map()
  注册Office通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
  return (名称, ...参数) => 处理器.get(名称)(null, ...参数)
}

describe('表格保存回读校验通道', () => {
  let 目录
  beforeEach(() => { 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-office-verify-')) })
  afterEach(() => { fs.rmSync(目录, { recursive: true, force: true }) })

  it('正常保存零差异；写坏后检出差异并可把原件恢复为保存前字节', async () => {
    const 调用 = 创建通道()
    const 路径 = path.join(目录, '成绩.xlsx')
    const 原字节 = await 写入xlsx({ 行: [['原始']] })
    fs.writeFileSync(路径, 原字节)
    const 模型 = { 工作表: [{ 名称: '成绩', 数据: [['新值']] }] }

    const 快照 = await 调用('office.xlsxSaveSnapshot', 路径)
    expect(快照).toMatchObject({ 成功: true, 有原文件: true })
    fs.writeFileSync(路径, await 写入xlsx(模型))
    expect(await 调用('office.xlsxVerifySaved', 快照.标识, 模型)).toMatchObject({ 成功: true, 一致: true, 失败: [], 警告: [] })

    const 第二次 = await 调用('office.xlsxSaveSnapshot', 路径)
    const 正确字节 = fs.readFileSync(路径)
    fs.writeFileSync(路径, await 写入xlsx({ 工作表: [{ 名称: '成绩', 数据: [['写坏']] }] }))
    const 校验 = await 调用('office.xlsxVerifySaved', 第二次.标识, 模型)
    expect(校验).toMatchObject({ 成功: true, 一致: false })
    expect(校验.失败[0].说明).toBe('工作表“成绩” A1：单元格内容不一致（期望：新值；实际：写坏）')
    expect(await 调用('office.xlsxRestoreOriginal', 第二次.标识)).toEqual({ 成功: true })
    expect(fs.readFileSync(路径).equals(正确字节)).toBe(true)
  })

  it('非 XLSX 路径与失效快照返回中文错误而不是抛出', async () => {
    const 调用 = 创建通道()
    expect(await 调用('office.xlsxSaveSnapshot', path.join(目录, '报告.docx'))).toEqual({ 成功: false, 错误: '只能为 XLSX 文件保留保存快照' })
    expect(await 调用('office.xlsxRestoreOriginal', '不存在')).toEqual({ 成功: false, 错误: '保存快照已失效，请重新保存后再试' })
    expect(await 调用('office.xlsxReleaseSnapshot', '不存在')).toEqual({ 成功: true })
  })
})
