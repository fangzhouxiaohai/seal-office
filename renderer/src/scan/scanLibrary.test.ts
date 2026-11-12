import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from '../../../mobile/node_modules/fake-indexeddb'
import { 打开扫描件库, 筛选扫描件, 默认分组, type 扫描件库, type 新扫描件 } from './scanLibrary'

const 页 = (字节数: number) => ({ 图片: new Uint8Array(字节数).fill(7), 类型: 'image/jpeg' as const, 宽: 10, 高: 20, 文字: '' })
const 扫描件 = (名称: string, 分组: string, 页大小: number[]): 新扫描件 => ({ 名称, 分组, 来源: '文件', 模板: '', 页: 页大小.map(页) })

describe('扫描件库', () => {
  let 库: 扫描件库
  beforeEach(async () => { 库 = await 打开扫描件库(new IDBFactory()) })

  it('保存后列表只含元数据，读取时取回全部页面字节', async () => {
    const 编号 = await 库.保存(扫描件('合同', '我的证件', [100, 50]))
    const 列表 = await 库.列出()
    expect(列表).toHaveLength(1)
    expect(列表[0]).toMatchObject({ 标识: 编号, 名称: '合同', 分组: '我的证件', 页数: 2, 大小: 150 })
    expect('页' in 列表[0]).toBe(false)
    const 完整 = await 库.读取(编号)
    expect(完整?.页.map(项 => 项.图片.length)).toEqual([100, 50])
  })

  it('更新已有扫描件保持标识不变，并重算大小与页数', async () => {
    const 编号 = await 库.保存(扫描件('试卷', '我的试卷', [10]))
    await 库.保存({ ...扫描件('期中试卷', '我的错题本', [10, 20, 30]), 标识: 编号 })
    expect(await 库.列出()).toEqual([expect.objectContaining({ 标识: 编号, 名称: '期中试卷', 分组: '我的错题本', 页数: 3, 大小: 60 })])
  })

  it('按时间、名称、大小排序，按分组与关键字筛选', async () => {
    let 时刻 = 1000
    库 = await 打开扫描件库(new IDBFactory(), () => (时刻 += 10))
    await 库.保存(扫描件('乙 发票', '我的票据', [300]))
    await 库.保存(扫描件('甲 身份证', '我的证件', [100]))
    await 库.保存(扫描件('丙 发票', '我的票据', [200]))
    const 列表 = await 库.列出()
    expect(筛选扫描件(列表, { 排序: '时间' }).map(项 => 项.名称)).toEqual(['丙 发票', '甲 身份证', '乙 发票'])
    expect(筛选扫描件(列表, { 排序: '名称' }).map(项 => 项.名称)).toEqual(['丙 发票', '甲 身份证', '乙 发票'].sort((甲, 乙) => 甲.localeCompare(乙, 'zh-CN')))
    expect(筛选扫描件(列表, { 排序: '大小' }).map(项 => 项.名称)).toEqual(['乙 发票', '丙 发票', '甲 身份证'])
    expect(筛选扫描件(列表, { 排序: '时间', 分组: '我的票据' }).map(项 => 项.名称)).toEqual(['丙 发票', '乙 发票'])
    expect(筛选扫描件(列表, { 排序: '时间', 关键字: '身份' }).map(项 => 项.名称)).toEqual(['甲 身份证'])
  })

  it('批量删除同时删除页面数据与导出记录', async () => {
    const 甲 = await 库.保存(扫描件('甲', '我的证件', [1]))
    const 乙 = await 库.保存(扫描件('乙', '我的证件', [1]))
    await 库.记录导出(甲, 'PDF', '甲.pdf')
    await 库.删除([甲])
    expect((await 库.列出()).map(项 => 项.标识)).toEqual([乙])
    expect(await 库.读取(甲)).toBeNull()
    expect(await 库.列出导出记录()).toEqual([])
  })

  it('已导出文件视图与全部扫描件视图对应同一批扫描件，无重复无丢失', async () => {
    const 甲 = await 库.保存(扫描件('甲', '我的证件', [1]))
    await 库.保存(扫描件('乙', '我的证件', [1]))
    await 库.记录导出(甲, 'PDF', '甲.pdf')
    await 库.记录导出(甲, 'Word', '甲.docx')
    const 记录 = await 库.列出导出记录()
    expect(记录.map(项 => 项.文件名).sort()).toEqual(['甲.docx', '甲.pdf'])
    expect(new Set(记录.map(项 => 项.扫描件标识))).toEqual(new Set([甲]))
    expect((await 库.列出()).find(项 => 项.标识 === 甲)?.导出次数).toBe(2)
  })

  it('默认四个分组不可删除，自定义分组可新增、去重并在删除后把扫描件移回未分组', async () => {
    expect(默认分组).toEqual(['我的证件', '我的试卷', '我的错题本', '我的票据'])
    expect(await 库.列出分组()).toEqual(默认分组)
    await 库.新建分组('  合同  ')
    await expect(库.新建分组('合同')).rejects.toThrow('分组已存在')
    await expect(库.新建分组('')).rejects.toThrow('分组名称不能为空')
    await expect(库.删除分组('我的证件')).rejects.toThrow('默认分组不能删除')
    const 编号 = await 库.保存(扫描件('租赁合同', '合同', [1]))
    await 库.删除分组('合同')
    expect(await 库.列出分组()).toEqual(默认分组)
    expect((await 库.列出()).find(项 => 项.标识 === 编号)?.分组).toBe('')
  })

  it('移动到分组只改元数据', async () => {
    const 编号 = await 库.保存(扫描件('甲', '我的证件', [5]))
    await 库.移动到分组([编号], '我的票据')
    expect((await 库.列出())[0].分组).toBe('我的票据')
    expect((await 库.读取(编号))?.页[0].图片.length).toBe(5)
  })
})
