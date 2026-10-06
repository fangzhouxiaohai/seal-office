const { 注册演示通道 } = require('./presentationChannel')
const { 创建资源存储 } = require('../ppt/resources')
const { 创建文稿会话服务 } = require('../ppt/session')
const { 写入pptx } = require('../office/pptxCodec')
const fs = require('fs')
const path = require('path')
const os = require('os')

const 页 = (标识, 文本) => ({ id: 标识, 背景色: '#FFFFFF', 文本框: [{ id: `${标识}-文字`, text: 文本, x: 40, y: 40, width: 400, height: 80, 字号: 20 }] })
const 临时文件 = async (名称, 模型) => {
  const 目录 = fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), 'seal-compare-'))
  const 路径 = path.join(目录, 名称)
  fs.writeFileSync(路径, await 写入pptx(模型))
  return 路径
}

describe('演示文稿比对通道', () => {
  it('比较两份真实文件并返回结构化差异，且不修改被比较文件', async () => {
    const 甲 = await 临时文件('甲.pptx', { 幻灯片: [页('页一', '原文')] })
    const 乙 = await 临时文件('乙.pptx', { 幻灯片: [页('页一', '改后'), 页('页二', '新增页')] })
    const 甲快照 = fs.readFileSync(甲), 乙快照 = fs.readFileSync(乙)
    const 处理 = new Map()
    注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 创建资源存储())
    const 结果 = await 处理.get('presentation.compareFiles')(null, 甲, 乙)
    expect(结果.成功).toBe(true)
    expect(结果.汇总).toMatchObject({ 新增页: 1, 删除页: 0, 修改页: 1 })
    expect(结果.页面.flatMap(项 => 项.差异 ?? []).some(项 => 项.类型 === '文本' && 项.字段 === 'text')).toBe(true)
    expect(fs.readFileSync(甲).equals(甲快照)).toBe(true)
    expect(fs.readFileSync(乙).equals(乙快照)).toBe(true)
  })

  it('同一份文件比较没有差异', async () => {
    const 文件 = await 临时文件('同一.pptx', { 幻灯片: [页('页一', '内容')] })
    const 处理 = new Map()
    注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 创建资源存储())
    const 结果 = await 处理.get('presentation.compareFiles')(null, 文件, 文件)
    expect(结果.成功).toBe(true)
    expect(结果.汇总).toEqual({ 新增页: 0, 删除页: 0, 移动页: 0, 修改页: 0, 差异项: 0 })
  })

  it('路径无效、文件缺失或内容不是演示文稿时返回真实原因', async () => {
    const 处理 = new Map()
    注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 创建资源存储())
    const 比较 = (甲, 乙) => 处理.get('presentation.compareFiles')(null, 甲, 乙)
    expect(await 比较('', 'x.pptx')).toMatchObject({ 成功: false, 错误: expect.stringContaining('路径') })
    const 缺失 = path.join(os.tmpdir(), 'seal-不存在-' + Date.now() + '.pptx')
    expect(await 比较(缺失, 缺失)).toMatchObject({ 成功: false, 错误: expect.stringContaining('无法读取') })
    const 坏文件 = path.join(os.tmpdir(), 'seal-坏文件-' + Date.now() + '.pptx')
    fs.writeFileSync(坏文件, '这不是演示文稿')
    const 结果 = await 比较(坏文件, 坏文件)
    expect(结果.成功).toBe(false)
    expect(结果.错误.length).toBeGreaterThan(0)
    fs.rmSync(坏文件, { force: true })
  })
})

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

describe('演示文稿会话与批量检查通道', () => {
  const 建通道 = (依赖 = {}) => {
    const 处理 = new Map()
    注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 创建资源存储(), 依赖)
    return (名称, ...参数) => 处理.get(名称)(null, ...参数)
  }
  const 内容 = (文本) => ({ 幻灯片: [页('页一', 文本)] })

  it('登记、读取、提交与保存状态通过通道对外可用，并在提交后广播', async () => {
    const 会话 = 创建文稿会话服务()
    const 广播 = vi.fn()
    const 调用 = 建通道({ 会话, 广播 })
    expect(await 调用('presentation.session.register', '文稿甲', '窗口一', 内容('初始'), 'E:\\资料\\甲.pptx')).toMatchObject({ 成功: true, 版本: 1 })
    expect(广播).toHaveBeenCalledWith('文稿甲', expect.objectContaining({ 类型: '会话变更' }), '窗口一')
    expect(await 调用('presentation.session.read', '文稿甲')).toMatchObject({ 成功: true, 版本: 1 })
    const 提交 = await 调用('presentation.session.commit', '文稿甲', 1, 内容('改过'), '窗口一')
    expect(提交).toMatchObject({ 成功: true, 版本: 2 })
    const 冲突 = await 调用('presentation.session.commit', '文稿甲', 1, 内容('旧版本'), '窗口二')
    expect(冲突.成功).toBe(false)
    expect(冲突.错误).toContain('版本')
    expect(await 调用('presentation.session.saved', '文稿甲', 'E:\\资料\\甲.pptx')).toMatchObject({ 成功: true })
    expect((await 调用('presentation.session.read', '文稿甲')).已保存).toBe(true)
    expect(await 调用('presentation.session.unregister', '文稿甲', '窗口一')).toMatchObject({ 成功: true, 是否最后视图: true })
  })

  it('会话操作失败时返回真实原因而不是空结果', async () => {
    const 调用 = 建通道({ 会话: 创建文稿会话服务(), 广播: vi.fn() })
    expect(await 调用('presentation.session.read', '不存在')).toMatchObject({ 成功: false, 错误: expect.stringContaining('不存在') })
    expect(await 调用('presentation.session.register', '', '窗口一', 内容('x'))).toMatchObject({ 成功: false })
    expect(await 调用('presentation.session.claimPath', '不存在', 'E:\\资料\\甲.pptx')).toMatchObject({ 成功: false })
  })

  it('批量资源检查逐文件返回结果，损坏文件不影响其他文件', async () => {
    const 好文件 = await 临时文件('批量好.pptx', { 幻灯片: [页('页一', '内容')] })
    const 目录 = path.dirname(好文件)
    const 坏文件 = path.join(目录, '批量坏.pptx')
    fs.writeFileSync(坏文件, '坏内容')
    const 调用 = 建通道({ 会话: 创建文稿会话服务(), 广播: vi.fn() })
    const 结果 = await 调用('presentation.batchCheck', [
      { 标识: '好', 名称: '批量好.pptx', 路径: 好文件 },
      { 标识: '坏', 名称: '批量坏.pptx', 路径: 坏文件 },
    ])
    expect(结果.成功).toBe(true)
    expect(结果.结果[0]).toMatchObject({ 标识: '好', 成功: true, 页数: 1 })
    expect(结果.结果[1]).toMatchObject({ 标识: '坏', 成功: false })
    expect(结果.汇总).toMatchObject({ 总数: 2, 成功: 1, 失败: 1 })
  })
})
