import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import SheetEditor from './SheetEditor'
import { AppProvider, useAppStore } from '../store'

const 差异 = { 表: 'Sheet1', 位置: 'A1', 项目: '单元格内容', 期望: '原值', 实际: '写坏', 说明: '工作表“Sheet1” A1：单元格内容不一致（期望：原值；实际：写坏）' }

function 安装接口(校验结果: Record<string, unknown>) {
  const 接口 = {
    backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
    saveToFile: vi.fn().mockResolvedValue({ 成功: true, 文件指纹: '新指纹' }),
    showSaveDialog: vi.fn().mockResolvedValue('C:\\资料\\成绩-副本.xlsx'),
    recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
    office: {
      writeXlsx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }),
      xlsxSaveSnapshot: vi.fn().mockResolvedValue({ 成功: true, 标识: '快照一', 有原文件: true }),
      xlsxVerifySaved: vi.fn().mockResolvedValue({ 成功: true, ...校验结果 }),
      xlsxRestoreOriginal: vi.fn().mockResolvedValue({ 成功: true }),
      xlsxReleaseSnapshot: vi.fn().mockResolvedValue({ 成功: true }),
    },
  }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: 接口 })
  return 接口
}

function 渲染() {
  let 状态: ReturnType<typeof useAppStore> | null = null
  const 入口 = () => {
    状态 = useAppStore()
    return <>
      <button onClick={() => 状态!.createDoc('table', '<table><tr><td>原值</td></tr></table>', { 路径: 'C:\\资料\\成绩.xlsx', 文件指纹: '原指纹' })}>打开成绩表</button>
      {状态.module === 'table' ? <SheetEditor /> : null}
    </>
  }
  render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
  return () => 状态!
}

describe('表格保存后回读校验', () => {
  it('回读一致时不弹窗，写盘前保留快照并用保存模型校验', async () => {
    const 接口 = 安装接口({ 一致: true, 失败: [], 警告: [], 已抽样: false })
    渲染()
    await userEvent.click(screen.getByText('打开成绩表'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(接口.office.xlsxVerifySaved).toHaveBeenCalled())
    expect(接口.office.xlsxSaveSnapshot).toHaveBeenCalledWith('C:\\资料\\成绩.xlsx')
    expect(接口.office.xlsxSaveSnapshot.mock.invocationCallOrder[0]).toBeLessThan(接口.saveToFile.mock.invocationCallOrder[0])
    expect(接口.office.xlsxVerifySaved).toHaveBeenCalledWith('快照一', expect.objectContaining({ 工作表: expect.any(Array) }))
    await waitFor(() => expect(接口.office.xlsxReleaseSnapshot).toHaveBeenCalledWith('快照一'))
    expect(screen.queryByText('保存后回读发现差异')).toBeNull()
  })

  it('回读不一致时列出具体差异，选择另存为副本后恢复原件并把新内容写到副本', async () => {
    const 接口 = 安装接口({ 一致: false, 失败: [差异], 警告: [], 已抽样: false, 失败总数: 1, 警告总数: 0 })
    const 状态 = 渲染()
    await userEvent.click(screen.getByText('打开成绩表'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findAllByText('保存后回读发现差异')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(差异.说明).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '另存为副本' }))
    await waitFor(() => expect(接口.office.xlsxRestoreOriginal).toHaveBeenCalledWith('快照一'))
    expect(接口.saveToFile).toHaveBeenLastCalledWith('C:\\资料\\成绩-副本.xlsx', 'UEsDBAo=', '二进制')
    await waitFor(() => expect(状态().文档路径[状态().activeDocumentId!]).toBe('C:\\资料\\成绩-副本.xlsx'))
  })

  it('选择保留本次保存时不恢复原件并释放快照', async () => {
    const 接口 = 安装接口({ 一致: false, 失败: [差异], 警告: [], 已抽样: true, 失败总数: 1, 警告总数: 0 })
    渲染()
    await userEvent.click(screen.getByText('打开成绩表'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findAllByText('已抽样校验：大表格仅比对部分行。')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '保留本次保存' }))
    await waitFor(() => expect(接口.office.xlsxReleaseSnapshot).toHaveBeenCalledWith('快照一'))
    expect(接口.office.xlsxRestoreOriginal).not.toHaveBeenCalled()
    expect(接口.showSaveDialog).not.toHaveBeenCalled()
  })
})
